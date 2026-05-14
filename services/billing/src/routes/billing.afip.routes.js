'use strict';

const { Router } = require('express');
const { db, R, afip, enqueue, generateInvoicePdf, logBillingError } = require('./billing.common');

const router = Router();

router.post('/:id/authorize', async (req, res, next) => {
  try {
    const inv = await db.queryOne(
      `SELECT i.*, cur.code AS currency,
              cl.first_name, cl.last_name, cl.tax_id, cl.fiscal_condition,
              o.id AS org_id, o.name AS org_name
       FROM invoices i
       JOIN currencies cur ON i.currency_id=cur.id
       JOIN clients cl     ON i.client_id=cl.id
       JOIN branches b     ON i.branch_id=b.id
       JOIN organizations o ON b.organization_id=o.id
       WHERE i.id=:id AND i.branch_id=:bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!inv) return R.notFound(res, 'Factura no encontrada');
    if (inv.afip_cae) return R.conflict(res, 'La factura ya tiene CAE asignado');
    if (inv.status === 'paid') return R.conflict(res, 'No se puede autorizar una factura ya pagada');

    const tipoComp = afip.getTipoComprobante(inv.fiscal_condition || 'CF');
    const tipoDoc = inv.fiscal_condition === 'RI'
      ? afip.TIPO_DOC.CUIT
      : (inv.tax_id ? afip.TIPO_DOC.DNI : afip.TIPO_DOC.CONSUMIDOR_FINAL);

    const importeNeto = inv.subtotal || (inv.total_amount / 1.21);
    const importeIVA = inv.tax_amount || (inv.total_amount - importeNeto);

    const result = await afip.authorizeVoucher({
      orgId: inv.org_id,
      tipoComprobante: tipoComp,
      tipoDocReceptor: tipoDoc,
      nroDocReceptor: inv.tax_id || '0',
      importeTotal: inv.total_amount,
      importeNeto: Number(importeNeto.toFixed(2)),
      importeIVA: Number(importeIVA.toFixed(2)),
    });

    await db.query(
      `UPDATE invoices
         SET afip_cae=:cae, afip_cae_vto=:vto,
             afip_tipo=:tipo, afip_punto_venta=:pv,
             afip_nro_comprobante=:nro, updated_at=NOW()
       WHERE id=:id`,
      {
        cae: result.cae,
        vto: result.caeFechaVencimiento,
        tipo: tipoComp,
        pv: result.puntoVenta,
        nro: result.nroComprobante,
        id: inv.id,
      }
    );

    enqueue({ event: 'invoice.authorized', payload: { invoiceId: inv.id, cae: result.cae }, orgId: inv.org_id }).catch(() => {});

    return R.ok(res, result);
  } catch (e) {
    logBillingError('POST /invoices/:id/authorize', e, { invoiceId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

router.get('/:id/pdf', async (req, res, next) => {
  try {
    const inv = await db.queryOne(
      `SELECT i.*,
              cur.code AS currency,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
              cl.first_name, cl.last_name, cl.email, cl.phone AS client_phone, cl.tax_id,
              b.name AS clinic_name, b.address AS clinic_address, b.phone AS clinic_phone,
              o.tax_id AS clinic_cuit
       FROM invoices i
       JOIN currencies cur ON i.currency_id=cur.id
       JOIN clients cl     ON i.client_id=cl.id
       JOIN branches b     ON i.branch_id=b.id
       JOIN organizations o ON b.organization_id=o.id
       WHERE i.id=:id AND i.branch_id=:bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!inv) return R.notFound(res, 'Factura no encontrada');

    const items = await db.query(
      `SELECT description, quantity, unit_price, discount_pct, tax_pct FROM invoice_items WHERE invoice_id=:id`,
      { id: inv.id }
    );
    const payments = await db.query(
      `SELECT payment_method, amount, paid_at FROM payments WHERE invoice_id=:id ORDER BY paid_at`,
      { id: inv.id }
    );

    const pdfBuffer = await generateInvoicePdf({
      invoice: inv,
      items,
      payments,
      clinic: { name: inv.clinic_name, address: inv.clinic_address, phone: inv.clinic_phone, cuit: inv.clinic_cuit },
      client: { first_name: inv.first_name, last_name: inv.last_name, email: inv.email, phone: inv.client_phone, tax_id: inv.tax_id },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="factura-${inv.invoice_number}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (e) {
    logBillingError('GET /invoices/:id/pdf', e, { invoiceId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

module.exports = { router };
