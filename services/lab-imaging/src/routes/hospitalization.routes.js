'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');
const { resolveMedicalRecordId } = require('../lib/clinicalContext');

const router   = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// GET /hospitalizations (active + recent)
router.get('/', async (req, res, next) => {
  try {
    const { status = 'active', page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['h.branch_id = :bid'];
    const p     = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };

    if (status === 'active') conds.push('h.discharge_date IS NULL');
    else if (status === 'discharged') conds.push('h.discharge_date IS NOT NULL');

    const rows = await db.query(
      `SELECT h.id, h.admission_date, h.discharge_date, h.estimated_discharge_date,
              h.hospitalization_reason, h.hospitalization_status,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS responsible_vet,
              k.kennel_number, w.name AS ward_name,
              DATEDIFF(COALESCE(h.discharge_date, NOW()), h.admission_date) AS days_admitted,
              (SELECT hm.temperature_celsius FROM hospitalization_monitoring hm
               WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_temp,
              (SELECT hm.heart_rate FROM hospitalization_monitoring hm
               WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_hr
       FROM hospitalizations h
       JOIN patients p ON h.patient_id = p.id
       JOIN species  sp ON p.species_id = sp.id
       JOIN users    u  ON h.responsible_vet_id = u.id
       LEFT JOIN kennels k ON h.kennel_id = k.id
       LEFT JOIN wards   w ON k.ward_id = w.id
       WHERE ${conds.join(' AND ')}
       ORDER BY h.admission_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /hospitalizations/board (nursing board view)
router.get('/board', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_active_hospitalizations WHERE branch_id = :bid ORDER BY ward_name, kennel_number`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /hospitalizations/:id
router.get('/:id', async (req, res, next) => {
  try {
    const hosp = await db.queryOne(
      `SELECT h.*, p.name AS patient_name, p.sex, p.birthdate, p.weight_kg, p.chip_number,
              sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              k.kennel_number, w.name AS ward_name
       FROM hospitalizations h
       JOIN patients p ON h.patient_id = p.id
       JOIN species sp  ON p.species_id  = sp.id
       JOIN users   u   ON h.responsible_vet_id = u.id
       LEFT JOIN kennels k ON h.kennel_id = k.id
       LEFT JOIN wards   w ON k.ward_id   = w.id
       WHERE h.id = :id AND h.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!hosp) return R.notFound(res);

    const [monitoring, medications] = await Promise.all([
      db.query(
        `SELECT hm.*, CONCAT(u.first_name,' ',u.last_name) AS recorded_by_name
         FROM hospitalization_monitoring hm
         JOIN users u ON hm.recorded_by = u.id
         WHERE hm.hospitalization_id = :hid ORDER BY hm.recorded_at DESC LIMIT 50`,
        { hid: req.params.id }
      ),
      db.query(
        `SELECT hm2.*, m.name AS medication_name, m.unit,
                CONCAT(u.first_name,' ',u.last_name) AS prescribed_by_name
         FROM hospitalization_medications hm2
         JOIN medications m ON hm2.medication_id = m.id
         JOIN users u ON hm2.prescribed_by = u.id
         WHERE hm2.hospitalization_id = :hid AND hm2.is_active = TRUE`,
        { hid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...hosp, monitoring, medications });
  } catch (e) { next(e); }
});

// POST /hospitalizations (admit patient)
router.post('/',
  body('patientId').isInt(),
  body('responsibleVetId').isInt(),
  body('hospitalizationReason').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const admission = await db.transaction(async (conn) => {
        const resolvedMedicalRecordId = await resolveMedicalRecordId(conn, {
          patientId: req.body.patientId,
          branchId: req.user.branchId,
          medicalRecordId: req.body.medicalRecordId || null,
        });
        const [r] = await conn.query(
          `INSERT INTO hospitalizations
             (branch_id, patient_id, medical_record_id, responsible_vet_id, kennel_id,
              hospitalization_reason, admission_diagnosis, hospitalization_status,
              admission_weight, estimated_discharge_date, special_instructions, created_by)
           VALUES (:bid,:pid,:mrid,:vetid,:kennelid,
                   :reason,:diagnosis,'admitted',
                   :weight,:estimated,:instructions,:uid)`,
          {
            bid: req.user.branchId,
            pid: req.body.patientId,
            mrid: resolvedMedicalRecordId,
            vetid: req.body.responsibleVetId,
            kennelid: req.body.kennelId || null,
            reason: req.body.hospitalizationReason,
            diagnosis: req.body.admissionDiagnosis || null,
            weight: req.body.admissionWeight || null,
            estimated: req.body.estimatedDischargeDate || null,
            instructions: req.body.specialInstructions || null,
            uid: req.user.userId,
          }
        );
        return {
          id: r.insertId,
          branch_id: req.user.branchId,
          patient_id: req.body.patientId,
          medical_record_id: resolvedMedicalRecordId,
          responsible_vet_id: req.body.responsibleVetId,
          kennel_id: req.body.kennelId || null,
          hospitalization_reason: req.body.hospitalizationReason,
          admission_diagnosis: req.body.admissionDiagnosis || null,
          hospitalization_status: 'admitted',
          admission_weight: req.body.admissionWeight || null,
          estimated_discharge_date: req.body.estimatedDischargeDate || null,
          special_instructions: req.body.specialInstructions || null,
          created_by: req.user.userId,
        };
      });
      return R.created(res, admission);
    } catch (e) {
      if (e.message?.includes('SQLSTATE')) {
        return R.conflict(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
      }
      next(e);
    }
  }
);

// POST /hospitalizations/:id/monitoring (nursing check)
router.post('/:id/monitoring',
  body('recordedAt').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        recordedAt, temperature, heartRate, respiratoryRate,
        systolicBp, diastolicBp, spo2, weight,
        consciousness, painScore, hydration,
        appetite, urination, defecation,
        woundStatus, ivSiteStatus, notes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO hospitalization_monitoring
           (hospitalization_id, recorded_at,
            temperature_celsius, heart_rate, respiratory_rate,
            systolic_bp, diastolic_bp, spo2_percent, weight_kg,
            consciousness_level, pain_score, hydration_status,
            appetite, urination, defecation,
            wound_status, iv_site_status, notes, recorded_by)
         VALUES (:hid,:at,:temp,:hr,:rr,:sbp,:dbp,:spo2,:wt,
                 :cons,:pain,:hyd,:app,:uri,:def,:wound,:iv,:notes,:uid)` ,
        {
          hid: req.params.id, at: recordedAt,
          temp: temperature || null, hr: heartRate || null, rr: respiratoryRate || null,
          sbp: systolicBp || null, dbp: diastolicBp || null, spo2: spo2 || null,
          wt: weight || null, cons: consciousness || null, pain: painScore || null,
          hyd: hydration || null, app: appetite || null, uri: urination || null,
          def: defecation || null, wound: woundStatus || null, iv: ivSiteStatus || null,
          notes: notes || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// POST /hospitalizations/:id/medications
router.post('/:id/medications',
  body('medicationId').isInt(),
  body('dose').notEmpty(),
  body('frequency').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { medicationId, dose, doseUnit, frequency, route, startDate, endDate, instructions } = req.body;
      const [r] = await db.query(
        `INSERT INTO hospitalization_medications
           (hospitalization_id, medication_id, dose, dose_unit, frequency, route,
            start_date, end_date, instructions, prescribed_by)
         VALUES (:hid,:med,:dose,:unit,:freq,:route,:start,:end,:instr,:uid)`,
        {
          hid: req.params.id, med: medicationId, dose,
          unit: doseUnit || null, freq: frequency, route: route || null,
          start: startDate || null, end: endDate || null,
          instr: instructions || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// PATCH /hospitalizations/:id/discharge
router.patch('/:id/discharge',
  body('dischargeDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE hospitalizations
         SET discharge_date = :dischargeDate,
             discharge_diagnosis = :diagnosis,
             discharge_instructions = :instructions,
             follow_up_date = :followUpDate,
             hospitalization_status = 'ready_for_discharge',
             updated_at = NOW()
         WHERE id = :id AND branch_id = :bid`,
        {
          id: req.params.id,
          bid: req.user.branchId,
          dischargeDate: req.body.dischargeDate,
          diagnosis: req.body.dischargeDiagnosis || null,
          instructions: req.body.dischargeInstructions || null,
          followUpDate: req.body.followUpDate || null,
        }
      );
      return R.ok(res, { message: 'Patient discharged successfully' });
    } catch (e) {
      if (e.message?.includes('SQLSTATE')) {
        return R.conflict(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
      }
      next(e);
    }
  }
);

// GET /hospitalizations/wards  (kennel availability)
router.get('/wards/availability', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT w.id AS ward_id, w.name AS ward_name, w.ward_type,
              k.id AS kennel_id, k.kennel_number, k.kennel_type, k.size_category,
              CASE WHEN h.id IS NOT NULL THEN 'occupied' ELSE 'available' END AS status,
              CASE WHEN h.id IS NOT NULL THEN p.name ELSE NULL END AS current_patient
       FROM wards w
       JOIN kennels k ON k.ward_id = w.id
       LEFT JOIN hospitalizations h ON h.kennel_id = k.id AND h.discharge_date IS NULL
       LEFT JOIN patients p ON h.patient_id = p.id
       WHERE w.branch_id = :bid AND k.is_active = TRUE
       ORDER BY w.name, k.kennel_number`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
