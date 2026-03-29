'use strict';

/**
 * shared/multibranch.js
 * Lógica de negocio multi-sucursal:
 *   - Verificar pertenencia al mismo org
 *   - Cálculo de KPIs consolidados
 *   - Helpers de transferencia (pacientes, stock)
 *   - Cross-branch access guard
 */

const db = require('./db');

// ─── Guards de pertenencia ────────────────────────────────────────────────────

/**
 * Verifica que ambas sucursales pertenezcan al mismo org.
 * Lanza error si no.
 */
async function assertSameOrg (branchIdA, branchIdB) {
  const [a, b] = await Promise.all([
    db.queryOne('SELECT organization_id FROM branches WHERE id = :id', { id: branchIdA }),
    db.queryOne('SELECT organization_id FROM branches WHERE id = :id', { id: branchIdB }),
  ]);
  if (!a || !b) throw Object.assign(new Error('Sucursal no encontrada'), { code: 'BRANCH_NOT_FOUND' });
  if (a.organization_id !== b.organization_id) {
    throw Object.assign(new Error('Las sucursales pertenecen a organizaciones distintas'), { code: 'CROSS_ORG_DENIED' });
  }
  return true;
}

/**
 * Verifica que el usuario tenga acceso a la sucursal destino (mismo org).
 */
async function assertBranchAccess (userId, branchId) {
  const row = await db.queryOne(
    `SELECT u.id FROM users u
     JOIN branches b ON b.organization_id = u.organization_id
     WHERE u.id = :uid AND b.id = :bid`,
    { uid: userId, bid: branchId }
  );
  if (!row) throw Object.assign(new Error('Sin acceso a la sucursal'), { code: 'BRANCH_ACCESS_DENIED' });
  return true;
}

/**
 * Devuelve todas las sucursales del org del usuario.
 */
async function getOrgBranches (orgId) {
  return db.query(
    `SELECT id, name, address, phone, timezone, is_active
     FROM branches WHERE organization_id = :orgId ORDER BY name`,
    { orgId }
  );
}

// ─── Transferencia de pacientes ───────────────────────────────────────────────

/**
 * Registra y ejecuta una transferencia de paciente entre sucursales.
 * El paciente mantiene su historial completo — solo cambia el cliente "principal"
 * a la sucursal destino.
 *
 * @param {object} opts
 * @param {number} opts.patientId
 * @param {number} opts.fromBranchId
 * @param {number} opts.toBranchId
 * @param {number} opts.clientId        — cliente en destino (puede ser el mismo o diferente)
 * @param {number} opts.requestedByUserId
 * @param {string} [opts.reason]
 * @param {boolean} [opts.transferOwnership] — si true, mueve la propiedad del cliente
 * @returns {Promise<{ transferId }>}
 */
async function transferPatient (opts) {
  const { patientId, fromBranchId, toBranchId, clientId, requestedByUserId, reason, transferOwnership = false } = opts;

  await assertSameOrg(fromBranchId, toBranchId);

  if (fromBranchId === toBranchId) {
    throw Object.assign(new Error('Origen y destino son la misma sucursal'), { code: 'SAME_BRANCH' });
  }

  // Verificar que el paciente existe en la sucursal origen
  const patient = await db.queryOne(
    `SELECT p.id, p.name
     FROM patients p
     JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
     JOIN clients cl ON po.client_id = cl.id AND cl.branch_id = :bid
     WHERE p.id = :pid`,
    { pid: patientId, bid: fromBranchId }
  );
  if (!patient) throw Object.assign(new Error('Paciente no encontrado en sucursal origen'), { code: 'PATIENT_NOT_FOUND' });

  // Registrar transferencia
  const [r] = await db.query(
    `INSERT INTO patient_transfers
       (patient_id, from_branch_id, to_branch_id, client_id,
        requested_by, reason, status, transfer_type)
     VALUES (:pid, :from, :to, :cid, :uid, :reason, 'completed', :type)`,
    {
      pid    : patientId,
      from   : fromBranchId,
      to     : toBranchId,
      cid    : clientId,
      uid    : requestedByUserId,
      reason : reason || null,
      type   : transferOwnership ? 'ownership' : 'visit',
    }
  );

  if (transferOwnership) {
    // Cambiar el cliente primario del paciente al nuevo cliente (en destino)
    await db.query(
      `UPDATE patient_owners SET client_id = :cid, updated_at = NOW()
       WHERE patient_id = :pid AND ownership_type = 'primary'`,
      { cid: clientId, pid: patientId }
    );
  }

  return { transferId: r.insertId };
}

// ─── Transferencia de stock ───────────────────────────────────────────────────

/**
 * Transfiere unidades de inventario de una sucursal a otra.
 * Descuenta del origen e incrementa en destino.
 *
 * @param {object} opts
 * @returns {Promise<{ transferId }>}
 */
async function transferStock (opts) {
  const { itemId, fromBranchId, toBranchId, quantity, requestedByUserId, reason, batchId } = opts;

  await assertSameOrg(fromBranchId, toBranchId);
  if (fromBranchId === toBranchId) throw Object.assign(new Error('Misma sucursal'), { code: 'SAME_BRANCH' });

  // Verificar stock disponible
  const stock = await db.queryOne(
    `SELECT stock_quantity FROM inventory_items WHERE id = :id AND branch_id = :bid`,
    { id: itemId, bid: fromBranchId }
  );
  if (!stock) throw Object.assign(new Error('Ítem no encontrado en sucursal origen'), { code: 'ITEM_NOT_FOUND' });
  if (stock.stock_quantity < quantity) {
    throw Object.assign(
      new Error(`Stock insuficiente: disponible ${stock.stock_quantity}, solicitado ${quantity}`),
      { code: 'INSUFFICIENT_STOCK' }
    );
  }

  // Registrar transferencia
  const [r] = await db.query(
    `INSERT INTO stock_transfers
       (item_id, from_branch_id, to_branch_id, quantity, batch_id, requested_by, reason, status)
     VALUES (:itemId, :from, :to, :qty, :batch, :uid, :reason, 'completed')`,
    {
      itemId, from: fromBranchId, to: toBranchId,
      qty: quantity, batch: batchId || null,
      uid: requestedByUserId, reason: reason || null,
    }
  );

  // Descontar del origen
  await db.query(
    `UPDATE inventory_items SET stock_quantity = stock_quantity - :qty, updated_at = NOW()
     WHERE id = :id AND branch_id = :from`,
    { qty: quantity, id: itemId, from: fromBranchId }
  );

  // Agregar al destino (upsert)
  await db.query(
    `INSERT INTO inventory_items (branch_id, name, category_id, stock_quantity, unit_cost, sale_price, sku)
     SELECT :toBid, name, category_id, :qty, unit_cost, sale_price, CONCAT(sku, '-TRF', :trid)
     FROM inventory_items WHERE id = :id
     ON DUPLICATE KEY UPDATE stock_quantity = stock_quantity + :qty`,
    { toBid: toBranchId, qty: quantity, trid: r.insertId, id: itemId }
  );

  return { transferId: r.insertId };
}

// ─── KPIs consolidados ────────────────────────────────────────────────────────

/**
 * Calcula KPIs financieros consolidados para todo el org en un período.
 * @param {number} orgId
 * @param {string} from  YYYY-MM-DD
 * @param {string} to    YYYY-MM-DD
 * @returns {Promise<object>}
 */
async function consolidatedFinancials (orgId, from, to) {
  const [revenue, branches, topClients] = await Promise.all([
    // Revenue total por sucursal
    db.query(
      `SELECT b.name AS branch_name, b.id AS branch_id,
              COUNT(DISTINCT i.id) AS invoices,
              ROUND(SUM(i.total_amount), 2) AS gross_revenue,
              ROUND(SUM(i.paid_amount),  2) AS collected,
              ROUND(SUM(i.total_amount - i.paid_amount), 2) AS outstanding
       FROM invoices i
       JOIN branches b ON i.branch_id = b.id
       WHERE b.organization_id = :orgId
         AND i.issued_date BETWEEN :from AND :to
         AND i.status != 'cancelled'
       GROUP BY b.id ORDER BY gross_revenue DESC`,
      { orgId, from, to }
    ),

    // Métricas de pacientes y citas por sucursal
    db.query(
      `SELECT b.id AS branch_id, b.name AS branch_name,
              COUNT(DISTINCT p.id) AS active_patients,
              COUNT(DISTINCT a.id) AS appointments,
              ROUND(SUM(a.status = 'completed') * 100.0 / NULLIF(COUNT(a.id), 0), 2) AS completion_rate
       FROM branches b
       LEFT JOIN clients cl ON cl.branch_id = b.id
       LEFT JOIN patient_owners po ON po.client_id = cl.id AND po.ownership_type = 'primary'
       LEFT JOIN patients p ON po.patient_id = p.id AND p.is_active = TRUE
       LEFT JOIN appointments a ON a.branch_id = b.id AND DATE(a.scheduled_date) BETWEEN :from AND :to
       WHERE b.organization_id = :orgId AND b.is_active = TRUE
       GROUP BY b.id ORDER BY b.name`,
      { orgId, from, to }
    ),

    // Top clientes del org (cross-branch)
    db.query(
      `SELECT CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.email,
              b.name AS primary_branch,
              SUM(i.total_amount) AS total_spent, COUNT(DISTINCT i.id) AS total_invoices,
              COUNT(DISTINCT po.patient_id) AS total_patients
       FROM clients cl
       JOIN branches b ON cl.branch_id = b.id
       JOIN invoices i ON i.client_id = cl.id
       JOIN patient_owners po ON po.client_id = cl.id AND po.ownership_type = 'primary'
       WHERE b.organization_id = :orgId
         AND i.issued_date BETWEEN :from AND :to
         AND i.status != 'cancelled'
       GROUP BY cl.id ORDER BY total_spent DESC LIMIT 10`,
      { orgId, from, to }
    ),
  ]);

  // Totales consolidados
  const totals = revenue.reduce((acc, r) => ({
    invoices    : acc.invoices    + (r.invoices    || 0),
    gross       : acc.gross       + (r.gross_revenue || 0),
    collected   : acc.collected   + (r.collected   || 0),
    outstanding : acc.outstanding + (r.outstanding || 0),
  }), { invoices: 0, gross: 0, collected: 0, outstanding: 0 });

  return { totals, revenueByBranch: revenue, metricsByBranch: branches, topClients };
}

/**
 * Historial completo de un paciente a través de todas las sucursales del org.
 * @param {number} patientId
 * @param {number} orgId   — para seguridad: solo devuelve registros del org correcto
 */
async function crossBranchPatientHistory (patientId, orgId) {
  const [appointments, labs, vaccinations, prescriptions, transfers] = await Promise.all([
    db.query(
      `SELECT a.id, a.scheduled_date, a.status, a.reason,
              b.name AS branch_name, b.id AS branch_id,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              at2.name AS appointment_type,
              mr.id AS record_id, mr.diagnosis AS diagnosis
       FROM appointments a
       JOIN branches b  ON a.branch_id = b.id AND b.organization_id = :orgId
       JOIN users    u  ON a.vet_id = u.id
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       LEFT JOIN medical_records mr ON mr.appointment_id = a.id
       WHERE a.patient_id = :pid
       ORDER BY a.scheduled_date DESC LIMIT 100`,
      { pid: patientId, orgId }
    ),

    db.query(
      `SELECT lo.id, lo.ordered_at, lo.status,
              b.name AS branch_name, b.id AS branch_id,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM lab_orders lo
       JOIN branches b ON lo.branch_id = b.id AND b.organization_id = :orgId
       JOIN users    u ON lo.vet_id = u.id
       WHERE lo.patient_id = :pid ORDER BY lo.ordered_at DESC LIMIT 50`,
      { pid: patientId, orgId }
    ),

    db.query(
      `SELECT v.id, v.vaccination_date, v.vaccine_name, v.batch_number, v.next_due_date,
              b.name AS branch_name, b.id AS branch_id,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM vaccinations v
       JOIN branches b ON v.branch_id = b.id AND b.organization_id = :orgId
       JOIN users    u ON v.vet_id = u.id
       WHERE v.patient_id = :pid ORDER BY v.vaccination_date DESC`,
      { pid: patientId, orgId }
    ),

    db.query(
      `SELECT pr.id, pr.prescribed_at, pr.status,
              b.name AS branch_name, b.id AS branch_id,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM prescriptions pr
       JOIN branches b ON pr.branch_id = b.id AND b.organization_id = :orgId
       JOIN users    u ON pr.vet_id = u.id
       WHERE pr.patient_id = :pid ORDER BY pr.prescribed_at DESC LIMIT 50`,
      { pid: patientId, orgId }
    ),

    db.query(
      `SELECT pt.*, bf.name AS from_branch, bt.name AS to_branch
       FROM patient_transfers pt
       JOIN branches bf ON pt.from_branch_id = bf.id
       JOIN branches bt ON pt.to_branch_id   = bt.id
       WHERE pt.patient_id = :pid ORDER BY pt.created_at DESC`,
      { pid: patientId }
    ),
  ]);

  return { appointments, labs, vaccinations, prescriptions, transfers };
}

module.exports = {
  assertSameOrg,
  assertBranchAccess,
  getOrgBranches,
  transferPatient,
  transferStock,
  consolidatedFinancials,
  crossBranchPatientHistory,
};
