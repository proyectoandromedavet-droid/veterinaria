'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, resolveMedicalRecordId, logHospitalizationError } = require('./hospitalization.common');

const router = Router();

router.post('/',
  body('patientId').isInt(),
  body('responsibleVetId').isInt(),
  body('hospitalizationReason').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const admission = await db.transaction(async (conn) => {
        const resolvedMedicalRecordId = await resolveMedicalRecordId(conn, {
          patientId: req.body.patientId,
          branchId: req.user.branchId,
          medicalRecordId: req.body.medicalRecordId || null,
        });
        const [r] = await conn.query(
          `INSERT INTO hospitalizations
             (branch_id, patient_id, medical_record_id, responsible_vet_id, kennel_id,
              hospitalization_reason, admission_diagnosis, hospitalization_status,
              admission_weight, estimated_discharge_date, special_instructions, created_by)
           VALUES (:bid,:pid,:mrid,:vetid,:kennelid,
                   :reason,:diagnosis,'admitted',
                   :weight,:estimated,:instructions,:uid)`,
          {
            bid: req.user.branchId,
            pid: req.body.patientId,
            mrid: resolvedMedicalRecordId,
            vetid: req.body.responsibleVetId,
            kennelid: req.body.kennelId || null,
            reason: req.body.hospitalizationReason,
            diagnosis: req.body.admissionDiagnosis || null,
            weight: req.body.admissionWeight || null,
            estimated: req.body.estimatedDischargeDate || null,
            instructions: req.body.specialInstructions || null,
            uid: req.user.userId,
          }
        );
        return {
          id: r.insertId,
          branch_id: req.user.branchId,
          patient_id: req.body.patientId,
          medical_record_id: resolvedMedicalRecordId,
          responsible_vet_id: req.body.responsibleVetId,
          kennel_id: req.body.kennelId || null,
          hospitalization_reason: req.body.hospitalizationReason,
          admission_diagnosis: req.body.admissionDiagnosis || null,
          hospitalization_status: 'admitted',
          admission_weight: req.body.admissionWeight || null,
          estimated_discharge_date: req.body.estimatedDischargeDate || null,
          special_instructions: req.body.specialInstructions || null,
          created_by: req.user.userId,
        };
      });
      return R.created(res, admission);
    } catch (e) {
      if (e.message?.includes('SQLSTATE')) {
        return R.conflict(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
      }
      logHospitalizationError('POST /hospitalizations', e, { branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.post('/:id(\\d+)/monitoring',
  body('recordedAt').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      const {
        recordedAt, temperature, heartRate, respiratoryRate,
        systolicBp, diastolicBp, spo2, weight,
        consciousness, painScore, hydration,
        appetite, urination, defecation,
        woundStatus, ivSiteStatus, notes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO hospitalization_monitoring
           (hospitalization_id, recorded_at,
            temperature_celsius, heart_rate, respiratory_rate,
            systolic_bp, diastolic_bp, spo2_percent, weight_kg,
            consciousness_level, pain_score, hydration_status,
            appetite, urination, defecation,
            wound_status, iv_site_status, notes, recorded_by)
         VALUES (:hid,:at,:temp,:hr,:rr,:sbp,:dbp,:spo2,:wt,
                 :cons,:pain,:hyd,:app,:uri,:def,:wound,:iv,:notes,:uid)` ,
        {
          hid: req.params.id, at: recordedAt,
          temp: temperature || null, hr: heartRate || null, rr: respiratoryRate || null,
          sbp: systolicBp || null, dbp: diastolicBp || null, spo2: spo2 || null,
          wt: weight || null, cons: consciousness || null, pain: painScore || null,
          hyd: hydration || null, app: appetite || null, uri: urination || null,
          def: defecation || null, wound: woundStatus || null, iv: ivSiteStatus || null,
          notes: notes || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) {
      logHospitalizationError('POST /hospitalizations/:id/monitoring', e, { hospitalizationId: req.params.id, body: req.body });
      next(e);
    }
  }
);

router.post('/:id(\\d+)/medications',
  body('medicationId').isInt(),
  body('dose').notEmpty(),
  body('frequency').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { medicationId, dose, doseUnit, frequency, route, startDate, endDate, instructions } = req.body;
      const [r] = await db.query(
        `INSERT INTO hospitalization_medications
           (hospitalization_id, medication_id, dose, dose_unit, frequency, route,
            start_date, end_date, instructions, prescribed_by)
         VALUES (:hid,:med,:dose,:unit,:freq,:route,:start,:end,:instr,:uid)`,
        {
          hid: req.params.id, med: medicationId, dose,
          unit: doseUnit || null, freq: frequency, route: route || null,
          start: startDate || null, end: endDate || null,
          instr: instructions || null, uid: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) {
      logHospitalizationError('POST /hospitalizations/:id/medications', e, { hospitalizationId: req.params.id, body: req.body });
      next(e);
    }
  }
);

router.patch('/:id(\\d+)/discharge',
  body('dischargeDate').isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE hospitalizations
         SET discharge_date = :dischargeDate,
             discharge_diagnosis = :diagnosis,
             discharge_instructions = :instructions,
             follow_up_date = :followUpDate,
             hospitalization_status = 'ready_for_discharge',
             updated_at = NOW()
         WHERE id = :id AND branch_id = :bid`,
        {
          id: req.params.id,
          bid: req.user.branchId,
          dischargeDate: req.body.dischargeDate,
          diagnosis: req.body.dischargeDiagnosis || null,
          instructions: req.body.dischargeInstructions || null,
          followUpDate: req.body.followUpDate || null,
        }
      );
      return R.ok(res, { message: 'Patient discharged successfully' });
    } catch (e) {
      if (e.message?.includes('SQLSTATE')) {
        return R.conflict(res, e.message.replace(/.*SQLSTATE\[45000\]:.*: \d+ /, ''));
      }
      logHospitalizationError('PATCH /hospitalizations/:id/discharge', e, { hospitalizationId: req.params.id, body: req.body });
      next(e);
    }
  }
);

module.exports = { router };
