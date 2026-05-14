'use strict';

/**
 * gateway/src/middleware/rateLimiter.js
 * Rate limiters con Redis store.
 *
 * Limiters disponibles:
 *   apiLimiter           — 100 req/min por usuario (o IP si anónimo)
 *   authLimiter          — 10 req/min por IP (fuerza bruta en login)
 *   passwordResetLimiter — 5 req/15min por IP
 *   exportLimiter        — 10 req/15min por usuario (operaciones costosas)
 *   tenantLimiter        — 2000 req/min por tenant (org_id) — evita que un
 *                          tenant consuma toda la infraestructura
 */

const rateLimit       = require('express-rate-limit');
const { RedisStore }  = require('rate-limit-redis');
const { getRedisSingleton } = require('../../../shared/redis');
const { createLogger } = require('../../../shared/logger');
const log = createLogger('gateway-rate-limit');

// ── Redis client para rate limiting ───────────────────────────────────────────
async function getRlRedis() {
  return getRedisSingleton('gateway-rate-limit', 'gateway-rate-limit');
}

let _redisScriptSupported = null;

async function buildStore(prefix) {
  try {
    const client = await getRlRedis();
    if (!client.isReady) return undefined;

    // Test SCRIPT support (Lua scripting) — not available on some Redis configs
    if (_redisScriptSupported === null) {
      try {
        await client.sendCommand(['SCRIPT', 'EXISTS', '0000000000000000000000000000000000000000']);
        _redisScriptSupported = true;
      } catch (error) {
        log.warn('Rate limiter Redis scripting unavailable - using memory fallback', { error: error?.message });
        _redisScriptSupported = false;
      }
    }
    if (!_redisScriptSupported) return undefined;  // fallback to MemoryStore

    return new RedisStore({ sendCommand: (...args) => client.sendCommand(args), prefix });
  } catch (error) {
    log.warn('Rate limiter Redis store unavailable - using memory fallback', { prefix, error: error?.message });
  }
  return undefined;   // fallback a MemoryStore
}

const windowMs      = parseInt(process.env.RATE_LIMIT_WINDOW_MS    || '60000');
const maxApi        = parseInt(process.env.RATE_LIMIT_MAX           || '100');
const maxAuth       = parseInt(process.env.RATE_LIMIT_AUTH_MAX      || '10');
const maxTenant     = parseInt(process.env.RATE_LIMIT_TENANT_MAX    || '2000');

function tooManyHandler(message) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      error: { message, code: 'RATE_LIMIT_EXCEEDED' },
    });
  };
}

// ── Key generators ────────────────────────────────────────────────────────────

/** Usuario autenticado → por userId; anónimo → por IP */
function userOrIpKey(req) {
  return req.user?.userId ? `user:${req.user.userId}` : `ip:${req.ip}`;
}

/** Por tenant (org_id); si no hay usuario → por IP */
function tenantOrIpKey(req) {
  return req.user?.orgId ? `org:${req.user.orgId}` : `ip:${req.ip}`;
}

// ── Builder factories ─────────────────────────────────────────────────────────

async function buildApiLimiter() {
  const store = await buildStore('rl:api:');
  return rateLimit({
    windowMs,
    max:             maxApi,
    standardHeaders: true,
    legacyHeaders:   false,
    store,
    keyGenerator:    userOrIpKey,
    handler:         tooManyHandler('Too many requests. Please slow down.'),
  });
}

async function buildAuthLimiter() {
  const store = await buildStore('rl:auth:');
  return rateLimit({
    windowMs,
    max:                    maxAuth,
    standardHeaders:        true,
    legacyHeaders:          false,
    store,
    keyGenerator:           (req) => `ip:${req.ip}`,
    skipSuccessfulRequests: false,
    handler:                tooManyHandler('Too many authentication attempts. Try again later.'),
  });
}

async function buildPasswordResetLimiter() {
  const store = await buildStore('rl:pwreset:');
  return rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             5,
    standardHeaders: true,
    legacyHeaders:   false,
    store,
    keyGenerator:    (req) => `ip:${req.ip}`,
    handler:         tooManyHandler('Too many password reset attempts. Try again in 15 minutes.'),
  });
}

async function buildTwoFaLimiter() {
  const store = await buildStore('rl:2fa:');
  return rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             5,
    standardHeaders: true,
    legacyHeaders:   false,
    store,
    keyGenerator:    (req) => `2fa:${req.body?.userId || req.ip}`,
    handler:         tooManyHandler('Too many 2FA attempts. Account locked for 15 minutes.'),
  });
}

async function buildExportLimiter() {
  const store = await buildStore('rl:export:');
  return rateLimit({
    windowMs:        15 * 60 * 1000,
    max:             10,
    standardHeaders: true,
    legacyHeaders:   false,
    store,
    keyGenerator:    userOrIpKey,
    handler:         tooManyHandler('Export limit reached. Try again in 15 minutes.'),
  });
}

/**
 * Limiter por tenant (org_id).
 * Protege la infraestructura de un tenant que haga demasiadas requests.
 * Se aplica DESPUÉS de authMiddleware para tener req.user.orgId disponible.
 */
async function buildTenantLimiter() {
  const store = await buildStore('rl:tenant:');
  return rateLimit({
    windowMs,
    max:             maxTenant,
    standardHeaders: true,
    legacyHeaders:   false,
    store,
    keyGenerator:    tenantOrIpKey,
    handler:         tooManyHandler('Tenant rate limit exceeded. Please contact support if this is unexpected.'),
  });
}

// ── Lazy wrappers (inicialización diferida en primer request) ─────────────────

function lazyLimiter(builderFn) {
  let instance = null;
  let building = false;
  const queue  = [];

  return async function(req, res, next) {
    if (instance) {
      try { return instance(req, res, next); }
      catch (error) {
        log.warn('Rate limiter instance failed - continuing', { error: error?.message, path: req.originalUrl });
        return next();
      }  // Redis SCRIPT error fallback
    }
    if (!building) {
      building = true;
      instance = await builderFn().catch((error) => {
        log.warn('Rate limiter initialization failed - using memory fallback', { error: error?.message });
        return rateLimit({ windowMs, max: maxApi });
      });
      queue.forEach(fn => fn());
      queue.length = 0;
    } else {
      await new Promise(resolve => queue.push(resolve));
    }
    try { return instance(req, res, next); }
    catch (error) {
      log.warn('Rate limiter execution failed - continuing', { error: error?.message, path: req.originalUrl });
      return next();
    }
  };
}

const apiLimiter           = lazyLimiter(buildApiLimiter);
const authLimiter          = lazyLimiter(buildAuthLimiter);
const passwordResetLimiter = lazyLimiter(buildPasswordResetLimiter);
const twoFaLimiter         = lazyLimiter(buildTwoFaLimiter);
const exportLimiter        = lazyLimiter(buildExportLimiter);
const tenantLimiter        = lazyLimiter(buildTenantLimiter);

module.exports = {
  apiLimiter,
  authLimiter,
  passwordResetLimiter,
  twoFaLimiter,
  exportLimiter,
  tenantLimiter,
};
