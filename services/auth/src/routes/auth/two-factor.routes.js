'use strict';

const rateLimit = require('express-rate-limit');
const { Router } = require('express');
const ctrl = require('../../controllers/auth.controller');
const {
  body,
  requireInternalSig,
  fromHeaders,
  validateRequest,
} = require('./_common');

const router = Router();

// Rate limit for 2FA management endpoints (setup, verify, disable).
// Keyed by userId from forwarded header to prevent brute-forcing TOTP secrets.
// Falls back to IP if header is absent.
const twoFaManagementLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => {
    const userId = req.headers['x-user-id'];
    return userId ? `2fa:mgmt:${userId}` : `2fa:mgmt:ip:${req.ip}`;
  },
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { message: 'Too many 2FA requests. Try again in 15 minutes.', code: 'RATE_LIMIT_EXCEEDED' },
  }),
});

router.post('/2fa/setup', requireInternalSig, fromHeaders, twoFaManagementLimit, ctrl.setup2fa);

router.post('/2fa/verify',
  requireInternalSig,
  fromHeaders,
  twoFaManagementLimit,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validateRequest,
  ctrl.verify2fa
);

router.delete('/2fa',
  requireInternalSig,
  fromHeaders,
  twoFaManagementLimit,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validateRequest,
  ctrl.disable2fa
);

const twoFaChallengeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  // Key by pendingToken (server-generated) — prevents IP rotation bypass
  // and prevents locking out other users by supplying their userId.
  // Falls back to IP only if token is absent (shouldn't happen given validation).
  keyGenerator: (req) => {
    const token = req.body?.pendingToken;
    return token ? `2fa:tok:${token}` : `2fa:ip:${req.ip}`;
  },
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { message: 'Too many 2FA attempts. Try again in 15 minutes.', code: 'RATE_LIMIT_EXCEEDED' },
  }),
});

router.post('/2fa/challenge',
  requireInternalSig,
  twoFaChallengeLimit,
  body('pendingToken').notEmpty(),
  body('token').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  body('code').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  validateRequest,
  ctrl.challenge2fa
);

module.exports = router;
