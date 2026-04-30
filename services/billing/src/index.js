'use strict';

require('dotenv').config();

const { Router }  = require('express');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { buildApp, startService } = require('../../../shared/serviceBase');
const db = require('../../../shared/db');
const { router: stripeRouter } = require('./routes/stripe.routes');
const R  = require('../../../shared/response');
const { httpCacheHeaders } = require('../../../shared/cache');
const mp   = require('../../../shared/mercadopago');
const afip = require('../../../shared/afip');
const { generateInvoicePdf } = require('../../../shared/pdf');
const { enqueue }             = require('../../../shared/webhooks/dispatcher');
const mb                      = require('../../../shared/multibranch');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

function buildInvoiceNumber(branchId, seq) {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${branchId}-${ymd}-${String(seq).padStart(5, '0')}`;
}

// ── Invoices ──────────────────────────────────────────────────────────────────
const invoicesRouter = Router();

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const { status, clientId, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['i.branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status)   { conds.push('i.status = :status');                 p.status = status; }
    if (clientId) { conds.push('i.client_id = :clientId');            p.clientId = clientId; }
    if (from)     { conds.push('i.issued_date >= :from');             p.from = from; }
    if (to)       { conds.push('i.issued_date <= :to');               p.to = to; }

    const where = `WHERE ${conds.join(' AND ')}`;
    const rows = await db.query(
      `SELECT i.id, i.invoice_number, i.status, i.issued_date, i.due_date,
              i.subtotal, i.tax_amount, i.discount_amount, i.total_amount, i.paid_amount,
              cur.code AS currency,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.email,
              p.name AS patient_name
       FROM invoices i
       JOIN clients cl ON i.client_id  = cl.id
       JOIN currencies cur ON i.currency_id = cur.id
       LEFT JOIN patients p ON i.patient_id = p.id
       ${where}
       ORDER BY i.issued_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    const [{ total }] = await db.query(
      `SELECT COUNT(*) AS total FROM invoices i ${where}`,
      { bid: req.user.branchId, ...(status && { status }), ...(clientId && { clientId }), ...(from && { from }), ...(to && { to }) }
    );
    return R.paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
});

invoicesRouter.get('/aging', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_invoice_aging WHERE branch_id = :bid`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

invoicesRouter.get('/:id', async (req, res, next) => {
  try {
    const inv = await db.queryOne(
      `SELECT i.*, cur.code AS currency,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.email, cl.phone, cl.tax_id,
              p.name AS patient_name, sp.common_name AS species
       FROM invoices i
       JOIN clients cl ON i.client_id = cl.id
       JOIN currencies cur ON i.currency_id = cur.id
       LEFT JOIN patients p  ON i.patient_id = p.id
       LEFT JOIN species sp  ON p.species_id  = sp.id
       WHERE i.id = :id AND i.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!inv) return R.notFound(res);

    const items = await db.query(
      `SELECT ii.*, sc.name AS service_category
       FROM invoice_items ii
       LEFT JOIN services_catalog svc ON ii.service_id = svc.id
       LEFT JOIN service_categories sc ON svc.category_id = sc.id
       WHERE ii.invoice_id = :iid ORDER BY ii.id`,
      { iid: req.params.id }
    );
    const payments = await db.query(
      `SELECT * FROM payments WHERE invoice_id = :iid ORDER BY paid_at DESC`,
      { iid: req.params.id }
    );
    return R.ok(res, { ...inv, items, payments });
  } catch (e) { next(e); }
});

invoicesRouter.post('/',
  body('clientId').isInt(),
  body('currencyId').optional().isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { clientId, patientId, appointmentId, currencyId, dueDate, notes, items = [] } = req.body;
      const invoice = await db.transaction(async (conn) => {
        const [{ seq }] = await conn.query(
          `SELECT COALESCE(MAX(id), 0) + 1 AS seq FROM invoices WHERE branch_id = :bid FOR UPDATE`,
          { bid: req.user.branchId }
        );
        const invoiceNumber = buildInvoiceNumber(req.user.branchId, seq);
        const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity || 1) * Number(item.unitPrice || 0)), 0);
        const taxAmount = items.reduce((sum, item) => sum + ((Number(item.quantity || 1) * Number(item.unitPrice || 0) * Number(item.taxPct || 0)) / 100), 0);
        const discountAmount = items.reduce((sum, item) => sum + ((Number(item.quantity || 1) * Number(item.unitPrice || 0) * Number(item.discountPct || 0)) / 100), 0);
        const totalAmount = Math.max(0, subtotal + taxAmount - discountAmount);

        const [result] = await conn.query(
          `INSERT INTO invoices
             (branch_id, client_id, patient_id, appointment_id, currency_id,
              invoice_number, status, issued_date, due_date,
              subtotal, tax_amount, discount_amount, total_amount, paid_amount,
              notes, created_by)
           VALUES (:bid, :cid, :pid, :aid, :curr,
                   :number, 'draft', CURDATE(), :due,
                   :subtotal, :tax, :discount, :total, 0,
                   :notes, :uid)`,
          {
            bid: req.user.branchId,
            cid: clientId,
            pid: patientId || null,
            aid: appointmentId || null,
            curr: currencyId || 1,
            number: invoiceNumber,
            due: dueDate || null,
            subtotal,
            tax: taxAmount,
            discount: discountAmount,
            total: totalAmount,
            notes: notes || null,
            uid: req.user.userId,
          }
        );

        for (const item of items) {
          await conn.query(
            `INSERT INTO invoice_items
               (invoice_id, service_id, description, quantity, unit_price, discount_pct, tax_pct, subtotal)
             VALUES (:iid, :sid, :desc, :qty, :price, :disc, :tax, :subtotal)`,
            {
              iid: result.insertId,
              sid: item.serviceId || null,
              desc: item.description,
              qty: item.quantity || 1,
              price: item.unitPrice,
              disc: item.discountPct || 0,
              tax: item.taxPct || 0,
              subtotal: ((Number(item.quantity || 1) * Number(item.unitPrice || 0)) * (1 - Number(item.discountPct || 0) / 100)) + (((Number(item.quantity || 1) * Number(item.unitPrice || 0)) * Number(item.taxPct || 0)) / 100),
            }
          );
        }

        return {
          id: result.insertId,
          invoice_number: invoiceNumber,
          branch_id: req.user.branchId,
          client_id: clientId,
          patient_id: patientId || null,
          appointment_id: appointmentId || null,
          currency_id: currencyId || 1,
          status: 'draft',
          issued_date: new Date().toISOString().slice(0, 10),
          due_date: dueDate || null,
          subtotal,
          tax_amount: taxAmount,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          paid_amount: 0,
          notes: notes || null,
          created_by: req.user.userId,
        };
      });
      return R.created(res, invoice);
    } catch (e) { next(e); }
  }
);

invoicesRouter.patch('/:id/cancel', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE invoices SET status = 'cancelled', notes = CONCAT(COALESCE(notes,''), ' [CANCELLED: ', :reason, ']'), updated_at = NOW()
       WHERE id = :id AND branch_id = :bid AND status IN ('draft','pending')`,
      { reason: req.body.reason || 'n/a', id: req.params.id, bid: req.user.branchId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── Payments ──────────────────────────────────────────────────────────────────
const paymentsRouter = Router();

paymentsRouter.post('/',
  body('invoiceId').isInt(),
  body('amount').isFloat({ min: 0.01 }),
  body('paymentMethod').isIn(['cash','credit_card','debit_card','bank_transfer','check','crypto','other']),
  validate,
  async (req, res, next) => {
    try {
      const { invoiceId, amount, paymentMethod, reference, notes } = req.body;
      await db.transaction(async (conn) => {
        const invoice = await conn.queryOne(
          `SELECT id, total_amount, paid_amount, status
           FROM invoices
           WHERE id = :id AND branch_id = :bid
           FOR UPDATE`,
          { id: invoiceId, bid: req.user.branchId }
        );
        if (!invoice) throw Object.assign(new Error('Factura no encontrada'), { http: 404 });

        const nextPaid = Number(invoice.paid_amount || 0) + Number(amount);
        const nextStatus = nextPaid >= Number(invoice.total_amount || 0) ? 'paid' : 'partial';

        await conn.query(
          `INSERT INTO payments
             (invoice_id, amount, payment_method, reference, payment_status, notes, paid_at, created_by)
           VALUES (:iid, :amount, :method, :reference, 'completed', :notes, NOW(), :uid)`,
          {
            iid: invoiceId,
            amount,
            method: paymentMethod,
            reference: reference || null,
            notes: notes || null,
            uid: req.user.userId,
          }
        );

        await conn.query(
          `UPDATE invoices
           SET paid_amount = paid_amount + :amount,
               status = :status,
               updated_at = NOW()
           WHERE id = :id`,
          { amount, status: nextStatus, id: invoiceId }
        );
      });
      return R.created(res, { message: 'Payment recorded' });
    } catch (e) { next(e); }
  }
);

// ── Inventory ─────────────────────────────────────────────────────────────────
const inventoryRouter = Router();

inventoryRouter.get('/', async (req, res, next) => {
  try {
    const { search, itemType, stockStatus, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['ist.branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (search)      { conds.push('(ii.name LIKE :s OR ii.sku LIKE :s)'); p.s = `%${search}%`; }
    if (itemType)    { conds.push('ii.item_type = :itemType');             p.itemType = itemType; }
    if (stockStatus === 'low')  conds.push('ist.quantity_available <= ist.reorder_point');
    if (stockStatus === 'zero') conds.push('ist.quantity_available = 0');

    const where = `WHERE ${conds.join(' AND ')}`;
    const rows = await db.query(
      `SELECT ii.id, ii.sku, ii.name, ii.item_type, ii.unit_cost, ii.sale_price,
              ist.quantity_available, ist.minimum_stock, ist.reorder_point,
              ii.expiry_date, ii.is_active
       FROM inventory_items ii
       JOIN inventory_stock ist ON ist.item_id = ii.id
       ${where}
       ORDER BY ii.name
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

inventoryRouter.post('/movements',
  body('itemId').isInt(),
  body('movementType').isIn(['purchase','sale','adjustment','transfer','expired','loss']),
  body('quantity').isFloat({ min: 0.001 }),
  validate,
  async (req, res, next) => {
    try {
      const { itemId, movementType, quantity, unitCost, reference, notes } = req.body;
      await db.query(
        `INSERT INTO inventory_movements
           (item_id, branch_id, movement_type, quantity, unit_cost, reference, notes, created_by)
         VALUES (:item, :bid, :type, :qty, :cost, :ref, :notes, :uid)`,
        {
          item: itemId, bid: req.user.branchId, type: movementType,
          qty: quantity, cost: unitCost || null, ref: reference || null,
          notes: notes || null, uid: req.user.userId,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── Price Lists ───────────────────────────────────────────────────────────────
const priceListsRouter = Router();

priceListsRouter.get('/', httpCacheHeaders({ maxAge: 300, scope: 'private' }), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT pl.*, cur.code AS currency
       FROM price_lists pl
       JOIN currencies cur ON pl.currency_id = cur.id
       WHERE pl.branch_id = :bid AND pl.is_active = TRUE`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

priceListsRouter.get('/:id/items', httpCacheHeaders({ maxAge: 300, scope: 'private' }), async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT pli.*, sc.name AS service_name, cat.name AS category
       FROM price_list_items pli
       JOIN services_catalog sc ON pli.service_id = sc.id
       LEFT JOIN service_categories cat ON sc.category_id = cat.id
       WHERE pli.price_list_id = :pid AND pli.is_active = TRUE
       ORDER BY cat.name, sc.name`,
      { pid: req.params.id }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── MercadoPago ───────────────────────────────────────────────────────────────
const mpRouter = Router();

/**
 * POST /payments/mp/preference
 * Genera link de pago Checkout Pro para una factura.
 */
mpRouter.post('/preference',
  body('invoiceId').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { invoiceId } = req.body;

      const inv = await db.queryOne(
        `SELECT i.id, i.invoice_number, i.total_amount, i.status,
                cur.code AS currency,
                CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
                cl.email AS client_email
         FROM invoices i
         JOIN clients cl   ON i.client_id   = cl.id
         JOIN currencies cur ON i.currency_id = cur.id
         WHERE i.id = :id AND i.branch_id = :bid`,
        { id: invoiceId, bid: req.user.branchId }
      );
      if (!inv)                         return R.notFound(res, 'Factura no encontrada');
      if (inv.status === 'paid')        return R.conflict(res, 'La factura ya está pagada');
      if (inv.status === 'cancelled')   return R.conflict(res, 'La factura está cancelada');

      const pref = await mp.createPreference({
        invoiceId:     inv.id,
        invoiceNumber: inv.invoice_number,
        amount:        inv.total_amount,
        currency:      inv.currency,
        payerEmail:    inv.client_email,
        payerName:     inv.client_name,
        description:   `Factura ${inv.invoice_number} — VetManager Pro`,
        orgId:         req.user.orgId,
        branchId:      req.user.branchId,
      });

      // Guardar preferenceId en la factura para trazabilidad
      await db.query(
        `UPDATE invoices SET mp_preference_id = :pref, updated_at = NOW() WHERE id = :id`,
        { pref: pref.preferenceId, id: invoiceId }
      );

      return R.ok(res, pref);
    } catch (e) { next(e); }
  }
);

/**
 * GET /payments/mp/:mpPaymentId
 * Consulta el estado de un pago en MercadoPago.
 */
mpRouter.get('/:mpPaymentId', async (req, res, next) => {
  try {
    const data = await mp.getPayment(req.params.mpPaymentId);
    return R.ok(res, {
      id:          data.id,
      status:      data.status,
      statusDetail: data.status_detail,
      amount:      data.transaction_amount,
      currency:    data.currency_id,
      payer:       data.payer,
      createdAt:   data.date_created,
      approvedAt:  data.date_approved,
    });
  } catch (e) { next(e); }
});

/**
 * POST /payments/mp/:mpPaymentId/refund
 * Reembolso total o parcial.
 */
mpRouter.post('/:mpPaymentId/refund',
  body('amount').optional().isFloat({ min: 0.01 }),
  validate,
  async (req, res, next) => {
    try {
      const { mpPaymentId } = req.params;
      const { amount, reason } = req.body;

      const refund = await mp.refundPayment(mpPaymentId, amount);

      // Registrar el reembolso en pagos internos
      const payment = await db.queryOne(
        `SELECT * FROM payments WHERE mp_payment_id = :mpid`,
        { mpid: String(mpPaymentId) }
      );
      if (payment) {
        await db.query(
          `INSERT INTO payments
             (invoice_id, amount, payment_method, reference, notes, payment_status, created_by)
           VALUES (:iid, :amt, 'mercadopago', :ref, :notes, 'refunded', :uid)`,
          {
            iid:   payment.invoice_id,
            amt:   -(amount || payment.amount),
            ref:   String(refund.id),
            notes: reason || 'Reembolso MercadoPago',
            uid:   req.user.userId,
          }
        );
      }

      return R.ok(res, { refundId: refund.id, status: refund.status });
    } catch (e) { next(e); }
  }
);

/**
 * POST /payments/mp/webhook
 * Notificaciones IPN de MercadoPago — SIN autenticación JWT (llamada desde MP).
 * Se registra en el gateway como ruta pública.
 */
mpRouter.post('/webhook', async (req, res, next) => {
  try {
    // Validar firma
    const xSig  = req.headers['x-signature'] || '';
    const xReqId = req.headers['x-request-id'] || req.headers['x-idempotency-key'] || '';
    const dataId = req.query['data.id'] || req.body?.data?.id || '';

    if (!mp.validateWebhookSignature(xSig, xReqId, dataId)) {
      return res.status(401).json({ success: false, error: { message: 'Firma inválida' } });
    }

    const type = req.body?.type || req.query?.type;

    // Solo procesar notificaciones de tipo "payment"
    if (type !== 'payment') return res.status(200).json({ received: true });

    const mpPaymentId = req.body?.data?.id || req.query?.['data.id'];
    if (!mpPaymentId) return res.status(200).json({ received: true });

    // Obtener detalles del pago
    const paymentData = await mp.getPayment(mpPaymentId);
    const status      = mp.mapMpStatus(paymentData.status);

    // Extraer invoiceId de external_reference  (formato: inv:ID:org:ORG:branch:BRANCH)
    const extRef    = paymentData.external_reference || '';
    const invMatch  = extRef.match(/inv:(\d+)/);
    if (!invMatch) return res.status(200).json({ received: true });

    const invoiceId = parseInt(invMatch[1]);

      if (status === 'completed') {
      await db.transaction(async (conn) => {
        const invoice = await conn.queryOne(
          `SELECT id, total_amount, paid_amount FROM invoices WHERE id = :id FOR UPDATE`,
          { id: invoiceId }
        );
        if (!invoice) return;

        await conn.query(
          `INSERT INTO payments
             (invoice_id, amount, payment_method, reference, mp_payment_id, payment_status, notes, paid_at, created_by)
           VALUES (:iid, :amount, 'mercadopago', :reference, :mpid, 'completed', :notes, NOW(), NULL)`,
          {
            iid: invoiceId,
            amount: paymentData.transaction_amount,
            reference: String(mpPaymentId),
            mpid: String(mpPaymentId),
            notes: `MercadoPago - ${paymentData.payment_type_id}`,
          }
        );

        await conn.query(
          `UPDATE invoices
           SET paid_amount = paid_amount + :amount,
               status = CASE WHEN paid_amount + :amount >= total_amount THEN 'paid' ELSE 'partial' END,
               updated_at = NOW()
           WHERE id = :id`,
          { amount: paymentData.transaction_amount, id: invoiceId }
        );
      });

      // Disparar webhook interno
      enqueue({ event: 'payment.approved', payload: { invoiceId, mpPaymentId, amount: paymentData.transaction_amount } }).catch(() => {});
    }

    if (status === 'refunded') {
      await db.query(
        `UPDATE invoices SET status = 'refunded', updated_at = NOW() WHERE id = :id`,
        { id: invoiceId }
      );
      enqueue({ event: 'payment.refunded', payload: { invoiceId, mpPaymentId } }).catch(() => {});
    }

    return res.status(200).json({ received: true });
  } catch (e) { next(e); }
});

// ── AFIP + PDF ────────────────────────────────────────────────────────────────
const afipRouter = Router();

/**
 * POST /invoices/:id/afip/authorize
 * Autoriza la factura en AFIP y obtiene el CAE.
 */
afipRouter.post('/:id/authorize', async (req, res, next) => {
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
    if (!inv)                  return R.notFound(res, 'Factura no encontrada');
    if (inv.afip_cae)          return R.conflict(res, 'La factura ya tiene CAE asignado');
    if (inv.status === 'paid') return R.conflict(res, 'No se puede autorizar una factura ya pagada');

    // Determinar tipo de comprobante según condición fiscal del cliente
    const tipoComp = afip.getTipoComprobante(inv.fiscal_condition || 'CF');

    // Tipo de doc receptor
    const tipoDoc = inv.fiscal_condition === 'RI'
      ? afip.TIPO_DOC.CUIT
      : (inv.tax_id ? afip.TIPO_DOC.DNI : afip.TIPO_DOC.CONSUMIDOR_FINAL);

    // Calcular IVA (21% sobre neto)
    const importeNeto = inv.subtotal || (inv.total_amount / 1.21);
    const importeIVA  = inv.tax_amount || (inv.total_amount - importeNeto);

    const result = await afip.authorizeVoucher({
      orgId:            inv.org_id,
      tipoComprobante:  tipoComp,
      tipoDocReceptor:  tipoDoc,
      nroDocReceptor:   inv.tax_id || '0',
      importeTotal:     inv.total_amount,
      importeNeto:      Number(importeNeto.toFixed(2)),
      importeIVA:       Number(importeIVA.toFixed(2)),
    });

    // Guardar CAE en la factura
    await db.query(
      `UPDATE invoices
         SET afip_cae=:cae, afip_cae_vto=:vto,
             afip_tipo=:tipo, afip_punto_venta=:pv,
             afip_nro_comprobante=:nro, updated_at=NOW()
       WHERE id=:id`,
      {
        cae:  result.cae,
        vto:  result.caeFechaVencimiento,
        tipo: tipoComp,
        pv:   result.puntoVenta,
        nro:  result.nroComprobante,
        id:   inv.id,
      }
    );

    enqueue({ event: 'invoice.authorized', payload: { invoiceId: inv.id, cae: result.cae }, orgId: inv.org_id }).catch(() => {});

    return R.ok(res, result);
  } catch (e) { next(e); }
});

/**
 * GET /invoices/:id/pdf
 * Genera y descarga el PDF de la factura.
 */
afipRouter.get('/:id/pdf', async (req, res, next) => {
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
      invoice:  inv,
      items,
      payments,
      clinic:   { name: inv.clinic_name, address: inv.clinic_address, phone: inv.clinic_phone, cuit: inv.clinic_cuit },
      client:   { first_name: inv.first_name, last_name: inv.last_name, email: inv.email, phone: inv.client_phone, tax_id: inv.tax_id },
    });

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="factura-${inv.invoice_number}.pdf"`,
      'Content-Length':      pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (e) { next(e); }
});

// ── Suppliers ─────────────────────────────────────────────────────────────────
const suppliersRouter = Router();

suppliersRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM suppliers WHERE org_id = :oid AND is_active = 1 ORDER BY name`,
      { oid: req.user.orgId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

suppliersRouter.post('/',
  body('name').notEmpty().isLength({ max: 120 }),
  body('email').optional().isEmail(),
  validate,
  async (req, res, next) => {
    try {
      const { name, taxId, contactName, email, phone, address, paymentTerms = 30, notes } = req.body;
      const result = await db.query(
        `INSERT INTO suppliers (org_id, name, tax_id, contact_name, email, phone, address, payment_terms, notes)
         VALUES (:oid, :name, :taxId, :contact, :email, :phone, :address, :terms, :notes)`,
        { oid: req.user.orgId, name, taxId: taxId||null, contact: contactName||null, email: email||null, phone: phone||null, address: address||null, terms: paymentTerms, notes: notes||null }
      );
      return R.created(res, { id: result.insertId });
    } catch (e) { next(e); }
  }
);

suppliersRouter.put('/:id',
  body('name').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { name, taxId, contactName, email, phone, address, paymentTerms, notes } = req.body;
      await db.query(
        `UPDATE suppliers SET name=:name, tax_id=:taxId, contact_name=:contact, email=:email,
          phone=:phone, address=:address, payment_terms=:terms, notes=:notes, updated_at=NOW()
         WHERE id=:id AND org_id=:oid`,
        { id: req.params.id, oid: req.user.orgId, name, taxId: taxId||null, contact: contactName||null, email: email||null, phone: phone||null, address: address||null, terms: paymentTerms||30, notes: notes||null }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

suppliersRouter.delete('/:id', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE suppliers SET is_active=0 WHERE id=:id AND org_id=:oid`,
      { id: req.params.id, oid: req.user.orgId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── Inventory: items CRUD + lotes + alertas ───────────────────────────────────

// Items CRUD (extiende el router existente)
inventoryRouter.post('/items',
  body('name').notEmpty(),
  body('itemType').isIn(['medication','supply','food','equipment','vaccine','other']),
  body('salePrice').isFloat({ min: 0 }),
  validate,
  async (req, res, next) => {
    try {
      const { name, sku, itemType, description, unitCost, salePrice, minimumStock, reorderPoint, supplierId, requiresPrescription } = req.body;
      const r = await db.query(
        `INSERT INTO inventory_items (name, sku, item_type, description, unit_cost, sale_price, minimum_stock, requires_prescription, supplier_id, is_active)
         VALUES (:name, :sku, :type, :desc, :cost, :price, :minStock, :rx, :sup, 1)`,
        { name, sku: sku||null, type: itemType, desc: description||null, cost: unitCost||0, price: salePrice, minStock: minimumStock||0, rx: requiresPrescription?1:0, sup: supplierId||null }
      );
      // Crear stock en la sucursal
      await db.query(
        `INSERT INTO inventory_stock (item_id, branch_id, quantity_available, minimum_stock, reorder_point)
         VALUES (:iid, :bid, 0, :min, :reorder)`,
        { iid: r.insertId, bid: req.user.branchId, min: minimumStock||0, reorder: reorderPoint||0 }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

inventoryRouter.put('/items/:id',
  body('name').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { name, sku, description, unitCost, salePrice, minimumStock, reorderPoint, supplierId, isActive } = req.body;
      await db.query(
        `UPDATE inventory_items SET name=:name, sku=:sku, description=:desc, unit_cost=:cost,
          sale_price=:price, minimum_stock=:min, supplier_id=:sup,
          is_active=:active, updated_at=NOW()
         WHERE id=:id`,
        { id: req.params.id, name, sku: sku||null, desc: description||null, cost: unitCost||0, price: salePrice||0, min: minimumStock||0, sup: supplierId||null, active: isActive!==false?1:0 }
      );
      if (reorderPoint !== undefined) {
        await db.query(
          `UPDATE inventory_stock SET reorder_point=:rp, minimum_stock=:min WHERE item_id=:id AND branch_id=:bid`,
          { rp: reorderPoint, min: minimumStock||0, id: req.params.id, bid: req.user.branchId }
        );
      }
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// ── Lotes ─────────────────────────────────────────────────────────────────────
inventoryRouter.get('/batches', async (req, res, next) => {
  try {
    const { itemId, expiringDays, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['ib.branch_id = :bid', 'ib.quantity_available > 0'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (itemId)      { conds.push('ib.item_id = :itemId');                        p.itemId = itemId; }
    if (expiringDays){ conds.push('ib.expiry_date <= DATE_ADD(NOW(), INTERVAL :days DAY)'); p.days = expiringDays; }

    const rows = await db.query(
      `SELECT ib.id, ib.lot_number, ib.expiry_date, ib.manufacture_date,
              ib.quantity_received, ib.quantity_available, ib.unit_cost,
              ii.name AS item_name, ii.sku,
              s.name AS supplier_name
       FROM inventory_batches ib
       JOIN inventory_items ii ON ib.item_id = ii.id
       LEFT JOIN suppliers s   ON ib.supplier_id = s.id
       WHERE ${conds.join(' AND ')}
       ORDER BY ib.expiry_date ASC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

inventoryRouter.post('/batches',
  body('itemId').isInt(),
  body('lotNumber').notEmpty(),
  body('quantityReceived').isFloat({ min: 0.001 }),
  validate,
  async (req, res, next) => {
    try {
      const { itemId, lotNumber, expiryDate, manufactureDate, quantityReceived, unitCost, supplierId, notes } = req.body;
      const r = await db.query(
        `INSERT INTO inventory_batches
           (item_id, branch_id, supplier_id, lot_number, manufacture_date, expiry_date,
            quantity_received, quantity_available, unit_cost, notes, created_by)
         VALUES (:iid, :bid, :sup, :lot, :mfg, :exp, :qty, :qty, :cost, :notes, :uid)`,
        { iid: itemId, bid: req.user.branchId, sup: supplierId||null, lot: lotNumber, mfg: manufactureDate||null, exp: expiryDate||null, qty: quantityReceived, cost: unitCost||null, notes: notes||null, uid: req.user.userId }
      );
      // Actualizar stock disponible
      await db.query(
        `UPDATE inventory_stock SET quantity_available = quantity_available + :qty
         WHERE item_id = :iid AND branch_id = :bid`,
        { qty: quantityReceived, iid: itemId, bid: req.user.branchId }
      );
      // Registrar movimiento
      await db.query(
        `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, unit_cost, reference, batch_id, created_by)
         VALUES (:iid, :bid, 'purchase', :qty, :cost, :lot, :batchId, :uid)`,
        { iid: itemId, bid: req.user.branchId, qty: quantityReceived, cost: unitCost||null, lot: lotNumber, batchId: r.insertId, uid: req.user.userId }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// ── Alertas de stock ──────────────────────────────────────────────────────────
inventoryRouter.get('/alerts', async (req, res, next) => {
  try {
    const { resolved = 'false' } = req.query;
    const rows = await db.query(
      `SELECT sa.id, sa.alert_type, sa.current_stock, sa.threshold, sa.expiry_date,
              sa.notified, sa.created_at, ii.id AS item_id, ii.name AS item_name, ii.sku
       FROM stock_alerts sa
       JOIN inventory_items ii ON sa.item_id = ii.id
       WHERE sa.branch_id = :bid AND sa.resolved = :res
       ORDER BY sa.created_at DESC`,
      { bid: req.user.branchId, res: resolved === 'true' ? 1 : 0 }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// Resolver una alerta
inventoryRouter.patch('/alerts/:id/resolve', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE stock_alerts SET resolved=1, resolved_at=NOW() WHERE id=:id AND branch_id=:bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// Chequear y generar alertas de stock (llamar con cron o manualmente)
inventoryRouter.post('/alerts/check', async (req, res, next) => {
  try {
    const { generated } = await checkAndGenerateAlerts(req.user.branchId);
    return R.ok(res, { generated });
  } catch (e) { next(e); }
});

async function checkAndGenerateAlerts(branchId) {
  let generated = 0;

  // Stock bajo / sin stock
  const lowStock = await db.query(
    `SELECT ii.id, ii.name, ist.quantity_available, ist.minimum_stock, ist.reorder_point
     FROM inventory_stock ist
     JOIN inventory_items ii ON ist.item_id = ii.id
     WHERE ist.branch_id = :bid
       AND ii.is_active = 1
       AND ist.quantity_available <= ist.reorder_point
       AND NOT EXISTS (
         SELECT 1 FROM stock_alerts sa
         WHERE sa.item_id = ii.id AND sa.branch_id = :bid
           AND sa.alert_type IN ('low_stock','out_of_stock') AND sa.resolved = 0
       )`,
    { bid: branchId }
  );

  for (const item of lowStock) {
    const type = item.quantity_available <= 0 ? 'out_of_stock' : 'low_stock';
    await db.query(
      `INSERT INTO stock_alerts (branch_id, item_id, alert_type, current_stock, threshold)
       VALUES (:bid, :iid, :type, :stock, :threshold)`,
      { bid: branchId, iid: item.id, type, stock: item.quantity_available, threshold: item.reorder_point }
    );
    generated++;
  }

  // Lotes por vencer (próximos 30 días)
  const expiring = await db.query(
    `SELECT ib.id, ib.item_id, ib.expiry_date, ib.quantity_available, ii.name
     FROM inventory_batches ib
     JOIN inventory_items ii ON ib.item_id = ii.id
     WHERE ib.branch_id = :bid
       AND ib.quantity_available > 0
       AND ib.expiry_date IS NOT NULL
       AND ib.expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)
       AND NOT EXISTS (
         SELECT 1 FROM stock_alerts sa
         WHERE sa.item_id = ib.item_id AND sa.branch_id = :bid
           AND sa.alert_type = 'expiring_soon' AND sa.expiry_date = ib.expiry_date AND sa.resolved = 0
       )`,
    { bid: branchId }
  );

  for (const batch of expiring) {
    const type = new Date(batch.expiry_date) < new Date() ? 'expired' : 'expiring_soon';
    await db.query(
      `INSERT INTO stock_alerts (branch_id, item_id, alert_type, current_stock, expiry_date)
       VALUES (:bid, :iid, :type, :stock, :exp)`,
      { bid: branchId, iid: batch.item_id, type, stock: batch.quantity_available, exp: batch.expiry_date }
    );
    generated++;
  }

  return { generated };
}

// ── Órdenes de compra ─────────────────────────────────────────────────────────
const purchaseOrdersRouter = Router();

purchaseOrdersRouter.get('/', async (req, res, next) => {
  try {
    const { status, supplierId, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['po.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status)     { conds.push('po.status = :status');          p.status = status; }
    if (supplierId) { conds.push('po.supplier_id = :supplierId'); p.supplierId = supplierId; }

    const rows = await db.query(
      `SELECT po.id, po.po_number, po.status, po.ordered_date, po.expected_date,
              po.received_date, po.total_amount, s.name AS supplier_name, po.created_at
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE ${conds.join(' AND ')}
       ORDER BY po.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

purchaseOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const po = await db.queryOne(
      `SELECT po.*, s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = :id AND po.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!po) return R.notFound(res, 'Orden de compra no encontrada');
    const items = await db.query(
      `SELECT poi.*, ii.name AS item_name, ii.sku
       FROM purchase_order_items poi
       JOIN inventory_items ii ON poi.item_id = ii.id
       WHERE poi.purchase_order_id = :pid`,
      { pid: po.id }
    );
    return R.ok(res, { ...po, items });
  } catch (e) { next(e); }
});

purchaseOrdersRouter.post('/',
  body('supplierId').isInt(),
  body('items').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { supplierId, items, orderedDate, expectedDate, notes } = req.body;

      // Generar número de PO
      const [{ count }] = await db.query(
        `SELECT COUNT(*)+1 AS count FROM purchase_orders WHERE branch_id=:bid`,
        { bid: req.user.branchId }
      );
      const poNumber = `PO-${String(count).padStart(5, '0')}`;

      const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitCost), 0);

      const r = await db.query(
        `INSERT INTO purchase_orders (branch_id, supplier_id, po_number, status, ordered_date, expected_date, subtotal, total_amount, notes, created_by)
         VALUES (:bid, :sup, :poNum, 'draft', :ordered, :expected, :sub, :total, :notes, :uid)`,
        { bid: req.user.branchId, sup: supplierId, poNum: poNumber, ordered: orderedDate||null, expected: expectedDate||null, sub: subtotal, total: subtotal, notes: notes||null, uid: req.user.userId }
      );

      for (const item of items) {
        await db.query(
          `INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity_ordered, unit_cost, lot_number, expiry_date, notes)
           VALUES (:poid, :iid, :qty, :cost, :lot, :exp, :notes)`,
          { poid: r.insertId, iid: item.itemId, qty: item.quantity, cost: item.unitCost, lot: item.lotNumber||null, exp: item.expiryDate||null, notes: item.notes||null }
        );
      }

      return R.created(res, { id: r.insertId, poNumber });
    } catch (e) { next(e); }
  }
);

// Enviar OC al proveedor (draft → sent)
purchaseOrdersRouter.patch('/:id/send', async (req, res, next) => {
  try {
    const po = await db.queryOne(
      `SELECT po.*, s.email FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=:id AND po.branch_id=:bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!po)               return R.notFound(res, 'OC no encontrada');
    if (po.status !== 'draft') return R.conflict(res, `No se puede enviar una OC en estado '${po.status}'`);

    await db.query(
      `UPDATE purchase_orders SET status='sent', ordered_date=COALESCE(ordered_date, CURDATE()), updated_at=NOW() WHERE id=:id`,
      { id: po.id }
    );

    // Notificar por email al proveedor (fire-and-forget)
    if (po.email) {
      const { send } = require('../../../shared/email');
      send({ to: po.email, subject: `Nueva orden de compra ${po.po_number}`, html: `<p>Se ha emitido la orden de compra <b>${po.po_number}</b>. Por favor confirme recepción.</p>` }).catch(() => {});
    }

    return R.ok(res, { message: 'OC enviada al proveedor' });
  } catch (e) { next(e); }
});

// Recibir mercadería (sent|partial → received|partial)
purchaseOrdersRouter.post('/:id/receive',
  body('items').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { items } = req.body;
      const po = await db.queryOne(
        `SELECT * FROM purchase_orders WHERE id=:id AND branch_id=:bid AND status IN ('sent','partial')`,
        { id: req.params.id, bid: req.user.branchId }
      );
      if (!po) return R.notFound(res, 'OC no encontrada o no está en estado enviada');

      await db.transaction(async (conn) => {
        for (const item of items) {
          const poi = await db.queryOne(
            `SELECT * FROM purchase_order_items WHERE id=:id AND purchase_order_id=:poid`,
            { id: item.poItemId, poid: po.id }
          );
          if (!poi) continue;

          const qtyReceiving = Math.min(item.quantityReceived, poi.quantity_ordered - poi.quantity_received);
          if (qtyReceiving <= 0) continue;

          // Actualizar ítem de OC
          await conn.execute(
            `UPDATE purchase_order_items SET quantity_received = quantity_received + ?, lot_number=COALESCE(?,lot_number), expiry_date=COALESCE(?,expiry_date) WHERE id=?`,
            [qtyReceiving, item.lotNumber||null, item.expiryDate||null, poi.id]
          );

          // Crear o actualizar lote
          const [batchResult] = await conn.execute(
            `INSERT INTO inventory_batches (item_id, branch_id, supplier_id, lot_number, expiry_date, quantity_received, quantity_available, unit_cost, purchase_order_id, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [poi.item_id, req.user.branchId, po.supplier_id, item.lotNumber||poi.lot_number||'SIN-LOTE', item.expiryDate||poi.expiry_date||null, qtyReceiving, qtyReceiving, poi.unit_cost, po.id, req.user.userId]
          );

          // Actualizar stock
          await conn.execute(
            `UPDATE inventory_stock SET quantity_available = quantity_available + ? WHERE item_id=? AND branch_id=?`,
            [qtyReceiving, poi.item_id, req.user.branchId]
          );

          // Movimiento
          await conn.execute(
            `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, unit_cost, reference, batch_id, created_by)
             VALUES (?,?,'purchase',?,?,?,?,?)`,
            [poi.item_id, req.user.branchId, qtyReceiving, poi.unit_cost, po.po_number, batchResult.insertId, req.user.userId]
          );
        }

        // Recalcular estado OC
        const [pending] = await conn.execute(
          `SELECT COUNT(*) AS c FROM purchase_order_items WHERE purchase_order_id=? AND quantity_received < quantity_ordered`,
          [po.id]
        );
        const newStatus = pending[0].c > 0 ? 'partial' : 'received';
        await conn.execute(
          `UPDATE purchase_orders SET status=?, received_date=COALESCE(received_date, CURDATE()), updated_at=NOW() WHERE id=?`,
          [newStatus, po.id]
        );

        // Resolver alertas de stock relacionadas
        await conn.execute(
          `UPDATE stock_alerts sa
           JOIN purchase_order_items poi ON poi.purchase_order_id=? AND sa.item_id=poi.item_id
           SET sa.resolved=1, sa.resolved_at=NOW()
           WHERE sa.branch_id=? AND sa.resolved=0 AND sa.alert_type IN ('low_stock','out_of_stock')`,
          [po.id, req.user.branchId]
        );
      });

      return R.ok(res, { message: 'Mercadería recibida correctamente' });
    } catch (e) { next(e); }
  }
);

// Cancelar OC
purchaseOrdersRouter.patch('/:id/cancel', async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE purchase_orders SET status='cancelled', updated_at=NOW()
       WHERE id=:id AND branch_id=:bid AND status IN ('draft','sent')`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!result.affectedRows) return R.conflict(res, 'No se puede cancelar esta OC');
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── Facturación consolidada multi-sucursal ───────────────────────────────────
const consolidatedRouter = Router();

// GET /billing/consolidated/summary?from=&to= — resumen financiero de todo el org
consolidatedRouter.get('/summary', async (req, res, next) => {
  try {
    const from = req.query.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const to   = req.query.to   || new Date().toISOString().slice(0, 10);

    const data = await mb.consolidatedFinancials(req.user.orgId, from, to);
    return R.ok(res, data, { from, to });
  } catch (e) { next(e); }
});

// GET /billing/consolidated/invoices?branchId=&from=&to= — facturas de todo el org
consolidatedRouter.get('/invoices', async (req, res, next) => {
  try {
    const { branchId, from, to, status, page = 1, limit = 50 } = req.query;
    const now  = new Date();
    const f    = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const t    = to   || now.toISOString().slice(0, 10);
    const offset = (page - 1) * limit;

    const conds = ['b.organization_id = :orgId', 'i.issued_date BETWEEN :from AND :to', "i.status != 'cancelled'"];
    const p     = { orgId: req.user.orgId, from: f, to: t, limit: parseInt(limit), offset: parseInt(offset) };

    if (branchId) { conds.push('i.branch_id = :branchId'); p.branchId = branchId; }
    if (status)   { conds.push('i.status = :status');       p.status   = status; }

    const rows = await db.query(
      `SELECT i.id, i.invoice_number, i.status, i.issued_date, i.total_amount, i.paid_amount,
              b.name AS branch_name, b.id AS branch_id,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name
       FROM invoices i
       JOIN branches b ON i.branch_id = b.id
       JOIN clients cl ON i.client_id = cl.id
       WHERE ${conds.join(' AND ')}
       ORDER BY i.issued_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows, { from: f, to: t });
  } catch (e) { next(e); }
});

// GET /billing/consolidated/revenue-trend?groupBy=month — tendencia de ingresos por sucursal
consolidatedRouter.get('/revenue-trend', async (req, res, next) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;
    const now = new Date();
    const f   = from || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t   = to   || now.toISOString().slice(0, 10);
    const fmt = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%x-W%v' : '%Y-%m';

    const rows = await db.query(
      `SELECT DATE_FORMAT(i.issued_date, :fmt) AS period,
              b.id AS branch_id, b.name AS branch_name,
              ROUND(SUM(i.total_amount), 2) AS revenue,
              COUNT(DISTINCT i.id) AS invoices
       FROM invoices i
       JOIN branches b ON i.branch_id = b.id AND b.organization_id = :orgId
       WHERE i.issued_date BETWEEN :from AND :to AND i.status != 'cancelled'
       GROUP BY period, b.id ORDER BY period, b.name`,
      { fmt, orgId: req.user.orgId, from: f, to: t }
    );

    // Reagrupar por período para formato chart-friendly
    const periods = {};
    const branches = [...new Set(rows.map(r => r.branch_name))];
    for (const row of rows) {
      if (!periods[row.period]) periods[row.period] = { period: row.period };
      periods[row.period][row.branch_name] = row.revenue;
    }

    return R.ok(res, {
      branches,
      data   : Object.values(periods),
      raw    : rows,
    }, { from: f, to: t });
  } catch (e) { next(e); }
});

// GET /billing/consolidated/outstanding — deuda pendiente por sucursal
consolidatedRouter.get('/outstanding', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT b.id AS branch_id, b.name AS branch_name,
              COUNT(i.id) AS overdue_invoices,
              ROUND(SUM(i.total_amount - i.paid_amount), 2) AS outstanding_amount,
              ROUND(AVG(DATEDIFF(NOW(), i.due_date)), 1) AS avg_days_overdue
       FROM invoices i
       JOIN branches b ON i.branch_id = b.id AND b.organization_id = :orgId
       WHERE i.status IN ('partial', 'pending')
         AND i.due_date < NOW()
       GROUP BY b.id ORDER BY outstanding_amount DESC`,
      { orgId: req.user.orgId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── App ───────────────────────────────────────────────────────────────────────
const { guardWrite } = require('../../../shared/serviceBase');
const app = buildApp('billing', (app, requirePerm) => {
  app.use('/invoices',              requirePerm('invoices:read'),    guardWrite('invoices'),    invoicesRouter);
  app.use('/invoices',              requirePerm('invoices:create'),  afipRouter);
  app.use('/payments/mp/webhook',   mpRouter);  // público
  app.use('/payments/mp',           requirePerm('payments:create'),  mpRouter);
  app.use('/payments',              requirePerm('payments:create'),  paymentsRouter);
  app.use('/price-lists',           requirePerm('invoices:read'),    guardWrite('invoices'),    priceListsRouter);
  app.use('/inventory',             requirePerm('inventory:read'),   guardWrite('inventory'),   inventoryRouter);
  app.use('/suppliers',             requirePerm('inventory:read'),   guardWrite('inventory'),   suppliersRouter);
  app.use('/purchase-orders',       requirePerm('inventory:read'),   guardWrite('inventory'),   purchaseOrdersRouter);
  app.use('/billing/consolidated',  requirePerm('reports:read'),     consolidatedRouter);
  app.use('/billing', requirePerm('billing:read'), stripeRouter);
}, { specPath: path.join(__dirname, 'openapi.yaml') });

const PORT = parseInt(process.env.PORT || '4055');
if (process.env.NODE_ENV !== 'test') {
  startService(app, 'billing', PORT);
}

module.exports = app;
