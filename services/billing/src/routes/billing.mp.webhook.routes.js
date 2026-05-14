'use strict';

const { Router } = require('express');
const { db, mp, enqueue, eventBus, logBillingError } = require('./billing.common');
const R = require('../../../../shared/response');
const { createLogger } = require('../../../../shared/logger');

const router = Router();
const log = createLogger('billing-mp-webhook');

router.post('/', async (req, res, next) => {
  try {
    const xSig = req.headers['x-signature'] || '';
    const xReqId = req.headers['x-request-id'] || req.headers['x-idempotency-key'] || '';
    const dataId = req.query['data.id'] || req.body?.data?.id || '';

    if (!mp.validateWebhookSignature(xSig, xReqId, dataId)) {
      return R.error(res, 401, 'Firma inválida', null, 'AUTH_012');
    }

    const type = req.body?.type || req.query?.type;
    if (type !== 'payment') return res.status(200).json({ received: true });

    const mpPaymentId = req.body?.data?.id || req.query?.['data.id'];
    if (!mpPaymentId) return res.status(200).json({ received: true });

    const paymentData = await mp.getPayment(mpPaymentId);
    const status = mp.mapMpStatus(paymentData.status);

    const extRef = paymentData.external_reference || '';
    const invMatch = extRef.match(/inv:(\d+)/);
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

      enqueue({ event: 'payment.approved', payload: { invoiceId, mpPaymentId, amount: paymentData.transaction_amount } }).catch((err) => {
        log.warn('MP webhook enqueue failed', { error: err.message, invoiceId, mpPaymentId });
      });
      eventBus.publish('billing.payment.approved', { invoiceId, mpPaymentId, amount: paymentData.transaction_amount }).catch((err) => {
        log.warn('MP webhook event publish failed', { error: err.message, invoiceId, mpPaymentId });
      });
    }

    if (status === 'refunded') {
      await db.query(
        `UPDATE invoices SET status = 'refunded', updated_at = NOW() WHERE id = :id`,
        { id: invoiceId }
      );
      enqueue({ event: 'payment.refunded', payload: { invoiceId, mpPaymentId } }).catch((err) => {
        log.warn('MP webhook enqueue failed', { error: err.message, invoiceId, mpPaymentId });
      });
      eventBus.publish('billing.payment.refunded', { invoiceId, mpPaymentId }).catch((err) => {
        log.warn('MP webhook event publish failed', { error: err.message, invoiceId, mpPaymentId });
      });
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    logBillingError('POST /payments/mp/webhook', e, { body: req.body, query: req.query });
    next(e);
  }
});

module.exports = { router };
