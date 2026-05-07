'use strict';

const { Router } = require('express');
const { body, param, query, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');
const { syncAccountDocuments } = require('../lib/sync');

const router = Router();

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return R.badRequest(res, 'Validation failed', errors.array());
  next();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sanitizeSettings(provider, settings = {}) {
  const copy = { ...settings };
  const commonSecrets = ['password', 'clientSecret', 'refreshToken', 'accessToken'];
  for (const key of commonSecrets) {
    if (copy[key]) copy[key] = '********';
  }
  if (provider === 'imap' && copy.username) copy.username = String(copy.username);
  return copy;
}

function mergeSettings(existing = {}, incoming = {}) {
  const merged = { ...existing, ...incoming };
  const secretKeys = ['password', 'clientSecret', 'refreshToken', 'accessToken'];
  for (const key of secretKeys) {
    if (incoming[key] === '********' || incoming[key] == null || incoming[key] === '') {
      if (existing[key] != null) merged[key] = existing[key];
      else delete merged[key];
    }
  }
  return merged;
}

async function loadAccount(id, orgId) {
  const row = await db.queryOne(
    `SELECT id, org_id, provider, email_address, display_name, folder_name, is_active,
            last_synced_at, last_error, created_at, updated_at, settings_json
       FROM mail_accounts
      WHERE id = :id AND org_id = :orgId`,
    { id, orgId }
  );
  if (!row) return null;
  return {
    ...row,
    is_active: Boolean(row.is_active),
    settings: parseJson(row.settings_json, {}),
  };
}

router.get('/',
  query('provider').optional().isString(),
  query('active').optional().isIn(['true', 'false']),
  validate,
  async (req, res, next) => {
    try {
      const conds = ['org_id = :orgId'];
      const params = { orgId: req.user.orgId };
      if (req.query.provider) {
        conds.push('provider = :provider');
        params.provider = req.query.provider;
      }
      if (req.query.active != null) {
        conds.push('is_active = :active');
        params.active = req.query.active === 'true' ? 1 : 0;
      }

      const rows = await db.query(
        `SELECT id, provider, email_address, display_name, folder_name, is_active,
                last_synced_at, last_error, created_at, updated_at, settings_json
           FROM mail_accounts
          WHERE ${conds.join(' AND ')}
          ORDER BY created_at DESC`,
        params
      );

      return R.ok(res, rows.map((row) => ({
        ...row,
        is_active: Boolean(row.is_active),
        settings: sanitizeSettings(row.provider, parseJson(row.settings_json, {})),
      })));
    } catch (err) { next(err); }
  }
);

router.post('/',
  body('provider').isIn(['gmail', 'imap', 'outlook', 'manual']),
  body('emailAddress').isEmail(),
  body('displayName').optional().isString(),
  body('folderName').optional().isString(),
  body('settings').optional().isObject(),
  body('isActive').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const [result] = await db.query(
        `INSERT INTO mail_accounts
           (org_id, provider, email_address, display_name, folder_name, is_active, settings_json)
         VALUES
           (:orgId, :provider, :emailAddress, :displayName, :folderName, :isActive, :settingsJson)`,
        {
          orgId: req.user.orgId,
          provider: req.body.provider,
          emailAddress: req.body.emailAddress,
          displayName: req.body.displayName || null,
          folderName: req.body.folderName || 'INBOX',
          isActive: req.body.isActive === false ? 0 : 1,
          settingsJson: JSON.stringify(req.body.settings || {}),
        }
      );

      return R.created(res, { id: result.insertId });
    } catch (err) { next(err); }
  }
);

router.patch('/:id',
  param('id').isInt({ min: 1 }),
  body('displayName').optional().isString(),
  body('folderName').optional().isString(),
  body('settings').optional().isObject(),
  body('isActive').optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      const account = await db.queryOne(
        'SELECT id, settings_json FROM mail_accounts WHERE id = :id AND org_id = :orgId',
        { id: req.params.id, orgId: req.user.orgId }
      );
      if (!account) return R.notFound(res, 'Mail account not found');

      const fields = [];
      const params = { id: req.params.id, orgId: req.user.orgId };
      if (Object.prototype.hasOwnProperty.call(req.body, 'displayName')) {
        fields.push('display_name = :displayName');
        params.displayName = req.body.displayName || null;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'folderName')) {
        fields.push('folder_name = :folderName');
        params.folderName = req.body.folderName || 'INBOX';
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'settings')) {
        fields.push('settings_json = :settingsJson');
        params.settingsJson = JSON.stringify(mergeSettings(parseJson(account.settings_json, {}), req.body.settings || {}));
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'isActive')) {
        fields.push('is_active = :isActive');
        params.isActive = req.body.isActive ? 1 : 0;
      }
      if (!fields.length) return R.badRequest(res, 'No fields to update');

      await db.query(
        `UPDATE mail_accounts
            SET ${fields.join(', ')}, updated_at = NOW()
          WHERE id = :id AND org_id = :orgId`,
        params
      );

      return R.noContent(res);
    } catch (err) { next(err); }
  }
);

router.post('/:id/sync',
  param('id').isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const account = await loadAccount(req.params.id, req.user.orgId);
      if (!account) return R.notFound(res, 'Mail account not found');
      if (!account.is_active) return R.conflict(res, 'Mail account is inactive');

      if (account.provider === 'manual') {
        return R.accepted(res, {
          accountId: account.id,
          provider: account.provider,
          status: 'manual_provider_ready',
          imported: 0,
          message: 'La cuenta manual no sincroniza remoto; usar importación manual o upload directo.',
        });
      }

      const { records, settings } = await syncAccountDocuments(account);
      let imported = 0;

      await db.transaction(async (conn) => {
        for (const record of records) {
          for (const attachment of record.attachments) {
            const existing = await conn.queryOne(
              `SELECT id
                 FROM mail_document_inbox
                WHERE org_id = :orgId
                  AND account_id = :accountId
                  AND external_message_id = :externalMessageId
                  AND filename = :filename
                LIMIT 1`,
              {
                orgId: req.user.orgId,
                accountId: account.id,
                externalMessageId: record.externalMessageId,
                filename: attachment.filename,
              }
            );
            if (existing) continue;

            const { uploadFile, BUCKETS } = require('../../../../shared/minio');
            const storagePath = await uploadFile(
              attachment.buffer,
              attachment.filename,
              BUCKETS.documents,
              `documents/${req.user.orgId}/${account.id}`
            );

            await conn.query(
              `INSERT INTO mail_document_inbox
                 (org_id, branch_id, account_id, patient_id, external_message_id,
                  from_email, subject, received_at, filename, mime_type, file_size,
                  checksum, storage_path, document_category, association_status,
                  ingestion_status, metadata_json)
               VALUES
                 (:orgId, :branchId, :accountId, NULL, :externalMessageId,
                  :fromEmail, :subject, :receivedAt, :filename, :mimeType, :fileSize,
                  :checksum, :storagePath, 'external_lab', 'unassociated',
                  'downloaded', :metadataJson)`,
              {
                orgId: req.user.orgId,
                branchId: req.user.branchId || null,
                accountId: account.id,
                externalMessageId: record.externalMessageId,
                fromEmail: record.fromEmail,
                subject: record.subject || null,
                receivedAt: record.receivedAt,
                filename: attachment.filename,
                mimeType: attachment.mimeType || 'application/pdf',
                fileSize: attachment.fileSize || attachment.buffer.length,
                checksum: attachment.checksum,
                storagePath,
                metadataJson: JSON.stringify(attachment.metadata || {}),
              }
            );
            imported += 1;
          }
        }

        await conn.query(
          `UPDATE mail_accounts
              SET last_error = NULL,
                  last_synced_at = NOW(),
                  settings_json = :settingsJson,
                  updated_at = NOW()
            WHERE id = :id AND org_id = :orgId`,
          {
            id: account.id,
            orgId: req.user.orgId,
            settingsJson: JSON.stringify(settings || account.settings || {}),
          }
        );
      });

      return R.accepted(res, {
        accountId: account.id,
        provider: account.provider,
        status: 'synced',
        imported,
        message: `Sincronización completada: ${imported} adjunto(s) nuevo(s).`,
      });
    } catch (err) {
      await db.query(
        `UPDATE mail_accounts
            SET last_error = :message, updated_at = NOW()
          WHERE id = :id AND org_id = :orgId`,
        {
          id: req.params.id,
          orgId: req.user.orgId,
          message: String(err.message || 'Sync failed').slice(0, 512),
        }
      ).catch(() => {});
      next(err);
    }
  }
);

module.exports = router;
