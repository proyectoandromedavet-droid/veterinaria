'use strict';

const { verifyAccess } = require('../../../shared/jwt');
const { getRedisSingleton } = require('../../../shared/redis');
const { callInternalService, buildSignedInternalHeaders } = require('../../../shared/internalService');
const {
  getDependencyMode,
  recordDependencyDegradation,
  logDependencyIssue,
  dependencyFailureResponse,
} = require('../../../shared/dependencyPolicy');
const { logger } = require('./logger');
const { checkDeviceFingerprint } = require('../../../shared/deviceFingerprint');
const R = require('../../../shared/response');

async function getRedis() {
  return getRedisSingleton('gateway-auth', 'gateway-auth');
}

function getRevocationMode() {
  return getDependencyMode('auth_revocation', 'degraded');
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  if (req.cookies?.accessToken) return req.cookies.accessToken;
  return null;
}

async function authenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return R.unauthorized(res, 'Missing authorization token', 'AUTH_001');

  let decoded;
  try {
    decoded = verifyAccess(token);
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return R.unauthorized(res, msg, err.name === 'TokenExpiredError' ? 'AUTH_003' : 'AUTH_002');
  }

  if (decoded.jti) {
    const revocationMode = getRevocationMode();
    try {
      const redis = await getRedis();
      if (redis.isReady) {
        const revoked = await redis.get(`revoked:${decoded.jti}`);
        if (revoked) return R.unauthorized(res, 'Token has been revoked', 'AUTH_004');
      } else if (revocationMode === 'strict') {
        recordDependencyDegradation('auth_revocation', revocationMode, 'blocked', { service: 'gateway' });
        return dependencyFailureResponse(res, {
          statusCode: 503,
          message: 'Token revocation backend unavailable',
          code: 'AUTH_013',
        });
      }
    } catch (err) {
      recordDependencyDegradation('auth_revocation', revocationMode, revocationMode === 'strict' ? 'blocked' : 'degraded', { service: 'gateway' });
      logDependencyIssue(logger, 'auth_revocation', revocationMode, 'Redis revocation check failed', err, { traceId: req.traceId });
      if (revocationMode === 'strict') {
        return dependencyFailureResponse(res, {
          statusCode: 503,
          message: 'Token revocation backend unavailable',
          code: 'AUTH_013',
        });
      }
    }
  }

  req.user = decoded;
  req.token = token;
  return checkDeviceFingerprint(req, res, next);
}

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return next();

  try {
    const path = '/internal/validate-api-key';
    const response = await callInternalService('auth', {
      method: 'POST',
      path,
      body: { apiKey },
      headers: {
        'X-Trace-Id': req.traceId || '',
        ...buildSignedInternalHeaders('POST', path, ''),
      },
      traceContext: { traceId: req.traceId, spanId: req.spanId, serviceName: 'gateway' },
      timeoutMs: 3000,
    });

    if (response.ok) {
      const { data } = await response.json();
      req.user = data;
      req.isApiKey = true;
      return next();
    }
  } catch (err) {
    logger.error('API key validation error', { error: err.message, traceId: req.traceId });
  }

  return R.unauthorized(res, 'Invalid API key', 'AUTH_012');
}

async function authMiddleware(req, res, next) {
  if (req.headers['x-api-key']) return authenticateApiKey(req, res, next);
  return authenticate(req, res, next);
}

async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = verifyAccess(token);
  } catch (_) {}
  next();
}

module.exports = { authMiddleware, authenticate, optionalAuth, getRedis };
