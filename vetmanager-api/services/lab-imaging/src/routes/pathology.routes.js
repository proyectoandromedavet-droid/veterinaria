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

// GET /pathology/orders
router.get('/orders', async (req, res, next) => {
  try {
    const { patientId, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['po.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (patientId) { conds.push('po.patient_id = :pid'); p.pid = patientId; }
    if (status)    { conds.push('po.status = :status');  p.status = status; }

    const rows = await db.query(
      `SELECT po.id, po.order_number, po.status, po.ordered_at, po.clinical_history,
              pt.name AS pathology_type,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS ordered_by,
              COUNT(ps.id) AS sample_count
       FROM pathology_orders po
       JOIN pathology_types pt ON po.pathology_type_id = pt.id
       JOIN patients p         ON po.patient_id        = p.id
       JOIN species  sp        ON p.species_id          = sp.id
       JOIN users    u         ON po.ordered_by         = u.id
       LEFT JOIN pathology_samples ps ON ps.pathology_order_id = po.id
       WHERE ${conds.join(' AND ')}
       GROUP BY po.id ORDER BY po.ordered_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /pathology/orders/:id
router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await db.queryOne(
      `SELECT po.*, pt.name AS type_name,
              p.name AS patient_name, sp.common_name AS species
       FROM pathology_orders po
       JOIN pathology_types pt ON po.pathology_type_id = pt.id
       JOIN patients p ON po.patient_id = p.id
       JOIN species sp ON p.species_id  = sp.id
       WHERE po.id = :id AND po.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!order) return R.notFound(res);

    const [samples, result] = await Promise.all([
      db.query(
        `SELECT * FROM pathology_samples WHERE pathology_order_id = :oid ORDER BY sample_number`,
        { oid: req.params.id }
      ),
      db.queryOne(
        `SELECT pr.*, CONCAT(u.first_name,' ',u.last_name) AS pathologist_name
         FROM pathology_results pr
         JOIN users u ON pr.pathologist_id = u.id
         WHERE pr.pathology_order_id = :oid`,
        { oid: req.params.id }
      ),
    ]);
    return R.ok(res, { ...order, samples, result });
  } catch (e) { next(e); }
});

// POST /pathology/orders
router.post('/orders',
  body('patientId').isInt(),
  body('pathologyTypeId').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, medicalRecordId, pathologyTypeId, clinicalHistory, samples = [] } = req.body;
      const [{ nextNum }] = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number,4) AS UNSIGNED)),0)+1 AS nextNum
         FROM pathology_orders WHERE branch_id = :bid`,
        { bid: req.user.branchId }
      );
      const orderNumber = `PAT${String(nextNum).padStart(6, '0')}`;

      const [r] = await db.query(
        `INSERT INTO pathology_orders
           (branch_id, patient_id, medical_record_id, pathology_type_id,
            order_number, clinical_history, ordered_by, status)
         VALUES (:bid,:pid,:mid,:type,:num,:hist,:uid,'pending')`,
        {
          bid: req.user.branchId, pid: patientId, mid: medicalRecordId || null,
          type: pathologyTypeId, num: orderNumber,
          hist: clinicalHistory || null, uid: req.user.userId,
        }
      );
      const orderId = r.insertId;

      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        await db.query(
          `INSERT INTO pathology_samples
             (pathology_order_id, sample_number, sample_type, anatomical_location,
              collection_date, fixation_method, macroscopic_description)
           VALUES (?,?,?,?,?,?,?)`,
          [orderId, i + 1, s.sampleType, s.anatomicalLocation || null,
           s.collectionDate || null, s.fixationMethod || null, s.macroscopicDescription || null]
        );
      }
      return R.created(res, { id: orderId, orderNumber });
    } catch (e) { next(e); }
  }
);

// POST /pathology/orders/:id/result
router.post('/orders/:id/result',
  body('microscopicDescription').notEmpty(),
  body('diagnosis').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const {
        microscopicDescription, diagnosis, behavior,
        differentialDiagnosis, prognosticNotes,
        tnmT, tnmN, tnmM, tnmStage,
        ihcResults, specialStains, recommendations,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO pathology_results
           (pathology_order_id, pathologist_id,
            microscopic_description, diagnosis, behavior,
            differential_diagnosis, prognostic_notes,
            tnm_t, tnm_n, tnm_m, tnm_stage,
            ihc_results, special_stains, recommendations, reported_at)
         VALUES (:oid,:uid,:micro,:diag,:beh,:diff,:prog,
                 :tt,:tn,:tm,:ts,:ihc,:stain,:rec,NOW())`,
        {
          oid: req.params.id, uid: req.user.userId,
          micro: microscopicDescription, diag: diagnosis,
          beh: behavior || null, diff: differentialDiagnosis || null,
          prog: prognosticNotes || null,
          tt: tnmT || null, tn: tnmN || null, tm: tnmM || null, ts: tnmStage || null,
          ihc: ihcResults || null, stain: specialStains || null, rec: recommendations || null,
        }
      );
      await db.query(
        `UPDATE pathology_orders SET status='reported', reported_at=NOW() WHERE id=?`,
        [req.params.id]
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// GET /pathology/types
router.get('/types', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM pathology_types WHERE is_active=TRUE ORDER BY name`);
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
