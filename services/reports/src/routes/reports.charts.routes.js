'use strict';

const { Router } = require('express');
const { R, db, dateRange, aggregateDiagnoses } = require('../reports.common');

const router = Router();

router.get('/charts/revenue-trend', async (req, res, next) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;
    const now = new Date();
    const f = from || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t = to || now.toISOString().slice(0, 10);
    const fmt = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%x-W%v' : '%Y-%m';

    const rows = await db.query(
      `SELECT DATE_FORMAT(issued_date,:fmt) AS label,
              ROUND(SUM(total_amount),2) AS gross,
              ROUND(SUM(total_amount - discount_amount),2) AS net,
              ROUND(SUM(paid_amount),2) AS collected
       FROM invoices
       WHERE branch_id=:bid AND issued_date BETWEEN :from AND :to AND status!='cancelled'
       GROUP BY label ORDER BY label ASC`,
      { fmt, bid: req.user.branchId, from: f, to: t }
    );

    return R.ok(res, {
      labels: rows.map((r) => r.label),
      datasets: [
        { id: 'gross', label: 'Ingreso Bruto', data: rows.map((r) => r.gross) },
        { id: 'net', label: 'Ingreso Neto', data: rows.map((r) => r.net) },
        { id: 'collected', label: 'Cobrado', data: rows.map((r) => r.collected) },
      ],
    });
  } catch (e) { next(e); }
});

router.get('/charts/appointments-heatmap', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const f = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const t = to || now.toISOString().slice(0, 10);

    const rows = await db.query(
      `SELECT DAYOFWEEK(scheduled_date) AS dow,
              HOUR(scheduled_date)       AS hour,
              COUNT(*) AS count
       FROM appointments
       WHERE branch_id=:bid AND DATE(scheduled_date) BETWEEN :from AND :to
       GROUP BY dow, hour ORDER BY dow, hour`,
      { bid: req.user.branchId, from: f, to: t }
    );

    const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return R.ok(res, {
      data: rows.map((r) => ({ day: DAYS[r.dow - 1] || String(r.dow), hour: r.hour, count: r.count })),
    });
  } catch (e) { next(e); }
});

router.get('/charts/species-distribution', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT sp.common_name AS species, COUNT(p.id) AS count,
              ROUND(COUNT(p.id)*100.0/SUM(COUNT(p.id)) OVER(),2) AS pct
       FROM patients p
       JOIN patient_owners po ON po.patient_id=p.id AND po.ownership_type='primary'
       JOIN clients cl ON po.client_id=cl.id AND cl.branch_id=:bid
       JOIN species sp ON p.species_id=sp.id
       WHERE p.is_active=TRUE AND p.is_deceased=FALSE
       GROUP BY sp.common_name ORDER BY count DESC`,
      { bid: req.user.branchId }
    );
    return R.ok(res, {
      labels: rows.map((r) => r.species),
      values: rows.map((r) => r.count),
      percents: rows.map((r) => r.pct),
    });
  } catch (e) { next(e); }
});

router.get('/charts/top-diagnoses-bar', async (req, res, next) => {
  try {
    const { from, to, limit = 10 } = req.query;
    const now = new Date();
    const f = from || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t = to || now.toISOString().slice(0, 10);

    const rows = await db.query(
      `SELECT d.diagnosis_name, sp.common_name AS species
       FROM diagnoses d
       JOIN medical_records mr ON d.medical_record_id=mr.id
       JOIN appointments a ON mr.appointment_id=a.id AND a.branch_id=:bid
       JOIN patients p ON mr.patient_id = p.id
       JOIN species sp ON p.species_id = sp.id
       WHERE DATE(d.created_at) BETWEEN :from AND :to AND d.is_primary=TRUE
       ORDER BY d.created_at DESC`,
      { bid: req.user.branchId, from: f, to: t }
    );
    const grouped = aggregateDiagnoses(rows, parseInt(limit, 10));
    return R.ok(res, { labels: grouped.map((r) => r.diagnosis_name), values: grouped.map((r) => r.frequency) });
  } catch (e) { next(e); }
});

router.get('/charts/payment-methods', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const f = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const t = to || now.toISOString().slice(0, 10);

    const rows = await db.query(
      `SELECT pm.name AS method, COUNT(p.id) AS transactions, ROUND(SUM(p.amount),2) AS total,
              ROUND(SUM(p.amount)*100.0/SUM(SUM(p.amount)) OVER(),2) AS pct
       FROM payments p
       JOIN payment_methods pm ON p.payment_method_id=pm.id
       JOIN invoices i ON p.invoice_id=i.id AND i.branch_id=:bid
       WHERE DATE(p.payment_date) BETWEEN :from AND :to
       GROUP BY pm.name ORDER BY total DESC`,
      { bid: req.user.branchId, from: f, to: t }
    );
    return R.ok(res, { labels: rows.map((r) => r.method), values: rows.map((r) => r.total), percents: rows.map((r) => r.pct), transactions: rows.map((r) => r.transactions) });
  } catch (e) { next(e); }
});

module.exports = router;
