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

// ── GET /lab/orders ───────────────────────────────────────────────────────────
router.get('/orders', async (req, res, next) => {
  try {
    const { patientId, status, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['lo.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };

    if (patientId) { conds.push('lo.patient_id = :pid');  p.pid    = patientId; }
    if (status)    { conds.push('lo.status = :status');   p.status = status; }
    if (from)      { conds.push('lo.ordered_at >= :from'); p.from  = from; }
    if (to)        { conds.push('lo.ordered_at <= :to');   p.to    = to; }

    const where = `WHERE ${conds.join(' AND ')}`;
    const rows  = await db.query(
      `SELECT lo.id, lo.order_number, lo.status, lo.ordered_at, lo.reported_at,
              lo.priority, lo.clinical_notes,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS ordered_by,
              COUNT(loi.id) AS test_count,
              SUM(CASE WHEN lr.id IS NOT NULL THEN 1 ELSE 0 END) AS results_count
       FROM lab_orders lo
       JOIN patients p       ON lo.patient_id = p.id
       JOIN species  sp      ON p.species_id  = sp.id
       JOIN users    u       ON lo.ordered_by = u.id
       LEFT JOIN lab_order_items loi ON loi.lab_order_id = lo.id
       LEFT JOIN lab_results     lr  ON lr.lab_order_item_id = loi.id
       ${where}
       GROUP BY lo.id
       ORDER BY lo.ordered_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );

    const [{ total }] = await db.query(
      `SELECT COUNT(*) AS total FROM lab_orders lo ${where}`,
      { bid: req.user.branchId, ...(patientId && { pid: patientId }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }
    );
    return R.paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
});

// ── GET /lab/orders/pending ───────────────────────────────────────────────────
router.get('/orders/pending', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_pending_lab_results WHERE branch_id = :bid ORDER BY ordered_at ASC`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── GET /lab/orders/:id ───────────────────────────────────────────────────────
router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await db.queryOne(
      `SELECT lo.*, p.name AS patient_name, p.sex, p.birthdate,
              sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS ordered_by_name
       FROM lab_orders lo
       JOIN patients p ON lo.patient_id = p.id
       JOIN species sp ON p.species_id  = sp.id
       JOIN users   u  ON lo.ordered_by = u.id
       WHERE lo.id = :id AND lo.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!order) return R.notFound(res);

    const items = await db.query(
      `SELECT loi.id, lt.name AS test_name, lt.code, loi.status,
              lr.value_text, lr.value_numeric, lr.unit, lr.is_critical,
              lr.reference_range_used, lr.interpretation, lr.reported_at,
              CONCAT(u2.first_name,' ',u2.last_name) AS reported_by
       FROM lab_order_items loi
       JOIN lab_tests lt ON loi.lab_test_id = lt.id
       LEFT JOIN lab_results lr ON lr.lab_order_item_id = loi.id
       LEFT JOIN users u2       ON lr.reported_by       = u2.id
       WHERE loi.lab_order_id = :oid ORDER BY lt.name`,
      { oid: req.params.id }
    );
    return R.ok(res, { ...order, items });
  } catch (e) { next(e); }
});

// ── POST /lab/orders ──────────────────────────────────────────────────────────
router.post('/orders',
  body('patientId').isInt(),
  body('medicalRecordId').isInt(),
  body('tests').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, medicalRecordId, tests, priority = 'routine', clinicalNotes } = req.body;

      // Auto-generate order number
      const [{ nextNum }] = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number,4) AS UNSIGNED)),0)+1 AS nextNum
         FROM lab_orders WHERE branch_id = :bid`,
        { bid: req.user.branchId }
      );
      const orderNumber = `LAB${String(nextNum).padStart(6, '0')}`;

      const [r] = await db.query(
        `INSERT INTO lab_orders
           (branch_id, patient_id, medical_record_id, order_number, priority, clinical_notes,
            ordered_by, status)
         VALUES (:bid, :pid, :mid, :num, :prio, :notes, :uid, 'pending')`,
        {
          bid: req.user.branchId, pid: patientId, mid: medicalRecordId,
          num: orderNumber, prio: priority, notes: clinicalNotes || null,
          uid: req.user.userId,
        }
      );
      const orderId = r.insertId;

      // Bulk INSERT — one query instead of N (one per test)
      const itemRows    = tests.map(testId => [orderId, testId, 'pending']);
      const itemPlaceholders = itemRows.map(() => '(?,?,?)').join(', ');
      await db.query(
        `INSERT INTO lab_order_items (lab_order_id, lab_test_id, status) VALUES ${itemPlaceholders}`,
        itemRows.flat()
      );

      return R.created(res, { id: orderId, orderNumber });
    } catch (e) { next(e); }
  }
);

// ── POST /lab/orders/:id/results  (lab tech enters results) ───────────────────
router.post('/orders/:id/results',
  body('results').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { results } = req.body;

      // Fetch patient ONCE for the whole order (same patient for all items)
      const patient = await db.queryOne(
        `SELECT p.species_id, p.sex FROM lab_orders lo
         JOIN patients p ON lo.patient_id = p.id WHERE lo.id = :oid`,
        { oid: req.params.id }
      );

      // Fetch all reference ranges in parallel (one query per item, but parallel not serial)
      const refs = await Promise.all(
        results.map(r => db.queryOne(
          `SELECT lrr.min_value, lrr.max_value, lrr.unit,
                  CONCAT(lrr.min_value,' - ',lrr.max_value,' ',lrr.unit) AS range_text
           FROM lab_order_items loi
           JOIN lab_reference_ranges lrr
             ON lrr.lab_test_id = loi.lab_test_id
            AND lrr.species_id  = :speciesId
            AND (lrr.sex = :sex OR lrr.sex = 'any')
           WHERE loi.id = :itemId
           ORDER BY lrr.sex DESC LIMIT 1`,
          { speciesId: patient?.species_id, sex: patient?.sex || 'any', itemId: r.itemId }
        ))
      );

      // Bulk INSERT results + parallel UPDATE items status
      const resultRows = results.map((r, i) => {
        const ref = refs[i];
        const isCritical = ref && r.valueNumeric != null
          ? (parseFloat(r.valueNumeric) < parseFloat(ref.min_value) * 0.7 ||
             parseFloat(r.valueNumeric) > parseFloat(ref.max_value) * 1.3)
          : false;
        return [
          r.itemId,
          r.valueNumeric != null ? r.valueNumeric : null,
          r.valueText    || null,
          r.unit         || ref?.unit || null,
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

      // Bulk UPDATE items to completed
      const itemIds = results.map(r => r.itemId);
      await db.query(
        `UPDATE lab_order_items SET status = 'completed' WHERE id IN (${itemIds.map(() => '?').join(',')})`,
        itemIds
      );

      // Update order status
      await db.query(
        `UPDATE lab_orders lo
         SET status = (
           CASE WHEN (SELECT COUNT(*) FROM lab_order_items WHERE lab_order_id = lo.id AND status != 'completed') = 0
                THEN 'completed' ELSE 'partial' END
         ), reported_at = CASE WHEN status = 'completed' THEN NOW() ELSE reported_at END
         WHERE id = :oid`,
        { oid: req.params.id }
      );

      return R.created(res, { message: 'Results recorded' });
    } catch (e) { next(e); }
  }
);

// ── GET /lab/tests?categoryId=&speciesId= ─────────────────────────────────────
router.get('/tests', async (req, res, next) => {
  try {
    const { categoryId, search } = req.query;
    const conds = ['lt.is_active = TRUE'];
    const p = {};
    if (categoryId) { conds.push('lt.category_id = :catId'); p.catId = categoryId; }
    if (search)     { conds.push('(lt.name LIKE :s OR lt.code LIKE :s)'); p.s = `%${search}%`; }

    const rows = await db.query(
      `SELECT lt.id, lt.name, lt.code, lt.turnaround_hours, lt.price,
              ltc.name AS category
       FROM lab_tests lt
       JOIN lab_test_categories ltc ON lt.category_id = ltc.id
       WHERE ${conds.join(' AND ')}
       ORDER BY ltc.name, lt.name`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── GET /lab/panels ───────────────────────────────────────────────────────────
router.get('/panels', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT ltp.id, ltp.name, ltp.description, ltp.price,
              GROUP_CONCAT(lt.name ORDER BY lt.name SEPARATOR ', ') AS tests_included
       FROM lab_test_panels ltp
       JOIN lab_panel_tests lpt ON lpt.panel_id = ltp.id
       JOIN lab_tests lt        ON lpt.lab_test_id = lt.id
       WHERE ltp.is_active = TRUE
       GROUP BY ltp.id ORDER BY ltp.name`
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
