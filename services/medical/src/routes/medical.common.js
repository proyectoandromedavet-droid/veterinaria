'use strict';

const { body, param, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

function logMedicalError(scope, error, meta = {}) {
  console.error(`[medical] ${scope}`, {
    message: error?.message,
    stack: error?.stack,
    ...meta,
  });
}

module.exports = {
  body,
  param,
  db,
  R,
  validate,
  logMedicalError,
};
