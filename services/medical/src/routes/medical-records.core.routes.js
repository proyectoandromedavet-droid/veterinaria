'use strict';

const { Router } = require('express');
const { body, db, R, validate, logMedicalError } = require('./medical.common');
const {
  encrypt,
  decrypt,
  decryptFields,
  decryptRows,
  MEDICAL_RECORD_FIELDS,
  ANAMNESIS_FIELDS,
  PHYSICAL_EXAM_FIELDS,
  DIAGNOSIS_FIELDS,
  TREATMENT_FIELDS,
  PRESCRIPTION_FIELDS,
} = require('../../../../shared/encryption');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { patientId, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['a.branch_id = :bid', 'p.organization_id = :orgId'];
    const params = { bid: req.user.branchId, orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) };

    if (patientId) { conditions.push('mr.patient_id = :pid'); params.pid = patientId; }
    if (status) { conditions.push('mr.status = :status'); params.status = status; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db.query(
      `SELECT mr.id, mr.patient_id, mr.status, mr.opened_at, mr.signed_at,
              mr.chief_complaint, mr.weight_kg,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              DATE(a.scheduled_date) AS visit_date
       FROM medical_records mr
       JOIN appointments a ON mr.appointment_id = a.id
       JOIN patients p     ON mr.patient_id = p.id
       JOIN species sp     ON p.species_id  = sp.id
       JOIN users u        ON mr.vet_id     = u.id
       ${where}
       ORDER BY mr.opened_at DESC
       LIMIT :limit OFFSET :offset`,
      params
    );
    return R.ok(res, decryptRows(rows, ['chief_complaint']));
  } catch (e) {
    logMedicalError('records.GET /medical-records', e, { orgId: req.user?.orgId, branchId: req.user?.branchId, query: req.query });
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const mr = await db.queryOne(
      `SELECT mr.*,
              mr.chief_complaint AS reason_for_visit,
              mr.opened_at AS visit_date,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       JOIN species sp ON p.species_id  = sp.id
       JOIN users   u  ON mr.vet_id     = u.id
       WHERE mr.id = :id AND p.organization_id = :orgId`,
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!mr) return R.notFound(res);

    const [anamnesis, physExam, diagnoses, treatments, prescriptions] = await Promise.all([
      db.queryOne(`SELECT * FROM anamnesis WHERE medical_record_id = :mid`, { mid: req.params.id }),
      db.queryOne(`SELECT * FROM physical_examinations WHERE medical_record_id = :mid`, { mid: req.params.id }),
      db.query(`SELECT * FROM diagnoses WHERE medical_record_id = :mid ORDER BY is_primary DESC, created_at`, { mid: req.params.id }),
      db.query(
        `SELECT t.*, m.name AS medication_name, m.unit, m.concentration
         FROM treatments t
         LEFT JOIN medications m ON t.medication_id = m.id
         WHERE t.medical_record_id = :mid ORDER BY t.created_at`,
        { mid: req.params.id }
      ),
      db.query(
        `SELECT p.*, pi.medication_name, pi.dose, pi.frequency, pi.duration_days
         FROM prescriptions p
         LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
         WHERE p.medical_record_id = :mid`,
        { mid: req.params.id }
      ),
    ]);

    return R.ok(res, {
      ...mr,
      chief_complaint: decrypt(mr.chief_complaint),
      reason_for_visit: decrypt(mr.reason_for_visit),
      notes: decrypt(mr.notes),
      anamnesis: decryptFields(anamnesis, ANAMNESIS_FIELDS),
      physicalExam: decryptFields(physExam, PHYSICAL_EXAM_FIELDS),
      diagnoses: decryptRows(diagnoses, DIAGNOSIS_FIELDS),
      treatments: decryptRows(treatments, TREATMENT_FIELDS),
      prescriptions: decryptRows(prescriptions, PRESCRIPTION_FIELDS),
    });
  } catch (e) {
    logMedicalError('records.GET /medical-records/:id', e, { recordId: req.params.id, orgId: req.user?.orgId });
    next(e);
  }
});

router.post('/',
  body('chiefComplaint').notEmpty().withMessage('El motivo de consulta es requerido'),
  validate,
  async (req, res, next) => {
    try {
      let { appointmentId, patientId, chiefComplaint, weightKg, bodyConditionScore, temperatureC } = req.body;

      if (!appointmentId && !patientId) {
        return R.badRequest(res, 'Se requiere appointmentId o patientId');
      }

      if (!appointmentId) {
        let branchId = req.user.branchId || null;
        if (!branchId && req.user.userId) {
          const u = await db.queryOne('SELECT branch_id FROM users WHERE id = :uid', { uid: req.user.userId });
          branchId = u?.branch_id || null;
        }

        const [apptResult] = await db.query(
          `INSERT INTO appointments
             (branch_id, patient_id, vet_id, scheduled_date, duration_minutes,
              status, reason, notes, is_emergency)
           VALUES (:bid, :pid, :uid, NOW(), 30,
                   'in_progress', :reason, NULL, 0)`,
          {
            bid: branchId,
            pid: patientId,
            uid: req.user.userId,
            reason: encrypt(chiefComplaint),
          }
        );
        appointmentId = apptResult.insertId;
      } else {
        const appt = await db.queryOne(
          `SELECT a.patient_id
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE a.id = :id AND a.branch_id = :bid AND p.organization_id = :orgId`,
          { id: appointmentId, bid: req.user.branchId, orgId: req.user.orgId }
        );
        if (!appt) return R.notFound(res, 'Cita no encontrada');
        patientId = appt.patient_id;
      }

      const { notes } = req.body;
      const [r] = await db.query(
        `INSERT INTO medical_records
           (appointment_id, patient_id, vet_id, status,
            chief_complaint, weight_kg, body_condition_score,
            temperature_celsius, notes, opened_at)
         VALUES (:apptId, :pid, :uid, 'open',
                 :cc, :wt, :bcs, :temp, :notes, NOW())`,
        {
          apptId: appointmentId,
          pid: patientId,
          uid: req.user.userId,
          cc: encrypt(chiefComplaint),
          wt: weightKg || null,
          bcs: bodyConditionScore || null,
          temp: temperatureC || null,
          notes: encrypt(notes || null),
        }
      );

      return R.created(res, { id: r.insertId, appointmentId, patientId });
    } catch (e) {
      logMedicalError('records.POST /medical-records', e, { orgId: req.user?.orgId, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
