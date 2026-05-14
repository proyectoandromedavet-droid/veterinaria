'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, logLabError, resolveMedicalRecordId } = require('./lab.orders.common');
const { validate } = require('./lab.common');

const router = Router();

router.post('/orders',
  body('patientId').isInt(),
  body('tests').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, medicalRecordId, tests, priority = 'routine', clinicalNotes } = req.body;
      const resolvedMedicalRecordId = await resolveMedicalRecordId(db, {
        patientId,
        branchId: req.user.branchId,
        medicalRecordId: medicalRecordId || null,
      });
      const normalizedTests = tests
        .map((entry) => {
          if (typeof entry === 'number') return entry;
          if (entry && typeof entry === 'object') return entry.testId || entry.id || null;
          return null;
        })
        .filter(Boolean);

      if (!normalizedTests.length) return R.badRequest(res, 'At least one valid lab test is required');

      const [{ nextNum }] = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number,4) AS UNSIGNED)),0)+1 AS nextNum
           FROM lab_orders
          WHERE branch_id = :bid`,
        { bid: req.user.branchId }
      );
      const orderNumber = `LAB${String(nextNum).padStart(6, '0')}`;

      const [r] = await db.query(
        `INSERT INTO lab_orders
           (branch_id, patient_id, medical_record_id, order_number, priority, clinical_notes,
            ordered_by, status)
         VALUES (:bid, :pid, :mid, :num, :prio, :notes, :uid, 'pending')`,
        {
          bid: req.user.branchId,
          pid: patientId,
          mid: resolvedMedicalRecordId,
          num: orderNumber,
          prio: priority,
          notes: clinicalNotes || null,
          uid: req.user.userId,
        }
      );
      const orderId = r.insertId;

      const itemRows = normalizedTests.map((testId) => [orderId, testId, 'pending']);
      const itemPlaceholders = itemRows.map(() => '(?,?,?)').join(', ');
      await db.query(
        `INSERT INTO lab_order_items (lab_order_id, lab_test_id, status) VALUES ${itemPlaceholders}`,
        itemRows.flat()
      );

      return R.created(res, { id: orderId, orderNumber, medicalRecordId: resolvedMedicalRecordId });
    } catch (e) {
      logLabError('POST /lab/orders', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.post('/orders/:id/results',
  body('results').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { results } = req.body;

      const patient = await db.queryOne(
        `SELECT p.species_id, p.sex
           FROM lab_orders lo
           JOIN patients p ON lo.patient_id = p.id
          WHERE lo.id = :oid`,
        { oid: req.params.id }
      );

      const refs = await Promise.all(
        results.map((r) => db.queryOne(
          `SELECT lrr.min_value, lrr.max_value, lrr.unit,
                  CONCAT(lrr.min_value,' - ',lrr.max_value,' ',lrr.unit) AS range_text
             FROM lab_order_items loi
             JOIN lab_reference_ranges lrr
               ON lrr.lab_test_id = loi.lab_test_id
              AND lrr.species_id = :speciesId
              AND (lrr.sex = :sex OR lrr.sex = 'any')
            WHERE loi.id = :itemId
            ORDER BY lrr.sex DESC
            LIMIT 1`,
          { speciesId: patient?.species_id, sex: patient?.sex || 'any', itemId: r.itemId }
        ))
      );

      const resultRows = results.map((r, i) => {
        const ref = refs[i];
        const isCritical = ref && r.valueNumeric != null
          ? (parseFloat(r.valueNumeric) < parseFloat(ref.min_value) * 0.7
            || parseFloat(r.valueNumeric) > parseFloat(ref.max_value) * 1.3)
          : false;

        return [
          r.itemId,
          r.valueNumeric != null ? r.valueNumeric : null,
          r.valueText || null,
          r.unit || ref?.unit || null,
          ref?.range_text || null,
          isCritical ? 1 : 0,
          r.interpretation || null,
          req.user.userId,
        ];
      });

      const resultPlaceholders = resultRows.map(() => '(?,?,?,?,?,?,?,?,NOW())').join(', ');
      await db.query(
        `INSERT INTO lab_results
           (lab_order_item_id, value_numeric, value_text, unit,
            reference_range_used, is_critical, interpretation, reported_by, reported_at)
         VALUES ${resultPlaceholders}`,
        resultRows.flat()
      );

      const itemIds = results.map((r) => r.itemId);
      await db.query(
        `UPDATE lab_order_items SET status = 'completed' WHERE id IN (${itemIds.map(() => '?').join(',')})`,
        itemIds
      );

      await db.query(
        `UPDATE lab_orders lo
            SET status = (
                  CASE WHEN (SELECT COUNT(*) FROM lab_order_items WHERE lab_order_id = lo.id AND status != 'completed') = 0
                       THEN 'completed' ELSE 'partial' END
                ),
                reported_at = CASE WHEN status = 'completed' THEN NOW() ELSE reported_at END
          WHERE id = :oid`,
        { oid: req.params.id }
      );

      return R.created(res, { message: 'Results recorded' });
    } catch (e) {
      logLabError('POST /lab/orders/:id/results', e, { orderId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
