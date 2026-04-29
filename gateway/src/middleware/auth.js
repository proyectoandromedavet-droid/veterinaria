'use strict';

/**
 * gateway/src/middleware/auth.js
 * Verifica JWT RS256 usando la clave pública de shared/jwt.
 * Ya no depende de JWT_ACCESS_SECRET ni de node-fetch.
 *
 * Cambios vs versión anterior:
 *   - Usa verifyAccess() de shared/jwt (RS256 asimétrico)
 *   - Usa fetch global de Node 18+ en lugar de node-fetch
 *   - Propaga X-Trace-Id desde req.traceId
 */

const { verifyAccess } = require('../../../shared/jwt');
const { getRedisSingleton } = require('../../../shared/redis');
const { signRequest, HEADER: INTERNAL_SIG_HEADER } = require('../../../shared/internalAuth');
const { logger }       = require('./logger');

async function getRedis() {
  return getRedisSingleton('gateway-auth', 'gateway-auth');
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * Middleware principal: verifica JWT RS256 + lista de revocación en Redis.
 */
async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Missing authorization token' } });
  }

  let decoded;
  try {
    decoded = verifyAccess(token);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ success: false, error: { message: msg } });
  }

  // Verificar revocación en Redis (lista negra de jti)
  if (decoded.jti) {
    try {
      const redis = await getRedis();
      if (redis.isReady) {
        const revoked = await redis.get(`revoked:${decoded.jti}`);
        if (revoked) {
          return res.status(401).json({ success: false, error: { message: 'Token has been revoked' } });
        }
      }
    } catch (e) {
      logger.warn('Redis revocation check failed — continuing', { error: e.message, traceId: req.traceId });
    }
  }

  req.user  = decoded;
  req.token = token;
  next();
}

/**
 * Valida un API key contra el auth service.
 * Usa fetch nativo de Node 18+ (sin node-fetch).
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return next();

  try {
    const path = '/internal/validate-api-key';
    const response = await fetch(`${process.env.SERVICE_AUTH}${path}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id':   req.traceId || '',
        [INTERNAL_SIG_HEADER]: signRequest('POST', path, ''),
      },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(3000),   // timeout de 3s
    });

    if (response.ok) {
      const { data } = await response.json();
      req.user      = data;
      req.isApiKey  = true;
      return next();
    }
  } catch (e) {
    logger.error('API key validation error', { error: e.message, traceId: req.traceId });
  }

  return res.status(401).json({ success: false, error: { message: 'Invalid API key' } });
}

/**
 * Middleware combinado: API key primero, luego JWT.
 */
async function authMiddleware(req, res, next) {
  if (req.headers['x-api-key']) return authenticateApiKey(req, res, next);
  return authenticate(req, res, next);
}

/**
 * Auth opcional — adjunta usuario si hay token pero no bloquea si falta.
 */
async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccess(token);
  } catch (_) { /* token inválido/expirado — continuar sin usuario */ }
  next();
}

module.exports = { authMiddleware, authenticate, optionalAuth, getRedis };
