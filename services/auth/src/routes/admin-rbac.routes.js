'use strict';

/**
 * Admin RBAC routes — manage per-org role permission overrides.
 * All endpoints require superadmin or org_admin role.
 *
 * GET  /admin/rbac/roles                    → list roles + static permissions
 * GET  /admin/rbac/orgs/:orgId/overrides    → get all overrides for an org
 * PUT  /admin/rbac/orgs/:orgId/roles/:role  → set override (grant/revoke)
 * DELETE /admin/rbac/orgs/:orgId/roles/:role → remove override
 * POST /admin/rbac/orgs/:orgId/sync         → reload DB → Redis for this org
 */

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const db   = require('../../../../shared/db');
const { requireInternalSig } = require('../../../../shared/internalAuth');
const {
  ROLE_PERMISSIONS,
  setRoleOverride,
  getEffectivePermissions,
  loadOrgOverridesFromDb,
} = require('../../../../shared/rbac');

const router = Router();

// ── Auth guard helpers (same as admin-users.routes.js) ───────────────────────
function fromHeaders(req, _res, next) {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
    email:    req.headers['x-user-email'],
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.roles?.some(r => ['superadmin', 'org_admin'].includes(r))) {
    return res.status(403).json({ success: false, error: { message: 'Se requiere rol org_admin o superadmin' } });
  }
  next();
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
  }
  next();
}

// Apply internal signature + role check to ALL routes in this router
router.use(requireInternalSig, fromHeaders, requireAdmin);

// ── GET /admin/rbac/roles ─────────────────────────────────────────────────────
router.get('/roles', (req, res) => {
  const roles = Object.entries(ROLE_PERMISSIONS).map(([name, perms]) => ({ name, permissions: perms }));
  res.json({ success: true, data: roles });
});

// ── GET /admin/rbac/orgs/:orgId/overrides ─────────────────────────────────────
router.get('/orgs/:orgId/overrides',
  param('orgId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { orgId } = req.params;
      const rows = await db.query(
        'SELECT role_name, added_permissions, removed_permissions, updated_at FROM org_role_overrides WHERE org_id = :orgId',
        { orgId }
      );
      const data = rows.map(r => ({
        role:    r.role_name,
        grant:   typeof r.added_permissions   === 'string' ? JSON.parse(r.added_permissions)   : (r.added_permissions   || []),
        revoke:  typeof r.removed_permissions === 'string' ? JSON.parse(r.removed_permissions) : (r.removed_permissions || []),
        updated: r.updated_at,
      }));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/rbac/orgs/:orgId/roles/:role/effective ─────────────────────────
router.get('/orgs/:orgId/roles/:role/effective',
  param('orgId').isInt({ min: 1 }),
  param('role').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { orgId, role } = req.params;
      const permissions = await getEffectivePermissions(role, orgId);
      res.json({ success: true, data: { role, orgId, permissions } });
    } catch (err) { next(err); }
  }
);

// ── PUT /admin/rbac/orgs/:orgId/roles/:role ───────────────────────────────────
router.put('/orgs/:orgId/roles/:role',
  param('orgId').isInt({ min: 1 }),
  param('role').notEmpty(),
  body('grant').optional().isArray(),
  body('revoke').optional().isArray(),
  validate,
  async (req, res, next) => {
    try {
      const { orgId, role } = req.params;
      const grant  = req.body.grant  || [];
      const revoke = req.body.revoke || [];

      if (!ROLE_PERMISSIONS[role]) {
        return res.status(404).json({ success: false, error: { message: `Role '${role}' not found` } });
      }

      await setRoleOverride(orgId, role, grant, revoke);
      const effective = await getEffectivePermissions(role, orgId);
      res.json({ success: true, data: { orgId, role, grant, revoke, effective } });
    } catch (err) { next(err); }
  }
);

// ── DELETE /admin/rbac/orgs/:orgId/roles/:role ────────────────────────────────
router.delete('/orgs/:orgId/roles/:role',
  param('orgId').isInt({ min: 1 }),
  param('role').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { orgId, role } = req.params;
      await setRoleOverride(orgId, role, [], []); // clear overrides
      await db.query(
        'DELETE FROM org_role_overrides WHERE org_id = :orgId AND role_name = :role',
        { orgId, role }
      );
      res.json({ success: true, message: `Overrides for role '${role}' in org ${orgId} removed` });
    } catch (err) { next(err); }
  }
);

// ── POST /admin/rbac/orgs/:orgId/sync ─────────────────────────────────────────
router.post('/orgs/:orgId/sync',
  param('orgId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { orgId } = req.params;
      await loadOrgOverridesFromDb(orgId);
      res.json({ success: true, message: `RBAC cache warmed for org ${orgId}` });
    } catch (err) { next(err); }
  }
);

// ── GET /admin/security-alerts ────────────────────────────────────────────────
router.get('/security-alerts', async (req, res, next) => {
  try {
    const orgId              = req.headers['x-org-id'];
    const onlyUnacknowledged = req.query.unacked === 'true';
    const { getAlerts }      = require('../../../../shared/dlp');
    const alerts             = await getAlerts(orgId, { onlyUnacknowledged });
    res.json({ success: true, data: alerts, count: alerts.length });
  } catch (err) { next(err); }
});

// ── POST /admin/security-alerts/:id/acknowledge ───────────────────────────────
router.post('/security-alerts/:id/acknowledge', async (req, res, next) => {
  try {
    const { acknowledgeAlert } = require('../../../../shared/dlp');
    await acknowledgeAlert(req.params.id, req.headers['x-user-id']);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
