'use strict';

const { Router, db, R, logMedicalError, encrypt } = require('./medical-records.sections.common');

const router = Router();

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
        mid: req.params.id,
        medId: medicationId || null,
        type: treatmentType,
        desc: encrypt(description || null),
        dose: dose || null,
        unit: doseUnit || null,
        freq: frequency || null,
        route: route || null,
        dur: durationDays || null,
        start: startDate || null,
        notes: encrypt(notes || null),
        user: req.user.userId,
      }
    );
    return R.created(res, { id: r.insertId });
  } catch (e) {
    logMedicalError('records.POST /medical-records/:id/treatments', e, { recordId: req.params.id, body: req.body });
    next(e);
  }
});

module.exports = { router };
