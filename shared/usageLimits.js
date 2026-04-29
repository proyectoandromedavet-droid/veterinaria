'use strict';

/**
 * Usage limits — per-org monthly quotas gated by plan tier.
 *
 * How it works:
 *   - Each org has a plan tier ('free' | 'basic' | 'pro' | 'enterprise').
 *   - Monthly usage is tracked in Redis: `usage:{orgId}:{feature}:{YYYY-MM}`
 *   - On each protected request, the middleware:
 *       1. Reads the org's current month counter.
 *       2. Compares against PLAN_LIMITS[tier][feature].
 *       3. Increments on success.
 *   - The Redis key expires at the end of the month automatically.
 *   - Unlimited is represented as Infinity (stored as -1 in Redis config).
 *
 * Plan tier is stored in Redis: `org:plan:{orgId}` → tier string.
 * Set via admin API (see setPlanTier).
 *
 * Usage:
 *   const { requireUsageLimit } = require('../../../shared/usageLimits');
 *   router.post('/diagnose', requireFeature('ai_diagnosis'), requireUsageLimit('ai_diagnosis'), handler);
 */

const { getRedisSingleton } = require('./redis');

// ── Plan definitions ──────────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free: {
    ai_diagnosis:       5,
    ai_image_analysis:  2,
    ai_chatbot:         20,
    ai_risk_assessment: 3,
    telemedicine:       10,
    pdf_reports:        50,
    sms_notifications:  0,
    whatsapp_notify:    0,
    api_calls_daily:    100,
    storage_mb:         500,       // 500 MB
  },
  basic: {
    ai_diagnosis:       50,
    ai_image_analysis:  20,
    ai_chatbot:         200,
    ai_risk_assessment: 30,
    telemedicine:       100,
    pdf_reports:        500,
    sms_notifications:  100,
    whatsapp_notify:    50,
    api_calls_daily:    1000,
    storage_mb:         5120,      // 5 GB
  },
  pro: {
    ai_diagnosis:       500,
    ai_image_analysis:  200,
    ai_chatbot:         Infinity,
    ai_risk_assessment: 300,
    telemedicine:       Infinity,
    pdf_reports:        Infinity,
    sms_notifications:  1000,
    whatsapp_notify:    500,
    api_calls_daily:    10000,
    storage_mb:         51200,     // 50 GB
  },
  enterprise: {
    ai_diagnosis:       Infinity,
    ai_image_analysis:  Infinity,
    ai_chatbot:         Infinity,
    ai_risk_assessment: Infinity,
    telemedicine:       Infinity,
    pdf_reports:        Infinity,
    sms_notifications:  Infinity,
    whatsapp_notify:    Infinity,
    api_calls_daily:    Infinity,
    storage_mb:         Infinity,
  },
};

/** Threshold (0–1) above which a warning alert is emitted. */
const ALERT_THRESHOLD = parseFloat(process.env.USAGE_ALERT_THRESHOLD || '0.8');

const DEFAULT_PLAN = process.env.DEFAULT_PLAN_TIER || 'free';

// ── Redis client ──────────────────────────────────────────────────────────────
async function getRedis() {
  return getRedisSingleton('usage-limits', 'usage-limits');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns YYYY-MM string for the current UTC month. */
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

/** Seconds until end of current UTC month (for Redis TTL). */
function secsUntilMonthEnd() {
  const now   = new Date();
  const next  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.max(1, Math.floor((next - now) / 1000));
}

/**
 * Get the plan tier for an org.
 * Falls back to DEFAULT_PLAN when Redis unavailable or key not set.
 * @param {string|number} orgId
 * @returns {Promise<string>}
 */
async function getPlanTier(orgId) {
  try {
    const redis = await getRedis();
    const tier  = await redis.get(`org:plan:${orgId}`);
    return tier || DEFAULT_PLAN;
  } catch (_) {
    return DEFAULT_PLAN;
  }
}

/**
 * Set the plan tier for an org (admin use).
 * @param {string|number} orgId
 * @param {'free'|'basic'|'pro'|'enterprise'} tier
 */
async function setPlanTier(orgId, tier) {
  if (!PLAN_LIMITS[tier]) throw new Error(`Unknown plan tier: ${tier}`);
  const redis = await getRedis();
  await redis.set(`org:plan:${orgId}`, tier);
}

/**
 * Get the monthly limit for an org's plan and feature.
 * @param {string|number} orgId
 * @param {string}        feature
 * @returns {Promise<number>}  Infinity = unlimited
 */
async function getLimit(orgId, feature) {
  const tier   = await getPlanTier(orgId);
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS[DEFAULT_PLAN];
  const limit  = limits[feature];
  if (limit === undefined) return Infinity; // feature not in limits → always allowed
  return limit;
}

/**
 * Get current monthly usage for an org + feature.
 * @param {string|number} orgId
 * @param {string}        feature
 * @returns {Promise<number>}
 */
async function getUsage(orgId, feature) {
  try {
    const redis = await getRedis();
    const key   = `usage:${orgId}:${feature}:${currentMonth()}`;
    const val   = await redis.get(key);
    return val ? parseInt(val) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Increment usage counter for an org + feature.
 * Automatically expires at end of month.
 * @param {string|number} orgId
 * @param {string}        feature
 * @param {number}        [amount=1]
 */
async function recordUsage(orgId, feature, amount = 1) {
  try {
    const redis = await getRedis();
    const key   = `usage:${orgId}:${feature}:${currentMonth()}`;
    const pipe  = redis.multi();
    pipe.incrBy(key, amount);
    pipe.expire(key, secsUntilMonthEnd());
    await pipe.exec();
  } catch (_) {}
}

/**
 * Check whether an org is within limits for a feature.
 * @param {string|number} orgId
 * @param {string}        feature
 * @returns {Promise<{ allowed: boolean, current: number, limit: number, pct: number }>}
 */
async function checkLimit(orgId, feature) {
  const [limit, current] = await Promise.all([
    getLimit(orgId, feature),
    getUsage(orgId, feature),
  ]);
  const pct = limit === Infinity ? 0 : current / limit;
  return { allowed: current < limit, current, limit, pct };
}

// ── Storage tracking ──────────────────────────────────────────────────────────

/**
 * Accumulate storage usage for an org (permanent counter — not monthly).
 * Key: `storage:{orgId}` — value in MB (float-safe via INCRBYFLOAT).
 * @param {string|number} orgId
 * @param {number}        deltaMb  — positive to add, negative to subtract (deletions)
 */
async function recordStorage(orgId, deltaMb) {
  try {
    const redis = await getRedis();
    const key   = `storage:${orgId}`;
    await redis.incrByFloat(key, deltaMb);
  } catch (_) {}
}

/**
 * Get current storage usage in MB for an org.
 * @param {string|number} orgId
 * @returns {Promise<number>}
 */
async function getStorageUsage(orgId) {
  try {
    const redis = await getRedis();
    const val   = await redis.get(`storage:${orgId}`);
    return val ? parseFloat(val) : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Check if an org is within storage limits.
 * @param {string|number} orgId
 * @returns {Promise<{ allowed: boolean, currentMb: number, limitMb: number, pct: number }>}
 */
async function checkStorageLimit(orgId) {
  const [limitMb, currentMb] = await Promise.all([
    getLimit(orgId, 'storage_mb'),
    getStorageUsage(orgId),
  ]);
  const pct = limitMb === Infinity ? 0 : currentMb / limitMb;
  return { allowed: currentMb < limitMb, currentMb, limitMb, pct };
}

// ── Alert helpers ─────────────────────────────────────────────────────────────

let _alertLogger;
function getAlertLogger() {
  if (!_alertLogger) {
    try { _alertLogger = require('./logger').createLogger('usage-limits'); } catch { _alertLogger = console; }
  }
  return _alertLogger;
}

/**
 * Emit a structured warning when usage crosses ALERT_THRESHOLD (default 80%).
 * Called internally; also exported for manual use.
 * @param {string|number} orgId
 * @param {string}        feature
 * @param {number}        current
 * @param {number}        limit
 */
function emitUsageAlert(orgId, feature, current, limit) {
  const pct = limit === Infinity ? 0 : current / limit;
  if (pct < ALERT_THRESHOLD) return;

  const level = pct >= 1 ? 'EXCEEDED' : 'WARNING';
  getAlertLogger().warn(`Usage ${level}: org=${orgId} feature=${feature}`, {
    orgId,
    feature,
    current,
    limit:     limit === Infinity ? 'unlimited' : limit,
    pct:       Math.round(pct * 100),
    threshold: Math.round(ALERT_THRESHOLD * 100),
    level,
  });
}

/**
 * Express middleware factory — enforces a monthly usage limit for a feature.
 *
 * On limit exceeded → 429 with headers:
 *   X-RateLimit-Limit:     monthly cap
 *   X-RateLimit-Remaining: 0
 *   X-RateLimit-Reset:     epoch seconds until month end
 *
 * On Redis error → fail-open (allow through).
 *
 * @param {string}  feature         — feature name matching PLAN_LIMITS keys
 * @param {boolean} [autoRecord=true] — increment counter on pass-through
 */
function requireUsageLimit(feature, autoRecord = true) {
  return async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      if (!orgId) return next(); // unauthenticated requests are not quota-tracked

      const { allowed, current, limit } = await checkLimit(orgId, feature);

      const resetEpoch = Math.floor(Date.now() / 1000) + secsUntilMonthEnd();
      const cap        = limit === Infinity ? 'unlimited' : limit;

      res.setHeader('X-RateLimit-Feature',   feature);
      res.setHeader('X-RateLimit-Limit',     cap);
      res.setHeader('X-RateLimit-Remaining', limit === Infinity ? 'unlimited' : Math.max(0, limit - current - 1));
      res.setHeader('X-RateLimit-Reset',     resetEpoch);

      if (!allowed) {
        emitUsageAlert(orgId, feature, current, limit);
        return res.status(429).json({
          success: false,
          error: {
            message: `Monthly quota for '${feature}' exceeded (${current}/${cap}). Upgrade your plan.`,
            code:    'QUOTA_EXCEEDED',
            feature,
            current,
            limit:   cap,
          },
        });
      }

      // Warn when approaching the limit
      emitUsageAlert(orgId, feature, current, limit);

      if (autoRecord) {
        // Record usage after response is sent so it doesn't delay the request
        res.on('finish', () => {
          if (res.statusCode < 400) {
            recordUsage(orgId, feature).catch(() => {});
          }
        });
      }

      next();
    } catch (_) {
      next(); // fail-open on Redis errors
    }
  };
}

module.exports = {
  PLAN_LIMITS,
  ALERT_THRESHOLD,
  getPlanTier,
  setPlanTier,
  getLimit,
  getUsage,
  recordUsage,
  checkLimit,
  requireUsageLimit,
  recordStorage,
  getStorageUsage,
  checkStorageLimit,
  emitUsageAlert,
};
