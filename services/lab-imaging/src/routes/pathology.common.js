'use strict';

const { validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

function logPathologyError(route, err, meta = {}) {
  console.error(`[lab-imaging:pathology] ${route} failed`, {
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    sqlState: err?.sqlState,
    sqlMessage: err?.sqlMessage,
    sql: err?.sql,
    meta,
    stack: err?.stack,
  });
}

module.exports = {
  db,
  R,
  validate,
  logPathologyError,
};
