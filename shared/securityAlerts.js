'use strict';

const db = require('./db');

async function createAlert({ orgId, userId = null, type, severity = 'warning', description, metadata = null }) {
  await db.query(
    `INSERT INTO security_alerts
       (organization_id, user_id, alert_type, severity, description, metadata, created_at)
     VALUES
       (:orgId, :userId, :type, :severity, :description, :metadata, NOW())`,
    {
      orgId,
      userId,
      type,
      severity,
      description,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }
  ).catch(() => {});
}

async function scanSuspiciousAccessPatterns(windowMinutes = 1) {
  const rows = await db.query(
    `SELECT org_id,
            user_id,
            COUNT(*) AS read_count,
            SUM(CASE WHEN action = 'EXPORT' THEN 1 ELSE 0 END) AS export_count
     FROM audit_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL :windowMinutes MINUTE)
       AND action IN ('READ', 'EXPORT')
     GROUP BY org_id, user_id
     HAVING COUNT(*) >= 200 OR SUM(CASE WHEN action = 'EXPORT' THEN 1 ELSE 0 END) >= 5`,
    { windowMinutes }
  ).catch(() => []);

  for (const row of rows) {
    await createAlert({
      orgId: row.org_id,
      userId: row.user_id,
      type: row.export_count >= 5 ? 'mass_export' : 'high_volume_read',
      severity: row.export_count >= 5 ? 'critical' : 'warning',
      description: row.export_count >= 5
        ? `Usuario con ${row.export_count} exportaciones en ${windowMinutes} minuto(s)`
        : `Usuario con ${row.read_count} lecturas en ${windowMinutes} minuto(s)`,
      metadata: {
        readCount: row.read_count,
        exportCount: row.export_count,
        windowMinutes,
      },
    });
  }

  return rows.length;
}

module.exports = {
  createAlert,
  scanSuspiciousAccessPatterns,
};
