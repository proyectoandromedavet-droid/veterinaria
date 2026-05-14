'use strict';

const { createLogger } = require('./logger');
const log = createLogger('rbac');

const R = require('./response');
const { checkRowTenantAccess } = require('./tenantScope');

/**
 * RBAC permission map.
 * Keys = role names (matching DB roles.name).
 * Values = array of allowed permission keys.
 *
 * Convention: resource:action   e.g. patients:read, invoices:create
 */
const ROLE_PERMISSIONS = {
  superadmin: ['*'],  // All permissions

  org_admin: [
    'org:read', 'org:update',
    'branches:*', 'users:*',
    'ai:*',
    'patients:*', 'clients:*',
    'appointments:*', 'medical_records:*',
    'lab:*', 'imaging:*', 'surgery:*', 'hospitalization:*',
    'vaccinations:*', 'deworming:*',
    'invoices:*', 'payments:*', 'inventory:*',
    'telemedicine:*', 'grooming:*',
    'reports:*', 'audit:read',
  ],

  branch_manager: [
    'branches:read', 'branches:update',
    'users:read', 'users:create', 'users:update',
    'ai:*',
    'patients:*', 'clients:*',
    'appointments:*', 'medical_records:*',
    'lab:*', 'imaging:*', 'surgery:*', 'hospitalization:*',
    'vaccinations:*', 'deworming:*',
    'invoices:*', 'payments:*', 'inventory:*',
    'telemedicine:*', 'grooming:*',
    'reports:read',
  ],

  veterinarian: [
    'patients:read', 'patients:update',
    'clients:read',
    'ai:*',
    'appointments:*',
    'medical_records:*',
    'lab:*', 'imaging:*', 'surgery:*', 'hospitalization:*',
    'vaccinations:*', 'deworming:*',
    'telemedicine:read', 'telemedicine:create', 'telemedicine:update',
    'invoices:read', 'invoices:create',
    'reports:read',
  ],

  vet_technician: [
    'patients:read', 'patients:update',
    'clients:read',
    'appointments:read', 'appointments:update',
    'medical_records:read', 'medical_records:create',
    'lab:read', 'lab:create',
    'imaging:read', 'imaging:create',
    'hospitalization:read', 'hospitalization:update',
    'vaccinations:*', 'deworming:*',
  ],

  receptionist: [
    'patients:read', 'patients:create',
    'clients:read', 'clients:create', 'clients:update',
    'appointments:*',
    'invoices:read', 'invoices:create',
    'payments:create',
  ],

  groomer: [
    'patients:read', 'clients:read',
    'grooming:read', 'grooming:create', 'grooming:update',
  ],

  grooming_manager: [
    'patients:read', 'clients:read',
    'grooming:*',
    'reports:read',
  ],

  tele_vet: [
    'patients:read', 'clients:read',
    'ai:*',
    'telemedicine:*',
    'medical_records:read', 'medical_records:create',
  ],

  pharmacist: [
    'patients:read',
    'medical_records:read',
    'inventory:*',
    'invoices:read',
  ],

  accountant: [
    'invoices:*', 'payments:*',
    'reports:read',
    'clients:read',
  ],

  lab_technician: [
    'patients:read',
    'lab:*',
    'medical_records:read',
  ],

  imaging_tech: [
    'patients:read',
    'imaging:*',
    'medical_records:read',
  ],

  surgeon: [
    'patients:read', 'patients:update',
    'clients:read',
    'medical_records:read',
    'surgery:*',
    'hospitalization:read',
    'lab:read', 'imaging:read',
  ],

  read_only: [
    'patients:read', 'clients:read',
    'appointments:read', 'medical_records:read',
    'invoices:read', 'reports:read',
  ],

  api_user: [],  // Permissions granted via api_key scopes
};

// Lazy-load to avoid circular dependency at module init time
let _rbacDenials;
function getRbacDenials() {
  if (!_rbacDenials) {
    try { _rbacDenials = require('./metrics').rbacDenials; } catch (err) {
      log.warn('RBAC denials metric unavailable', { error: err.message });
    }
  }
  return _rbacDenials;
}

/**
 * Check if a set of roles has a given permission.
 * Supports wildcards: '*' (all), 'resource:*' (all actions on resource),
 * and 'crud:table:action' patterns.
 *
 * @param {string[]} roles   List of role names from JWT
 * @param {string}   perm    e.g. 'patients:read' or 'crud:patients:delete'
 */
function hasPermission(roles, perm) {
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;

    const [resource] = perm.split(':');
    if (perms.includes(perm)) return true;
    if (perms.includes(`${resource}:*`)) return true;

    // crud:table:action — check if role has crud:table:* or the exact perm
    if (perm.startsWith('crud:')) {
      const [, table] = perm.split(':');
      if (perms.includes(`crud:${table}:*`)) return true;
    }
  }
  return false;
}

/**
 * Express middleware factory.
 * Usage: router.get('/patients', requirePermission('patients:read'), handler)
 */
function requirePermission(perm) {
  return async (req, res, next) => {
    const roles = req.user?.roles || [];
    const orgId = req.user?.orgId || req.user?.organization_id || req.headers?.['x-org-id'] || null;
    const allowed = await hasPermissionDynamic(roles, perm, orgId);
    if (!allowed) {
      getRbacDenials()?.inc({ permission: perm, role: roles[0] || 'none', service: 'unknown' });
      return R.error(res, 403, `Forbidden: requires permission '${perm}'`, null, 'RBAC_003');
    }
    next();
  };
}

/**
 * Require ANY of the listed permissions (OR logic).
 * @param {...string} perms
 */
function requireAny(...perms) {
  return async (req, res, next) => {
    const roles = req.user?.roles || [];
    const orgId = req.user?.orgId || req.user?.organization_id || req.headers?.['x-org-id'] || null;
    const checks = await Promise.all(perms.map(p => hasPermissionDynamic(roles, p, orgId)));
    if (checks.some(Boolean)) return next();

    getRbacDenials()?.inc({ permission: perms.join('|'), role: roles[0] || 'none', service: 'unknown' });
    R.error(res, 403, `Forbidden: requires one of [${perms.join(', ')}]`, null, 'RBAC_003');
  };
}

/**
 * Require ALL of the listed permissions (AND logic).
 * @param {...string} perms
 */
function requireAll(...perms) {
  return async (req, res, next) => {
    const roles = req.user?.roles || [];
    const orgId = req.user?.orgId || req.user?.organization_id || req.headers?.['x-org-id'] || null;
    const results = await Promise.all(perms.map(async (p) => ({ perm: p, ok: await hasPermissionDynamic(roles, p, orgId) })));
    const missing = results.filter(r => !r.ok).map(r => r.perm);
    if (!missing.length) return next();

    getRbacDenials()?.inc({ permission: missing[0], role: roles[0] || 'none', service: 'unknown' });
    R.error(res, 403, `Forbidden: missing permissions [${missing.join(', ')}]`, null, 'RBAC_003');
  };
}

/**
 * Middleware: ensure req.user.orgId matches the resource's org
 * (call this after loading the resource into req.resource)
 */
function requireSameOrg(req, res, next) {
  const user = req.user;
  if (!user) return R.error(res, 401, 'Unauthorized', null, 'AUTH_001');
  const access = checkRowTenantAccess(req.resource, req, { orgField: 'organization_id', allowSuperadmin: true });
  if (!access.ok && access.reason === 'org_mismatch') {
    return R.error(res, 403, 'Cross-organization access denied', null, 'RBAC_005');
  }
  next();
}

// ── Dynamic RBAC overrides per org ────────────────────────────────────────────
/**
 * Org-level permission overrides stored in Redis:
 *   key: `rbac:org:{orgId}:role:{roleName}`
 *   value: { grant: string[], revoke: string[] }
 *
 * This allows orgs to narrow or expand base role permissions at runtime
 * without a deployment (e.g. disable billing access for a specific org's vets).
 *
 * Overrides are applied on top of ROLE_PERMISSIONS:
 *   effective perms = (base perms + grant) - revoke
 */

const RBAC_OVERRIDE_TTL = parseInt(process.env.RBAC_OVERRIDE_TTL || '300'); // 5 min

let _cache;
function _getCache() {
  if (!_cache) {
    try { _cache = require('./cache'); } catch (err) {
      log.warn('RBAC cache helper unavailable', { error: err.message });
    }
  }
  return _cache;
}

/**
 * Get effective permissions for a role, applying org-level overrides.
 * Falls back to static ROLE_PERMISSIONS on any error.
 *
 * @param {string}        roleName
 * @param {string|number} orgId
 * @returns {Promise<string[]>}
 */
async function getEffectivePermissions(roleName, orgId) {
  const base = ROLE_PERMISSIONS[roleName] || [];
  if (!orgId) return base;

  try {
    const cache = _getCache();
    if (!cache) return base;

    const key      = `rbac:org:${orgId}:role:${roleName}`;
    const override = await cache.get(key);
    if (!override) return base;

    const grant  = override.grant  || [];
    const revoke = new Set(override.revoke || []);
    const merged = [...new Set([...base, ...grant])].filter(p => !revoke.has(p));
    return merged;
  } catch (err) {
    log.warn('RBAC dynamic permission lookup failed, using base permissions', {
      roleName,
      orgId,
      error: err.message,
    });
    return base;
  }
}

/**
 * Set role permission overrides for an org (admin API use).
 * Writes to Redis cache AND persists to DB (org_role_overrides table).
 * @param {string|number} orgId
 * @param {string}        roleName
 * @param {string[]}      grant    — extra permissions to add
 * @param {string[]}      revoke   — permissions to remove
 */
async function setRoleOverride(orgId, roleName, grant = [], revoke = []) {
  const cache = _getCache();
  if (!cache) throw new Error('Cache unavailable');
  const key = `rbac:org:${orgId}:role:${roleName}`;
  await cache.set(key, { grant, revoke }, RBAC_OVERRIDE_TTL);

  // Persist to DB so overrides survive Redis restarts
  if (process.env.NODE_ENV === 'test') return;
  try {
    const db = require('./db');
    await db.query(
      `INSERT INTO org_role_overrides (org_id, role_name, added_permissions, removed_permissions)
       VALUES (:orgId, :roleName, :grant, :revoke)
       ON DUPLICATE KEY UPDATE
         added_permissions   = :grant,
         removed_permissions = :revoke,
         updated_at          = NOW()`,
      { orgId, roleName, grant: JSON.stringify(grant), revoke: JSON.stringify(revoke) }
    );
  } catch (err) {
    log.warn('RBAC override DB persistence skipped', {
      orgId,
      roleName,
      error: err.message,
    });
  }
}

/**
 * Load all org_role_overrides from DB and warm Redis cache.
 * Call once at service startup (auth / gateway).
 * @param {string|number} [orgId]  — if provided, only sync that org
 */
async function loadOrgOverridesFromDb(orgId) {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const db    = require('./db');
    const cache = _getCache();
    if (!cache) return;

    const sql = orgId
      ? 'SELECT org_id, role_name, added_permissions, removed_permissions FROM org_role_overrides WHERE org_id = :orgId'
      : 'SELECT org_id, role_name, added_permissions, removed_permissions FROM org_role_overrides';

    const rows = await db.query(sql, orgId ? { orgId } : {});
    for (const row of rows) {
      const grant  = typeof row.added_permissions   === 'string' ? JSON.parse(row.added_permissions)   : (row.added_permissions   || []);
      const revoke = typeof row.removed_permissions === 'string' ? JSON.parse(row.removed_permissions) : (row.removed_permissions || []);
      const key    = `rbac:org:${row.org_id}:role:${row.role_name}`;
      await cache.set(key, { grant, revoke }, RBAC_OVERRIDE_TTL);
    }
  } catch (err) {
    log.warn('RBAC override DB sync failed', {
      orgId,
      error: err.message,
    });
  }
}

/**
 * Async version of hasPermission that checks dynamic overrides.
 * Use this in routes that need per-org RBAC (e.g. admin panel).
 *
 * @param {string[]}      roles
 * @param {string}        perm
 * @param {string|number} orgId
 * @returns {Promise<boolean>}
 */
async function hasPermissionDynamic(roles, perm, orgId) {
  for (const role of roles) {
    const perms = await getEffectivePermissions(role, orgId);
    if (perms.includes('*')) return true;
    const [resource] = perm.split(':');
    if (perms.includes(perm)) return true;
    if (perms.includes(`${resource}:*`)) return true;
    if (perm.startsWith('crud:')) {
      const [, table] = perm.split(':');
      if (perms.includes(`crud:${table}:*`)) return true;
    }
  }
  return false;
}

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
  requireAny,
  requireAll,
  requireSameOrg,
  getEffectivePermissions,
  setRoleOverride,
  loadOrgOverridesFromDb,
  hasPermissionDynamic,
};
