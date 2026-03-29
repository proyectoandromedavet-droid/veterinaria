'use strict';

/**
 * Subdomain tenant resolver middleware.
 *
 * Extracts the org slug from the subdomain and sets `req.tenantSlug`.
 * The downstream auth middleware already sets orgId from the JWT.
 * This middleware enables:
 *   1. Routing validation — reject tokens used on the wrong subdomain
 *   2. Public routes (e.g. portal login) that need orgId before auth
 *
 * Example:
 *   clinic-peludo.vetmanagerpro.com  →  req.tenantSlug = 'clinic-peludo'
 *   localhost / IP                   →  req.tenantSlug = null (dev mode)
 *
 * To map slug → orgId, the gateway checks Redis cache first, then
 * calls the auth service (internal). Result cached 60 min.
 *
 * Config:
 *   ROOT_DOMAIN  — e.g. "vetmanagerpro.com" (default: skip resolution)
 *   INTERNAL_AUTH_URL — e.g. "http://auth:4051" (for slug→orgId lookup)
 */

const { get: cacheGet, set: cacheSet } = require('../../../shared/cache');


const INTERNAL_AUTH_URL = process.env.SERVICE_AUTH || 'http://localhost:4051';
const SLUG_CACHE_TTL    = parseInt(process.env.SUBDOMAIN_CACHE_TTL || '3600');

/**
 * Extract slug from hostname.
 * "clinic-peludo.vetmanagerpro.com" + "vetmanagerpro.com" → "clinic-peludo"
 * Returns null if hostname doesn't match ROOT_DOMAIN or is a bare IP/localhost.
 */
function extractSlug(hostname) {
  const rootDomain = process.env.ROOT_DOMAIN || "";
  if (!rootDomain || !hostname) return null;
  if (!hostname.endsWith(`.${rootDomain}`)) return null;
  const slug = hostname.slice(0, -(rootDomain.length + 1));
  // Only single-level slug (no dots)
  if (!slug || slug.includes('.')) return null;
  return slug;
}

/**
 * Resolve slug → orgId via cache then auth service.
 * Returns null on failure (non-blocking).
 */
async function resolveSlug(slug) {
  const key    = `tenant:slug:${slug}`;
  const cached = await cacheGet(key);
  if (cached) return cached.orgId;

  try {
    const res = await fetch(
      `${INTERNAL_AUTH_URL}/internal/orgs/by-slug/${encodeURIComponent(slug)}`,
      {
        headers: { 'X-Internal-Token': process.env.INTERNAL_SECRET || '' },
        signal:  AbortSignal.timeout(2000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.orgId) {
      await cacheSet(key, { orgId: data.orgId }, SLUG_CACHE_TTL);
      return data.orgId;
    }
  } catch (_) {
    // Non-blocking — auth service may be starting up
  }
  return null;
}

/**
 * Middleware — attaches `req.tenantSlug` and optionally `req.tenantOrgId`.
 * Never blocks the request on failure.
 */
async function subdomainMiddleware(req, _res, next) {
  try {
    const hostname = req.hostname;
    const slug     = extractSlug(hostname);
    req.tenantSlug  = slug;

    if (slug) {
      req.tenantOrgId = await resolveSlug(slug);
    }
  } catch (_) {
    req.tenantSlug  = null;
    req.tenantOrgId = null;
  }
  next();
}

/**
 * Express middleware: reject requests where the JWT orgId doesn't match
 * the subdomain's orgId.  Must run AFTER the JWT auth middleware that sets
 * req.user, and AFTER subdomainMiddleware that sets req.tenantOrgId.
 *
 * Skip check when:
 *   - no subdomain detected (localhost / direct IP)
 *   - user is superadmin (cross-org access allowed)
 */
function tenantMismatchGuard(req, res, next) {
  if (!req.tenantOrgId) return next();  // no subdomain — skip
  if (!req.user?.orgId) return next();  // no JWT yet — JWT guard will handle auth

  if (req.user.roles?.includes('superadmin')) return next();

  if (String(req.user.orgId) !== String(req.tenantOrgId)) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Token does not belong to this tenant',
        code:    'RBAC_005',
      },
    });
  }
  next();
}

module.exports = { subdomainMiddleware, extractSlug, tenantMismatchGuard };
