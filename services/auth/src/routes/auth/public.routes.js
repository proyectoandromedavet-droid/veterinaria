'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../../controllers/auth.controller');
const {
  body,
  captchaMiddleware,
  validateRequest,
  strongPasswordField,
} = require('./_common');

const router = Router();

const ssoConnectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many SSO requests', code: 'RATE_LIMIT_EXCEEDED' } },
});

router.post('/login',
  captchaMiddleware,
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  validateRequest,
  ctrl.login
);

router.post('/refresh', ctrl.refresh);
router.get('/sso/:provider/connect', ssoConnectLimiter, ctrl.ssoConnect);
router.get('/sso/:provider/callback', ctrl.ssoCallback);

router.post('/password-reset/request',
  captchaMiddleware,
  body('email').isEmail().normalizeEmail(),
  validateRequest,
  ctrl.requestPasswordReset
);

router.post('/password-reset/confirm',
  body('token').notEmpty(),
  strongPasswordField('newPassword'),
  validateRequest,
  ctrl.confirmPasswordReset
);

module.exports = router;
