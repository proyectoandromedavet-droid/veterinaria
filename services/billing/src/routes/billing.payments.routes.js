'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, logBillingError } = require('./billing.common');

const router = Router();

router.post('/',
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
    } catch (e) {
      logBillingError('POST /payments', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
