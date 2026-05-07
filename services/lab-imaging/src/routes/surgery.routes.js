'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');
const { resolveMedicalRecordId } = require('../lib/clinicalContext');

const router   = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// GET /surgeries
router.get('/', async (req, res, next) => {
  try {
    const { patientId, status, from, to, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['s.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (patientId) { conds.push('s.patient_id = :pid'); p.pid = patientId; }
    if (status)    { conds.push('s.status = :status');  p.status = status; }
    if (from)      { conds.push('s.scheduled_date >= :from'); p.from = from; }
    if (to)        { conds.push('s.scheduled_date <= :to');   p.to   = to; }

    const rows = await db.query(
      `SELECT s.id, s.medical_record_id, s.scheduled_date, s.start_time, s.end_time, s.status,
              s.duration_minutes, s.urgency,
              st.name AS surgery_type, sc.name AS surgery_category,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS lead_surgeon,
              ar.id AS anesthesia_record_id, ar.anesthesia_type
       FROM surgeries s
       JOIN surgery_types  st ON s.surgery_type_id = st.id
       JOIN surgery_categories sc ON st.category_id = sc.id
       JOIN patients p           ON s.patient_id    = p.id
       JOIN species  sp          ON p.species_id    = sp.id
       JOIN users    u           ON s.lead_surgeon_id = u.id
       LEFT JOIN anesthesia_records ar ON ar.surgery_id = s.id
       WHERE ${conds.join(' AND ')}
       ORDER BY s.scheduled_date DESC, s.start_time DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /surgeries/types/all
router.get('/types/all', async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT st.id, st.name, st.description, st.estimated_duration_minutes,
              sc.name AS category
       FROM surgery_types st
       JOIN surgery_categories sc ON st.category_id = sc.id
       WHERE st.is_active = TRUE ORDER BY sc.name, st.name`
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /surgeries/:id
router.get('/:id', async (req, res, next) => {
  try {
    const surgery = await db.queryOne(
      `SELECT s.*,
              st.name AS type_name, sc.name AS category_name,
              p.name AS patient_name, p.sex, p.birthdate, p.weight_kg,
              sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS lead_surgeon_name
       FROM surgeries s
       JOIN surgery_types st  ON s.surgery_type_id  = st.id
       JOIN surgery_categories sc ON st.category_id = sc.id
       JOIN patients p        ON s.patient_id        = p.id
       JOIN species  sp       ON p.species_id         = sp.id
       JOIN users    u        ON s.lead_surgeon_id    = u.id
       WHERE s.id = :id AND s.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!surgery) return R.notFound(res);

    const [anesthesia] = await Promise.all([
      db.queryOne(
        `SELECT ar.*, CONCAT(u.first_name,' ',u.last_name) AS anesthesiologist_name
         FROM anesthesia_records ar
         JOIN users u ON ar.anesthesiologist_id = u.id
         WHERE ar.surgery_id = :sid`,
        { sid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...surgery, anesthesia });
  } catch (e) { next(e); }
});

// POST /surgeries
router.post('/',
  body('patientId').isInt(),
  body('surgeryTypeId').isInt(),
  body('leadSurgeonId').isInt(),
  body('scheduledDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, medicalRecordId, surgeryTypeId, leadSurgeonId,
        assistantSurgeonId, anesthesiologistId, surgicalNurseId,
        scheduledDate, startTime, urgency = 'elective',
        preoperativeDiagnosis, surgicalApproach, notes,
      } = req.body;
      const resolvedMedicalRecordId = await resolveMedicalRecordId(db, {
        patientId,
        branchId: req.user.branchId,
        medicalRecordId: medicalRecordId || null,
      });

      const [r] = await db.query(
        `INSERT INTO surgeries
           (branch_id, patient_id, medical_record_id, surgery_type_id,
            lead_surgeon_id, assistant_surgeon_id, anesthesiologist_id, surgical_nurse_id,
            scheduled_date, start_time, urgency,
            preoperative_diagnosis, surgical_approach, notes, status)
         VALUES (:bid,:pid,:mid,:type,:lead,:asst,:anes,:nurse,
                 :date,:time,:urg,:prediag,:approach,:notes,'scheduled')`,
        {
          bid: req.user.branchId, pid: patientId, mid: resolvedMedicalRecordId,
          type: surgeryTypeId, lead: leadSurgeonId,
          asst: assistantSurgeonId || null, anes: anesthesiologistId || null,
          nurse: surgicalNurseId || null, date: scheduledDate,
          time: startTime || null, urg: urgency,
          prediag: preoperativeDiagnosis || null, approach: surgicalApproach || null,
          notes: notes || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// PATCH /surgeries/:id/status
router.patch('/:id/status',
  body('status').isIn(['scheduled','in_progress','completed','cancelled','postponed']),
  validate,
  async (req, res, next) => {
    try {
      const extra = {};
      if (req.body.status === 'in_progress') extra.start_time = req.body.startTime || null;
      if (req.body.status === 'completed') {
        extra.end_time = req.body.endTime || null;
        if (req.body.startTime && req.body.endTime) {
          const dur = Math.round((new Date(req.body.endTime) - new Date(req.body.startTime)) / 60000);
          extra.duration_minutes = dur;
        }
        if (req.body.postoperativeDiagnosis) extra.postoperative_diagnosis = req.body.postoperativeDiagnosis;
        if (req.body.complications)          extra.complications = req.body.complications;
        if (req.body.surgicalFindings)       extra.surgical_findings = req.body.surgicalFindings;
      }

      const setClauses = [`status = :status`];
      const p = { status: req.body.status, id: req.params.id, bid: req.user.branchId };
      for (const [k, v] of Object.entries(extra)) { setClauses.push(`${k} = :${k}`); p[k] = v; }

      await db.query(
        `UPDATE surgeries SET ${setClauses.join(', ')}, updated_at=NOW() WHERE id=:id AND branch_id=:bid`,
        p
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// POST /surgeries/:id/anesthesia
router.post('/:id/anesthesia',
  body('anesthesiologistId').isInt(),
  body('anesthesiaType').isIn(['general','local','regional','epidural','sedation','loco_regional']),
  validate,
  async (req, res, next) => {
    try {
      const {
        anesthesiologistId, anesthesiaType,
        inductionAgents, maintenanceAgents, analgesics, reversalAgents,
        premedications, inductionTime, extubationTime,
        totalAnesthesiaMinutes, complications,
        monitoringChart,  // JSON array: [{time, hr, rr, spo2, etco2, temp, bp, depth, notes}]
        recoveryNotes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO anesthesia_records
           (surgery_id, anesthesiologist_id, anesthesia_type,
            induction_agents, maintenance_agents, analgesics, reversal_agents,
            premedications, induction_time, extubation_time,
            total_anesthesia_minutes, complications,
            monitoring_chart, recovery_notes)
         VALUES (:sid,:uid,:type,:ind,:main,:anal,:rev,:pre,:indt,:extt,:total,:comp,:chart,:rec)`,
        {
          sid: req.params.id, uid: anesthesiologistId, type: anesthesiaType,
          ind: inductionAgents || null, main: maintenanceAgents || null,
          anal: analgesics || null, rev: reversalAgents || null,
          pre: premedications || null, indt: inductionTime || null,
          extt: extubationTime || null, total: totalAnesthesiaMinutes || null,
          comp: complications || null,
          chart: monitoringChart ? JSON.stringify(monitoringChart) : null,
          rec: recoveryNotes || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

module.exports = router;
