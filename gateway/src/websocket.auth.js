'use strict';

const { verifyAccess } = require('../../shared/jwt');
const { getRedisSingleton } = require('../../shared/redis');
const { logger } = require('./middleware/logger');

function isAllowedOrigin(origin) {
  if (!origin) return false;

  const allowedRaw = process.env.ALLOWED_ORIGINS || '';

  if (process.env.NODE_ENV !== 'production') {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    } catch (error) {
      logger.warn('WS: invalid origin URL', { origin, error: error?.message });
      return false;
    }
  }

  if (!allowedRaw) return false;

  const allowed = allowedRaw.split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
  const originLower = origin.toLowerCase().replace(/\/$/, '');
  return allowed.some((a) => originLower === a || originLower.startsWith(`${a}/`));
}

function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function getTokenFromRequest(req) {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) return header.slice(7);

  const cookieToken = readCookie(req, 'accessToken');
  if (cookieToken) return cookieToken;

  if (process.env.NODE_ENV === 'production') return null;
  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token) return token;
  } catch (error) {
    logger.warn('WS: failed parsing request URL for token fallback', { error: error?.message, url: req.url });
  }

  return null;
}

async function verifyWsRequest(req) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return {
      ok: false,
      code: 4003,
      reason: 'Origin not allowed',
      log: { message: 'WS: connection rejected - invalid origin', meta: { origin, ip: req.socket.remoteAddress } },
    };
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return {
      ok: false,
      code: 4001,
      reason: 'Missing token',
      log: { message: 'WS: connection rejected - missing token', meta: { origin, ip: req.socket.remoteAddress } },
    };
  }

  let user;
  try {
    user = verifyAccess(token);
  } catch (error) {
    return {
      ok: false,
      code: 4001,
      reason: 'Invalid or expired token',
      log: { message: 'WS: connection rejected - invalid token', meta: { error: error?.message, ip: req.socket.remoteAddress } },
    };
  }

  if (user.jti) {
    try {
      const revokeCheck = await getRedisSingleton('gateway-auth', 'gateway-auth');
      const revoked = revokeCheck.isReady ? await revokeCheck.get(`revoked:${user.jti}`) : null;
      if (revoked) {
        return {
          ok: false,
          code: 4001,
          reason: 'Token revoked',
          log: { message: 'WS: connection rejected - revoked token', meta: { userId: user.userId } },
        };
      }
    } catch (error) {
      logger.warn('WS: revocation check failed - continuing', { error: error.message, userId: user.userId });
    }
  }

  return { ok: true, user };
}

module.exports = {
  isAllowedOrigin,
  getTokenFromRequest,
  verifyWsRequest,
};
