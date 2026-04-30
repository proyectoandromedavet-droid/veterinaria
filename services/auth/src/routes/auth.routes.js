'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const ctrl     = require('../controllers/auth.controller');
const calendar = require('../../../../shared/calendar');
const { captchaMiddleware } = require('../../../../shared/captcha');
const { requireInternalSig } = require('../../../../shared/internalAuth');
const rateLimit = require('express-rate-limit');

const router = Router();

// ── Validation middleware ─────────────────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Validation failed', details: errors.array() },
    });
  }
  next();
}

// ── Internal (called by gateway only, no user auth) ───────────────────────────
router.post('/internal/validate-api-key', requireInternalSig, ctrl.validateApiKey);

// Resolve tenant subdomain slug → org_id (used by gateway subdomain middleware)
router.get('/internal/orgs/by-slug/:slug', requireInternalSig, async (req, res, next) => {
  try {
    const db  = require('../../../../shared/db');
    const row = await db.queryOne(
      `SELECT t.org_id, t.plan, t.status
       FROM tenants t
       WHERE t.subdomain = :slug`,
      { slug: req.params.slug }
    );
    if (!row) return res.status(404).json({ success: false, error: { message: 'Tenant not found' } });
    if (row.status !== 'active') {
      return res.status(403).json({ success: false, error: { message: `Tenant is ${row.status}` } });
    }
    res.json({ success: true, orgId: row.org_id, plan: row.plan });
  } catch (err) { next(err); }
});

// ── Public ────────────────────────────────────────────────────────────────────
router.post('/login',
  captchaMiddleware,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validate,
  ctrl.login
);

router.post('/refresh', ctrl.refresh);
router.get('/sso/:provider/connect', ctrl.ssoConnect);
router.get('/sso/:provider/callback', ctrl.ssoCallback);

router.post('/password-reset/request',
  captchaMiddleware,
  body('email').isEmail().normalizeEmail(),
  validate,
  ctrl.requestPasswordReset
);

router.post('/password-reset/confirm',
  body('token').notEmpty(),
  body('newPassword').isLength({ min: 10 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/),
  validate,
  ctrl.confirmPasswordReset
);

// ── Protected (JWT required — gateway injects X-User-* headers) ───────────────
// In microservice, we read user from injected headers (not JWT directly)
function fromHeaders(req, _res, next) {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
    email:    req.headers['x-user-email'],
    jti:      req.headers['x-jti'],
  };
  next();
}

router.post('/logout',      requireInternalSig, fromHeaders, ctrl.logout);
router.post('/logout-all',  requireInternalSig, fromHeaders, ctrl.logoutAll);
router.get('/me',           requireInternalSig, fromHeaders, ctrl.me);

router.post('/change-password',
  requireInternalSig,
  fromHeaders,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 10 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/),
  validate,
  ctrl.changePassword
);

router.get('/sessions',              requireInternalSig, fromHeaders, ctrl.listSessions);
router.delete('/sessions/:id',       requireInternalSig, fromHeaders, ctrl.revokeSession);
router.get('/api-keys',              requireInternalSig, fromHeaders, ctrl.listApiKeys);
router.post('/api-keys',
  requireInternalSig,
  fromHeaders,
  body('name').notEmpty().isLength({ max: 60 }),
  validate,
  ctrl.createApiKey
);
router.delete('/api-keys/:id',       requireInternalSig, fromHeaders, ctrl.deleteApiKey);

// ── 2FA ───────────────────────────────────────────────────────────────────────
router.post('/2fa/setup',   requireInternalSig, fromHeaders, ctrl.setup2fa);
router.post('/2fa/verify',
  requireInternalSig,
  fromHeaders,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  ctrl.verify2fa
);
router.delete('/2fa',
  requireInternalSig,
  fromHeaders,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  ctrl.disable2fa
);
// Called during login flow when user has 2FA enabled (no JWT yet)
// Rate-limited: 5 attempts per 15 min per userId to prevent TOTP brute-force
const twoFaChallengeLimit = rateLimit({
  windowMs:     15 * 60 * 1000,
  max:          5,
  keyGenerator: (req) => `2fa:${req.body?.userId || req.ip}`,
  handler:      (_req, res) => res.status(429).json({
    success: false,
    error:   { message: 'Too many 2FA attempts. Try again in 15 minutes.', code: 'RATE_LIMIT_EXCEEDED' },
  }),
});

router.post('/2fa/challenge',
  requireInternalSig,
  twoFaChallengeLimit,
  body('pendingToken').notEmpty(),
  body('token').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  body('code').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
  ctrl.challenge2fa
);

// ── Google Calendar OAuth — iniciar conexión (autenticado) ───────────────────
// GET /auth/google/connect → redirige al consentimiento de Google
router.get('/google/connect', requireInternalSig, fromHeaders, async (req, res) => {
  const { v4: uuidv4 }   = require('uuid');
  const { getRedisSingleton } = require('../../../../shared/redis');

  const userId = req.user.userId;
  if (!userId) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

  const nonce  = uuidv4();
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    const redis = await getRedisSingleton('auth-oauth', 'auth-oauth');
    // Nonce expira en 10 min — solo para el tiempo del flujo OAuth
    await redis.setEx(`oauth:nonce:${nonce}`, 600, String(userId));
  } catch (_) {
    return res.status(503).json({ success: false, error: { message: 'Service temporarily unavailable' } });
  }

  return res.redirect(calendar.getAuthUrl(nonce));
});

// ── Google Calendar OAuth callback (público — redirige desde Google) ──────────
// GET /auth/google/callback?code=xxx&state=<nonce>
router.get('/google/callback', async (req, res) => {
  const { code, state: nonce, error } = req.query;
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    return res.redirect(`${FRONTEND_URL}/settings/calendar?error=oauth_denied`);
  }
  if (!code || !nonce) {
    return res.status(400).json({ success: false, error: { message: 'Parámetros inválidos' } });
  }

  let userId;
  try {
    const { getRedisSingleton } = require('../../../../shared/redis');
    const redis = await getRedisSingleton('auth-oauth', 'auth-oauth');
    userId = await redis.get(`oauth:nonce:${nonce}`);
    if (userId) await redis.del(`oauth:nonce:${nonce}`);  // consume nonce (single use)
  } catch (_) {
    return res.redirect(`${FRONTEND_URL}/settings/calendar?error=internal_error`);
  }

  if (!userId) {
    // Nonce inválido o expirado — posible CSRF
    return res.redirect(`${FRONTEND_URL}/settings/calendar?error=invalid_state`);
  }

  try {
    await calendar.exchangeCode(userId, code);
    return res.redirect(`${FRONTEND_URL}/settings/calendar?connected=true`);
  } catch (_) {
    return res.redirect(`${FRONTEND_URL}/settings/calendar?error=exchange_failed`);
  }
});

module.exports = router;
