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

router.post('/2fa/setup', requireInternalSig, fromHeaders, ctrl.setup2fa);

router.post('/2fa/verify',
  requireInternalSig,
  fromHeaders,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validateRequest,
  ctrl.verify2fa
);

router.delete('/2fa',
  requireInternalSig,
  fromHeaders,
  body('token').isLength({ min: 6, max: 6 }).isNumeric(),
  validateRequest,
  ctrl.disable2fa
);

const twoFaChallengeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => `2fa:${req.body?.userId || req.ip}`,
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
