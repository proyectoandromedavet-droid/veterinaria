'use strict';

const { validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

function logLabError(scope, error, meta = {}) {
  console.error(`[lab-imaging] ${scope}`, {
    message: error?.message,
    code: error?.code,
    meta,
  });
}

module.exports = {
  db,
  R,
  validate,
  logLabError,
};
