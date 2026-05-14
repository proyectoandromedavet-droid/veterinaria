'use strict';

const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

function deletedPredicate(cols, alias) {
  return cols.has('deleted_at') ? `${alias}.deleted_at IS NULL` : '1 = 1';
}

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

function logClientsError(scope, error, meta = {}) {
  console.error(`[patients.clients] ${scope}`, {
    message: error?.message,
    stack: error?.stack,
    ...meta,
  });
}

let _clientSchemaPromise;
async function getClientSchema() {
  if (!_clientSchemaPromise) {
    _clientSchemaPromise = db.query(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('clients', 'patients', 'patient_owners', 'client_emergency_contacts', 'countries', 'currencies')`
    ).then((rows) => {
      const schema = {};
      for (const row of rows) {
        if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = new Set();
        schema[row.TABLE_NAME].add(row.COLUMN_NAME);
      }
      return schema;
    });
  }
  return _clientSchemaPromise;
}

module.exports = {
  body,
  db,
  R,
  deletedPredicate,
  validate,
  logClientsError,
  getClientSchema,
};
