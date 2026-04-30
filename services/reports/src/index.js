'use strict';

require('dotenv').config();

const { Router }   = require('express');
const path = require('path');
const { buildApp, startService } = require('../../../shared/serviceBase');
const db           = require('../../../shared/db');
const R            = require('../../../shared/response');
const { toExcel, toCsv } = require('../../../shared/export');
const { consolidatedFinancials } = require('../../../shared/multibranch');
const {
  generateRevenuePdf,
  generateAppointmentsReportPdf,
  generateDiagnosesReportPdf,
} = require('../../../shared/pdf');
const { sendReportEmail } = require('../../../shared/email');

// ── Helper: calcular próxima ejecución ────────────────────────────────────────
function calcNextRun (frequency, dayOfWeek, dayOfMonth) {
  const now  = new Date();
  const next = new Date(now);

  if (frequency === 'daily') {
    next.setDate(now.getDate() + 1);
    next.setHours(7, 0, 0, 0);
  } else if (frequency === 'weekly') {
    const dow = dayOfWeek != null ? dayOfWeek : 1;   // default lunes
    const diff = (dow - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + diff);
    next.setHours(7, 0, 0, 0);
  } else if (frequency === 'monthly') {
    const dom = dayOfMonth || 1;
    next.setMonth(now.getMonth() + (now.getDate() >= dom ? 1 : 0));
    next.setDate(dom);
    next.setHours(7, 0, 0, 0);
  } else if (frequency === 'quarterly') {
    const dom = dayOfMonth || 1;
    next.setMonth(now.getMonth() + 3);
    next.setDate(dom);
    next.setHours(7, 0, 0, 0);
  }

  return next.toISOString().slice(0, 19).replace('T', ' ');
}

const router = Router();

// ── Helper: parse date range query params ─────────────────────────────────────
function dateRange(query) {
  const now  = new Date();
  const from = query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to   = query.to   || now.toISOString().slice(0, 10);
  return { from, to };
}

function isSchemaError(err) {
  return ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_SP_DOES_NOT_EXIST'].includes(err?.code)
    || /Unknown column|doesn't exist|does not exist/i.test(err?.message || '');
}

async function safeQuery(sql, params, fallback = []) {
  try {
    return await db.queryRead(sql, params);
  } catch (err) {
    if (isSchemaError(err)) return fallback;
    throw err;
  }
}

async function getBranchDashboard(branchId, from, to) {
  const [patients, appointments, revenue, payments] = await Promise.all([
    db.queryRead(
      `SELECT COUNT(DISTINCT p.id) AS total_patients,
              COUNT(DISTINCT CASE WHEN DATE(p.created_at) BETWEEN :from AND :to THEN p.id END) AS new_patients
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients cl ON cl.id = po.client_id AND cl.branch_id = :bid`,
      { bid: branchId, from, to }
    ),
    db.queryRead(
      `SELECT COUNT(*) AS total_appointments,
              SUM(status = 'completed') AS completed_appointments,
              SUM(status = 'cancelled') AS cancelled_appointments,
              SUM(status = 'no_show') AS no_show_appointments,
              ROUND(AVG(duration_minutes), 1) AS avg_duration_minutes
       FROM appointments
       WHERE branch_id = :bid AND DATE(scheduled_date) BETWEEN :from AND :to`,
      { bid: branchId, from, to }
    ),
    db.queryRead(
      `SELECT COUNT(*) AS total_invoices,
              ROUND(COALESCE(SUM(total_amount), 0), 2) AS gross_revenue,
              ROUND(COALESCE(SUM(paid_amount), 0), 2) AS collected_revenue,
              ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS outstanding_revenue
       FROM invoices
       WHERE branch_id = :bid
         AND issued_date BETWEEN :from AND :to
         AND status != 'cancelled'`,
      { bid: branchId, from, to }
    ),
    safeQuery(
      `SELECT COUNT(*) AS total_payments,
              ROUND(COALESCE(SUM(amount), 0), 2) AS paid_amount
       FROM payments
       WHERE branch_id = :bid
         AND DATE(payment_date) BETWEEN :from AND :to
         AND COALESCE(payment_status, 'completed') != 'cancelled'`,
      { bid: branchId, from, to },
      [{ total_payments: 0, paid_amount: 0 }]
    ),
  ]);

  return {
    from,
    to,
    totalPatients: patients[0]?.total_patients || 0,
    newPatients: patients[0]?.new_patients || 0,
    totalAppointments: appointments[0]?.total_appointments || 0,
    completedAppointments: appointments[0]?.completed_appointments || 0,
    cancelledAppointments: appointments[0]?.cancelled_appointments || 0,
    noShowAppointments: appointments[0]?.no_show_appointments || 0,
    avgDurationMinutes: appointments[0]?.avg_duration_minutes || 0,
    totalInvoices: revenue[0]?.total_invoices || 0,
    grossRevenue: revenue[0]?.gross_revenue || 0,
    collectedRevenue: revenue[0]?.collected_revenue || 0,
    outstandingRevenue: revenue[0]?.outstanding_revenue || 0,
    totalPayments: payments[0]?.total_payments || 0,
    paidAmount: payments[0]?.paid_amount || 0,
  };
}

// ── GET /reports/dashboard  (KPIs diarios de sucursal) ───────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const summary = await getBranchDashboard(req.user.branchId, today, today);
    return R.ok(res, summary);
  } catch (e) { next(e); }
});

// ── GET /reports/kpis  (view v_branch_daily_kpis) ────────────────────────────
router.get('/kpis', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const summary = await getBranchDashboard(req.user.branchId, from, to);
    return R.ok(res, summary);
  } catch (e) { next(e); }
});

// ── GET /reports/revenue  (ingresos por período) ──────────────────────────────
router.get('/revenue', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const { groupBy = 'day' } = req.query;

    const fmt = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%x-W%v' : '%Y-%m-%d';
    const rows = await db.query(
      `SELECT DATE_FORMAT(i.issued_date, :fmt) AS period,
              COUNT(DISTINCT i.id) AS invoices,
              SUM(i.total_amount) AS gross_revenue,
              SUM(i.discount_amount) AS discounts,
              SUM(i.tax_amount) AS taxes,
              SUM(i.total_amount - i.discount_amount) AS net_revenue,
              SUM(i.paid_amount) AS collected,
              SUM(i.total_amount - i.paid_amount) AS outstanding,
              cur.code AS currency
       FROM invoices i
       JOIN currencies cur ON i.currency_id = cur.id
       WHERE i.branch_id = :bid
         AND i.issued_date BETWEEN :from AND :to
         AND i.status != 'cancelled'
       GROUP BY period, cur.code
       ORDER BY period ASC`,
      { fmt, bid: req.user.branchId, from, to }
    );
    return R.ok(res, rows, { from, to, groupBy });
  } catch (e) { next(e); }
});

// ── GET /reports/revenue-by-service  (mix de servicios) ──────────────────────
router.get('/revenue-by-service', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const rows = await db.query(
      `SELECT sc.name AS category,
              COUNT(ii.id) AS line_items,
              SUM(ii.total_price) AS revenue,
              ROUND(SUM(ii.total_price) * 100.0 / SUM(SUM(ii.total_price)) OVER (), 2) AS pct
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_id = i.id
       LEFT JOIN services_catalog svc ON ii.service_id = svc.id
       LEFT JOIN service_categories sc ON svc.category_id = sc.id
       WHERE i.branch_id = :bid
         AND i.issued_date BETWEEN :from AND :to
         AND i.status != 'cancelled'
       GROUP BY sc.name ORDER BY revenue DESC`,
      { bid: req.user.branchId, from, to }
    );
    return R.ok(res, rows, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/top-clients ──────────────────────────────────────────────────
router.get('/top-clients', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const limit = parseInt(req.query.limit || '20');
    const rows = await db.query(
      `SELECT CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
              cl.email, cl.phone,
              COUNT(DISTINCT i.id) AS total_invoices,
              SUM(i.total_amount) AS total_spent,
              SUM(i.paid_amount) AS total_paid,
              COUNT(DISTINCT a.id) AS total_appointments,
              COUNT(DISTINCT p.id) AS total_patients
       FROM clients cl
       JOIN invoices i ON i.client_id = cl.id
       LEFT JOIN appointments a ON a.branch_id = cl.branch_id
       LEFT JOIN patient_owners po ON po.client_id = cl.id AND po.ownership_type = 'primary'
       LEFT JOIN patients p ON po.patient_id = p.id
       WHERE cl.branch_id = :bid
         AND i.issued_date BETWEEN :from AND :to
         AND i.status != 'cancelled'
       GROUP BY cl.id ORDER BY total_spent DESC
       LIMIT :limit`,
      { bid: req.user.branchId, from, to, limit }
    );
    return R.ok(res, rows, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/appointments  (funnel de turnos) ─────────────────────────────
router.get('/appointments', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const rows = await db.query(
      `SELECT
         COUNT(*) AS total_scheduled,
         SUM(status = 'completed')   AS completed,
         SUM(status = 'cancelled')   AS cancelled,
         SUM(status = 'no_show')     AS no_show,
         SUM(status = 'in_progress') AS in_progress,
         ROUND(SUM(status='completed')*100.0/COUNT(*),2) AS completion_rate,
         ROUND(SUM(status='no_show')*100.0/COUNT(*),2) AS no_show_rate,
         ROUND(AVG(duration_minutes),1) AS avg_duration_minutes
       FROM appointments
       WHERE branch_id = :bid
         AND DATE(scheduled_date) BETWEEN :from AND :to`,
      { bid: req.user.branchId, from, to }
    );

    const byType = await db.query(
      `SELECT at2.name AS type, COUNT(*) AS count, ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),2) AS pct
       FROM appointments a
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       WHERE a.branch_id=:bid AND DATE(a.scheduled_date) BETWEEN :from AND :to
       GROUP BY at2.name ORDER BY count DESC`,
      { bid: req.user.branchId, from, to }
    );
    return R.ok(res, { summary: rows[0], byType }, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/new-patients  (adquisición) ─────────────────────────────────
router.get('/new-patients', async (req, res, next) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;
    const f = from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
    const t = to || new Date().toISOString().slice(0,10);
    const fmt = groupBy === 'week' ? '%x-W%v' : '%Y-%m';

    const rows = await db.query(
      `SELECT DATE_FORMAT(p.created_at, :fmt) AS period,
              COUNT(*) AS new_patients,
              sp.common_name AS species, COUNT(*) AS species_count
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type='primary'
       JOIN clients cl ON po.client_id = cl.id AND cl.branch_id = :bid
       JOIN species sp ON p.species_id = sp.id
       WHERE p.created_at BETWEEN :from AND :to
       GROUP BY period, sp.common_name ORDER BY period, species_count DESC`,
      { fmt, bid: req.user.branchId, from: f, to: t }
    );
    return R.ok(res, rows, { from: f, to: t, groupBy });
  } catch (e) { next(e); }
});

// ── GET /reports/diagnoses  (diagnósticos más frecuentes) ────────────────────
router.get('/diagnoses', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const limit = parseInt(req.query.limit || '20');
    const rows  = await db.query(
      `SELECT d.diagnosis_name, d.diagnosis_code, d.diagnosis_type,
              sp.common_name AS species,
              COUNT(*) AS frequency,
              ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),2) AS pct
       FROM diagnoses d
       JOIN medical_records mr ON d.medical_record_id = mr.id
       JOIN appointments a ON mr.appointment_id = a.id AND a.branch_id = :bid
       JOIN patients p ON mr.patient_id = p.id
       JOIN species sp ON p.species_id = sp.id
       WHERE DATE(d.created_at) BETWEEN :from AND :to
         AND d.is_primary = TRUE
       GROUP BY d.diagnosis_name, sp.common_name
       ORDER BY frequency DESC LIMIT :limit`,
      { bid: req.user.branchId, from, to, limit }
    );
    return R.ok(res, rows, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/vaccination-compliance ──────────────────────────────────────
router.get('/vaccination-compliance', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT
         COUNT(DISTINCT p.id) AS total_active_patients,
         SUM(CASE WHEN last_vac.vaccination_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR) THEN 1 ELSE 0 END) AS vaccinated_last_year,
         SUM(CASE WHEN last_vac.vaccination_date < DATE_SUB(NOW(), INTERVAL 1 YEAR)
                    OR last_vac.vaccination_date IS NULL THEN 1 ELSE 0 END) AS not_vaccinated,
         ROUND(SUM(CASE WHEN last_vac.vaccination_date >= DATE_SUB(NOW(), INTERVAL 1 YEAR) THEN 1 ELSE 0 END)
               * 100.0 / COUNT(DISTINCT p.id), 2) AS compliance_rate
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type='primary'
       JOIN clients cl ON po.client_id = cl.id AND cl.branch_id = :bid
       LEFT JOIN (
         SELECT patient_id, MAX(vaccination_date) AS vaccination_date
         FROM vaccinations WHERE branch_id = :bid GROUP BY patient_id
       ) last_vac ON last_vac.patient_id = p.id
       WHERE p.is_active = TRUE AND p.is_deceased = FALSE`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows[0]);
  } catch (e) { next(e); }
});

// ── GET /reports/hospitalization-occupancy ───────────────────────────────────
router.get('/hospitalization-occupancy', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const [current, historical] = await Promise.all([
      db.query(
        `SELECT w.name AS ward, k.kennel_type, k.size_category,
                COUNT(k.id) AS total_kennels,
                SUM(CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END) AS occupied,
                ROUND(SUM(CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END)*100.0/COUNT(k.id),2) AS occupancy_pct
         FROM wards w
         JOIN kennels k ON k.ward_id = w.id
         LEFT JOIN hospitalizations h ON h.kennel_id = k.id AND h.discharge_date IS NULL
         WHERE w.branch_id = :bid AND k.is_active = TRUE
         GROUP BY w.id, k.kennel_type, k.size_category ORDER BY w.name`,
        { bid: req.user.branchId }
      ),
      db.query(
        `SELECT DATE_FORMAT(admission_date,'%Y-%m') AS month,
                COUNT(*) AS admissions,
                ROUND(AVG(DATEDIFF(COALESCE(discharge_date,NOW()),admission_date)),1) AS avg_stay_days
         FROM hospitalizations
         WHERE branch_id=:bid AND admission_date BETWEEN :from AND :to
         GROUP BY month ORDER BY month ASC`,
        { bid: req.user.branchId, from, to }
      ),
    ]);
    return R.ok(res, { current, historical }, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/lab-turnaround ───────────────────────────────────────────────
router.get('/lab-turnaround', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const rows = await db.query(
      `SELECT ltc.name AS category,
              COUNT(lo.id) AS total_orders,
              ROUND(AVG(TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.reported_at)),1) AS avg_hours,
              MIN(TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.reported_at)) AS min_hours,
              MAX(TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.reported_at)) AS max_hours,
              SUM(CASE WHEN TIMESTAMPDIFF(HOUR,lo.ordered_at,lo.reported_at) > lt.turnaround_hours THEN 1 ELSE 0 END) AS overdue_count
       FROM lab_orders lo
       JOIN lab_order_items loi ON loi.lab_order_id = lo.id
       JOIN lab_tests lt ON loi.lab_test_id = lt.id
       JOIN lab_test_categories ltc ON lt.category_id = ltc.id
       WHERE lo.branch_id = :bid
         AND lo.status = 'completed'
         AND lo.reported_at IS NOT NULL
         AND DATE(lo.ordered_at) BETWEEN :from AND :to
       GROUP BY ltc.name ORDER BY avg_hours DESC`,
      { bid: req.user.branchId, from, to }
    );
    return R.ok(res, rows, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/telemedicine ─────────────────────────────────────────────────
router.get('/telemedicine', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const [summary, byType] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS total_sessions,
                SUM(status='completed') AS completed,
                SUM(status='cancelled') AS cancelled,
                SUM(status='no_show')   AS no_show,
                ROUND(AVG(CASE WHEN status='completed' THEN duration_minutes END),1) AS avg_duration,
                ROUND(AVG(tr.overall_score),2) AS avg_rating
         FROM tele_sessions ts
         LEFT JOIN tele_ratings tr ON tr.session_id = ts.id
         WHERE ts.branch_id=:bid AND DATE(ts.scheduled_at) BETWEEN :from AND :to`,
        { bid: req.user.branchId, from, to }
      ),
      db.query(
        `SELECT session_type, COUNT(*) AS count,
                ROUND(AVG(tr.overall_score),2) AS avg_rating
         FROM tele_sessions ts
         LEFT JOIN tele_ratings tr ON tr.session_id = ts.id
         WHERE ts.branch_id=:bid AND DATE(ts.scheduled_at) BETWEEN :from AND :to
         GROUP BY session_type ORDER BY count DESC`,
        { bid: req.user.branchId, from, to }
      ),
    ]);
    return R.ok(res, { summary: summary[0], byType }, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/grooming ─────────────────────────────────────────────────────
router.get('/grooming', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const rows = await db.query(
      `SELECT CONCAT(u.first_name,' ',u.last_name) AS groomer_name,
              COUNT(ga.id) AS appointments,
              SUM(ga.final_price) AS revenue,
              ROUND(AVG(gr2.overall_score),2) AS avg_rating,
              SUM(CASE WHEN ga.status='completed' THEN 1 ELSE 0 END) AS completed,
              SUM(CASE WHEN ga.status='no_show'   THEN 1 ELSE 0 END) AS no_shows
       FROM grooming_appointments ga
       JOIN groomers g ON ga.groomer_id = g.id
       JOIN users    u ON g.user_id     = u.id
       LEFT JOIN grooming_ratings gr2 ON gr2.grooming_appointment_id = ga.id
       WHERE ga.branch_id=:bid AND DATE(ga.scheduled_at) BETWEEN :from AND :to
       GROUP BY g.id ORDER BY revenue DESC`,
      { bid: req.user.branchId, from, to }
    );
    return R.ok(res, rows, { from, to });
  } catch (e) { next(e); }
});

// ── GET /reports/security  (admin only) ──────────────────────────────────────
router.get('/security', async (req, res, next) => {
  try {
    const [failures, sessions, alerts] = await Promise.all([
      safeQuery(
        `SELECT lh.id, lh.ip_address, lh.user_agent, lh.failure_reason, lh.created_at,
                u.id AS user_id, u.email, u.first_name, u.last_name, u.branch_id
         FROM login_history lh
         LEFT JOIN users u ON u.id = lh.user_id
         WHERE lh.success = 0
           AND lh.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
           AND (u.branch_id = :bid OR lh.user_id IS NULL)
         ORDER BY lh.created_at DESC
         LIMIT 50`,
        { bid: req.user.branchId },
        []
      ),
      safeQuery(
        `SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.device_type,
                s.created_at, s.last_activity_at, s.expires_at,
                u.email, u.first_name, u.last_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE u.branch_id = :bid
           AND s.is_revoked = FALSE
           AND s.expires_at > NOW()
         ORDER BY s.last_activity_at DESC
         LIMIT 100`,
        { bid: req.user.branchId },
        []
      ),
      safeQuery(
        `SELECT * FROM security_alerts
         WHERE (branch_id = :bid OR org_id = :orgId)
           AND COALESCE(is_resolved, resolved, 0) = FALSE
         ORDER BY created_at DESC
         LIMIT 50`,
        { bid: req.user.branchId, orgId: req.user.orgId },
        []
      ),
    ]);
    return R.ok(res, { loginFailures: failures, activeSessions: sessions, unresolvedAlerts: alerts });
  } catch (e) { next(e); }
});

// ── GET /reports/executive  (sp_executive_dashboard) ─────────────────────────
router.get('/executive', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const financials = await consolidatedFinancials(req.user.orgId, from, to);
    const [topDiagnoses, occupancy] = await Promise.all([
      safeQuery(
        `SELECT d.diagnosis_name, COUNT(*) AS frequency
         FROM diagnoses d
         JOIN medical_records mr ON d.medical_record_id = mr.id
         JOIN appointments a ON mr.appointment_id = a.id
         JOIN branches b ON b.id = a.branch_id
         WHERE b.organization_id = :orgId
           AND DATE(d.created_at) BETWEEN :from AND :to
           AND d.is_primary = TRUE
         GROUP BY d.diagnosis_name
         ORDER BY frequency DESC
         LIMIT 10`,
        { orgId: req.user.orgId, from, to },
        []
      ),
      safeQuery(
        `SELECT b.id AS branch_id, b.name AS branch_name,
                COUNT(DISTINCT k.id) AS total_kennels,
                SUM(CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END) AS occupied_kennels,
                ROUND(SUM(CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(DISTINCT k.id), 0), 2) AS occupancy_pct
         FROM branches b
         LEFT JOIN wards w ON w.branch_id = b.id
         LEFT JOIN kennels k ON k.ward_id = w.id AND k.is_active = TRUE
         LEFT JOIN hospitalizations h ON h.kennel_id = k.id AND h.discharge_date IS NULL
         WHERE b.organization_id = :orgId
         GROUP BY b.id, b.name
         ORDER BY b.name`,
        { orgId: req.user.orgId },
        []
      ),
    ]);
    const summary = {
      from,
      to,
      ...financials.totals,
      branches: financials.metricsByBranch.length,
      totalActivePatients: financials.metricsByBranch.reduce((acc, row) => acc + (row.active_patients || 0), 0),
      totalAppointments: financials.metricsByBranch.reduce((acc, row) => acc + (row.appointments || 0), 0),
      averageCompletionRate: financials.metricsByBranch.length
        ? Number((financials.metricsByBranch.reduce((acc, row) => acc + (row.completion_rate || 0), 0) / financials.metricsByBranch.length).toFixed(2))
        : 0,
    };
    return R.ok(res, {
      summary,
      revenueByBranch: financials.revenueByBranch,
      topDiagnoses,
      occupancy,
      topClients: financials.topClients,
      metricsByBranch: financials.metricsByBranch,
    });
  } catch (e) { next(e); }
});

// ─── Exportación (PDF / Excel / CSV) ─────────────────────────────────────────

/**
 * Helper interno: obtiene datos de un tipo de reporte.
 */
async function fetchReportData (type, branchId, orgId, params = {}) {
  const { from, to, groupBy = 'month', limit = 20 } = params;
  const now  = new Date();
  const f    = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const t    = to   || now.toISOString().slice(0, 10);
  const fmt  = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%x-W%v' : '%Y-%m';

  switch (type) {
    case 'revenue':
      return db.query(
        `SELECT DATE_FORMAT(i.issued_date,:fmt) AS period,
                COUNT(DISTINCT i.id) AS invoices,
                SUM(i.total_amount) AS gross_revenue,
                SUM(i.total_amount - i.discount_amount) AS net_revenue,
                SUM(i.paid_amount) AS collected,
                SUM(i.total_amount - i.paid_amount) AS outstanding
         FROM invoices i
         WHERE i.branch_id=:bid AND i.issued_date BETWEEN :from AND :to AND i.status!='cancelled'
         GROUP BY period ORDER BY period ASC`,
        { fmt, bid: branchId, from: f, to: t }
      );

    case 'appointments': {
      const [summary, byType] = await Promise.all([
        db.query(
          `SELECT COUNT(*) AS total_scheduled,
                  SUM(status='completed') AS completed, SUM(status='cancelled') AS cancelled,
                  SUM(status='no_show') AS no_show,
                  ROUND(SUM(status='completed')*100.0/COUNT(*),2) AS completion_rate,
                  ROUND(SUM(status='no_show')*100.0/COUNT(*),2) AS no_show_rate
           FROM appointments WHERE branch_id=:bid AND DATE(scheduled_date) BETWEEN :from AND :to`,
          { bid: branchId, from: f, to: t }
        ),
        db.query(
          `SELECT at2.name AS type, COUNT(*) AS count, ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),2) AS pct
           FROM appointments a LEFT JOIN appointment_types at2 ON a.appointment_type_id=at2.id
           WHERE a.branch_id=:bid AND DATE(a.scheduled_date) BETWEEN :from AND :to
           GROUP BY at2.name ORDER BY count DESC`,
          { bid: branchId, from: f, to: t }
        ),
      ]);
      return { summary: summary[0], byType, _meta: { from: f, to: t } };
    }

    case 'diagnoses':
      return db.query(
        `SELECT d.diagnosis_name, d.diagnosis_code, sp.common_name AS species,
                COUNT(*) AS frequency, ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(),2) AS pct
         FROM diagnoses d
         JOIN medical_records mr ON d.medical_record_id=mr.id
         JOIN appointments a ON mr.appointment_id=a.id AND a.branch_id=:bid
         JOIN patients p ON mr.patient_id=p.id
         JOIN species sp ON p.species_id=sp.id
         WHERE DATE(d.created_at) BETWEEN :from AND :to AND d.is_primary=TRUE
         GROUP BY d.diagnosis_name, sp.common_name ORDER BY frequency DESC LIMIT :limit`,
        { bid: branchId, from: f, to: t, limit: parseInt(limit) }
      );

    default:
      throw Object.assign(new Error(`Tipo de reporte desconocido: ${type}`), { code: 'UNKNOWN_REPORT' });
  }
}

// POST /reports/:type/export  — descarga PDF, Excel o CSV
router.post('/:type/export', async (req, res, next) => {
  try {
    const { type } = req.params;
    const format   = req.body.format || req.query.format || 'excel';
    const params   = { ...req.query, ...req.body };

    const data   = await fetchReportData(type, req.user.branchId, req.user.orgId, params);
    const from   = params.from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const to     = params.to   || new Date().toISOString().slice(0,10);
    const meta   = { from, to, branch: req.user.branchName, generatedBy: req.user.email };

    if (format === 'pdf') {
      let pdfBuf;
      if      (type === 'revenue')      pdfBuf = await generateRevenuePdf({ rows: data, meta });
      else if (type === 'appointments') pdfBuf = await generateAppointmentsReportPdf({ ...data, meta });
      else if (type === 'diagnoses')    pdfBuf = await generateDiagnosesReportPdf({ rows: data, meta });
      else return R.badRequest(res, `PDF no disponible para tipo: ${type}`);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-${type}-${from}-${to}.pdf"`);
      return res.send(pdfBuf);
    }

    // Definir columnas por tipo
    const COLS = {
      revenue: [
        { key: 'period',        header: 'Período',       type: 'string'   },
        { key: 'invoices',      header: 'Facturas',      type: 'number'   },
        { key: 'gross_revenue', header: 'Ingreso Bruto', type: 'currency' },
        { key: 'net_revenue',   header: 'Ingreso Neto',  type: 'currency' },
        { key: 'collected',     header: 'Cobrado',       type: 'currency' },
        { key: 'outstanding',   header: 'Pendiente',     type: 'currency' },
      ],
      diagnoses: [
        { key: 'diagnosis_name', header: 'Diagnóstico', type: 'string' },
        { key: 'diagnosis_code', header: 'Código',      type: 'string' },
        { key: 'species',        header: 'Especie',     type: 'string' },
        { key: 'frequency',      header: 'Frecuencia',  type: 'number' },
        { key: 'pct',            header: '% Total',     type: 'percent' },
      ],
    };

    const rows    = Array.isArray(data) ? data : (data.byType || []);
    const columns = COLS[type] || Object.keys(rows[0] || {}).map(k => ({ key: k, header: k }));
    const title   = `Reporte ${type} — ${from} a ${to}`;

    if (format === 'excel') {
      const buf = await toExcel({ title, columns, rows, meta });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-${type}-${from}-${to}.xlsx"`);
      return res.send(buf);
    }

    if (format === 'csv') {
      const csv = toCsv({ columns, rows });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reporte-${type}-${from}-${to}.csv"`);
      return res.send(csv);
    }

    return R.badRequest(res, `Formato no soportado: ${format}. Usar: pdf, excel, csv`);
  } catch (e) {
    if (e.code === 'UNKNOWN_REPORT') return R.badRequest(res, e.message);
    next(e);
  }
});

// ─── Reportes programados ─────────────────────────────────────────────────────

const scheduledRouter = Router();

// GET /reports/scheduled
scheduledRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT sr.*, b.name AS branch_name,
              CONCAT(u.first_name,' ',u.last_name) AS created_by_name,
              (SELECT COUNT(*) FROM report_runs rr WHERE rr.scheduled_report_id = sr.id) AS total_runs,
              (SELECT MAX(started_at) FROM report_runs rr WHERE rr.scheduled_report_id = sr.id AND rr.status='completed') AS last_success
       FROM scheduled_reports sr
       LEFT JOIN branches b ON sr.branch_id = b.id
       LEFT JOIN users    u ON sr.created_by = u.id
       WHERE sr.org_id = :orgId
       ORDER BY sr.name ASC`,
      { orgId: req.user.orgId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /reports/scheduled/:id
scheduledRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await db.queryOne(
      `SELECT sr.*, b.name AS branch_name
       FROM scheduled_reports sr LEFT JOIN branches b ON sr.branch_id=b.id
       WHERE sr.id=:id AND sr.org_id=:orgId`,
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!row) return R.notFound(res);

    const runs = await db.query(
      `SELECT id, status, format, file_size_bytes, started_at, finished_at, error_message
       FROM report_runs WHERE scheduled_report_id=:id ORDER BY created_at DESC LIMIT 10`,
      { id: req.params.id }
    );
    return R.ok(res, { ...row, recent_runs: runs });
  } catch (e) { next(e); }
});

// POST /reports/scheduled
scheduledRouter.post('/', async (req, res, next) => {
  try {
    const {
      name, reportType, frequency, dayOfWeek, dayOfMonth,
      format = 'excel', recipients, params: rparams, branchId,
    } = req.body;

    if (!name || !reportType || !frequency || !recipients?.length) {
      return R.badRequest(res, 'name, reportType, frequency y recipients son requeridos');
    }

    const nextRun = calcNextRun(frequency, dayOfWeek, dayOfMonth);

    const [r] = await db.query(
      `INSERT INTO scheduled_reports
         (org_id, branch_id, name, report_type, frequency, day_of_week, day_of_month,
          format, recipients, params, next_run_at, created_by)
       VALUES (:orgId, :bid, :name, :type, :freq, :dow, :dom, :fmt, :recip, :params, :next, :uid)`,
      {
        orgId: req.user.orgId,
        bid  : branchId || req.user.branchId,
        name, type: reportType, freq: frequency,
        dow  : dayOfWeek  || null,
        dom  : dayOfMonth || null,
        fmt  : format,
        recip: JSON.stringify(recipients),
        params: rparams ? JSON.stringify(rparams) : null,
        next  : nextRun,
        uid   : req.user.userId,
      }
    );
    return R.created(res, { id: r.insertId, nextRunAt: nextRun });
  } catch (e) { next(e); }
});

// PATCH /reports/scheduled/:id
scheduledRouter.patch('/:id', async (req, res, next) => {
  try {
    const row = await db.queryOne(
      'SELECT id FROM scheduled_reports WHERE id=:id AND org_id=:orgId',
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!row) return R.notFound(res);

    const fields = [];
    const vals   = { id: req.params.id };
    const allowed = ['name','frequency','day_of_week','day_of_month','format','recipients','params','is_active','branch_id'];

    for (const [k, v] of Object.entries(req.body)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (!allowed.includes(col)) continue;
      fields.push(`${col} = :${col}`);
      vals[col] = Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : v;
    }
    if (!fields.length) return R.badRequest(res, 'Sin campos para actualizar');

    // Recalcular próxima ejecución si cambió la frecuencia
    const { frequency, dayOfWeek, dayOfMonth } = req.body;
    if (frequency) {
      const nextRun = calcNextRun(frequency, dayOfWeek, dayOfMonth);
      fields.push('next_run_at = :nextRun');
      vals.nextRun = nextRun;
    }

    await db.query(`UPDATE scheduled_reports SET ${fields.join(', ')} WHERE id = :id`, vals);
    return R.noContent(res);
  } catch (e) { next(e); }
});

// DELETE /reports/scheduled/:id
scheduledRouter.delete('/:id', async (req, res, next) => {
  try {
    await db.query(
      'DELETE FROM scheduled_reports WHERE id=:id AND org_id=:orgId',
      { id: req.params.id, orgId: req.user.orgId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// POST /reports/scheduled/:id/run  — ejecutar ahora (manual trigger)
scheduledRouter.post('/:id/run', async (req, res, next) => {
  try {
    const sr = await db.queryOne(
      'SELECT * FROM scheduled_reports WHERE id=:id AND org_id=:orgId',
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!sr) return R.notFound(res);

    // Registrar la corrida
    const [runRow] = await db.query(
      `INSERT INTO report_runs (scheduled_report_id, org_id, branch_id, report_type, format, status, params, triggered_by, started_at)
       VALUES (:sid, :orgId, :bid, :type, :fmt, 'running', :params, :uid, NOW())`,
      {
        sid: sr.id, orgId: req.user.orgId, bid: sr.branch_id,
        type: sr.report_type, fmt: sr.format,
        params: sr.params, uid: req.user.userId,
      }
    );
    const runId = runRow.insertId;

    // Ejecutar asíncrono (fire-and-forget, sin bloquear respuesta)
    setImmediate(async () => {
      try {
        const params    = sr.params ? JSON.parse(sr.params) : {};
        const data      = await fetchReportData(sr.report_type, sr.branch_id, sr.org_id, params);
        const meta      = { from: params.from, to: params.to, generatedBy: 'Programado' };

        let fileSize = 0;
        let subject  = `Reporte: ${sr.name}`;

        // Generar archivo según formato
        if (sr.format === 'excel') {
          const cols   = _defaultCols(sr.report_type);
          const rows   = Array.isArray(data) ? data : (data.byType || []);
          const buffer = await toExcel({ title: sr.name, columns: cols, rows, meta });
          fileSize     = buffer.length;
          // Enviar por email
          const recipients = JSON.parse(sr.recipients);
          for (const email of recipients) {
            await sendReportEmail({ email, subject, reportName: sr.name, buffer, filename: `${sr.report_type}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).catch(() => {});
          }
        } else if (sr.format === 'pdf') {
          let buf;
          if      (sr.report_type === 'revenue')      buf = await generateRevenuePdf({ rows: data, meta });
          else if (sr.report_type === 'appointments') buf = await generateAppointmentsReportPdf({ ...data, meta });
          else if (sr.report_type === 'diagnoses')    buf = await generateDiagnosesReportPdf({ rows: data, meta });
          if (buf) {
            fileSize = buf.length;
            const recipients = JSON.parse(sr.recipients);
            for (const email of recipients) {
              await sendReportEmail({ email, subject, reportName: sr.name, buffer: buf, filename: `${sr.report_type}.pdf`, mimeType: 'application/pdf' }).catch(() => {});
            }
          }
        }

        await db.query(
          `UPDATE report_runs SET status='completed', file_size_bytes=:sz, finished_at=NOW() WHERE id=:id`,
          { sz: fileSize, id: runId }
        );
        await db.query(
          `UPDATE scheduled_reports SET last_run_at=NOW(), next_run_at=:next WHERE id=:id`,
          { next: calcNextRun(sr.frequency, sr.day_of_week, sr.day_of_month), id: sr.id }
        );
      } catch (err) {
        await db.query(
          `UPDATE report_runs SET status='failed', error_message=:msg, finished_at=NOW() WHERE id=:id`,
          { msg: err.message, id: runId }
        );
      }
    });

    return R.accepted(res, { runId, message: 'Reporte en proceso. Se enviará por email al terminar.' });
  } catch (e) { next(e); }
});

// GET /reports/runs  — historial de ejecuciones
router.get('/runs', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT rr.*, sr.name AS scheduled_name,
              CONCAT(u.first_name,' ',u.last_name) AS triggered_by_name
       FROM report_runs rr
       LEFT JOIN scheduled_reports sr ON rr.scheduled_report_id = sr.id
       LEFT JOIN users u ON rr.triggered_by = u.id
       WHERE rr.org_id = :orgId
       ORDER BY rr.created_at DESC
       LIMIT :limit OFFSET :offset`,
      { orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ─── Datos para gráficos (chart-friendly JSON) ────────────────────────────────

// GET /reports/charts/revenue-trend — datos de línea de ingresos
router.get('/charts/revenue-trend', async (req, res, next) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;
    const now = new Date();
    const f   = from || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t   = to   || now.toISOString().slice(0, 10);
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

    // Formato recharts/chart.js friendly
    return R.ok(res, {
      labels   : rows.map(r => r.label),
      datasets : [
        { id: 'gross',     label: 'Ingreso Bruto', data: rows.map(r => r.gross)     },
        { id: 'net',       label: 'Ingreso Neto',  data: rows.map(r => r.net)       },
        { id: 'collected', label: 'Cobrado',        data: rows.map(r => r.collected) },
      ],
    });
  } catch (e) { next(e); }
});

// GET /reports/charts/appointments-heatmap — turnos por hora/día
router.get('/charts/appointments-heatmap', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const f   = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const t   = to   || now.toISOString().slice(0, 10);

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
      data: rows.map(r => ({ day: DAYS[r.dow - 1] || String(r.dow), hour: r.hour, count: r.count })),
    });
  } catch (e) { next(e); }
});

// GET /reports/charts/species-distribution — distribución de pacientes por especie
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
      labels  : rows.map(r => r.species),
      values  : rows.map(r => r.count),
      percents: rows.map(r => r.pct),
    });
  } catch (e) { next(e); }
});

// GET /reports/charts/top-diagnoses-bar — top diagnósticos para bar chart
router.get('/charts/top-diagnoses-bar', async (req, res, next) => {
  try {
    const { from, to, limit = 10 } = req.query;
    const now = new Date();
    const f   = from || new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
    const t   = to   || now.toISOString().slice(0, 10);

    const rows = await db.query(
      `SELECT d.diagnosis_name AS label, COUNT(*) AS value
       FROM diagnoses d
       JOIN medical_records mr ON d.medical_record_id=mr.id
       JOIN appointments a ON mr.appointment_id=a.id AND a.branch_id=:bid
       WHERE DATE(d.created_at) BETWEEN :from AND :to AND d.is_primary=TRUE
       GROUP BY d.diagnosis_name ORDER BY value DESC LIMIT :lim`,
      { bid: req.user.branchId, from: f, to: t, lim: parseInt(limit) }
    );
    return R.ok(res, { labels: rows.map(r => r.label), values: rows.map(r => r.value) });
  } catch (e) { next(e); }
});

// GET /reports/charts/payment-methods — métodos de pago pie chart
router.get('/charts/payment-methods', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const f   = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const t   = to   || now.toISOString().slice(0, 10);

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
    return R.ok(res, { labels: rows.map(r => r.method), values: rows.map(r => r.total), percents: rows.map(r => r.pct), transactions: rows.map(r => r.transactions) });
  } catch (e) { next(e); }
});

// ─── Helper: columnas por defecto para exportación ────────────────────────────

function _defaultCols (type) {
  const MAP = {
    revenue: [
      { key: 'period',        header: 'Período',       type: 'string'   },
      { key: 'invoices',      header: 'Facturas',      type: 'number'   },
      { key: 'gross_revenue', header: 'Ingreso Bruto', type: 'currency' },
      { key: 'net_revenue',   header: 'Ingreso Neto',  type: 'currency' },
      { key: 'collected',     header: 'Cobrado',       type: 'currency' },
      { key: 'outstanding',   header: 'Pendiente',     type: 'currency' },
    ],
    appointments: [
      { key: 'type',  header: 'Tipo',       type: 'string' },
      { key: 'count', header: 'Cantidad',   type: 'number' },
      { key: 'pct',   header: '% del total',type: 'percent'},
    ],
    diagnoses: [
      { key: 'diagnosis_name', header: 'Diagnóstico',  type: 'string'  },
      { key: 'diagnosis_code', header: 'Código',       type: 'string'  },
      { key: 'species',        header: 'Especie',      type: 'string'  },
      { key: 'frequency',      header: 'Frecuencia',   type: 'number'  },
      { key: 'pct',            header: '% Total',      type: 'percent' },
    ],
  };
  return MAP[type] || [];
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = buildApp('reports', (app, requirePerm) => {
  app.use('/reports/scheduled', requirePerm('reports:write'), scheduledRouter);
  app.use('/reports',           requirePerm('reports:read'),  router);
}, { specPath: path.join(__dirname, 'openapi.yaml') });

const PORT = parseInt(process.env.PORT || '3008');
if (process.env.NODE_ENV !== 'test') {
  startService(app, 'reports', PORT);
}

module.exports = app;
