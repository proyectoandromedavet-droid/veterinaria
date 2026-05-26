'use strict';

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const calendar = require('../../../../../shared/calendar');
const R = require('../../../../../shared/response');
const { createLogger } = require('../../../../../shared/logger');
const { requireInternalSig, fromHeaders } = require('./_common');

const router = Router();
const log = createLogger('auth-google');

// BUG-FIX: Rate limit en el callback OAuth para prevenir fuerza bruta de nonces.
// Un atacante no puede probar millones de nonces desde una misma IP.
const oauthCallbackLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});

/**
 * BUG-FIX Open Redirect: Valida que FRONTEND_URL sea una URL absoluta con
 * protocolo http/https y no contenga secuencias de path traversal ni payloads
 * javascript:// u otros esquemas peligrosos. Esto previene que una configuración
 * errónea o una inyección de variable de entorno derive en open redirect.
 */
const ALLOWED_FRONTEND_URL = (() => {
  const raw = process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('FRONTEND_URL must use http or https');
    }
    // Normalizar: eliminar trailing slash para consistencia
    return parsed.origin;
  } catch (err) {
    log.error('Invalid FRONTEND_URL — falling back to localhost', { error: err.message });
    return 'http://localhost:3000';
  }
})();

router.get('/google/connect', requireInternalSig, fromHeaders, async (req, res) => {
  const { getRedisSingleton } = require('../../../../../shared/redis');

  const userId = req.user.userId;
  if (!userId) return R.unauthorized(res, 'Unauthorized');

  const nonce = uuidv4();

  try {
    const redis = await getRedisSingleton('auth-oauth', 'auth-oauth');
    await redis.setEx(`oauth:nonce:${nonce}`, 600, String(userId));
  } catch (err) {
    log.warn('OAuth nonce persistence failed', { error: err.message, userId });
    return R.error(res, 503, 'Service temporarily unavailable', { message: err.message }, 'SVC_005');
  }

  return res.redirect(calendar.getAuthUrl(nonce));
});

router.get('/google/callback', oauthCallbackLimit, async (req, res) => {
  const { code, state: nonce, error } = req.query;

  if (error) {
    return res.redirect(`${ALLOWED_FRONTEND_URL}/settings/calendar?error=oauth_denied`);
  }
  if (!code || !nonce) {
    return R.error(res, 400, 'Parámetros inválidos', null, 'VAL_001');
  }

  let userId;
  try {
    const { getRedisSingleton } = require('../../../../../shared/redis');
    const redis = await getRedisSingleton('auth-oauth', 'auth-oauth');
    userId = await redis.get(`oauth:nonce:${nonce}`);
    if (userId) await redis.del(`oauth:nonce:${nonce}`);
  } catch (err) {
    log.warn('OAuth state lookup failed', { error: err.message });
    return res.redirect(`${ALLOWED_FRONTEND_URL}/settings/calendar?error=internal_error`);
  }

  if (!userId) {
    return res.redirect(`${ALLOWED_FRONTEND_URL}/settings/calendar?error=invalid_state`);
  }

  try {
    await calendar.exchangeCode(userId, code);
    return res.redirect(`${ALLOWED_FRONTEND_URL}/settings/calendar?connected=true`);
  } catch (err) {
    log.warn('OAuth exchange failed', { error: err.message, userId });
    return res.redirect(`${ALLOWED_FRONTEND_URL}/settings/calendar?error=exchange_failed`);
  }
});

module.exports = router;
