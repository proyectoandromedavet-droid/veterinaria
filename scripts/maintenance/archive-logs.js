'use strict';

require('dotenv').config();

const db = require('../../shared/db');

async function archiveAuditLogs(retentionDays) {
  await db.query(
    `INSERT INTO audit_log_immutable_archive
       (created_at, org_id, audit_log_id, payload_json, prev_hash, entry_hash, export_status)
     SELECT created_at, org_id, audit_log_id, payload_json, prev_hash, entry_hash, 'archived'
     FROM audit_log_immutable
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM audit_log_immutable
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function archiveNotificationLogs(retentionDays) {
  await db.query(
    `INSERT INTO notification_logs_archive
       (created_at, branch_id, user_id, client_id, channel, title, body, status, error_message, external_id, deleted_at)
     SELECT created_at, branch_id, user_id, client_id, channel, title, body, status, error_message, external_id, deleted_at
     FROM notification_logs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM notification_logs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function main() {
  const retentionDays = Math.max(30, parseInt(process.env.LOG_ARCHIVE_RETENTION_DAYS || '90', 10));
  await archiveAuditLogs(retentionDays);
  await archiveNotificationLogs(retentionDays);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[archive-logs]', err.message);
    process.exit(1);
  });
