'use strict';

const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const { requireInternalSig } = require('../../../../shared/internalAuth');
const { getFlags, setFlags, FLAG_DEFINITIONS, DEFAULT_FLAGS } = require('../../../../shared/featureFlags');

const router = Router();

function fromHeaders(req, _res, next) {
  req.user = {
    userId: req.headers['x-user-id'],
    orgId: req.headers['x-org-id'],
    roles: (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
  };
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.roles?.some((role) => ['superadmin', 'org_admin'].includes(role))) {
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

async function auditFeatureChange(req, previousValue, newValue) {
  await db.query(
    `INSERT INTO permission_change_audit
       (org_id, actor_user_id, action_type, previous_value_json, new_value_json, request_id, ip_address)
     VALUES
       (:orgId, :actorUserId, :actionType, :previousValue, :newValue, :requestId, :ipAddress)`,
    {
      orgId: req.user.orgId,
      actorUserId: req.user.userId || null,
      actionType: 'feature_flags_updated',
      previousValue: JSON.stringify(previousValue || {}),
      newValue: JSON.stringify(newValue || {}),
      requestId: req.headers['x-request-id'] || req.requestId || null,
      ipAddress: req.ip || null,
    }
  ).catch(() => {});
}

router.use(requireInternalSig, fromHeaders, requireAdmin);

router.get('/orgs/:orgId',
  param('orgId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const flags = await getFlags(req.params.orgId);
      res.json({
        success: true,
        data: {
          flags,
          definitions: FLAG_DEFINITIONS,
          defaults: DEFAULT_FLAGS,
        },
      });
    } catch (err) { next(err); }
  }
);

router.patch('/orgs/:orgId',
  param('orgId').isInt({ min: 1 }),
  body('flags').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const previous = await getFlags(req.params.orgId);
      const nextFlags = await setFlags(req.params.orgId, req.body.flags || {});
      await auditFeatureChange(req, previous, nextFlags);
      res.json({
        success: true,
        data: {
          flags: nextFlags,
          definitions: FLAG_DEFINITIONS,
          defaults: DEFAULT_FLAGS,
        },
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
