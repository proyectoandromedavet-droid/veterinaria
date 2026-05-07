'use strict';

const { Router } = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');
const { requirePerm } = require('../../../../shared/serviceBase');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return R.badRequest(res, 'Validation failed', errors.array());
  next();
}

function parsePagination(queryParams, defaultLimit = 25) {
  const page = Math.max(parseInt(`${queryParams.page || '1'}`, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(`${queryParams.limit || `${defaultLimit}`}`, 10) || defaultLimit, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function ensurePatientInOrg(patientId, orgId) {
  if (!patientId) return null;
  return db.queryOne(
    `SELECT p.id, p.name
       FROM patients p
      WHERE p.id = :patientId AND p.organization_id = :orgId`,
    { patientId, orgId }
  );
}

router.get('/',
  query('accountId').optional().isInt({ min: 1 }),
  query('patientId').optional().isInt({ min: 1 }),
  query('associationStatus').optional().isIn(['unassociated', 'associated', 'needs_review']),
  query('provider').optional().isString(),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  async (req, res, next) => {
    try {
      const { page, limit, offset } = parsePagination(req.query);
      const conds = ['d.org_id = :orgId'];
      const params = { orgId: req.user.orgId, limit, offset };

      if (req.query.accountId) {
        conds.push('d.account_id = :accountId');
        params.accountId = req.query.accountId;
      }
      if (req.query.patientId) {
        conds.push('d.patient_id = :patientId');
        params.patientId = req.query.patientId;
      }
      if (req.query.associationStatus) {
        conds.push('d.association_status = :associationStatus');
        params.associationStatus = req.query.associationStatus;
      }
      if (req.query.provider) {
        conds.push('a.provider = :provider');
        params.provider = req.query.provider;
      }

      const where = conds.join(' AND ');
      const rows = await db.query(
        `SELECT d.id, d.account_id, d.patient_id, d.branch_id, d.external_message_id,
                d.from_email, d.subject, d.received_at, d.filename, d.mime_type,
                d.file_size, d.checksum, d.storage_path, d.document_category,
                d.association_status, d.ingestion_status, d.error_message,
                d.created_at, d.updated_at, d.metadata_json,
                a.provider, a.email_address,
                p.name AS patient_name
           FROM mail_document_inbox d
      LEFT JOIN mail_accounts a ON a.id = d.account_id
      LEFT JOIN patients p      ON p.id = d.patient_id
          WHERE ${where}
          ORDER BY d.received_at DESC, d.id DESC
          LIMIT :limit OFFSET :offset`,
        params
      );

      const totalRow = await db.queryOne(
        `SELECT COUNT(*) AS total
           FROM mail_document_inbox d
      LEFT JOIN mail_accounts a ON a.id = d.account_id
          WHERE ${where}`,
        { ...params, limit: undefined, offset: undefined }
      );

      return R.paginated(
        res,
        rows.map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) })),
        totalRow?.total || 0,
        page,
        limit
      );
    } catch (err) { next(err); }
  }
);

router.get('/patients/:patientId',
  param('patientId').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const patient = await ensurePatientInOrg(req.params.patientId, req.user.orgId);
      if (!patient) return R.notFound(res, 'Patient not found');

      const rows = await db.query(
        `SELECT id, account_id, patient_id, branch_id, external_message_id,
                from_email, subject, received_at, filename, mime_type, file_size,
                checksum, storage_path, document_category, association_status,
                ingestion_status, error_message, created_at, updated_at, metadata_json
           FROM mail_document_inbox
          WHERE org_id = :orgId AND patient_id = :patientId
          ORDER BY received_at DESC, id DESC`,
        { orgId: req.user.orgId, patientId: req.params.patientId }
      );

      return R.ok(res, rows.map((row) => ({ ...row, metadata: parseJson(row.metadata_json, {}) })), {
        patient: { id: patient.id, name: patient.name },
      });
    } catch (err) { next(err); }
  }
);

router.get('/:id',
  param('id').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const row = await db.queryOne(
        `SELECT d.*, a.provider, a.email_address, p.name AS patient_name
           FROM mail_document_inbox d
      LEFT JOIN mail_accounts a ON a.id = d.account_id
      LEFT JOIN patients p      ON p.id = d.patient_id
          WHERE d.id = :id AND d.org_id = :orgId`,
        { id: req.params.id, orgId: req.user.orgId }
      );
      if (!row) return R.notFound(res, 'Inbox document not found');
      return R.ok(res, { ...row, metadata: parseJson(row.metadata_json, {}) });
    } catch (err) { next(err); }
  }
);

router.post('/manual',
  requirePerm('medical_records:update'),
  body('accountId').optional().isInt({ min: 1 }),
  body('fromEmail').isEmail(),
  body('subject').optional().isString(),
  body('receivedAt').optional().isISO8601(),
  body('attachments').isArray({ min: 1 }),
  body('attachments.*.filename').isString(),
  body('attachments.*.mimeType').optional().isString(),
  body('attachments.*.fileSize').optional().isInt({ min: 0 }),
  body('attachments.*.checksum').optional().isString(),
  body('attachments.*.storagePath').optional().isString(),
  body('attachments.*.documentCategory').optional().isString(),
  body('attachments.*.patientId').optional().isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const attachments = req.body.attachments || [];
      const createdIds = [];
      const receivedAt = req.body.receivedAt || new Date().toISOString();

      if (req.body.accountId) {
        const account = await db.queryOne(
          'SELECT id FROM mail_accounts WHERE id = :id AND org_id = :orgId',
          { id: req.body.accountId, orgId: req.user.orgId }
        );
        if (!account) return R.notFound(res, 'Mail account not found');
      }

      await db.transaction(async (conn) => {
        for (const attachment of attachments) {
          let associationStatus = 'unassociated';
          if (attachment.patientId) {
            const patient = await conn.queryOne(
              `SELECT p.id
                 FROM patients p
                WHERE p.id = :patientId AND p.organization_id = :orgId`,
              { patientId: attachment.patientId, orgId: req.user.orgId }
            );
            if (!patient) throw new Error(`Patient ${attachment.patientId} not found in org`);
            associationStatus = 'associated';
          }

          const [result] = await conn.query(
            `INSERT INTO mail_document_inbox
               (org_id, branch_id, account_id, patient_id, external_message_id,
                from_email, subject, received_at, filename, mime_type, file_size,
                checksum, storage_path, document_category, association_status,
                ingestion_status, metadata_json)
             VALUES
               (:orgId, :branchId, :accountId, :patientId, :externalMessageId,
                :fromEmail, :subject, :receivedAt, :filename, :mimeType, :fileSize,
                :checksum, :storagePath, :documentCategory, :associationStatus,
                'indexed', :metadataJson)`,
            {
              orgId: req.user.orgId,
              branchId: req.user.branchId || null,
              accountId: req.body.accountId || null,
              patientId: attachment.patientId || null,
              externalMessageId: req.body.externalMessageId || null,
              fromEmail: req.body.fromEmail,
              subject: req.body.subject || null,
              receivedAt,
              filename: attachment.filename,
              mimeType: attachment.mimeType || 'application/pdf',
              fileSize: attachment.fileSize || 0,
              checksum: attachment.checksum || null,
              storagePath: attachment.storagePath || null,
              documentCategory: attachment.documentCategory || 'external_lab',
              associationStatus,
              metadataJson: JSON.stringify(attachment.metadata || {}),
            }
          );
          createdIds.push(result.insertId);
        }
      });

      return R.created(res, { createdIds, count: createdIds.length });
    } catch (err) { next(err); }
  }
);

router.patch('/:id/associate',
  requirePerm('medical_records:update'),
  param('id').isInt({ min: 1 }),
  body('patientId').isInt({ min: 1 }),
  body('documentCategory').optional().isString(),
  body('metadata').optional().isObject(),
  validate,
  async (req, res, next) => {
    try {
      const inboxRow = await db.queryOne(
        'SELECT id FROM mail_document_inbox WHERE id = :id AND org_id = :orgId',
        { id: req.params.id, orgId: req.user.orgId }
      );
      if (!inboxRow) return R.notFound(res, 'Inbox document not found');

      const patient = await ensurePatientInOrg(req.body.patientId, req.user.orgId);
      if (!patient) return R.notFound(res, 'Patient not found');

      const existing = await db.queryOne(
        'SELECT metadata_json FROM mail_document_inbox WHERE id = :id AND org_id = :orgId',
        { id: req.params.id, orgId: req.user.orgId }
      );
      const mergedMetadata = { ...parseJson(existing?.metadata_json, {}), ...(req.body.metadata || {}) };

      await db.query(
        `UPDATE mail_document_inbox
            SET patient_id = :patientId,
                document_category = COALESCE(:documentCategory, document_category),
                association_status = 'associated',
                metadata_json = :metadataJson,
                updated_at = NOW()
          WHERE id = :id AND org_id = :orgId`,
        {
          id: req.params.id,
          orgId: req.user.orgId,
          patientId: req.body.patientId,
          documentCategory: req.body.documentCategory || null,
          metadataJson: JSON.stringify(mergedMetadata),
        }
      );

      return R.ok(res, {
        id: Number(req.params.id),
        patientId: patient.id,
        patientName: patient.name,
        associationStatus: 'associated',
      });
    } catch (err) { next(err); }
  }
);

module.exports = router;
