'use strict';

const { Router } = require('express');
const engine = require('../../../../shared/rulesEngine');
const { body, param, db, R, validate, logMedicalError } = require('./medical.common');

const router = Router();

const VALID_TYPES = ['appointment_restriction', 'capacity_limit', 'clinical_alert', 'invoice_rule'];
const VALID_OPS = ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in', 'nin', 'contains', 'day_of_week', 'between'];

router.get('/', async (req, res, next) => {
  try {
    const orgId = req.user?.orgId;
    const { type } = req.query;
    const whereType = type ? 'AND rule_type = :type' : '';
    const rules = await db.query(
      `SELECT * FROM business_rules WHERE org_id = :orgId ${whereType} ORDER BY rule_type, priority`,
      { orgId, type: type || null }
    );
    res.json({ success: true, data: rules });
  } catch (err) {
    logMedicalError('rules.GET /rules', err, { orgId: req.user?.orgId, query: req.query });
    next(err);
  }
});

router.post('/',
  body('rule_type').isIn(VALID_TYPES),
  body('name').isString().notEmpty().isLength({ max: 120 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('action_message').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('conditions').isArray({ min: 1, max: 20 }),
  body('conditions.*.field').isString().notEmpty().isLength({ max: 100 }),
  body('conditions.*.operator').isIn(VALID_OPS),
  body('conditions.*.value').optional().isLength({ max: 500 }),
  body('action').optional().isIn(['block', 'warn', 'alert']),
  validate,
  async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      const userId = req.user?.userId;
      const { rule_type, name, description, conditions, action, action_message, branch_id, priority } = req.body;
      if (branch_id) {
        const branch = await db.queryOne(
          `SELECT id FROM branches WHERE id = :branchId AND organization_id = :orgId`,
          { branchId: branch_id, orgId }
        );
        if (!branch) return R.forbidden(res, 'Sucursal fuera de organizacion');
      }

      const result = await db.query(
        `INSERT INTO business_rules
           (org_id, branch_id, rule_type, name, description, conditions, action, action_message, priority, created_by)
         VALUES (:orgId, :branchId, :ruleType, :name, :description, :conditions, :action, :actionMessage, :priority, :userId)`,
        {
          orgId,
          branchId: branch_id || null,
          ruleType: rule_type,
          name,
          description: description || null,
          conditions: JSON.stringify(conditions),
          action: action || 'warn',
          actionMessage: action_message || null,
          priority: priority || 100,
          userId,
        }
      );

      await engine.invalidateCache(orgId);
      res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (err) {
      logMedicalError('rules.POST /rules', err, { orgId: req.user?.orgId, userId: req.user?.userId, body: req.body });
      next(err);
    }
  }
);

router.put('/:id',
  param('id').isInt(),
  body('name').optional().isString().notEmpty().isLength({ max: 120 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('action_message').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('conditions').optional().isArray({ min: 1, max: 20 }),
  body('conditions.*.field').optional().isString().notEmpty().isLength({ max: 100 }),
  body('conditions.*.operator').optional().isIn(VALID_OPS),
  body('conditions.*.value').optional().isLength({ max: 500 }),
  body('action').optional().isIn(['block', 'warn', 'alert']),
  body('is_active').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      const { name, description, conditions, action, action_message, priority, is_active } = req.body;

      const updates = [];
      const params = { id: req.params.id, orgId };

      if (name != null) { updates.push('name = :name'); params.name = name; }
      if (description != null) { updates.push('description = :desc'); params.desc = description; }
      if (conditions != null) { updates.push('conditions = :conditions'); params.conditions = JSON.stringify(conditions); }
      if (action != null) { updates.push('action = :action'); params.action = action; }
      if (action_message != null) { updates.push('action_message = :msg'); params.msg = action_message; }
      if (priority != null) { updates.push('priority = :priority'); params.priority = priority; }
      if (is_active != null) { updates.push('is_active = :active'); params.active = is_active; }

      if (!updates.length) return R.error(res, 400, 'No fields to update', null, 'VAL_009');

      // SEC: verificar affectedRows para detectar regla inexistente o de otra org
      const [result] = await db.query(
        `UPDATE business_rules SET ${updates.join(', ')} WHERE id = :id AND org_id = :orgId`,
        params
      );
      if (!result.affectedRows) return R.notFound(res, 'Regla no encontrada');

      await engine.invalidateCache(orgId);
      res.json({ success: true });
    } catch (err) {
      logMedicalError('rules.PUT /rules/:id', err, { ruleId: req.params.id, orgId: req.user?.orgId, body: req.body });
      next(err);
    }
  }
);

router.delete('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    const orgId = req.user?.orgId;
    await db.query(
      'UPDATE business_rules SET is_active = FALSE WHERE id = :id AND org_id = :orgId',
      { id: req.params.id, orgId }
    );
    await engine.invalidateCache(orgId);
    res.json({ success: true });
  } catch (err) {
    logMedicalError('rules.DELETE /rules/:id', err, { ruleId: req.params.id, orgId: req.user?.orgId });
    next(err);
  }
});

module.exports = { router, VALID_TYPES, VALID_OPS };
