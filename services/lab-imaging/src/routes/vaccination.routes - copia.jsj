'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');

const router   = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// GET /vaccinations?patientId=&branchId=
router.get('/', async (req, res, next) => {
  try {
    const { patientId, upcoming, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['v.branch_id = :bid'];
    const p     = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (patientId) { conds.push('v.patient_id = :pid'); p.pid = patientId; }
    if (upcoming === 'true') conds.push('v.next_due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 30 DAY)');

    const rows = await db.query(
      `SELECT v.id, v.vaccination_date, v.next_due_date, v.batch_number, v.notes,
              vac.name AS vaccine_name, vac.disease_covered, vac.manufacturer,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS administered_by
       FROM vaccinations v
       JOIN vaccines vac ON v.vaccine_id   = vac.id
       JOIN patients p   ON v.patient_id   = p.id
       JOIN species  sp  ON p.species_id   = sp.id
       JOIN users    u   ON v.administered_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY v.vaccination_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /vaccinations/alerts (due/overdue)
router.get('/alerts', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_vaccination_alerts WHERE branch_id = :bid ORDER BY next_due_date`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
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
        patientId, vaccineId, vaccinationDate,
        batchNumber, expiryDate, dose, route, site,
        nextDueDate, notes, medicalRecordId,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO vaccinations
           (branch_id, patient_id, vaccine_id, medical_record_id,
            vaccination_date, batch_number, expiry_date,
            dose, route, administration_site,
            next_due_date, notes, administered_by)
         VALUES (:bid,:pid,:vid,:mid,:date,:batch,:exp,:dose,:route,:site,:next,:notes,:uid)`,
        {
          bid: req.user.branchId, pid: patientId, vid: vaccineId,
          mid: medicalRecordId || null, date: vaccinationDate,
          batch: batchNumber || null, exp: expiryDate || null,
          dose: dose || null, route: route || null, site: site || null,
          next: nextDueDate || null, notes: notes || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// GET /vaccinations/vaccines?speciesId=
router.get('/vaccines', async (req, res, next) => {
  try {
    const { speciesId } = req.query;
    const where = speciesId
      ? `WHERE (v.target_species LIKE :s OR v.target_species = 'all') AND v.is_active = TRUE`
      : `WHERE v.is_active = TRUE`;
    const rows = await db.query(
      `SELECT v.*, vm.name AS manufacturer_name
       FROM vaccines v
       LEFT JOIN vaccine_manufacturers vm ON v.manufacturer_id = vm.id
       ${where} ORDER BY v.name`,
      speciesId ? { s: `%${speciesId}%` } : {}
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── Deworming ─────────────────────────────────────────────────────────────────

const getDeworming = [async (req, res, next) => {
  try {
    const { patientId, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['dr.branch_id = :bid'];
    const p     = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (patientId) { conds.push('dr.patient_id = :pid'); p.pid = patientId; }

    const rows = await db.query(
      `SELECT dr.id, dr.deworming_date, dr.next_due_date, dr.weight_at_treatment,
              dr.dose_administered, dr.notes,
              ap.name AS product_name, ap.parasite_type, ap.active_ingredient,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS administered_by
       FROM deworming_records dr
       JOIN antiparasitic_products ap ON dr.product_id  = ap.id
       JOIN patients p                ON dr.patient_id  = p.id
       JOIN species  sp               ON p.species_id   = sp.id
       JOIN users    u                ON dr.administered_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY dr.deworming_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
}];

const getDewormingAlerts = [async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_deworming_alerts WHERE branch_id = :bid ORDER BY next_due_date`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
}];

const postDeworming = [
  body('patientId').isInt(),
  body('productId').isInt(),
  body('dewormingDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, productId, dewormingDate,
        weightAtTreatment, doseAdministered, route, nextDueDate, notes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO deworming_records
           (branch_id, patient_id, product_id,
            deworming_date, weight_at_treatment, dose_administered,
            route, next_due_date, notes, administered_by)
         VALUES (:bid,:pid,:prod,:date,:wt,:dose,:route,:next,:notes,:uid)`,
        {
          bid: req.user.branchId, pid: patientId, prod: productId,
          date: dewormingDate, wt: weightAtTreatment || null,
          dose: doseAdministered || null, route: route || null,
          next: nextDueDate || null, notes: notes || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  },
];

const getDewormingProducts = [async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM antiparasitic_products WHERE is_active = TRUE ORDER BY parasite_type, name`
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
}];

// GET /vaccinations/deworming?patientId=
router.get('/deworming', ...getDeworming);

// GET /vaccinations/deworming/alerts
router.get('/deworming/alerts', ...getDewormingAlerts);

// POST /vaccinations/deworming
router.post('/deworming', ...postDeworming);

// GET /vaccinations/deworming/products
router.get('/deworming/products', ...getDewormingProducts);

module.exports = router;
module.exports.getDeworming = getDeworming;
module.exports.getDewormingAlerts = getDewormingAlerts;
module.exports.postDeworming = postDeworming;
module.exports.getDewormingProducts = getDewormingProducts;
