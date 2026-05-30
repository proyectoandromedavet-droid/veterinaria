'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, buildInvoiceNumber, logBillingError } = require('./billing.common');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, clientId, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['i.branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('i.status = :status'); p.status = status; }
    if (clientId) { conds.push('i.client_id = :clientId'); p.clientId = clientId; }
    if (from) { conds.push('i.issued_date >= :from'); p.from = from; }
    if (to) { conds.push('i.issued_date <= :to'); p.to = to; }

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
  } catch (e) {
    logBillingError('GET /invoices', e, { branchId: req.user?.branchId, query: req.query });
    next(e);
  }
});

router.get('/aging', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_invoice_aging WHERE branch_id = :bid`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) {
    logBillingError('GET /invoices/aging', e, { branchId: req.user?.branchId });
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
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
  } catch (e) {
    logBillingError('GET /invoices/:id', e, { invoiceId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

router.post('/',
  body('clientId').isInt(),
  body('currencyId').optional().isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { clientId, patientId, appointmentId, currencyId, dueDate, notes, items = [] } = req.body;
      const invoice = await db.transaction(async (conn) => {
        await conn.query(
          `INSERT IGNORE INTO invoice_branch_sequences (branch_id, next_seq) VALUES (:bid, 0)`,
          { bid: req.user.branchId }
        );
        await conn.query(
          `UPDATE invoice_branch_sequences SET next_seq = next_seq + 1 WHERE branch_id = :bid`,
          { bid: req.user.branchId }
        );
        const { seq } = await conn.queryOne(
          `SELECT next_seq AS seq FROM invoice_branch_sequences WHERE branch_id = :bid`,
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
    } catch (e) {
      logBillingError('POST /invoices', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE invoices SET status = 'cancelled', notes = CONCAT(COALESCE(notes,''), ' [CANCELLED: ', :reason, ']'), updated_at = NOW()
       WHERE id = :id AND branch_id = :bid AND status IN ('draft','pending')`,
      { reason: req.body.reason || 'n/a', id: req.params.id, bid: req.user.branchId }
    );
    return R.noContent(res);
  } catch (e) {
    logBillingError('PATCH /invoices/:id/cancel', e, { invoiceId: req.params.id, branchId: req.user?.branchId, body: req.body });
    next(e);
  }
});

module.exports = { router };
