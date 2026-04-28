'use strict';

/**
 * routes/branches.routes.js
 * Gestión multi-sucursal:
 *   - Administración de sucursales del org
 *   - Transferencias de pacientes
 *   - Historial cross-branch
 *   - Búsqueda org-wide
 *   - Acceso temporal entre sucursales
 */

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db          = require('../../../../shared/db');
const R           = require('../../../../shared/response');
const mb          = require('../../../../shared/multibranch');
const { enqueue } = require('../../../../shared/webhooks/dispatcher');

const router = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// ─── Sucursales del org ───────────────────────────────────────────────────────

// GET /branches — lista todas las sucursales del org del usuario
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT b.id, b.name, b.address, b.phone, b.email, b.timezone,
              b.is_active, b.created_at,
              COUNT(DISTINCT u.id) AS staff_count,
              COUNT(DISTINCT cl.id) AS client_count
       FROM branches b
       LEFT JOIN users   u  ON u.branch_id = b.id  AND u.is_active = TRUE
       LEFT JOIN clients cl ON cl.branch_id = b.id AND cl.is_active = TRUE
       WHERE b.organization_id = :orgId
       GROUP BY b.id ORDER BY b.name`,
      { orgId: req.user.orgId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /branches/:id — detalle de una sucursal
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const branch = await db.queryOne(
      `SELECT b.*, o.name AS org_name
       FROM branches b JOIN organizations o ON b.organization_id = o.id
       WHERE b.id = :id AND b.organization_id = :orgId`,
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!branch) return R.notFound(res);

    const [settings, kpis] = await Promise.all([
      db.queryOne('SELECT * FROM branch_integration_settings WHERE branch_id = :id', { id: req.params.id }),
      db.queryOne('SELECT * FROM v_branch_daily_kpis WHERE branch_id = :id', { id: req.params.id })
        .catch(() => null),
    ]);

    return R.ok(res, { ...branch, integrationSettings: settings, kpis });
  } catch (e) { next(e); }
});

// PATCH /branches/:id/settings — actualizar configuración de integración
router.patch('/:id/settings', async (req, res, next) => {
  try {
    const branch = await db.queryOne(
      'SELECT id FROM branches WHERE id=:id AND organization_id=:orgId',
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!branch) return R.notFound(res);

    const {
      sharePatientHistory = 1,
      shareInventoryView  = 1,
      allowStockTransfers = 1,
      allowPatientTransfers = 1,
      requireTransferApproval = 0,
    } = req.body;

    await db.query(
      `INSERT INTO branch_integration_settings
         (branch_id, share_patient_history, share_inventory_view,
          allow_stock_transfers, allow_patient_transfers, require_transfer_approval)
       VALUES (:bid, :sph, :siv, :ast, :apt, :rta)
       ON DUPLICATE KEY UPDATE
         share_patient_history    = VALUES(share_patient_history),
         share_inventory_view     = VALUES(share_inventory_view),
         allow_stock_transfers    = VALUES(allow_stock_transfers),
         allow_patient_transfers  = VALUES(allow_patient_transfers),
         require_transfer_approval = VALUES(require_transfer_approval)`,
      {
        bid: req.params.id,
        sph: sharePatientHistory ? 1 : 0,
        siv: shareInventoryView  ? 1 : 0,
        ast: allowStockTransfers ? 1 : 0,
        apt: allowPatientTransfers ? 1 : 0,
        rta: requireTransferApproval ? 1 : 0,
      }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── Búsqueda org-wide ────────────────────────────────────────────────────────

// GET /branches/search/patients?q= — buscar pacientes en todo el org
router.get('/search/patients', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q || q.length < 2) return R.badRequest(res, 'q debe tener al menos 2 caracteres');

    const offset = (page - 1) * limit;
    const search = `%${q}%`;

    const rows = await db.query(
      `SELECT p.id, p.name AS patient_name, p.chip_number,
              sp.common_name AS species, b.name AS species,
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
              OR cl.phone LIKE :s OR cl.email LIKE :s)
         AND p.is_active = TRUE
       ORDER BY p.name
       LIMIT :limit OFFSET :offset`,
      { orgId: req.user.orgId, s: search, limit: parseInt(limit), offset: parseInt(offset) }
    );
    return R.ok(res, rows, { query: q });
  } catch (e) { next(e); }
});

// GET /branches/search/clients?q= — buscar clientes en todo el org
router.get('/search/clients', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q || q.length < 2) return R.badRequest(res, 'q debe tener al menos 2 caracteres');

    const offset = (page - 1) * limit;
    const search = `%${q}%`;

    const rows = await db.query(
      `SELECT cl.id, CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
              cl.email, cl.phone, cl.dni,
              b.id AS branch_id, b.name AS branch_name,
              COUNT(DISTINCT po.patient_id) AS patient_count
       FROM clients cl
       JOIN branches b ON cl.branch_id = b.id AND b.organization_id = :orgId
       LEFT JOIN patient_owners po ON po.client_id = cl.id AND po.ownership_type = 'primary'
       WHERE (CONCAT(cl.first_name,' ',cl.last_name) LIKE :s
              OR cl.email LIKE :s OR cl.phone LIKE :s OR cl.dni LIKE :s)
         AND cl.is_active = TRUE
       GROUP BY cl.id ORDER BY client_name
       LIMIT :limit OFFSET :offset`,
      { orgId: req.user.orgId, s: search, limit: parseInt(limit), offset: parseInt(offset) }
    );
    return R.ok(res, rows, { query: q });
  } catch (e) { next(e); }
});

// ─── Historial cross-branch ───────────────────────────────────────────────────

// GET /branches/patients/:id/history — historial completo de un paciente en todo el org
router.get('/patients/:id/history', async (req, res, next) => {
  try {
    // Verificar que el paciente sea del org del usuario
    const patient = await db.queryOne(
      `SELECT p.id, p.name, sp.common_name AS species
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients cl ON po.client_id = cl.id
       JOIN branches b ON cl.branch_id = b.id AND b.organization_id = :orgId
       JOIN species sp ON p.species_id = sp.id
       WHERE p.id = :pid`,
      { pid: req.params.id, orgId: req.user.orgId }
    );
    if (!patient) return R.notFound(res);

    const history = await mb.crossBranchPatientHistory(req.params.id, req.user.orgId);
    return R.ok(res, { patient, ...history });
  } catch (e) { next(e); }
});

// ─── Transferencias de pacientes ──────────────────────────────────────────────

// GET /branches/transfers/patients — lista transferencias del org
router.get('/transfers/patients', async (req, res, next) => {
  try {
    const { status, fromBranch, toBranch, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['bf.organization_id = :orgId'];
    const p      = { orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) };

    if (status)     { conds.push('pt.status = :status');          p.status = status; }
    if (fromBranch) { conds.push('pt.from_branch_id = :from');    p.from   = fromBranch; }
    if (toBranch)   { conds.push('pt.to_branch_id   = :to');      p.to     = toBranch; }

    const rows = await db.query(
      `SELECT pt.*, pat.name AS patient_name, sp.common_name AS species,
              bf.name AS from_branch_name, bt.name AS to_branch_name,
              CONCAT(u.first_name,' ',u.last_name) AS requested_by_name
       FROM patient_transfers pt
       JOIN patients  pat ON pt.patient_id     = pat.id
       JOIN species   sp  ON pat.species_id    = sp.id
       JOIN branches  bf  ON pt.from_branch_id = bf.id
       JOIN branches  bt  ON pt.to_branch_id   = bt.id
       JOIN users     u   ON pt.requested_by   = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY pt.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// POST /branches/transfers/patients — solicitar transferencia de paciente
router.post('/transfers/patients',
  body('patientId').isInt(),
  body('toBranchId').isInt(),
  body('transferType').isIn(['visit', 'ownership']),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, toBranchId, clientId, reason, transferType } = req.body;

      const result = await mb.transferPatient({
        patientId,
        fromBranchId      : req.user.branchId,
        toBranchId,
        clientId          : clientId || null,
        requestedByUserId : req.user.userId,
        reason,
        transferOwnership : transferType === 'ownership',
      });

      // Webhook
      enqueue({
        event  : 'patient.transferred',
        payload: { patientId, fromBranchId: req.user.branchId, toBranchId, transferType },
        orgId  : req.user.orgId,
      }).catch(() => {});

      return R.created(res, result);
    } catch (e) {
      if (['SAME_BRANCH', 'PATIENT_NOT_FOUND', 'CROSS_ORG_DENIED', 'BRANCH_NOT_FOUND'].includes(e.code)) {
        return R.badRequest(res, e.message);
      }
      next(e);
    }
  }
);

// PATCH /branches/transfers/patients/:id — aprobar / rechazar transferencia pendiente
router.patch('/transfers/patients/:id',
  body('status').isIn(['approved', 'rejected', 'cancelled']),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE patient_transfers SET status=:status, approved_by=:uid, updated_at=NOW()
         WHERE id=:id`,
        { status: req.body.status, uid: req.user.userId, id: req.params.id }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// ─── Transferencias de stock ──────────────────────────────────────────────────

// GET /branches/transfers/stock — lista transferencias de inventario del org
router.get('/transfers/stock', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['bf.organization_id = :orgId'];
    const p      = { orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('st.status = :status'); p.status = status; }

    const rows = await db.query(
      `SELECT st.*, ii.name AS item_name,
              bf.name AS from_branch_name, bt.name AS to_branch_name,
              CONCAT(u.first_name,' ',u.last_name) AS requested_by_name
       FROM stock_transfers st
       JOIN inventory_items ii ON st.item_id       = ii.id
       JOIN branches        bf ON st.from_branch_id = bf.id
       JOIN branches        bt ON st.to_branch_id   = bt.id
       JOIN users           u  ON st.requested_by   = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY st.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// POST /branches/transfers/stock — transferir stock entre sucursales
router.post('/transfers/stock',
  body('itemId').isInt(),
  body('toBranchId').isInt(),
  body('quantity').isFloat({ min: 0.001 }),
  validate,
  async (req, res, next) => {
    try {
      const { itemId, toBranchId, quantity, reason, batchId } = req.body;

      const result = await mb.transferStock({
        itemId,
        fromBranchId      : req.user.branchId,
        toBranchId,
        quantity,
        requestedByUserId : req.user.userId,
        reason,
        batchId           : batchId || null,
      });

      return R.created(res, result);
    } catch (e) {
      if (['SAME_BRANCH', 'ITEM_NOT_FOUND', 'INSUFFICIENT_STOCK', 'CROSS_ORG_DENIED'].includes(e.code)) {
        return R.badRequest(res, e.message);
      }
      next(e);
    }
  }
);

// ─── Acceso temporal cross-branch ─────────────────────────────────────────────

// GET /branches/access — lista accesos del usuario actual
router.get('/access', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT cba.*, b.name AS branch_name,
              CONCAT(u.first_name,' ',u.last_name) AS granted_by_name
       FROM cross_branch_access cba
       JOIN branches b ON cba.branch_id = b.id
       JOIN users    u ON cba.granted_by = u.id
       WHERE cba.user_id = :uid AND cba.is_active = TRUE
         AND (cba.valid_until IS NULL OR cba.valid_until > NOW())
       ORDER BY b.name`,
      { uid: req.user.userId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// POST /branches/access — otorgar acceso temporal a un usuario
router.post('/access',
  body('userId').isInt(),
  body('branchId').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { userId, branchId, validUntil, reason } = req.body;

      // Verificar que la sucursal sea del mismo org
      const branch = await db.queryOne(
        'SELECT id FROM branches WHERE id=:id AND organization_id=:orgId',
        { id: branchId, orgId: req.user.orgId }
      );
      if (!branch) return R.notFound(res, 'Sucursal no encontrada en el org');

      const [r] = await db.query(
        `INSERT INTO cross_branch_access (user_id, branch_id, granted_by, valid_until, reason)
         VALUES (:uid, :bid, :gby, :until, :reason)
         ON DUPLICATE KEY UPDATE
           is_active = 1, valid_until = VALUES(valid_until),
           granted_by = VALUES(granted_by), reason = VALUES(reason)`,
        {
          uid   : userId,
          bid   : branchId,
          gby   : req.user.userId,
          until : validUntil || null,
          reason: reason || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// DELETE /branches/access/:id — revocar acceso
router.delete('/access/:id', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE cross_branch_access SET is_active=0 WHERE id=:id`,
      { id: req.params.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── Inventario cross-branch (vista) ─────────────────────────────────────────

// GET /branches/inventory/overview — stock de todos los ítems en todas las sucursales del org
router.get('/inventory/overview', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT ii.name AS item_name, ii.sku,
              b.id AS branch_id, b.name AS branch_name,
              ii.stock_quantity, ii.unit_cost, ii.minimum_stock,
              CASE WHEN ii.stock_quantity <= 0 THEN 'out_of_stock'
                   WHEN ii.stock_quantity <= ii.minimum_stock THEN 'low_stock'
                   ELSE 'ok' END AS stock_status
       FROM inventory_items ii
       JOIN branches b ON ii.branch_id = b.id AND b.organization_id = :orgId
       WHERE b.is_active = TRUE AND ii.is_active = TRUE
       ORDER BY ii.name, b.name`,
      { orgId: req.user.orgId }
    );

    // Pivotear: un ítem con una fila por sucursal
    const map = {};
    for (const row of rows) {
      if (!map[row.item_name]) map[row.item_name] = { item_name: row.item_name, sku: row.sku, branches: [] };
      map[row.item_name].branches.push({
        branch_id   : row.branch_id,
        branch_name : row.branch_name,
        stock       : row.stock_quantity,
        status      : row.stock_status,
      });
    }
    return R.ok(res, Object.values(map));
  } catch (e) { next(e); }
});

module.exports = router;
