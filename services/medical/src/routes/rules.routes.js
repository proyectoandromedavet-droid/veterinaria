'use strict';
/**
 * Business Rules CRUD — gestión de reglas de negocio configurables por org.
 *
 * GET    /rules           → listar reglas del org
 * POST   /rules           → crear regla
 * PUT    /rules/:id       → actualizar regla
 * DELETE /rules/:id       → eliminar/desactivar regla
 * POST   /rules/evaluate  → evaluar reglas contra un contexto (testing)
 */
const { Router } = require('express');
const { body, param, validationResult } = require('express-validator');
const db          = require('../../../../shared/db');
const engine      = require('../../../../shared/rulesEngine');

const router = Router();

const VALID_TYPES = ['appointment_restriction', 'capacity_limit', 'clinical_alert', 'invoice_rule'];
const VALID_OPS   = ['eq','neq','gt','lt','gte','lte','in','nin','contains','day_of_week','between'];

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
  next();
}

// GET /rules
router.get('/', async (req, res, next) => {
  try {
    const orgId    = req.user?.orgId;
    const { type } = req.query;
    const whereType = type ? 'AND rule_type = :type' : '';
    const rules = await db.query(
      `SELECT * FROM business_rules WHERE org_id = :orgId ${whereType} ORDER BY rule_type, priority`,
      { orgId, type: type || null },
    );
    res.json({ success: true, data: rules });
  } catch (err) { next(err); }
});

// POST /rules
router.post('/',
  body('rule_type').isIn(VALID_TYPES),
  body('name').isString().notEmpty().isLength({ max: 120 }),
  body('conditions').isArray({ min: 1 }),
  body('conditions.*.field').isString().notEmpty(),
  body('conditions.*.operator').isIn(VALID_OPS),
  body('action').optional().isIn(['block','warn','alert']),
  validate,
  async (req, res, next) => {
    try {
      const orgId  = req.user?.orgId;
      const userId = req.user?.userId;
      const { rule_type, name, description, conditions, action, action_message, branch_id, priority } = req.body;

      const result = await db.query(
        `INSERT INTO business_rules
           (org_id, branch_id, rule_type, name, description, conditions, action, action_message, priority, created_by)
         VALUES (:orgId, :branchId, :ruleType, :name, :description, :conditions, :action, :actionMessage, :priority, :userId)`,
        {
          orgId, branchId: branch_id || null, ruleType: rule_type, name,
          description: description || null,
          conditions:  JSON.stringify(conditions),
          action:      action || 'warn',
          actionMessage: action_message || null,
          priority:    priority || 100,
          userId,
        },
      );

      await engine.invalidateCache(orgId);
      res.status(201).json({ success: true, data: { id: result.insertId } });
    } catch (err) { next(err); }
  },
);

// PUT /rules/:id
router.put('/:id',
  param('id').isInt(),
  body('name').optional().isString().notEmpty(),
  body('conditions').optional().isArray({ min: 1 }),
  body('action').optional().isIn(['block','warn','alert']),
  body('is_active').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      const { name, description, conditions, action, action_message, priority, is_active } = req.body;

      const updates = [];
      const params  = { id: req.params.id, orgId };

      if (name           != null) { updates.push('name = :name');             params.name = name; }
      if (description    != null) { updates.push('description = :desc');      params.desc = description; }
      if (conditions     != null) { updates.push('conditions = :conditions'); params.conditions = JSON.stringify(conditions); }
      if (action         != null) { updates.push('action = :action');         params.action = action; }
      if (action_message != null) { updates.push('action_message = :msg');    params.msg = action_message; }
      if (priority       != null) { updates.push('priority = :priority');     params.priority = priority; }
      if (is_active      != null) { updates.push('is_active = :active');      params.active = is_active; }

      if (!updates.length) return res.status(400).json({ success: false, error: { message: 'No fields to update', code: 'VAL_009' } });

      await db.query(
        `UPDATE business_rules SET ${updates.join(', ')} WHERE id = :id AND org_id = :orgId`,
        params,
      );

      await engine.invalidateCache(orgId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// DELETE /rules/:id
router.delete('/:id', param('id').isInt(), validate, async (req, res, next) => {
  try {
    const orgId = req.user?.orgId;
    await db.query(
      'UPDATE business_rules SET is_active = FALSE WHERE id = :id AND org_id = :orgId',
      { id: req.params.id, orgId },
    );
    await engine.invalidateCache(orgId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /rules/evaluate — testing de reglas
router.post('/evaluate',
  body('rule_type').isIn(VALID_TYPES),
  body('context').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const orgId    = req.user?.orgId;
      const branchId = req.user?.branchId;
      const { rule_type, context } = req.body;
      const result = await engine.evaluate(rule_type, orgId, branchId, context);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

module.exports = router;
