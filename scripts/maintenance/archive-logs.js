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

async function archiveMessageLogs(retentionDays) {
  await db.query(
    `INSERT INTO message_logs_archive
       (created_at, branch_id, client_id, user_id, channel, recipient, template_name, status, external_id, error_message, payload_json)
     SELECT created_at, branch_id, client_id, user_id, channel, recipient, template_name, status, external_id, error_message, payload_json
     FROM message_logs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM message_logs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function archiveSecurityAlerts(retentionDays) {
  await db.query(
    `INSERT INTO security_alerts_archive
       (created_at, organization_id, user_id, alert_type, severity, status, title, description, metadata_json)
     SELECT created_at,
            organization_id,
            user_id,
            alert_type,
            severity,
            COALESCE(status, 'closed'),
            COALESCE(title, alert_type),
            description,
            metadata
     FROM security_alerts
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM security_alerts
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function archiveReportRuns(retentionDays) {
  await db.query(
    `INSERT INTO report_runs_archive
       (created_at, scheduled_report_id, status, output_path, generated_by, error_message, metadata_json)
     SELECT created_at, scheduled_report_id, status, output_path, generated_by, error_message, metadata_json
     FROM report_runs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM report_runs
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function archiveServiceRegistrySnapshots(retentionDays) {
  await db.query(
    `INSERT INTO service_registry_snapshots_archive
       (created_at, service_name, service_url, health_status, metadata_json)
     SELECT created_at, service_name, service_url, health_status, metadata_json
     FROM service_registry_snapshots
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});

  await db.query(
    `DELETE FROM service_registry_snapshots
     WHERE created_at < DATE_SUB(NOW(), INTERVAL :days DAY)`,
    { days: retentionDays }
  ).catch(() => {});
}

async function main() {
  const retentionDays = Math.max(30, parseInt(process.env.LOG_ARCHIVE_RETENTION_DAYS || '90', 10));
  await archiveAuditLogs(retentionDays);
  await archiveNotificationLogs(retentionDays);
  await archiveMessageLogs(retentionDays);
  await archiveSecurityAlerts(retentionDays);
  await archiveReportRuns(retentionDays);
  await archiveServiceRegistrySnapshots(retentionDays);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[archive-logs]', err.message);
    process.exit(1);
  });
