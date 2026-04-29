'use strict';

/**
 * Redis cache layer — mirrors apipersonal cache pattern.
 * Provides get/set/del/invalidatePrefix + Express middleware.
 */

const { cacheHits, cacheMisses } = require('./metrics');
const { getRedisSingleton } = require('./redis');

async function getClient() {
  return getRedisSingleton('shared-cache', 'cache');
}

/**
 * Get a cached value. Returns parsed object or null on miss/error.
 * @param {string} key
 */
async function get(key) {
  try {
    const redis = await getClient();
    const raw   = await redis.get(key);
    if (raw === null) {
      cacheMisses?.inc({ key_prefix: prefix(key) });
      return null;
    }
    cacheHits?.inc({ key_prefix: prefix(key) });
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Set a cache value with optional TTL in seconds (default 300).
 * @param {string} key
 * @param {*}      value
 * @param {number} [ttl=300]
 */
async function set(key, value, ttl = 300) {
  try {
    const redis = await getClient();
    await redis.setEx(key, ttl, JSON.stringify(value));
  } catch (_) {}
}

/**
 * Delete one key.
 * @param {string} key
 */
async function del(key) {
  try {
    const redis = await getClient();
    await redis.del(key);
  } catch (_) {}
}

/**
 * Delete all keys matching a prefix pattern (e.g. "org:42:patients:*").
 * @param {string} keyPrefix
 */
async function invalidatePrefix(keyPrefix) {
  try {
    const redis   = await getClient();
    const pattern = keyPrefix.endsWith('*') ? keyPrefix : `${keyPrefix}*`;
    let cursor    = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length) await redis.del(reply.keys);
    } while (cursor !== 0);
  } catch (_) {}
}

/**
 * Wrap an async function with cache-aside.
 * On hit: return cached. On miss: call fn, cache result, return.
 *
 * @param {string}   key
 * @param {Function} fn     async () => value
 * @param {number}   [ttl]  seconds
 */
async function remember(key, fn, ttl = 300) {
  const cached = await get(key);
  if (cached !== null) return cached;

  const value = await fn();
  if (value !== null && value !== undefined) {
    await set(key, value, ttl);
  }
  return value;
}

/**
 * Express middleware factory that caches GET responses.
 *
 * @param {number|Function} ttl  Seconds, or (req) => seconds
 * @param {Function}        [keyFn]  (req) => string — custom cache key builder
 */
function cacheMiddleware(ttl = 60, keyFn) {
  return async function(req, res, next) {
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : defaultKey(req);

    const cached = await get(key);
    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.body);
    }

    // Intercept json() to capture the response
    const origJson = res.json.bind(res);
    res.json = async function(body) {
      if (res.statusCode < 400) {
        const secs = typeof ttl === 'function' ? ttl(req) : ttl;
        await set(key, { status: res.statusCode, body }, secs);
      }
      res.setHeader('X-Cache', 'MISS');
      return origJson(body);
    };

    next();
  };
}

function defaultKey(req) {
  const userId = req.user?.userId || 'anon';
  const orgId  = req.user?.orgId  || 'none';
  return `cache:${orgId}:${userId}:${req.method}:${req.originalUrl}`;
}

/** Return first segment of key for metric label */
function prefix(key) {
  return key.split(':').slice(0, 2).join(':');
}

/**
 * HTTP cache headers middleware — CDN-ready Cache-Control.
 *
 * Modes:
 *   'public'   — shared CDN cache (use for global reference data: species, breeds)
 *   'private'  — per-user browser cache only (default, for per-org data)
 *   'no-store' — disable caching entirely (mutations, sensitive data)
 *
 * @param {object} opts
 * @param {number}  opts.maxAge   — seconds (default 60)
 * @param {string}  opts.scope    — 'public' | 'private' | 'no-store' (default 'private')
 * @param {boolean} opts.noCache  — add no-cache directive (forces revalidation)
 * @param {string[]} opts.vary    — Vary header values (default: ['Accept-Encoding'])
 */
function httpCacheHeaders({ maxAge = 60, scope = 'private', noCache = false, vary = ['Accept-Encoding'] } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    if (scope === 'no-store') {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      const directives = [scope, `max-age=${maxAge}`];
      if (noCache)         directives.push('no-cache');
      if (scope === 'public') directives.push(`s-maxage=${maxAge}`);
      res.setHeader('Cache-Control', directives.join(', '));
    }

    if (vary.length) res.setHeader('Vary', vary.join(', '));
    next();
  };
}

module.exports = { get, set, del, invalidatePrefix, remember, cacheMiddleware, httpCacheHeaders, getClient };
