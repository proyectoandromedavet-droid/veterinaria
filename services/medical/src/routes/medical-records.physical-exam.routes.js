'use strict';

const { Router, db, R, logMedicalError, encryptFields } = require('./medical-records.sections.common');

const router = Router();

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

    const cols = Object.entries(encryptedTextFields).map(([k, v]) => {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      return { col, v };
    }).filter(({ col }) => col !== 'medical_record_id');

    const colNames = cols.map((c) => c.col).join(', ');
    const vals = cols.map(() => '?').join(', ');
    const values = cols.map((c) => c.v);

    await db.query(
      `INSERT INTO physical_examinations (medical_record_id, ${colNames})
       VALUES (?, ${vals})
       ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c.col} = VALUES(${c.col})`).join(', ')}`,
      [req.params.id, ...values]
    );
    return R.created(res);
  } catch (e) {
    logMedicalError('records.POST /medical-records/:id/physical-exam', e, { recordId: req.params.id, body: req.body });
    next(e);
  }
});

module.exports = { router };
