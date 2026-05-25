'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const {
  db,
  R,
  ai,
  buildImagePrompt,
  requirePerm,
  validate,
  getUser,
  withAiTimeout,
  log,
} = require('../ai.common');
const { requireUsageLimit, requireUserUsageLimit } = require('../../../../shared/usageLimits');

const router = Router();

router.post('/analyze',
  requirePerm('ai:use'),
  requireUsageLimit('ai_image_analysis'),
  requireUserUsageLimit('ai_image_analysis'),  // OT-093: per-user daily cap
  body('patientId').isInt({ min: 1 }),
  body('imageType').isIn(['xray', 'ultrasound', 'blood_smear', 'cytology', 'histology', 'fundoscopy', 'ecg', 'other']),
  body('imageUrl').optional().isURL().custom((url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('Only HTTPS URLs allowed');
    const host = parsed.hostname.toLowerCase();
    const BLOCKED = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|::1|::ffff:|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|fd[0-9a-f]{2}:|fc[0-9a-f]{2}:|metadata\.google\.internal|100\.64\.)/.test(host);
    if (BLOCKED) throw new Error('Internal/private URLs not allowed');
    return true;
  }),
  // OT-094: validate imageBase64 — size cap + allowed MIME types
  body('imageBase64').optional().isString().custom((val) => {
    if (!val) return true;
    const MAX_BYTES = parseInt(process.env.AI_IMAGE_MAX_BYTES || String(10 * 1024 * 1024), 10); // 10 MB
    const base64Data = val.includes(',') ? val.split(',')[1] : val;
    const approxBytes = Math.ceil(base64Data.replace(/=/g, '').length * 3 / 4);
    if (approxBytes > MAX_BYTES) throw new Error(`Image exceeds max size of ${MAX_BYTES} bytes`);
    if (val.startsWith('data:')) {
      const mime = val.split(';')[0].slice(5); // strip 'data:'
      const ALLOWED_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff']);
      if (!ALLOWED_MIMES.has(mime)) throw new Error(`Image MIME type '${mime}' not allowed`);
    }
    return true;
  }),
  // OT-092: length caps + control-char sanitization on free-text fields
  body('region').optional().isString().trim()
    .customSanitizer((v) => v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''))
    .isLength({ max: 200 }),
  body('clinicalContext').optional().isString().trim()
    .customSanitizer((v) => v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''))
    .isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, imageType, imageUrl, imageBase64, region, clinicalContext, labResultId } = req.body;
      const user = getUser(req);
      if (!imageUrl && !imageBase64) return R.badRequest(res, 'Se requiere imageUrl o imageBase64');

      const patient = await db.queryOne(
        `SELECT p.id, p.name, p.birthdate, p.sex, p.weight_kg AS weight,
                sp.common_name AS species, br.name AS breed
         FROM patients p
         LEFT JOIN species sp ON p.species_id = sp.id
         LEFT JOIN breeds  br ON p.breed_id   = br.id
         WHERE p.id = :pid AND p.organization_id = :org`,
        { pid: patientId, org: user.orgId }
      );
      if (!patient) return R.notFound(res, 'Paciente no encontrado');

      // Validate labResultId ownership — must belong to same patient and org
      if (labResultId) {
        const labResult = await db.queryOne(
          `SELECT id FROM lab_results
           WHERE id = :labId AND patient_id = :pid AND organization_id = :org`,
          { labId: labResultId, pid: patientId, org: user.orgId }
        );
        if (!labResult) return R.notFound(res, 'Resultado de laboratorio no encontrado para este paciente');
      }

      const prompt = buildImagePrompt(imageType, patient, region, clinicalContext);
      const rawAnalysis = await withAiTimeout((signal) =>
        ai.analyzeImage(imageUrl || imageBase64, prompt, { signal })
      );

      let parsed;
      try { parsed = JSON.parse(rawAnalysis); }
      catch (err) {
        log.warn('image analysis parse failed', { err: err.message });
        parsed = { findings: [], assessment: rawAnalysis, severity: 'unknown', recommendations: [], parseError: true };
      }

      const [ins] = await db.query(
        `INSERT INTO ai_image_analyses
           (patient_id, org_id, lab_result_id, image_type, region, severity,
            findings_json, assessment, recommendations_json, model_provider, requested_by)
         VALUES (:pid, :org, :labId, :type, :region, :sev, :findings, :assess, :recs, :prov, :uid)`,
        {
          pid: patientId,
          org: user.orgId,
          labId: labResultId || null,
          type: imageType,
          region: region || null,
          sev: parsed.severity || 'unknown',
          findings: JSON.stringify(parsed.findings || []),
          assess: parsed.assessment || '',
          recs: JSON.stringify(parsed.recommendations || []),
          prov: ai.PROVIDER,
          uid: user.userId,
        }
      ).catch((err) => {
        log.warn('image analysis insert failed', { err: err.message });
        return [{ insertId: null }];
      });

      return R.ok(res, { id: ins.insertId, patient: { id: patient.id, name: patient.name }, ...parsed });
    } catch (e) { next(e); }
  }
);

module.exports = router;
