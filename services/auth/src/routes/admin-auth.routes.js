'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');
const { requireInternalSig } = require('../../../../shared/internalAuth');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return R.badRequest(res, 'Validation failed', errors.array());
  next();
}

function fromHeaders(req, _res, next) {
  req.user = {
    userId: req.headers['x-user-id'],
    orgId: req.headers['x-org-id'],
    roles: (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user.roles.some((role) => ['superadmin', 'org_admin'].includes(role))) {
    return R.forbidden(res, 'Se requiere rol org_admin o superadmin');
  }
  next();
}

router.get('/policy',
  requireInternalSig,
  fromHeaders,
  requireAdmin,
  async (req, res, next) => {
    try {
      let row = await db.queryOne(
        `SELECT organization_id, two_factor_optional_enabled, two_factor_enforced, updated_at
         FROM organization_auth_policies
         WHERE organization_id = :orgId`,
        { orgId: req.user.orgId }
      );
      if (!row) {
        await db.query(
          `INSERT INTO organization_auth_policies (organization_id, two_factor_optional_enabled, two_factor_enforced, updated_by)
           VALUES (:orgId, 0, 0, :userId)`,
          { orgId: req.user.orgId, userId: req.user.userId || null }
        );
        row = await db.queryOne(
          `SELECT organization_id, two_factor_optional_enabled, two_factor_enforced, updated_at
           FROM organization_auth_policies
           WHERE organization_id = :orgId`,
          { orgId: req.user.orgId }
        );
      }
      return R.ok(res, row);
    } catch (e) { next(e); }
  }
);

router.patch('/policy',
  requireInternalSig,
  fromHeaders,
  requireAdmin,
  body('twoFactorOptionalEnabled').isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const enabled = req.body.twoFactorOptionalEnabled ? 1 : 0;
      await db.query(
        `INSERT INTO organization_auth_policies (organization_id, two_factor_optional_enabled, two_factor_enforced, updated_by)
         VALUES (:orgId, :enabled, 0, :userId)
         ON DUPLICATE KEY UPDATE
           two_factor_optional_enabled = VALUES(two_factor_optional_enabled),
           two_factor_enforced = 0,
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        { orgId: req.user.orgId, enabled, userId: req.user.userId || null }
      );
      return R.ok(res, { organizationId: req.user.orgId, twoFactorOptionalEnabled: Boolean(enabled), twoFactorEnforced: false });
    } catch (e) { next(e); }
  }
);

module.exports = router;
