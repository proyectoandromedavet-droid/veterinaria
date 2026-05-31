'use strict';

const { Router } = require('express');
const { db, R, logBranchesError } = require('./branches.common');

function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}
function maskPhone(phone) {
  if (!phone) return null;
  const s = String(phone);
  return s.slice(0, 3) + '***' + s.slice(-2);
}
function hasPiiAccess(req) {
  const roles = req.user?.roles || [];
  return Array.isArray(roles)
    ? roles.some(r => ['org_admin', 'branch_manager', 'receptionist', 'superadmin'].includes(r))
    : false;
}

const router = Router();

router.get('/search/patients', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q || q.length < 2) return R.badRequest(res, 'q debe tener al menos 2 caracteres');
    // OT-SEC: limitar q para evitar LIKE explosivo en búsquedas muy largas
    if (q.length > 200) return R.badRequest(res, 'q no puede superar 200 caracteres');

    const parsedLimit  = Math.min(parseInt(`${limit}`, 10) || 20, 100);
    const parsedPage   = Math.max(parseInt(`${page}`, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;
    const search = `%${q}%`;
    const pii = hasPiiAccess(req);

    // Sin acceso PII no se permite buscar por email/teléfono para evitar oracle attack sobre datos sensibles
    const piiFilter = pii ? 'OR cl.phone LIKE :s OR cl.email LIKE :s' : '';

    const rows = await db.query(
      `SELECT p.id, p.name AS patient_name, p.chip_number,
              sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone AS owner_phone, cl.email AS owner_email,
              b.id AS branch_id, b.name AS branch_name
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients cl ON po.client_id = cl.id
       JOIN branches b ON cl.branch_id = b.id AND b.organization_id = :orgId
       JOIN species sp ON p.species_id = sp.id
       WHERE (p.name LIKE :s OR p.chip_number LIKE :s
              OR CONCAT(cl.first_name,' ',cl.last_name) LIKE :s
              ${piiFilter})
         AND p.is_active = TRUE
       ORDER BY p.name
       LIMIT :limit OFFSET :offset`,
      { orgId: req.user.orgId, s: search, limit: parsedLimit, offset }
    );
    const pii = hasPiiAccess(req);
    const safeRows = rows.map(r => ({
      ...r,
      owner_phone: pii ? r.owner_phone : maskPhone(r.owner_phone),
      owner_email: pii ? r.owner_email : maskEmail(r.owner_email),
    }));
    return R.ok(res, safeRows, { query: q });
  } catch (e) {
    logBranchesError('GET /branches/search/patients', e, { orgId: req.user?.orgId, query: req.query });
    next(e);
  }
});

router.get('/search/clients', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q || q.length < 2) return R.badRequest(res, 'q debe tener al menos 2 caracteres');
    // OT-SEC: limitar q para evitar LIKE explosivo
    if (q.length > 200) return R.badRequest(res, 'q no puede superar 200 caracteres');

    const parsedLimit  = Math.min(parseInt(`${limit}`, 10) || 20, 100);
    const parsedPage   = Math.max(parseInt(`${page}`, 10) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;
    const search = `%${q}%`;
    const pii = hasPiiAccess(req);

    // Sin acceso PII no se permite buscar por email/teléfono/DNI para evitar oracle attack sobre datos sensibles
    const piiFilter = pii ? 'OR cl.email LIKE :s OR cl.phone LIKE :s OR cl.dni LIKE :s' : '';

    const rows = await db.query(
      `SELECT cl.id, CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
              cl.email, cl.phone, cl.dni,
              b.id AS branch_id, b.name AS branch_name,
              COUNT(DISTINCT po.patient_id) AS patient_count
       FROM clients cl
       JOIN branches b ON cl.branch_id = b.id AND b.organization_id = :orgId
       LEFT JOIN patient_owners po ON po.client_id = cl.id AND po.ownership_type = 'primary'
       WHERE (CONCAT(cl.first_name,' ',cl.last_name) LIKE :s
              ${piiFilter})
         AND cl.is_active = TRUE
       GROUP BY cl.id ORDER BY client_name
       LIMIT :limit OFFSET :offset`,
      { orgId: req.user.orgId, s: search, limit: parsedLimit, offset }
    );
    const pii = hasPiiAccess(req);
    const safeRows = rows.map(r => ({
      ...r,
      email: pii ? r.email : maskEmail(r.email),
      phone: pii ? r.phone : maskPhone(r.phone),
      dni:   pii ? r.dni : (r.dni ? '***' : null),
    }));
    return R.ok(res, safeRows, { query: q });
  } catch (e) {
    logBranchesError('GET /branches/search/clients', e, { orgId: req.user?.orgId, query: req.query });
    next(e);
  }
});

module.exports = router;
