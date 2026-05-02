'use strict';

/**
 * GET /audit/export
 *
 * Exporta audit logs del tenant autenticado.
 * Requiere rol 'owner' o 'admin'.
 * Soporta formato JSON (default) y CSV (Accept: text/csv o ?format=csv).
 *
 * Query params:
 *   dateFrom  — YYYY-MM-DD (default: últimos 30 días)
 *   dateTo    — YYYY-MM-DD (default: hoy)
 *   resource  — e.g. 'patients', 'invoices'
 *   action    — CREATE | UPDATE | DELETE | READ
 *   userId    — filtrar por usuario
 *   format    — 'json' | 'csv' (también respetado vía Accept header)
 *   limit     — máximo registros (cap en 10 000)
 */

const { Router } = require('express');
const { exportAuditLogs, rowsToCsv, rowsToNdjson } = require('../../../../shared/audit');
const { scanSuspiciousAccessPatterns } = require('../../../../shared/securityAlerts');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');

const router = Router();

// Read user from gateway-injected headers (same pattern as auth.routes.js)
function fromHeaders(req, _res, next) {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
  };
  next();
}

function requireAdminRole(req, res, next) {
  const roles = req.user?.roles || [];
  if (roles.some(r => ['superadmin', 'org_admin'].includes(r))) return next();
  return res.status(403).json({
    success: false,
    error: { message: 'Audit export requires org_admin or superadmin role', code: 'FORBIDDEN' },
  });
}

router.get('/export', fromHeaders, requireAdminRole, async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    if (!orgId) return R.unauthorized(res, 'Missing org context');

    const wantsCsv =
      req.query.format === 'csv' ||
      (req.headers['accept'] || '').includes('text/csv');
    const wantsNdjson =
      req.query.format === 'ndjson' ||
      (req.headers['accept'] || '').includes('application/x-ndjson');
    const source = req.query.source === 'immutable' ? 'immutable' : 'audit_logs';

    const { rows, format } = await exportAuditLogs({
      orgId,
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
      resource: req.query.resource,
      action:   req.query.action,
      userId:   req.query.userId ? parseInt(req.query.userId) : undefined,
      format:   wantsNdjson ? 'ndjson' : (wantsCsv ? 'csv' : 'json'),
      limit:    req.query.limit,
      source,
    });

    if (wantsNdjson) {
      const filename = `audit-${source}-${orgId}-${new Date().toISOString().slice(0,10)}.ndjson`;
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(rowsToNdjson(rows));
    }

    if (format === 'csv') {
      const filename = `audit-${source}-${orgId}-${new Date().toISOString().slice(0,10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(rowsToCsv(rows));
    }

    return R.ok(res, { total: rows.length, rows });
  } catch (e) { next(e); }
});

router.get('/alerts', fromHeaders, requireAdminRole, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, alert_type, severity, description, metadata, created_at
       FROM security_alerts
       WHERE organization_id = :orgId
       ORDER BY created_at DESC
       LIMIT 200`,
      { orgId: req.user.orgId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/alerts/scan', fromHeaders, requireAdminRole, async (req, res, next) => {
  try {
    const generated = await scanSuspiciousAccessPatterns(parseInt(req.body?.windowMinutes || '1', 10));
    return R.ok(res, { generated });
  } catch (e) { next(e); }
});

module.exports = router;
