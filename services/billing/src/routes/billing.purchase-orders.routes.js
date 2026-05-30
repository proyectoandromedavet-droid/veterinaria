'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, notDeleted, logBillingError } = require('./billing.common');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { status, supplierId, page = 1, limit = 20 } = req.query;
    const VALID_PO_STATUSES = new Set(['draft', 'sent', 'partial', 'received', 'cancelled']);
    if (status && !VALID_PO_STATUSES.has(status)) {
      return R.badRequest(res, 'Estado de orden de compra inválido');
    }
    const offset = (page - 1) * limit;
    const conds = ['po.branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('po.status = :status'); p.status = status; }
    if (supplierId) { conds.push('po.supplier_id = :supplierId'); p.supplierId = supplierId; }

    const rows = await db.query(
      `SELECT po.id, po.po_number, po.status, po.ordered_date, po.expected_date,
              po.received_date, po.total_amount, s.name AS supplier_name, po.created_at
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id AND ${notDeleted('s')}
       WHERE ${conds.join(' AND ')} AND ${notDeleted('po')}
       ORDER BY po.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) {
    logBillingError('GET /purchase-orders', e, { branchId: req.user?.branchId, query: req.query });
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const po = await db.queryOne(
      `SELECT po.*, s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id AND ${notDeleted('s')}
       WHERE po.id = :id AND po.branch_id = :bid AND ${notDeleted('po')}`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!po) return R.notFound(res, 'Orden de compra no encontrada');
    const items = await db.query(
      `SELECT poi.*, ii.name AS item_name, ii.sku
       FROM purchase_order_items poi
       JOIN inventory_items ii ON poi.item_id = ii.id AND ${notDeleted('ii')}
       WHERE poi.purchase_order_id = :pid AND ${notDeleted('poi')}`,
      { pid: po.id }
    );
    return R.ok(res, { ...po, items });
  } catch (e) {
    logBillingError('GET /purchase-orders/:id', e, { purchaseOrderId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

router.post('/',
  body('supplierId').isInt(),
  body('items').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { supplierId, items, orderedDate, expectedDate, notes } = req.body;
      const [{ count }] = await db.query(
        `SELECT COUNT(*)+1 AS count FROM purchase_orders WHERE branch_id=:bid`,
        { bid: req.user.branchId }
      );
      const poNumber = `PO-${String(count).padStart(5, '0')}`;
      const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitCost), 0);

      const r = await db.query(
        `INSERT INTO purchase_orders (branch_id, supplier_id, po_number, status, ordered_date, expected_date, subtotal, total_amount, notes, created_by)
         VALUES (:bid, :sup, :poNum, 'draft', :ordered, :expected, :sub, :total, :notes, :uid)`,
        { bid: req.user.branchId, sup: supplierId, poNum: poNumber, ordered: orderedDate||null, expected: expectedDate||null, sub: subtotal, total: subtotal, notes: notes||null, uid: req.user.userId }
      );

      for (const item of items) {
        await db.query(
          `INSERT INTO purchase_order_items (purchase_order_id, item_id, quantity_ordered, unit_cost, lot_number, expiry_date, notes)
           VALUES (:poid, :iid, :qty, :cost, :lot, :exp, :notes)`,
          { poid: r.insertId, iid: item.itemId, qty: item.quantity, cost: item.unitCost, lot: item.lotNumber||null, exp: item.expiryDate||null, notes: item.notes||null }
        );
      }

      return R.created(res, { id: r.insertId, poNumber });
    } catch (e) {
      logBillingError('POST /purchase-orders', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.patch('/:id/send', async (req, res, next) => {
  try {
    const po = await db.queryOne(
      `SELECT po.*, s.email
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id AND ${notDeleted('s')}
       WHERE po.id = :id AND po.branch_id = :bid AND ${notDeleted('po')}`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!po) return R.notFound(res, 'OC no encontrada');
    if (po.status !== 'draft') return R.conflict(res, `No se puede enviar una OC en estado '${po.status}'`);

    await db.query(
      `UPDATE purchase_orders SET status='sent', ordered_date=COALESCE(ordered_date, CURDATE()), updated_at=NOW() WHERE id=:id`,
      { id: po.id }
    );

    if (po.email) {
      const { send } = require('../../../shared/email');
      send({ to: po.email, subject: `Nueva orden de compra ${po.po_number}`, html: `<p>Se ha emitido la orden de compra <b>${po.po_number}</b>. Por favor confirme recepción.</p>` }).catch(() => {});
    }

    return R.ok(res, { message: 'OC enviada al proveedor' });
  } catch (e) {
    logBillingError('PATCH /purchase-orders/:id/send', e, { purchaseOrderId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

router.post('/:id/receive',
  body('items').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { items } = req.body;
      const po = await db.queryOne(
        `SELECT * FROM purchase_orders
         WHERE id=:id AND branch_id=:bid AND status IN ('sent','partial') AND ${notDeleted('purchase_orders')}`,
        { id: req.params.id, bid: req.user.branchId }
      );
      if (!po) return R.notFound(res, 'OC no encontrada o no está en estado enviada');

      await db.transaction(async (conn) => {
        for (const item of items) {
          const poi = await db.queryOne(
            `SELECT * FROM purchase_order_items WHERE id=:id AND purchase_order_id=:poid`,
            { id: item.poItemId, poid: po.id }
          );
          if (!poi) continue;

          const qtyReceiving = Math.min(item.quantityReceived, poi.quantity_ordered - poi.quantity_received);
          if (qtyReceiving <= 0) continue;

          await conn.execute(
            `UPDATE purchase_order_items SET quantity_received = quantity_received + ?, lot_number=COALESCE(?,lot_number), expiry_date=COALESCE(?,expiry_date) WHERE id=?`,
            [qtyReceiving, item.lotNumber||null, item.expiryDate||null, poi.id]
          );

          const [batchResult] = await conn.execute(
            `INSERT INTO inventory_batches (item_id, branch_id, supplier_id, lot_number, expiry_date, quantity_received, quantity_available, unit_cost, purchase_order_id, created_by)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [poi.item_id, req.user.branchId, po.supplier_id, item.lotNumber||poi.lot_number||'SIN-LOTE', item.expiryDate||poi.expiry_date||null, qtyReceiving, qtyReceiving, poi.unit_cost, po.id, req.user.userId]
          );

          await conn.execute(
            `UPDATE inventory_stock SET quantity_available = quantity_available + ? WHERE item_id=? AND branch_id=?`,
            [qtyReceiving, poi.item_id, req.user.branchId]
          );

          await conn.execute(
            `INSERT INTO inventory_movements (item_id, branch_id, movement_type, quantity, unit_cost, reference, batch_id, created_by)
             VALUES (?,?,'purchase',?,?,?,?,?)`,
            [poi.item_id, req.user.branchId, qtyReceiving, poi.unit_cost, po.po_number, batchResult.insertId, req.user.userId]
          );
        }

        const [pending] = await conn.execute(
          `SELECT COUNT(*) AS c FROM purchase_order_items WHERE purchase_order_id=? AND quantity_received < quantity_ordered`,
          [po.id]
        );
        const newStatus = pending[0].c > 0 ? 'partial' : 'received';
        await conn.execute(
          `UPDATE purchase_orders SET status=?, received_date=COALESCE(received_date, CURDATE()), updated_at=NOW() WHERE id=?`,
          [newStatus, po.id]
        );

        await conn.execute(
          `UPDATE stock_alerts sa
           JOIN purchase_order_items poi ON poi.purchase_order_id=? AND sa.item_id=poi.item_id
           SET sa.resolved=1, sa.resolved_at=NOW()
           WHERE sa.branch_id=? AND sa.resolved=0 AND sa.alert_type IN ('low_stock','out_of_stock')`,
          [po.id, req.user.branchId]
        );
      });

      return R.ok(res, { message: 'Mercadería recibida correctamente' });
    } catch (e) {
      logBillingError('POST /purchase-orders/:id/receive', e, { purchaseOrderId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE purchase_orders SET status='cancelled', updated_at=NOW()
       WHERE id=:id AND branch_id=:bid AND status IN ('draft','sent')`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!result.affectedRows) return R.conflict(res, 'No se puede cancelar esta OC');
    return R.noContent(res);
  } catch (e) {
    logBillingError('PATCH /purchase-orders/:id/cancel', e, { purchaseOrderId: req.params.id, branchId: req.user?.branchId });
    next(e);
  }
});

module.exports = { router };
