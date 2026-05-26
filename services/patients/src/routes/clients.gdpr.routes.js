'use strict';

const { Router } = require('express');
const gdpr = require('../../../../shared/gdpr');
const { db, R, body, validate, logClientsError } = require('./clients.common');

const router = Router();

// OT-SEC: requireClientBranch verifica branch_id Y organization_id para evitar
// que clientes de otra org con el mismo branchId (edge-case de schema) sean accesibles.
// CORRECCIÓN: eliminada la cláusula "OR :orgId IS NULL" que permitía bypassear el
// check de org cuando el token del usuario no incluía orgId (e.g. tokens malformados).
async function requireClientBranch(clientId, branchId, orgId, res) {
  if (!orgId) { R.error(res, 403, 'Token sin organización válida', null, 'NO_ORG'); return false; }
  const client = await db.queryOne(
    `SELECT id FROM clients
     WHERE id = :id AND branch_id = :bid
       AND organization_id = :orgId`,
    { id: clientId, bid: branchId, orgId }
  );
  if (!client) { R.notFound(res, 'Cliente no encontrado'); return false; }
  return true;
}

// Guard de rol: solo admin/org_admin/superadmin pueden ejecutar operaciones GDPR destructivas.
function requireGdprAdmin(req, res, next) {
  const roles = req.user?.roles || [];
  const allowed = ['admin', 'org_admin', 'superadmin'];
  if (!Array.isArray(roles) || !roles.some(r => allowed.includes(r))) {
    return R.error(res, 403, 'Se requiere rol de administrador para operaciones GDPR', null, 'FORBIDDEN');
  }
  next();
}

router.get('/:id/gdpr/consents', async (req, res, next) => {
  try {
    if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
    const consents = await gdpr.getConsents(req.params.id);
    return R.ok(res, consents);
  } catch (e) {
    logClientsError('GET /clients/:id/gdpr/consents', e, { clientId: req.params.id, orgId: req.user?.orgId });
    next(e);
  }
});

router.post('/:id/gdpr/consents',
  body('consentType').isIn(['marketing', 'analytics', 'third_party', 'telemedicine', 'photo', 'data_sharing', 'terms', 'privacy']),
  body('granted').isBoolean(),
  // CORRECCIÓN: faltaba validate — las reglas body() no se ejecutaban.
  validate,
  async (req, res, next) => {
    try {
      if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
      const { consentType, granted, source, version } = req.body;
      const result = await gdpr.recordConsent({
        clientId: req.params.id,
        consentType,
        granted: granted === true || granted === 'true',
        source: source || 'staff',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        version,
      });

      await db.query(
        `INSERT INTO gdpr_audit_trail (client_id, user_id, action, performed_by, ip_address, details)
         VALUES (:cid, NULL, :action, :uid, :ip, :det)`,
        {
          cid: req.params.id,
          action: `consent.${granted ? 'granted' : 'withdrawn'}.${consentType}`,
          uid: req.user.userId,
          ip: req.ip,
          det: JSON.stringify({ consentType, granted, source }),
        }
      ).catch((auditError) => logClientsError('POST /clients/:id/gdpr/consents audit', auditError, { clientId: req.params.id, orgId: req.user?.orgId }));

      return R.created(res, result);
    } catch (e) {
      logClientsError('POST /clients/:id/gdpr/consents', e, { clientId: req.params.id, orgId: req.user?.orgId, body: req.body });
      next(e);
    }
  }
);

router.delete('/:id/gdpr/consents', async (req, res, next) => {
  try {
    if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
    await gdpr.withdrawAllConsents(req.params.id, 'staff');
    return R.noContent(res);
  } catch (e) {
    logClientsError('DELETE /clients/:id/gdpr/consents', e, { clientId: req.params.id, orgId: req.user?.orgId });
    next(e);
  }
});

router.get('/:id/gdpr/export', async (req, res, next) => {
  try {
    // OT-101: GDPR personal-data exports must only be served over HTTPS.
    // In production, reject plaintext HTTP requests (e.g., misconfigured proxies
    // or direct internal calls without TLS).
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    if (!isSecure && process.env.NODE_ENV === 'production') {
      return R.error(res, 403, 'GDPR exports require a secure HTTPS connection', null, 'HTTPS_REQUIRED');
    }

    if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
    const data = await gdpr.exportPersonalData(req.params.id, req.user.orgId);
    await db.query(
      `INSERT INTO gdpr_audit_trail (client_id, user_id, action, performed_by, ip_address)
       VALUES (:cid, NULL, 'access.export', :uid, :ip)`,
      { cid: req.params.id, uid: req.user.userId, ip: req.ip }
    ).catch((auditError) => logClientsError('GET /clients/:id/gdpr/export audit', auditError, { clientId: req.params.id, orgId: req.user?.orgId }));

    const format = req.query.format || 'json';
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="datos-personales-${req.params.id}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }
    return R.ok(res, data);
  } catch (e) {
    if (e.code === 'CLIENT_NOT_FOUND') return R.notFound(res);
    logClientsError('GET /clients/:id/gdpr/export', e, { clientId: req.params.id, orgId: req.user?.orgId, query: req.query });
    next(e);
  }
});

router.post('/:id/gdpr/requests',
  body('requestType').isIn(['access', 'erasure', 'portability', 'rectification', 'restriction', 'objection']),
  body('notes').optional().isString().isLength({ max: 1000 }),
  // CORRECCIÓN: faltaba validate — requestType inválido pasaba sin error.
  validate,
  async (req, res, next) => {
    try {
      if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
      const result = await gdpr.createDataRequest({
        clientId: req.params.id,
        requestType: req.body.requestType,
        notes: req.body.notes,
        handledBy: req.user.userId,
      });
      return R.created(res, result);
    } catch (e) {
      logClientsError('POST /clients/:id/gdpr/requests', e, { clientId: req.params.id, orgId: req.user?.orgId, body: req.body });
      next(e);
    }
  }
);

// CORRECCIÓN: añadido requireGdprAdmin — solo admins deben ver solicitudes GDPR de la org.
// CORRECCIÓN: filtrado por organization_id (a través del JOIN con branches) para evitar
// cross-org: antes solo se filtraba por branch_id, un admin de otra org con mismo branchId
// podría haber visto solicitudes ajenas.
router.get('/gdpr/requests', requireGdprAdmin, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(`${limit}`, 10) || 20, 100);
    const parsedPage  = Math.max(parseInt(`${page}`, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;
    // Filtrar por org a través del branch del cliente (más robusto que solo branch_id)
    const conds = ['b.organization_id = :orgId'];
    const p = { orgId: req.user.orgId, bid: req.user.branchId, limit: parsedLimit, offset };
    // Restringir además al branch del usuario si no es superadmin
    const roles = req.user?.roles || [];
    if (!roles.includes('superadmin')) {
      conds.push('c.branch_id = :bid');
    }
    if (status) { conds.push('gdr.status = :status'); p.status = status; }

    const rows = await db.query(
      `SELECT gdr.*, CONCAT(c.first_name,' ',c.last_name) AS client_name, c.email,
              CONCAT(u.first_name,' ',u.last_name) AS handled_by_name
       FROM gdpr_data_requests gdr
       JOIN clients c ON gdr.client_id = c.id
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN users u ON gdr.handled_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY gdr.due_date ASC, gdr.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) {
    logClientsError('GET /clients/gdpr/requests', e, { branchId: req.user?.branchId, orgId: req.user?.orgId, query: req.query });
    next(e);
  }
});

// CORRECCIÓN: añadido requireGdprAdmin + validate; el lookup de ownership ahora incluye
// organization_id vía JOIN branches para evitar que un admin de otra org modifique
// solicitudes ajenas que comparten branchId numérico.
router.patch('/gdpr/requests/:reqId',
  requireGdprAdmin,
  body('status').isIn(['in_progress', 'completed', 'rejected']),
  validate,
  async (req, res, next) => {
    try {
      const reqData = await db.queryOne(
        `SELECT gdr.id FROM gdpr_data_requests gdr
         JOIN clients c ON gdr.client_id = c.id
         JOIN branches b ON c.branch_id = b.id
         WHERE gdr.id = :reqId AND b.organization_id = :orgId`,
        { reqId: req.params.reqId, orgId: req.user.orgId }
      );
      if (!reqData) return R.notFound(res, 'Solicitud no encontrada');
      await gdpr.updateDataRequest(req.params.reqId, req.body.status, req.user.userId);
      return R.noContent(res);
    } catch (e) {
      logClientsError('PATCH /clients/gdpr/requests/:reqId', e, { requestId: req.params.reqId, orgId: req.user?.orgId, body: req.body });
      next(e);
    }
  }
);

// OT-SEC: anonymización GDPR — requiere rol de administrador
router.delete('/:id/gdpr/erase', requireGdprAdmin, async (req, res, next) => {
  try {
    if (!await requireClientBranch(req.params.id, req.user.branchId, req.user.orgId, res)) return;
    const result = await gdpr.anonymizeClient(req.params.id, req.user.orgId, req.user.userId);
    return R.ok(res, result);
  } catch (e) {
    if (e.code === 'CLIENT_NOT_FOUND') return R.notFound(res);
    logClientsError('DELETE /clients/:id/gdpr/erase', e, { clientId: req.params.id, orgId: req.user?.orgId });
    next(e);
  }
});

router.get('/gdpr/retention', async (req, res, next) => {
  try {
    const candidates = await gdpr.findRetentionCandidates(req.user.orgId);
    return R.ok(res, candidates, { policies: gdpr.getRetentionPolicies() });
  } catch (e) {
    logClientsError('GET /clients/gdpr/retention', e, { orgId: req.user?.orgId });
    next(e);
  }
});

module.exports = router;
