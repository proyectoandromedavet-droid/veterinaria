'use strict';

/**
 * Security middleware collection — mirrors apipersonal hardening stack.
 * Exposes: helmet, hpp, compression, sanitize, ipGuard, requestId, idempotency
 */

const helmet      = require('helmet');
const hpp         = require('hpp');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const db          = require('./db');

// ── Helmet (HTTP security headers) ───────────────────────────────────────────
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'"],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,  // allow Swagger UI assets
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// ── HPP — HTTP Parameter Pollution protection ─────────────────────────────────
const hppMiddleware = hpp({ whitelist: ['sort', 'filter', 'fields', 'expand'] });

// ── Compression ───────────────────────────────────────────────────────────────
const compressionMiddleware = compression({
  level: 6,
  threshold: 1024,    // only compress > 1KB
  filter(req, res) {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
});

// ── Sanitize — trim strings + block prototype pollution ──────────────────────
function sanitizeDeep(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (typeof value === 'object') {
    const BLOCKED = new Set(['__proto__', 'constructor', 'prototype']);
    const out = Object.create(null);
    for (const [k, v] of Object.entries(value)) {
      if (BLOCKED.has(k)) continue;
      out[k] = sanitizeDeep(v);
    }
    return out;
  }
  return value;
}

function sanitize(req, _res, next) {
  if (req.body   && typeof req.body   === 'object') req.body   = sanitizeDeep(req.body);
  if (req.query  && typeof req.query  === 'object') req.query  = sanitizeDeep(req.query);
  if (req.params && typeof req.params === 'object') req.params = sanitizeDeep(req.params);
  next();
}

// ── Request ID ────────────────────────────────────────────────────────────────
function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// ── IP Guard ──────────────────────────────────────────────────────────────────
/**
 * IP whitelist/blacklist.
 * Env vars:
 *   IP_WHITELIST = "1.2.3.4,10.0.0.0/8"   (if set, only these pass)
 *   IP_BLACKLIST = "5.6.7.8,9.10.11.0/24"  (always blocked)
 */
function parseList(env) {
  return (env || '').split(',').map(s => s.trim()).filter(Boolean);
}

function ipToLong(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct), 0) >>> 0;
}

function ipInCidr(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [base, bits] = cidr.split('/');
  const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

function ipGuard(req, res, next) {
  const whitelist = parseList(process.env.IP_WHITELIST);
  const blacklist = parseList(process.env.IP_BLACKLIST);
  const ip = req.ip || req.socket?.remoteAddress || '';
  const clean = ip.replace('::ffff:', '');

  if (blacklist.length && blacklist.some(cidr => ipInCidr(clean, cidr))) {
    return res.status(403).json({ success: false, error: { message: 'Access denied' } });
  }
  if (whitelist.length && !whitelist.some(cidr => ipInCidr(clean, cidr))) {
    return res.status(403).json({ success: false, error: { message: 'Access denied' } });
  }
  next();
}

// ── Idempotency ───────────────────────────────────────────────────────────────
/**
 * Prevents duplicate mutating requests using Idempotency-Key header.
 * Stores key → response in Redis for 24h.
 * Only applies to POST/PUT/PATCH/DELETE.
 */
const { createClient } = require('redis');
let idempotencyRedis;

async function getIdempotencyRedis() {
  if (!idempotencyRedis) {
    idempotencyRedis = createClient({
      socket:   { host: process.env.REDIS_HOST || 'redis', port: parseInt(process.env.REDIS_PORT || '6379') },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    idempotencyRedis.on('error', () => {});
    await idempotencyRedis.connect().catch(() => {});
  }
  return idempotencyRedis;
}

async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];
  if (!key) return next();
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();

  const redisKey = `idempotency:${key}`;
  try {
    const redis  = await getIdempotencyRedis();
    const cached = await redis.get(redisKey);

    if (cached) {
      const { status, body } = JSON.parse(cached);
      res.setHeader('X-Idempotent-Replayed', 'true');
      return res.status(status).json(body);
    }

    // Intercept response to cache it
    const origJson = res.json.bind(res);
    res.json = async function(body) {
      try {
        await redis.setEx(redisKey, 86400, JSON.stringify({ status: res.statusCode, body }));
      } catch (_) {}
      return origJson(body);
    };
  } catch (_) {}

  next();
}

module.exports = {
  helmetMiddleware,
  hppMiddleware,
  compressionMiddleware,
  sanitize,
  requestId,
  ipGuard,
  idempotency,
};
