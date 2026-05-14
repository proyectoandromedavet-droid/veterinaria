'use strict';
/**
 * Stripe billing routes.
 * Todos los endpoints de gestión requieren auth.
 * El webhook es público (validado por firma Stripe).
 *
 * POST   /billing/subscriptions              → crear suscripción
 * GET    /billing/subscriptions/current      → plan actual
 * DELETE /billing/subscriptions              → cancelar
 * GET    /billing/subscriptions/portal       → URL del portal Stripe
 * POST   /payments/stripe/webhook            → webhook de Stripe (montado en gateway)
 */
const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db     = require('../../../../shared/db');
const stripe = require('../../../../shared/stripe');
const logger = require('../../../../shared/logger');
const R = require('../../../../shared/response');
const { logBillingError } = require('./billing.common');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return R.error(res, 400, 'Validation failed', errors.array(), 'VALIDATION_ERROR');
  next();
}

function stripeAvailable(req, res, next) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return R.error(res, 501, 'Stripe billing not configured', null, 'SVC_005');
  }
  next();
}

router.use(stripeAvailable);

// POST /billing/subscriptions
router.post('/subscriptions',
  body('plan').isIn(['basic', 'pro', 'enterprise']),
  body('email').isEmail(),
  validate,
  async (req, res, next) => {
    try {
      const orgId   = req.user?.orgId;
      const { plan, email, orgName } = req.body;

      const subscription = await stripe.createSubscription(orgId, plan, email, orgName);
      res.status(201).json({
        success: true,
        data: {
          subscriptionId: subscription.id,
          status:         subscription.status,
          plan,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        },
      });
    } catch (err) {
      if (err.http) return R.error(res, err.http, err.message, null, err.code);
      next(err);
    }
  },
);

// GET /billing/subscriptions/current
router.get('/subscriptions/current', async (req, res, next) => {
  try {
    const orgId  = req.user?.orgId;
    const tenant = await db.queryOne(
      'SELECT plan, stripe_subscription_id, next_billing_date, billing_email FROM tenants WHERE org_id = :orgId',
      { orgId },
    );

    if (!tenant) return R.error(res, 404, 'Tenant not found', null, 'TENANT_001');

    res.json({ success: true, data: tenant });
  } catch (err) {
    logBillingError('GET /billing/subscriptions/current', err, { orgId: req.user?.orgId });
    next(err);
  }
});

// DELETE /billing/subscriptions
router.delete('/subscriptions', async (req, res, next) => {
  try {
    const orgId = req.user?.orgId;
    await stripe.cancelSubscription(orgId);
    res.json({ success: true, message: 'Subscription cancelled. Plan downgraded to free.' });
  } catch (err) {
    if (err.http) return R.error(res, err.http, err.message);
    next(err);
  }
});

// GET /billing/subscriptions/portal
router.get('/subscriptions/portal', async (req, res, next) => {
  try {
    const orgId     = req.user?.orgId;
    const returnUrl = req.query.return_url;
    const url = await stripe.getBillingPortalUrl(orgId, returnUrl);
    res.json({ success: true, data: { portalUrl: url } });
  } catch (err) {
    if (err.http) return R.error(res, err.http, err.message);
    next(err);
  }
});

// POST /payments/stripe/webhook — este route se monta directamente en gateway como ruta PÚBLICA
// Exportamos el handler para uso en gateway
async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event;
  try {
    // req.body debe ser el raw buffer para validación de firma
    const payload = req.rawBody || JSON.stringify(req.body);
    event = stripe.constructWebhookEvent(payload, sig);
  } catch (err) {
    logger.warn('[stripe-webhook] Invalid signature', { err: err.message });
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  try {
    const orgId = event.data?.object?.metadata?.org_id;

    // Registrar evento
    if (orgId) {
      await db.query(
        `INSERT IGNORE INTO subscription_events (org_id, event_type, stripe_event_id, payload)
         VALUES (:orgId, :type, :eventId, :payload)`,
        { orgId, type: event.type, eventId: event.id, payload: JSON.stringify(event.data.object) },
      );
    }

    // Manejar eventos relevantes
    switch (event.type) {
      case 'invoice.payment_succeeded':
        if (orgId) {
          await db.query(
            'UPDATE tenants SET next_billing_date = DATE_ADD(NOW(), INTERVAL 1 MONTH) WHERE org_id = :orgId',
            { orgId },
          );
          logger.info('[stripe-webhook] Payment succeeded', { orgId, eventId: event.id });
        }
        break;

      case 'invoice.payment_failed':
        if (orgId) {
          logger.warn('[stripe-webhook] Payment failed', { orgId, eventId: event.id });
          // Aquí se podría enviar email de aviso o marcar el tenant como past_due
        }
        break;

      case 'customer.subscription.deleted':
        if (orgId) {
          await db.query(
            'UPDATE tenants SET plan = :plan, stripe_subscription_id = NULL WHERE org_id = :orgId',
            { plan: 'free', orgId },
          );
          logger.info('[stripe-webhook] Subscription deleted, plan downgraded to free', { orgId });
        }
        break;
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('[stripe-webhook] Handler error', { err: err.message });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

module.exports = { router, stripeWebhookHandler };
