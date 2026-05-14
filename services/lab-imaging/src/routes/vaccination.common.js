'use strict';

const { validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

const getRows = async (sql, params = {}) => {
  const result = await db.query(sql, params);
  return Array.isArray(result?.[0]) ? result[0] : result;
};

const getInsertResult = async (sql, params = {}) => {
  const result = await db.query(sql, params);
  return Array.isArray(result) ? result[0] : result;
};

async function resolveBranchFromPatient(req, patientId) {
  let userBranchId = req.user?.branchId || null;

  if (!userBranchId && req.user?.userId) {
    const users = await getRows(
      `SELECT branch_id
       FROM users
       WHERE id = :userId
       LIMIT 1`,
      { userId: req.user.userId }
    );

    userBranchId = users[0]?.branch_id || null;
  }

  const patients = await getRows(
    `SELECT id
     FROM patients
     WHERE id = :patientId
     LIMIT 1`,
    { patientId }
  );

  const patient = patients[0];

  if (!patient) {
    return { error: 'Paciente no encontrado' };
  }

  if (!userBranchId) {
    return { error: 'Usuario sin sucursal asignada' };
  }

  return { patient, branchId: userBranchId };
}

function logVaccinationError(scope, error, meta = {}) {
  console.error(`[lab-imaging:vaccination] ${scope}`, {
    message: error?.message,
    code: error?.code,
    errno: error?.errno,
    sqlState: error?.sqlState,
    sqlMessage: error?.sqlMessage,
    meta,
  });
}

module.exports = {
  db,
  R,
  validate,
  getRows,
  getInsertResult,
  resolveBranchFromPatient,
  logVaccinationError,
};
