'use strict';

const db = require('../../../shared/db');
const R = require('../../../shared/response');
const { decrypt } = require('../../../shared/encryption');
const { toExcel, toCsv } = require('../../../shared/export');
const { consolidatedFinancials } = require('../../../shared/multibranch');
const {
  generateRevenuePdf,
  generateAppointmentsReportPdf,
  generateDiagnosesReportPdf,
} = require('../../../shared/pdf');
const { sendReportEmail } = require('../../../shared/email');

function calcNextRun(frequency, dayOfWeek, dayOfMonth) {
  const now = new Date();
  const next = new Date(now);

  if (frequency === 'daily') {
    next.setDate(now.getDate() + 1);
    next.setHours(7, 0, 0, 0);
  } else if (frequency === 'weekly') {
    const dow = dayOfWeek != null ? dayOfWeek : 1;
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

function dateRange(query) {
  const now = new Date();
  const from = query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = query.to || now.toISOString().slice(0, 10);
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

function aggregateDiagnoses(rawRows, limit = 20) {
  const totals = new Map();
  let totalCount = 0;

  for (const row of rawRows) {
    const diagnosisName = decrypt(row.diagnosis_name) || 'Sin diagnóstico';
    const diagnosisCode = decrypt(row.diagnosis_code) || null;
    const species = row.species || 'N/D';
    const key = `${diagnosisName}||${species}`;
    const current = totals.get(key) || {
      diagnosis_name: diagnosisName,
      diagnosis_code: diagnosisCode,
      species,
      frequency: 0,
      pct: 0,
    };
    current.frequency += 1;
    if (!current.diagnosis_code && diagnosisCode) current.diagnosis_code = diagnosisCode;
    totals.set(key, current);
    totalCount += 1;
  }

  return Array.from(totals.values())
    .sort((a, b) => b.frequency - a.frequency || a.diagnosis_name.localeCompare(b.diagnosis_name))
    .slice(0, limit)
    .map((row) => ({
      ...row,
      pct: totalCount ? Number(((row.frequency * 100) / totalCount).toFixed(2)) : 0,
    }));
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

async function fetchReportData(type, branchId, orgId, params = {}) {
  const { from, to, groupBy = 'month', limit = 20 } = params;
  const now = new Date();
  const f = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const t = to || now.toISOString().slice(0, 10);

  switch (type) {
    case 'revenue': {
      const fmt = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%x-W%v' : '%Y-%m';
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
    }
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
      return aggregateDiagnoses(await db.query(
        `SELECT d.diagnosis_name, d.diagnosis_code, sp.common_name AS species
         FROM diagnoses d
         JOIN medical_records mr ON d.medical_record_id=mr.id
         JOIN appointments a ON mr.appointment_id=a.id AND a.branch_id=:bid
         JOIN patients p ON mr.patient_id=p.id
         JOIN species sp ON p.species_id=sp.id
         WHERE DATE(d.created_at) BETWEEN :from AND :to AND d.is_primary=TRUE
         ORDER BY d.created_at DESC`,
        { bid: branchId, from: f, to: t }
      ), parseInt(limit, 10));
    default:
      throw Object.assign(new Error(`Tipo de reporte desconocido: ${type}`), { code: 'UNKNOWN_REPORT' });
  }
}

function defaultCols(type) {
  const MAP = {
    revenue: [
      { key: 'period', header: 'Período', type: 'string' },
      { key: 'invoices', header: 'Facturas', type: 'number' },
      { key: 'gross_revenue', header: 'Ingreso Bruto', type: 'currency' },
      { key: 'net_revenue', header: 'Ingreso Neto', type: 'currency' },
      { key: 'collected', header: 'Cobrado', type: 'currency' },
      { key: 'outstanding', header: 'Pendiente', type: 'currency' },
    ],
    appointments: [
      { key: 'type', header: 'Tipo', type: 'string' },
      { key: 'count', header: 'Cantidad', type: 'number' },
      { key: 'pct', header: '% del total', type: 'percent' },
    ],
    diagnoses: [
      { key: 'diagnosis_name', header: 'Diagnóstico', type: 'string' },
      { key: 'diagnosis_code', header: 'Código', type: 'string' },
      { key: 'species', header: 'Especie', type: 'string' },
      { key: 'frequency', header: 'Frecuencia', type: 'number' },
      { key: 'pct', header: '% Total', type: 'percent' },
    ],
  };
  return MAP[type] || [];
}

module.exports = {
  R,
  db,
  decrypt,
  toExcel,
  toCsv,
  consolidatedFinancials,
  generateRevenuePdf,
  generateAppointmentsReportPdf,
  generateDiagnosesReportPdf,
  sendReportEmail,
  calcNextRun,
  dateRange,
  safeQuery,
  aggregateDiagnoses,
  getBranchDashboard,
  fetchReportData,
  defaultCols,
};
