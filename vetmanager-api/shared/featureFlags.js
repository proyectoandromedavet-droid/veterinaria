'use strict';

/**
 * Feature Flags — per-org feature toggles.
 *
 * Flags are stored in Redis as a JSON hash:
 *   key: `ff:org:{orgId}`   value: { flagName: true/false, ... }
 *
 * On Redis miss (or Redis unavailable), falls back to DEFAULT_FLAGS.
 *
 * Usage in a route:
 *   const { isEnabled } = require('../../../shared/featureFlags');
 *   if (!(await isEnabled('ai_diagnosis', req.user?.orgId))) {
 *     return res.status(403).json({ error: { message: 'Feature not available', code: 'FEATURE_DISABLED' } });
 *   }
 */

const { get: cacheGet, set: cacheSet } = require('./cache');

// ── Defaults — base config for all orgs ──────────────────────────────────────
const DEFAULT_FLAGS = {
  ai_diagnosis:        false,
  ai_image_analysis:   false,
  ai_chatbot:          false,
  ai_risk_assessment:  false,
  telemedicine:        true,
  grooming:            true,
  portal_owner:        true,
  digital_signature:   false,
  whatsapp_notify:     false,
  advanced_reports:    true,
  multi_branch:        true,
  inventory_advanced:  false,
};

const TTL = parseInt(process.env.FEATURE_FLAGS_TTL || '300'); // 5 min cache

/**
 * Check if a feature is enabled for a given org.
 * Falls back to DEFAULT_FLAGS when Redis is unavailable.
 *
 * @param {string}           flag   — flag name (e.g. 'ai_diagnosis')
 * @param {string|number}    orgId  — organisation id
 * @returns {Promise<boolean>}
 */
async function isEnabled(flag, orgId) {
  const flags = await getFlags(orgId);
  // Per-org setting takes precedence; if undefined falls back to default
  if (flag in flags) return Boolean(flags[flag]);
  return Boolean(DEFAULT_FLAGS[flag] ?? false);
}

/**
 * Get all feature flags for an org (merged with defaults).
 * @param {string|number} orgId
 * @returns {Promise<Record<string,boolean>>}
 */
async function getFlags(orgId) {
  if (!orgId) return { ...DEFAULT_FLAGS };

  const cacheKey = `ff:org:${orgId}`;
  const cached   = await cacheGet(cacheKey);
  if (cached) return cached;

  // No DB layer here — flags are set via admin API and written to Redis directly
  // When no org-specific flags exist, return defaults
  const merged = { ...DEFAULT_FLAGS };
  await cacheSet(cacheKey, merged, TTL);
  return merged;
}

/**
 * Set a flag for an org (admin use — updates Redis directly).
 * @param {string|number} orgId
 * @param {string}        flag
 * @param {boolean}       value
 */
async function setFlag(orgId, flag, value) {
  const cacheKey = `ff:org:${orgId}`;
  const current  = await cacheGet(cacheKey) || { ...DEFAULT_FLAGS };
  current[flag]  = Boolean(value);
  await cacheSet(cacheKey, current, TTL);
}

/**
 * Express middleware factory — gates a route on a feature flag.
 * Returns 403 with code FEATURE_DISABLED when flag is off.
 *
 * @param {string} flag
 */
function requireFeature(flag) {
  return async (req, res, next) => {
    try {
      const orgId = req.user?.orgId || req.headers['x-org-id'];
      if (await isEnabled(flag, orgId)) return next();

      res.status(403).json({
        success: false,
        error:   { message: `Feature '${flag}' is not enabled for your organization`, code: 'FEATURE_DISABLED' },
      });
    } catch (_) {
      // On error allow through — don't block on flag system failures
      next();
    }
  };
}

module.exports = { isEnabled, getFlags, setFlag, requireFeature, DEFAULT_FLAGS };
