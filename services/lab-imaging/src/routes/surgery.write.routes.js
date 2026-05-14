'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, resolveMedicalRecordId, logSurgeryError } = require('./surgery.common');

const router = Router();

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
    } catch (e) {
      logSurgeryError('POST /surgeries', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

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
        if (req.body.complications) extra.complications = req.body.complications;
        if (req.body.surgicalFindings) extra.surgical_findings = req.body.surgicalFindings;
      }

      const setClauses = [`status = :status`];
      const p = { status: req.body.status, id: req.params.id, bid: req.user.branchId };
      for (const [k, v] of Object.entries(extra)) { setClauses.push(`${k} = :${k}`); p[k] = v; }

      await db.query(
        `UPDATE surgeries SET ${setClauses.join(', ')}, updated_at=NOW() WHERE id=:id AND branch_id=:bid`,
        p
      );
      return R.noContent(res);
    } catch (e) {
      logSurgeryError('PATCH /surgeries/:id/status', e, { surgeryId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

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
        monitoringChart,
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
    } catch (e) {
      logSurgeryError('POST /surgeries/:id/anesthesia', e, { surgeryId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
