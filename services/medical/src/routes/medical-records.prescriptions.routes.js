'use strict';

const { Router } = require('express');
const { body, db, R, validate, logMedicalError } = require('./medical.common');
const { encrypt, decryptRows, PRESCRIPTION_FIELDS } = require('../../../../shared/encryption');

const router = Router();

let prescriptionSchemaPromise;
async function getPrescriptionSchema() {
  if (!prescriptionSchemaPromise) {
    prescriptionSchemaPromise = db.query(
      `SELECT TABLE_NAME, COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN ('prescriptions', 'prescription_items')`
    ).then((rows) => {
      const schema = {};
      for (const row of rows) {
        if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = new Set();
        schema[row.TABLE_NAME].add(row.COLUMN_NAME);
      }
      return schema;
    });
  }
  return prescriptionSchemaPromise;
}

const getPrescriptions = [async (req, res, next) => {
  try {
    const record = await db.queryOne(
      `SELECT mr.id FROM medical_records mr
       JOIN patients p ON p.id = mr.patient_id
       LEFT JOIN appointments a ON a.id = mr.appointment_id
       WHERE mr.id = :mid
         AND p.organization_id = :orgId
         AND (:branchId IS NULL OR a.branch_id = :branchId)`,
      { mid: req.params.id, orgId: req.user.orgId, branchId: req.user.branchId || null }
    );
    if (!record) return R.notFound(res, 'Ficha no encontrada');
    const rows = await db.query(
      `SELECT p.*, pi.medication_name, pi.dose, pi.frequency, pi.duration_days, pi.quantity, pi.instructions
       FROM prescriptions p
       LEFT JOIN prescription_items pi ON pi.prescription_id = p.id
       WHERE p.medical_record_id = :mid`,
      { mid: req.params.id }
    );
    return R.ok(res, decryptRows(rows, PRESCRIPTION_FIELDS));
  } catch (e) {
    logMedicalError('records.GET /medical-records/:id/prescriptions', e, { recordId: req.params.id });
    next(e);
  }
}];

const MAX_REFILLS = parseInt(process.env.MAX_PRESCRIPTION_REFILLS || '12', 10);

function blankToNull(value) {
  return value === '' ? null : value;
}

const postPrescriptions = [
  body('items').isArray({ min: 1, max: 50 }),
  body('notes').customSanitizer(blankToNull).optional({ nullable: true }).isString().isLength({ max: 4000 }),
  body('refills').optional().isInt({ min: 0, max: MAX_REFILLS })
    .withMessage(`Refills must be between 0 and ${MAX_REFILLS}`).toInt(),
  body('items.*.medicationId').customSanitizer(blankToNull).optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  body('items.*.medicationName').isString().bail().trim().notEmpty().isLength({ max: 255 }),
  body('items.*.dose').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('items.*.doseUnit').customSanitizer(blankToNull).optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('items.*.frequency').isString().bail().trim().notEmpty().isLength({ max: 100 }),
  body('items.*.route').customSanitizer(blankToNull).optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  body('items.*.durationDays').customSanitizer(blankToNull).optional({ nullable: true }).isInt({ min: 1, max: 3650 }).toInt(),
  body('items.*.quantity').customSanitizer(blankToNull).optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('items.*.instructions').customSanitizer(blankToNull).optional({ nullable: true }).isString().isLength({ max: 4000 }),
  validate,
  async (req, res, next) => {
    try {
      // SEC: verificar que la ficha existe, pertenece al tenant y no está firmada/cerrada
      // (prescriptionsRouter se monta fuera de sectionsRouter, sin ensureMedicalRecordWritable)
      const record = await db.queryOne(
        `SELECT mr.id, mr.status, mr.signed_at FROM medical_records mr
         JOIN patients p ON p.id = mr.patient_id
         LEFT JOIN appointments a ON a.id = mr.appointment_id
         WHERE mr.id = :mid
           AND p.organization_id = :orgId
           AND (:branchId IS NULL OR a.branch_id = :branchId)`,
        { mid: req.params.id, orgId: req.user.orgId, branchId: req.user.branchId || null }
      );
      if (!record) return R.notFound(res, 'Ficha clinica no encontrada');
      if (record.signed_at || ['signed', 'closed', 'cancelled'].includes(record.status)) {
        return R.conflict(res, 'La ficha clinica no admite modificaciones', 'MEDICAL_RECORD_LOCKED');
      }

      const { items, notes } = req.body;
      const refills = Math.min(Math.max(parseInt(req.body.refills ?? 0, 10) || 0, 0), MAX_REFILLS);
      const schema = await getPrescriptionSchema();
      const prescriptionCols = schema.prescriptions || new Set();
      const itemCols = schema.prescription_items || new Set();

      const prescriptionColumns = ['medical_record_id', 'prescribed_by', 'notes', 'refills_allowed', 'status'];
      const prescriptionValues = [':mid', ':uid', ':notes', ':refills', `'active'`];
      const prescriptionParams = {
        mid: req.params.id,
        uid: req.user.userId,
        notes: encrypt(notes ?? null),
        refills,
        orgId: req.user.orgId,
        branchId: req.user.branchId,
      };
      if (prescriptionCols.has('organization_id')) {
        prescriptionColumns.push('organization_id');
        prescriptionValues.push(':orgId');
      }
      if (prescriptionCols.has('branch_id')) {
        prescriptionColumns.push('branch_id');
        prescriptionValues.push(':branchId');
      }
      if (prescriptionCols.has('refills_used')) {
        prescriptionColumns.push('refills_used');
        prescriptionValues.push('0');
      }
      if (prescriptionCols.has('valid_until')) {
        prescriptionColumns.push('valid_until');
        prescriptionValues.push('NULL');
      }
      if (prescriptionCols.has('created_at')) {
        prescriptionColumns.push('created_at');
        prescriptionValues.push('NOW()');
      }
      if (prescriptionCols.has('updated_at')) {
        prescriptionColumns.push('updated_at');
        prescriptionValues.push('NOW()');
      }

      const [r] = await db.query(
        `INSERT INTO prescriptions
           (${prescriptionColumns.join(', ')})
         VALUES (${prescriptionValues.join(', ')})`,
        prescriptionParams
      );
      const prescId = r.insertId;

      const itemColumns = [
        'prescription_id',
        'medication_id',
        'medication_name',
        'dose',
        'dose_unit',
        'frequency',
        'route',
        'duration_days',
        'quantity',
        'instructions',
      ];
      if (itemCols.has('organization_id')) itemColumns.push('organization_id');
      if (itemCols.has('branch_id')) itemColumns.push('branch_id');
      if (itemCols.has('created_at')) itemColumns.push('created_at');
      if (itemCols.has('updated_at')) itemColumns.push('updated_at');

      const itemRows = items.map((item) => {
        const row = [
          prescId,
          item.medicationId ?? null,
          encrypt(item.medicationName),
          item.dose,
          item.doseUnit ?? null,
          item.frequency,
          item.route ?? null,
          item.durationDays ?? null,
          item.quantity ?? null,
          encrypt(item.instructions ?? null),
        ];
        if (itemCols.has('organization_id')) row.push(req.user.orgId);
        if (itemCols.has('branch_id')) row.push(req.user.branchId);
        if (itemCols.has('created_at')) row.push(new Date());
        if (itemCols.has('updated_at')) row.push(new Date());
        return row;
      });
      const itemPlaceholders = itemRows.map(() => `(${itemColumns.map(() => '?').join(',')})`).join(', ');
      await db.query(
        `INSERT INTO prescription_items
           (${itemColumns.join(', ')})
         VALUES ${itemPlaceholders}`,
        itemRows.flat()
      );
      return R.created(res, { id: prescId });
    } catch (e) {
      logMedicalError('records.POST /medical-records/:id/prescriptions', e, { recordId: req.params.id, body: req.body });
      next(e);
    }
  },
];

router.get('/:id/prescriptions', ...getPrescriptions);
router.post('/:id/prescriptions', ...postPrescriptions);

module.exports = {
  router,
  getPrescriptions,
  postPrescriptions,
};
