'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');

const router = Router();

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

const resolveBranchFromPatient = async (req, patientId) => {
  const userBranchId = req.user?.branchId || null;

  const patients = await getRows(
    userBranchId
      ? `SELECT id, branch_id
         FROM patients
         WHERE id = :patientId
           AND branch_id = :branchId
         LIMIT 1`
      : `SELECT id, branch_id
         FROM patients
         WHERE id = :patientId
         LIMIT 1`,
    userBranchId
      ? { patientId, branchId: userBranchId }
      : { patientId }
  );

  const patient = patients[0];

  if (!patient) {
    return { error: 'Paciente no encontrado' };
  }

  const branchId = userBranchId || patient.branch_id || null;

  if (!branchId) {
    return { error: 'Paciente sin sucursal asignada' };
  }

  return { patient, branchId };
};

// GET /vaccinations?patientId=&upcoming=
router.get('/', async (req, res, next) => {
  try {
    const { patientId, upcoming, page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let branchId = req.user?.branchId || null;

    if (!branchId && patientId) {
      const resolved = await resolveBranchFromPatient(req, patientId);
      if (resolved.error) return R.badRequest(res, resolved.error);
      branchId = resolved.branchId;
    }

    if (!branchId) {
      return R.badRequest(res, 'No se pudo determinar la sucursal');
    }

    const conds = ['v.branch_id = :bid'];
    const p = {
      bid: branchId,
      limit: Number(limit),
      offset: Number(offset),
    };

    if (patientId) {
      conds.push('v.patient_id = :pid');
      p.pid = patientId;
    }

    if (upcoming === 'true') {
      conds.push('v.next_due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)');
    }

    const rows = await getRows(
      `SELECT v.id, v.vaccination_date, v.next_due_date, v.batch_number, v.notes,
              vac.name AS vaccine_name, vac.disease_covered, vac.manufacturer,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS administered_by
       FROM vaccinations v
       JOIN vaccines vac ON v.vaccine_id = vac.id
       JOIN patients p   ON v.patient_id = p.id
       JOIN species sp   ON p.species_id = sp.id
       JOIN users u      ON v.administered_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY v.vaccination_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
});

// GET /vaccinations/alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const branchId = req.user?.branchId || null;

    if (!branchId) {
      return R.badRequest(res, 'No se pudo determinar la sucursal');
    }

    const rows = await getRows(
      `SELECT * FROM v_vaccination_alerts WHERE branch_id = :bid ORDER BY next_due_date`,
      { bid: branchId }
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
});

// POST /vaccinations
router.post('/',
  body('patientId').isInt(),
  body('vaccineId').isInt(),
  body('vaccinationDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId,
        vaccineId,
        vaccinationDate,
        batchNumber,
        expiryDate,
        dose,
        route,
        site,
        nextDueDate,
        notes,
        medicalRecordId,
      } = req.body;

      const resolved = await resolveBranchFromPatient(req, patientId);
      if (resolved.error) return R.badRequest(res, resolved.error);

      const { branchId } = resolved;

      const r = await getInsertResult(
        `INSERT INTO vaccinations
           (branch_id, patient_id, vaccine_id, medical_record_id,
            vaccination_date, batch_number, expiry_date,
            dose, route, administration_site,
            next_due_date, notes, administered_by)
         VALUES (:bid,:pid,:vid,:mid,:date,:batch,:exp,:dose,:route,:site,:next,:notes,:uid)`,
        {
          bid: branchId,
          pid: patientId,
          vid: vaccineId,
          mid: medicalRecordId || null,
          date: vaccinationDate,
          batch: batchNumber || null,
          exp: expiryDate || null,
          dose: dose || null,
          route: route || null,
          site: site || null,
          next: nextDueDate || null,
          notes: notes || null,
          uid: req.user.userId,
        }
      );

      return R.created(res, { id: r.insertId });
    } catch (e) {
      console.error('[vaccinations:create] failed', {
        message: e.message,
        code: e.code,
        errno: e.errno,
        sqlState: e.sqlState,
        sqlMessage: e.sqlMessage,
        user: req.user,
        body: req.body,
      });
      next(e);
    }
  }
);

// GET /vaccinations/vaccines?speciesId=
router.get('/vaccines', async (req, res, next) => {
  try {
    const { speciesId } = req.query;

    const where = speciesId
      ? `WHERE (v.target_species LIKE :s OR v.target_species = 'all') AND v.is_active = TRUE`
      : `WHERE v.is_active = TRUE`;

    const rows = await getRows(
      `SELECT v.*, vm.name AS manufacturer_name
       FROM vaccines v
       LEFT JOIN vaccine_manufacturers vm ON v.manufacturer_id = vm.id
       ${where}
       ORDER BY v.name`,
      speciesId ? { s: `%${speciesId}%` } : {}
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
});

// ── Deworming ─────────────────────────────────────────────────────────────────

// GET /vaccinations/deworming?patientId=
const getDeworming = [async (req, res, next) => {
  try {
    const { patientId, page = 1, limit = 30 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let branchId = req.user?.branchId || null;

    if (!branchId && patientId) {
      const resolved = await resolveBranchFromPatient(req, patientId);
      if (resolved.error) return R.badRequest(res, resolved.error);
      branchId = resolved.branchId;
    }

    if (!branchId) {
      return R.badRequest(res, 'No se pudo determinar la sucursal');
    }

    const conds = ['dr.branch_id = :bid'];
    const p = {
      bid: branchId,
      limit: Number(limit),
      offset: Number(offset),
    };

    if (patientId) {
      conds.push('dr.patient_id = :pid');
      p.pid = patientId;
    }

    const rows = await getRows(
      `SELECT dr.id, dr.deworming_date, dr.next_due_date, dr.weight_at_treatment,
              dr.dose_administered, dr.notes,
              ap.name AS product_name, ap.parasite_type, ap.active_ingredient,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS administered_by
       FROM deworming_records dr
       JOIN antiparasitic_products ap ON dr.product_id = ap.id
       JOIN patients p                ON dr.patient_id = p.id
       JOIN species sp                ON p.species_id = sp.id
       JOIN users u                   ON dr.administered_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY dr.deworming_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
}];

// GET /vaccinations/deworming/alerts
const getDewormingAlerts = [async (req, res, next) => {
  try {
    const branchId = req.user?.branchId || null;

    if (!branchId) {
      return R.badRequest(res, 'No se pudo determinar la sucursal');
    }

    const rows = await getRows(
      `SELECT * FROM v_deworming_alerts WHERE branch_id = :bid ORDER BY next_due_date`,
      { bid: branchId }
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
}];

// POST /vaccinations/deworming
const postDeworming = [
  body('patientId').isInt(),
  body('productId').isInt(),
  body('dewormingDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId,
        productId,
        dewormingDate,
        weightAtTreatment,
        doseAdministered,
        route,
        nextDueDate,
        notes,
      } = req.body;

      const resolved = await resolveBranchFromPatient(req, patientId);
      if (resolved.error) return R.badRequest(res, resolved.error);

      const { branchId } = resolved;

      const products = await getRows(
        `SELECT id FROM antiparasitic_products WHERE id = :productId LIMIT 1`,
        { productId }
      );

      if (!products[0]) {
        return R.badRequest(res, 'Producto antiparasitario no encontrado');
      }

      const r = await getInsertResult(
        `INSERT INTO deworming_records
           (branch_id, patient_id, product_id,
            deworming_date, weight_at_treatment, dose_administered,
            route, next_due_date, notes, administered_by)
         VALUES (:bid,:pid,:prod,:date,:wt,:dose,:route,:next,:notes,:uid)`,
        {
          bid: branchId,
          pid: patientId,
          prod: productId,
          date: dewormingDate,
          wt: weightAtTreatment || null,
          dose: doseAdministered || null,
          route: route || null,
          next: nextDueDate || null,
          notes: notes || null,
          uid: req.user.userId,
        }
      );

      return R.created(res, { id: r.insertId });
    } catch (e) {
      console.error('[deworming:create] failed', {
        message: e.message,
        code: e.code,
        errno: e.errno,
        sqlState: e.sqlState,
        sqlMessage: e.sqlMessage,
        user: req.user,
        body: req.body,
      });
      next(e);
    }
  },
];

// GET /vaccinations/deworming/products
const getDewormingProducts = [async (_req, res, next) => {
  try {
    const rows = await getRows(
      `SELECT *
       FROM antiparasitic_products
       WHERE is_active = TRUE
       ORDER BY parasite_type, name`
    );

    return R.ok(res, rows);
  } catch (e) {
    next(e);
  }
}];

router.get('/deworming', ...getDeworming);
router.get('/deworming/alerts', ...getDewormingAlerts);
router.post('/deworming', ...postDeworming);
router.get('/deworming/products', ...getDewormingProducts);

module.exports = router;
module.exports.getDeworming = getDeworming;
module.exports.getDewormingAlerts = getDewormingAlerts;
module.exports.postDeworming = postDeworming;
module.exports.getDewormingProducts = getDewormingProducts;