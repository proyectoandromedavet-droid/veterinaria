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

// GET /imaging/orders
router.get('/orders', async (req, res, next) => {
  try {
    const { patientId, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['io.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };

    if (patientId) { conds.push('io.patient_id = :pid'); p.pid = patientId; }
    if (status)    { conds.push('io.status = :status');  p.status = status; }

    const where = `WHERE ${conds.join(' AND ')}`;
    const rows  = await db.query(
      `SELECT io.id, io.order_number, io.status, io.ordered_at, io.priority,
              io.clinical_indication, io.body_region,
              p.name AS patient_name, sp.common_name AS species,
              it.name AS imaging_type,
              CONCAT(u.first_name,' ',u.last_name) AS ordered_by,
              COUNT(img.id) AS images_count,
              ir.id AS report_id
       FROM imaging_orders io
       JOIN patients p       ON io.patient_id      = p.id
       JOIN species  sp      ON p.species_id        = sp.id
       JOIN users    u       ON io.ordered_by       = u.id
       LEFT JOIN imaging_types it      ON io.imaging_type_id = it.id
       LEFT JOIN imaging_studies ims   ON ims.imaging_order_id = io.id
       LEFT JOIN imaging_images  img   ON img.imaging_study_id = ims.id
       LEFT JOIN imaging_reports ir    ON ir.imaging_order_id  = io.id
       ${where}
       GROUP BY io.id
       ORDER BY io.ordered_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /imaging/orders/pending-report
router.get('/orders/pending-report', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_pending_imaging_reports WHERE branch_id = :bid ORDER BY ordered_at`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /imaging/orders/:id
router.get('/orders/:id', async (req, res, next) => {
  try {
    const order = await db.queryOne(
      `SELECT io.*, it.name AS imaging_type_name,
              p.name AS patient_name, p.sex, p.birthdate, p.weight_kg,
              sp.common_name AS species
       FROM imaging_orders io
       LEFT JOIN imaging_types it ON io.imaging_type_id = it.id
       JOIN patients p ON io.patient_id = p.id
       JOIN species sp ON p.species_id  = sp.id
       WHERE io.id = :id AND io.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!order) return R.notFound(res);

    const [studies, report] = await Promise.all([
      db.query(
        `SELECT ims.id, ims.study_datetime, ims.dicom_study_uid, ims.pacs_url,
                ims.technique, ims.contrast_used, ims.contrast_agent,
                GROUP_CONCAT(img.image_url SEPARATOR '|') AS image_urls,
                COUNT(img.id) AS image_count
         FROM imaging_studies ims
         LEFT JOIN imaging_images img ON img.imaging_study_id = ims.id
         WHERE ims.imaging_order_id = :oid
         GROUP BY ims.id ORDER BY ims.study_datetime`,
        { oid: req.params.id }
      ),
      db.queryOne(
        `SELECT ir.*, CONCAT(u.first_name,' ',u.last_name) AS radiologist_name
         FROM imaging_reports ir
         JOIN users u ON ir.reported_by = u.id
         WHERE ir.imaging_order_id = :oid`,
        { oid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...order, studies, report });
  } catch (e) { next(e); }
});

// POST /imaging/orders
router.post('/orders',
  body('patientId').isInt(),
  body('imagingTypeId').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, medicalRecordId, imagingTypeId,
        bodyRegion, clinicalIndication, priority = 'routine',
        patientPreparation, sedationRequired,
      } = req.body;
      const resolvedMedicalRecordId = await resolveMedicalRecordId(db, {
        patientId,
        branchId: req.user.branchId,
        medicalRecordId: medicalRecordId || null,
      });

      const [{ nextNum }] = await db.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number,4) AS UNSIGNED)),0)+1 AS nextNum
         FROM imaging_orders WHERE branch_id = :bid`,
        { bid: req.user.branchId }
      );
      const orderNumber = `IMG${String(nextNum).padStart(6, '0')}`;

      const [r] = await db.query(
        `INSERT INTO imaging_orders
           (branch_id, patient_id, medical_record_id, imaging_type_id,
            order_number, body_region, clinical_indication, priority,
            patient_preparation, sedation_required, ordered_by, status)
         VALUES (:bid,:pid,:mid,:type,:num,:region,:indication,:prio,:prep,:sed,:uid,'pending')`,
        {
          bid: req.user.branchId, pid: patientId, mid: resolvedMedicalRecordId,
          type: imagingTypeId, num: orderNumber, region: bodyRegion || null,
          indication: clinicalIndication || null, prio: priority,
          prep: patientPreparation || null, sed: sedationRequired ? 1 : 0,
          uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId, orderNumber });
    } catch (e) { next(e); }
  }
);

// POST /imaging/orders/:id/studies  (add study + image URLs from PACS)
router.post('/orders/:id/studies',
  body('studyDatetime').isISO8601(),
  body('imageUrls').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { studyDatetime, dicomStudyUid, pacsUrl, technique, contrastUsed, contrastAgent, imageUrls } = req.body;

      const [r] = await db.query(
        `INSERT INTO imaging_studies
           (imaging_order_id, study_datetime, dicom_study_uid, pacs_url,
            technique, contrast_used, contrast_agent, performed_by)
         VALUES (:oid,:dt,:dicom,:pacs,:tech,:contrast,:agent,:uid)`,
        {
          oid: req.params.id, dt: studyDatetime,
          dicom: dicomStudyUid || null, pacs: pacsUrl || null,
          tech: technique || null, contrast: contrastUsed ? 1 : 0,
          agent: contrastAgent || null, uid: req.user.userId,
        }
      );
      const studyId = r.insertId;

      for (const url of imageUrls) {
        await db.query(
          `INSERT INTO imaging_images (imaging_study_id, image_url) VALUES (?,?)`,
          [studyId, url]
        );
      }

      await db.query(`UPDATE imaging_orders SET status='acquired' WHERE id=?`, [req.params.id]);
      return R.created(res, { studyId });
    } catch (e) { next(e); }
  }
);

// POST /imaging/orders/:id/report
router.post('/orders/:id/report',
  body('findings').notEmpty(),
  body('conclusion').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { findings, conclusion, recommendations, isNormal } = req.body;
      const [r] = await db.query(
        `INSERT INTO imaging_reports
           (imaging_order_id, findings, conclusion, recommendations, is_normal, reported_by)
         VALUES (:oid,:find,:conc,:rec,:norm,:uid)`,
        {
          oid: req.params.id, find: findings, conc: conclusion,
          rec: recommendations || null, norm: isNormal ? 1 : 0, uid: req.user.userId,
        }
      );
      await db.query(`UPDATE imaging_orders SET status='reported' WHERE id=?`, [req.params.id]);
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// GET /imaging/types
router.get('/types', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM imaging_types WHERE is_active=TRUE ORDER BY name`);
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
