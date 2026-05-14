'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, mp, validate, logBillingError } = require('./billing.common');

const router = Router();

router.post('/preference',
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
      if (!inv) return R.notFound(res, 'Factura no encontrada');
      if (inv.status === 'paid') return R.conflict(res, 'La factura ya está pagada');
      if (inv.status === 'cancelled') return R.conflict(res, 'La factura está cancelada');

      const pref = await mp.createPreference({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        amount: inv.total_amount,
        currency: inv.currency,
        payerEmail: inv.client_email,
        payerName: inv.client_name,
        description: `Factura ${inv.invoice_number} — VetManager Pro`,
        orgId: req.user.orgId,
        branchId: req.user.branchId,
      });

      await db.query(
        `UPDATE invoices SET mp_preference_id = :pref, updated_at = NOW() WHERE id = :id`,
        { pref: pref.preferenceId, id: invoiceId }
      );

      return R.ok(res, pref);
    } catch (e) {
      logBillingError('POST /payments/mp/preference', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.get('/:mpPaymentId', async (req, res, next) => {
  try {
    const data = await mp.getPayment(req.params.mpPaymentId);
    return R.ok(res, {
      id: data.id,
      status: data.status,
      statusDetail: data.status_detail,
      amount: data.transaction_amount,
      currency: data.currency_id,
      payer: data.payer,
      createdAt: data.date_created,
      approvedAt: data.date_approved,
    });
  } catch (e) {
    logBillingError('GET /payments/mp/:mpPaymentId', e, { mpPaymentId: req.params.mpPaymentId });
    next(e);
  }
});

router.post('/:mpPaymentId/refund',
  body('amount').optional().isFloat({ min: 0.01 }),
  validate,
  async (req, res, next) => {
    try {
      const { mpPaymentId } = req.params;
      const { amount, reason } = req.body;
      const refund = await mp.refundPayment(mpPaymentId, amount);

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
            iid: payment.invoice_id,
            amt: -(amount || payment.amount),
            ref: String(refund.id),
            notes: reason || 'Reembolso MercadoPago',
            uid: req.user.userId,
          }
        );
      }

      return R.ok(res, { refundId: refund.id, status: refund.status });
    } catch (e) {
      logBillingError('POST /payments/mp/:mpPaymentId/refund', e, { mpPaymentId: req.params.mpPaymentId, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
