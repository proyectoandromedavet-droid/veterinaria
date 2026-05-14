'use strict';

const { Router, body, db, R, validate, logMedicalError, encrypt } = require('./medical-records.sections.common');

const router = Router();

router.post('/:id/diagnoses',
  body('diagnosisName').notEmpty(),
  body('diagnosisType').isIn(['definitive', 'presumptive', 'differential', 'rule_out']),
  validate,
  async (req, res, next) => {
    try {
      const { diagnosisName, diagnosisType, diagnosisCode, isPrimary, notes, prognosis } = req.body;
      const [r] = await db.query(
        `INSERT INTO diagnoses
           (medical_record_id, diagnosis_name, diagnosis_type, diagnosis_code, is_primary, notes, prognosis)
         VALUES (:mid, :name, :type, :code, :primary, :notes, :prog)`,
        {
          mid: req.params.id,
          name: encrypt(diagnosisName),
          type: diagnosisType,
          code: encrypt(diagnosisCode || null),
          primary: isPrimary ? 1 : 0,
          notes: encrypt(notes || null),
          prog: prognosis || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) {
      logMedicalError('records.POST /medical-records/:id/diagnoses', e, { recordId: req.params.id, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
