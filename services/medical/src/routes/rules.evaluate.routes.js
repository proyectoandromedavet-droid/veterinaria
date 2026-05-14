'use strict';

const { Router } = require('express');
const engine = require('../../../../shared/rulesEngine');
const { body, validate, logMedicalError } = require('./medical.common');
const { VALID_TYPES } = require('./rules.admin.routes');

const router = Router();

router.post('/evaluate',
  body('rule_type').isIn(VALID_TYPES),
  body('context').isObject(),
  validate,
  async (req, res, next) => {
    try {
      const orgId = req.user?.orgId;
      const branchId = req.user?.branchId;
      const { rule_type, context } = req.body;
      const result = await engine.evaluate(rule_type, orgId, branchId, context);
      res.json({ success: true, data: result });
    } catch (err) {
      logMedicalError('rules.POST /rules/evaluate', err, { orgId: req.user?.orgId, branchId: req.user?.branchId, body: req.body });
      next(err);
    }
  }
);

module.exports = { router };
