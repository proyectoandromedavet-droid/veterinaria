'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');
const {
  encrypt,
  decrypt,
  encryptFields,
  decryptFields,
  decryptRows,
  ANAMNESIS_FIELDS,
  PHYSICAL_EXAM_FIELDS,
  MEDICAL_RECORD_FIELDS,
  DIAGNOSIS_FIELDS,
  TREATMENT_FIELDS,
  PRESCRIPTION_FIELDS,
} = require('../../../../shared/encryption');

const router = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// GET /medical-records?patientId=&status=
router.get('/', async (req, res, next) => {
  try {
    const { patientId, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['a.branch_id = :bid', 'p.organization_id = :orgId'];
    const params = { bid: req.user.branchId, orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) };

    if (patientId) { conditions.push('mr.patient_id = :pid'); params.pid = patientId; }
    if (status)    { conditions.push('mr.status = :status');   params.status = status; }

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
       JOIN species sp      ON p.species_id  = sp.id
       JOIN users u         ON mr.vet_id     = u.id
       ${where}
      ORDER BY mr.opened_at DESC
       LIMIT :limit OFFSET :offset`,
      params
    );
    return R.ok(res, decryptRows(rows, ['chief_complaint']));
  } catch (e) { next(e); }
});

// GET /medical-records/:id  (full record)
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
  } catch (e) { next(e); }
});

// POST /medical-records  (open a new HC)
// Acepta appointmentId existente O patientId para crear cita walk-in automáticamente
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
        // Admin users may have no branchId — use the creating user's branch
        let branchId = req.user.branchId || null;
        if (!branchId && req.user.userId) {
          const u = await db.queryOne('SELECT branch_id FROM users WHERE id = :uid', { uid: req.user.userId });
          branchId = u?.branch_id || null;
        }

        // Crear cita walk-in
        const [apptResult] = await db.query(
          `INSERT INTO appointments
             (branch_id, patient_id, vet_id, scheduled_date, duration_minutes,
              status, reason, notes, is_emergency)
           VALUES (:bid, :pid, :uid, NOW(), 30,
                   'in_progress', :reason, NULL, 0)`,
          {
            bid:    branchId,
            pid:    patientId,
            uid:    req.user.userId,
            reason: encrypt(chiefComplaint),
          }
        );
        appointmentId = apptResult.insertId;
      } else {
        // Obtener patient_id desde la cita
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

      // Insertar historia clínica directamente (sin SP)
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
          pid:    patientId,
          uid:    req.user.userId,
          cc:     encrypt(chiefComplaint),
          wt:     weightKg         || null,
          bcs:    bodyConditionScore || null,
          temp:   temperatureC     || null,
          notes:  encrypt(notes || null),
        }
      );

      return R.created(res, { id: r.insertId, appointmentId, patientId });
    } catch (e) { next(e); }
  }
);

// POST /medical-records/:id/anamnesis
router.post('/:id/anamnesis',
  body('currentIllnessHistory').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const {
        currentIllnessHistory, illnessDuration, illnessOnset,
        appetite, thirst, urination, defecation, vomiting, coughing,
        sneezing, pruritus, locomotionIssues, otherSigns,
        vaccinationHistory, dewormingHistory, previousIllnesses,
        previousSurgeries, currentMedications, feedingType, feedingBrand,
        environment, contactWithAnimals, recentTravel, ownerObservations,
      } = req.body;

      const encryptedAnamnesis = encryptFields({
        current_illness_history: currentIllnessHistory,
        illness_duration: illnessDuration || null,
        illness_onset: illnessOnset || null,
        other_signs: otherSigns || null,
        vaccination_history: vaccinationHistory || null,
        deworming_history: dewormingHistory || null,
        previous_illnesses: previousIllnesses || null,
        previous_surgeries: previousSurgeries || null,
        current_medications: currentMedications || null,
        feeding_brand: feedingBrand || null,
        recent_travel: recentTravel || null,
        owner_observations: ownerObservations || null,
      }, ANAMNESIS_FIELDS);

      await db.query(
        `INSERT INTO anamnesis
           (medical_record_id, current_illness_history, illness_duration, illness_onset,
            appetite, thirst, urination, defecation, vomiting, coughing,
            sneezing, pruritus, locomotion_issues, other_signs,
            vaccination_history, deworming_history, previous_illnesses,
            previous_surgeries, current_medications, feeding_type, feeding_brand,
            environment, contact_with_animals, recent_travel, owner_observations)
         VALUES (:mid, :cih, :dur, :onset, :app, :thr, :uri, :def, :vom, :cou,
                 :sne, :pru, :loc, :oth, :vac, :dew, :prev, :surg, :meds,
                 :feed, :brand, :env, :contact, :travel, :obs)
         ON DUPLICATE KEY UPDATE
           current_illness_history = VALUES(current_illness_history),
           illness_duration = VALUES(illness_duration),
           illness_onset = VALUES(illness_onset),
           appetite = VALUES(appetite),
           thirst = VALUES(thirst),
           urination = VALUES(urination),
           defecation = VALUES(defecation),
           vomiting = VALUES(vomiting),
           coughing = VALUES(coughing),
           sneezing = VALUES(sneezing),
           pruritus = VALUES(pruritus),
           locomotion_issues = VALUES(locomotion_issues),
           other_signs = VALUES(other_signs),
           vaccination_history = VALUES(vaccination_history),
           deworming_history = VALUES(deworming_history),
           previous_illnesses = VALUES(previous_illnesses),
           previous_surgeries = VALUES(previous_surgeries),
           current_medications = VALUES(current_medications),
           feeding_type = VALUES(feeding_type),
           feeding_brand = VALUES(feeding_brand),
           environment = VALUES(environment),
           contact_with_animals = VALUES(contact_with_animals),
           recent_travel = VALUES(recent_travel),
           owner_observations = VALUES(owner_observations)`,
        {
          mid: req.params.id,
          cih: encryptedAnamnesis.current_illness_history,
          dur: encryptedAnamnesis.illness_duration,
          onset: encryptedAnamnesis.illness_onset,
          app: appetite || null, thr: thirst || null,
          uri: urination || null, def: defecation || null,
          vom: vomiting || 0, cou: coughing || 0,
          sne: sneezing || 0, pru: pruritus || 0,
          loc: locomotionIssues || 0,
          oth: encryptedAnamnesis.other_signs,
          vac: encryptedAnamnesis.vaccination_history,
          dew: encryptedAnamnesis.deworming_history,
          prev: encryptedAnamnesis.previous_illnesses,
          surg: encryptedAnamnesis.previous_surgeries,
          meds: encryptedAnamnesis.current_medications,
          feed: feedingType || null,
          brand: encryptedAnamnesis.feeding_brand,
          env: environment || null,
          contact: contactWithAnimals || 0,
          travel: encryptedAnamnesis.recent_travel,
          obs: encryptedAnamnesis.owner_observations,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// POST /medical-records/:id/physical-exam
router.post('/:id/physical-exam', async (req, res, next) => {
  try {
    const fields = req.body;
    const encryptedTextFields = encryptFields(fields, [
      'mucousMembranes',
      'hydrationStatus',
      'lymphNodes',
      'skinCoat',
      'eyes',
      'ears',
      'noseThroat',
      'oralCavity',
      'cardiovascular',
      'respiratory',
      'abdomen',
      'musculoskeletal',
      'neurological',
      'urogenital',
      'painAssessment',
      'generalObservations',
    ]);
    // Map camelCase to snake_case for DB columns
    const cols = Object.entries(encryptedTextFields).map(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      return { col, v };
    }).filter(({ col }) => col !== 'medical_record_id');

    const colNames = cols.map(c => c.col).join(', ');
    const vals     = cols.map((_, i) => `?`).join(', ');
    const values   = cols.map(c => c.v);

    await db.query(
      `INSERT INTO physical_examinations (medical_record_id, ${colNames})
       VALUES (?, ${vals})
       ON DUPLICATE KEY UPDATE ${cols.map(c => `${c.col} = VALUES(${c.col})`).join(', ')}`,
      [req.params.id, ...values]
    );
    return R.created(res);
  } catch (e) { next(e); }
});

// POST /medical-records/:id/diagnoses
router.post('/:id/diagnoses',
  body('diagnosisName').notEmpty(),
  body('diagnosisType').isIn(['definitive','presumptive','differential','rule_out']),
  validate,
  async (req, res, next) => {
    try {
      const { diagnosisName, diagnosisType, diagnosisCode, isPrimary, notes, prognosis } = req.body;
      const [r] = await db.query(
        `INSERT INTO diagnoses
           (medical_record_id, diagnosis_name, diagnosis_type, diagnosis_code, is_primary, notes, prognosis)
         VALUES (:mid, :name, :type, :code, :primary, :notes, :prog)`,
        {
          mid: req.params.id, name: encrypt(diagnosisName), type: diagnosisType,
          code: encrypt(diagnosisCode || null), primary: isPrimary ? 1 : 0,
          notes: encrypt(notes || null), prog: prognosis || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// POST /medical-records/:id/treatments
router.post('/:id/treatments', async (req, res, next) => {
  try {
    const {
      medicationId, treatmentType = 'medication',
      description, dose, doseUnit, frequency,
      route, durationDays, startDate, notes,
    } = req.body;

    const [r] = await db.query(
      `INSERT INTO treatments
         (medical_record_id, medication_id, treatment_type,
          description, dose, dose_unit, frequency, route, duration_days, start_date, notes,
          prescribed_by)
       VALUES (:mid, :medId, :type, :desc, :dose, :unit, :freq, :route, :dur, :start, :notes, :user)`,
      {
        mid: req.params.id, medId: medicationId || null, type: treatmentType,
        desc: encrypt(description || null), dose: dose || null, unit: doseUnit || null,
        freq: frequency || null, route: route || null, dur: durationDays || null,
        start: startDate || null, notes: encrypt(notes || null), user: req.user.userId,
      }
    );
    return R.created(res, { id: r.insertId });
  } catch (e) { next(e); }
});

// POST /medical-records/:id/sign
router.post('/:id/sign', async (req, res, next) => {
  try {
    const [result] = await db.query(
      `UPDATE medical_records mr
       JOIN patients p ON mr.patient_id = p.id
       SET mr.status = 'signed',
           mr.signed_at = NOW(),
           mr.signed_by = :uid,
           mr.updated_at = NOW()
       WHERE mr.id = :id
         AND p.organization_id = :orgId`,
      {
        id: req.params.id,
        uid: req.user.userId,
        orgId: req.user.orgId,
      }
    );

    if (!result.affectedRows) {
      return R.notFound(res, 'Medical record not found');
    }
    return R.ok(res, { message: 'Medical record signed successfully' });
  } catch (e) {
    if (e.message?.includes('SQLSTATE')) {
      return R.badRequest(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
    }
    next(e);
  }
});

const getPrescriptions = [async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT p.*, pi.medication_name, pi.dose, pi.frequency, pi.duration_days, pi.quantity, pi.instructions
       FROM prescriptions p
       LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
       WHERE p.medical_record_id = :mid`,
      { mid: req.params.id }
    );
    return R.ok(res, decryptRows(rows, PRESCRIPTION_FIELDS));
  } catch (e) { next(e); }
}];

const postPrescriptions = [
  body('items').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { items, notes, refills = 0 } = req.body;

      const [r] = await db.query(
        `INSERT INTO prescriptions
           (medical_record_id, prescribed_by, notes, refills_allowed, status)
         VALUES (:mid, :uid, :notes, :refills, 'active')`,
        { mid: req.params.id, uid: req.user.userId, notes: encrypt(notes || null), refills }
      );
      const prescId = r.insertId;

      // Bulk INSERT — one query instead of N (one per item)
      const itemRows = items.map(item => [
        prescId,
        item.medicationId  || null,
        encrypt(item.medicationName),
        item.dose,
        item.doseUnit      || null,
        item.frequency,
        item.route         || null,
        item.durationDays  || null,
        item.quantity      || null,
        encrypt(item.instructions || null),
      ]);
      const itemPlaceholders = itemRows.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(', ');
      await db.query(
        `INSERT INTO prescription_items
           (prescription_id, medication_id, medication_name, dose, dose_unit,
            frequency, route, duration_days, quantity, instructions)
         VALUES ${itemPlaceholders}`,
        itemRows.flat()
      );
      return R.created(res, { id: prescId });
    } catch (e) { next(e); }
  },
];

// GET /medical-records/:id/prescriptions
router.get('/:id/prescriptions', ...getPrescriptions);

// POST /medical-records/:id/prescriptions
router.post('/:id/prescriptions', ...postPrescriptions);

module.exports = router;
module.exports.getPrescriptions = getPrescriptions;
module.exports.postPrescriptions = postPrescriptions;
