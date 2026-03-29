'use strict';

/**
 * Internal service-to-service authentication.
 *
 * The gateway signs every proxied request with an HMAC-SHA256 token
 * derived from a shared secret (INTERNAL_SECRET env var).
 * Microservices verify this header before processing requests that
 * claim to come from an authenticated user.
 *
 * Header: X-Internal-Sig: t={timestamp}.s={hmac}
 *
 * Algorithm:
 *   message = `${method}:${path}:${timestamp}:${orgId}`
 *   sig     = HMAC-SHA256(INTERNAL_SECRET, message)
 *
 * Replay window: 30 seconds (configurable via INTERNAL_SIG_TTL_S).
 *
 * In development (no INTERNAL_SECRET set), verification is skipped
 * and a warning is logged once.
 */

const { createHmac, timingSafeEqual } = require('crypto');

// Read dynamically so tests can set env vars without module re-loading
const _secret = () => process.env.INTERNAL_SECRET || '';
const _ttl    = () => parseInt(process.env.INTERNAL_SIG_TTL_S || '30');
const HEADER  = 'x-internal-sig';

let _warnedOnce = false;

function _warn() {
  if (!_warnedOnce && process.env.NODE_ENV !== 'test') {
    console.warn('[internalAuth] INTERNAL_SECRET not set — service-to-service auth disabled');
    _warnedOnce = true;
  }
}

/**
 * Build the HMAC message string.
 */
function _message(method, path, timestamp, orgId) {
  return `${method.toUpperCase()}:${path}:${timestamp}:${orgId || ''}`;
}

/**
 * Generate the X-Internal-Sig header value for a request.
 * Called by the gateway before proxying.
 *
 * @param {string} method
 * @param {string} path
 * @param {string} orgId
 * @returns {string}
 */
function signRequest(method, path, orgId) {
  const secret = _secret();
  if (!secret) return '';
  const t   = Math.floor(Date.now() / 1000).toString();
  const msg = _message(method, path, t, orgId);
  const sig = createHmac('sha256', secret).update(msg).digest('hex');
  return `t=${t}.s=${sig}`;
}

/**
 * Verify the X-Internal-Sig header on an incoming request.
 * Returns { ok: true } or { ok: false, reason: string }.
 *
 * @param {string} method
 * @param {string} path
 * @param {string} orgId
 * @param {string} headerValue
 */
function verifySignature(method, path, orgId, headerValue) {
  const secret = _secret();
  if (!secret) {
    _warn();
    return { ok: true };  // dev mode — skip
  }
  if (!headerValue) return { ok: false, reason: 'missing_header' };

  const match = headerValue.match(/^t=(\d+)\.s=([0-9a-f]+)$/);
  if (!match) return { ok: false, reason: 'malformed_header' };

  const [, t, sig] = match;
  const age = Math.floor(Date.now() / 1000) - parseInt(t);
  if (age > _ttl() || age < -5) return { ok: false, reason: 'expired' };

  const expected = createHmac('sha256', secret).update(_message(method, path, t, orgId)).digest('hex');

  // Constant-time comparison
  const a = Buffer.from(sig,      'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'invalid_signature' };
  if (!timingSafeEqual(a, b))  return { ok: false, reason: 'invalid_signature' };

  return { ok: true };
}

/**
 * Express middleware for microservices — rejects requests without valid signature.
 * Add to serviceBase or individual service entry points:
 *   app.use(requireInternalSig);
 *
 * Skipped when INTERNAL_SECRET is not configured (dev/test).
 */
function requireInternalSig(req, res, next) {
  if (!_secret()) { _warn(); return next(); }

  const orgId = req.headers['x-org-id'] || '';
  const { ok, reason } = verifySignature(
    req.method,
    req.path,
    orgId,
    req.headers[HEADER] || ''
  );

  if (!ok) {
    return res.status(401).json({
      success: false,
      error:   { message: 'Invalid internal signature', code: 'INTERNAL_AUTH_FAILED', reason },
    });
  }
  next();
}

module.exports = { signRequest, verifySignature, requireInternalSig, HEADER };
