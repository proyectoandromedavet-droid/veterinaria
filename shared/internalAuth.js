'use strict';

/**
 * Internal service-to-service authentication.
 *
 * Header: X-Internal-Sig: t={timestamp}.s={hmac}
 * message = `${method}:${path}:${timestamp}:${orgId}`
 */

const { createHmac, timingSafeEqual } = require('crypto');
const { createLogger } = require('./logger');
const { getSecret } = require('./secrets');
const {
  getDependencyMode,
  recordDependencyDegradation,
  logDependencyIssue,
  dependencyFailureResponse,
} = require('./dependencyPolicy');

const log = createLogger('internal-auth');

const _secret = () => getSecret('INTERNAL_SECRET', { defaultValue: '' }) || '';
const _ttl = () => parseInt(process.env.INTERNAL_SIG_TTL_S || '30', 10);
const HEADER = 'x-internal-sig';

let _warnedOnce = false;

function getInternalAuthMode() {
  return getDependencyMode('internal_auth', process.env.NODE_ENV === 'production' ? 'strict' : 'open');
}

function _warn() {
  if (!_warnedOnce && process.env.NODE_ENV !== 'test') {
    log.warn('INTERNAL_SECRET not set - service-to-service auth degraded', { mode: getInternalAuthMode() });
    _warnedOnce = true;
  }
}

function _message(method, path, timestamp, orgId) {
  return `${method.toUpperCase()}:${path}:${timestamp}:${orgId || ''}`;
}

function signRequest(method, path, orgId) {
  const secret = _secret();
  if (!secret) return '';
  const t = Math.floor(Date.now() / 1000).toString();
  const msg = _message(method, path, t, orgId);
  const sig = createHmac('sha256', secret).update(msg).digest('hex');
  return `t=${t}.s=${sig}`;
}

function verifySignature(method, path, orgId, headerValue) {
  const secret = _secret();
  if (!secret) {
    const mode = getInternalAuthMode();
    _warn();
    recordDependencyDegradation('internal_auth', mode, mode === 'strict' ? 'blocked' : 'degraded', { service: 'shared' });
    if (mode === 'strict') return { ok: false, reason: 'missing_secret' };
    return { ok: true };
  }

  if (!headerValue) return { ok: false, reason: 'missing_header' };

  const match = headerValue.match(/^t=(\d+)\.s=([0-9a-f]+)$/);
  if (!match) return { ok: false, reason: 'malformed_header' };

  const [, t, sig] = match;
  const age = Math.floor(Date.now() / 1000) - parseInt(t, 10);
  if (age > _ttl() || age < -5) return { ok: false, reason: 'expired' };

  const expected = createHmac('sha256', secret)
    .update(_message(method, path, t, orgId))
    .digest('hex');

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'invalid_signature' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'invalid_signature' };

  return { ok: true };
}

function requireInternalSig(req, res, next) {
  if (!_secret() && getInternalAuthMode() !== 'strict') {
    _warn();
    return next();
  }

  const orgId = req.headers['x-org-id'] || '';
  const { ok, reason } = verifySignature(
    req.method,
    req.baseUrl + req.path,
    orgId,
    req.headers[HEADER] || ''
  );

  if (!ok) {
    if (reason === 'missing_secret') {
      logDependencyIssue(log, 'internal_auth', getInternalAuthMode(), 'Internal auth unavailable - rejecting request', null, {
        path: req.originalUrl,
        traceId: req.traceId,
        requestId: req.requestId,
      });
      return dependencyFailureResponse(res, {
        statusCode: 503,
        message: 'Internal authentication unavailable',
        code: 'INTERNAL_AUTH_UNAVAILABLE',
        details: { reason },
      });
    }

    return res.status(401).json({
      success: false,
      error: { message: 'Invalid internal signature', code: 'INTERNAL_AUTH_FAILED', reason },
    });
  }

  next();
}

module.exports = {
  signRequest,
  verifySignature,
  requireInternalSig,
  HEADER,
  getInternalAuthMode,
};
