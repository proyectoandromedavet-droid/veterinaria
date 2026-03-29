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
const { exportAuditLogs, rowsToCsv } = require('../../../../shared/audit');
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
  if (roles.includes('owner') || roles.includes('admin')) return next();
  return res.status(403).json({
    success: false,
    error: { message: 'Audit export requires owner or admin role', code: 'FORBIDDEN' },
  });
}

router.get('/export', fromHeaders, requireAdminRole, async (req, res, next) => {
  try {
    const orgId = req.user.orgId;
    if (!orgId) return R.unauthorized(res, 'Missing org context');

    const wantsCsv =
      req.query.format === 'csv' ||
      (req.headers['accept'] || '').includes('text/csv');

    const { rows, format } = await exportAuditLogs({
      orgId,
      dateFrom: req.query.dateFrom,
      dateTo:   req.query.dateTo,
      resource: req.query.resource,
      action:   req.query.action,
      userId:   req.query.userId ? parseInt(req.query.userId) : undefined,
      format:   wantsCsv ? 'csv' : 'json',
      limit:    req.query.limit,
    });

    if (format === 'csv') {
      const filename = `audit-${orgId}-${new Date().toISOString().slice(0,10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(rowsToCsv(rows));
    }

    return R.ok(res, { total: rows.length, rows });
  } catch (e) { next(e); }
});

module.exports = router;
