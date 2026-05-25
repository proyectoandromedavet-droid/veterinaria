'use strict';

const { Router } = require('express');
const { body, db, R, validate, logAppointmentsError } = require('./appointments.common');

const router = Router();

router.post('/',
  body('patientId').isInt(),
  body('vetId').isInt(),
  body('scheduledDate').isISO8601(),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, vetId, scheduledDate, durationMinutes = 30,
        appointmentTypeId, reason, notes, isEmergency = false,
      } = req.body;

      const patient = await db.queryOne(
        `SELECT id FROM patients WHERE id = :pid AND organization_id = :orgId`,
        { pid: patientId, orgId: req.user.orgId }
      );
      if (!patient) return R.notFound(res, 'Paciente no encontrado');

      let branchId = req.user.branchId || null;
      if (!branchId && vetId) {
        const vet = await db.queryOne('SELECT branch_id FROM users WHERE id = :vid', { vid: vetId });
        branchId = vet?.branch_id || null;
      }

      const [r] = await db.query(
        `INSERT INTO appointments
           (branch_id, patient_id, vet_id, scheduled_date, duration_minutes,
            appointment_type_id, reason, notes, is_emergency, status)
         VALUES (:bid, :pid, :vid, :date, :dur, :typeId, :reason, :notes, :emerg, 'scheduled')`,
        {
          bid: branchId,
          pid: patientId,
          vid: vetId,
          date: scheduledDate,
          dur: durationMinutes,
          typeId: appointmentTypeId || null,
          reason: reason || null,
          notes: notes || null,
          emerg: isEmergency ? 1 : 0,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) {
      logAppointmentsError('POST /appointments', e, { orgId: req.user?.orgId, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

// OT-065: PUT /:id — full appointment update (alias compliant with OpenAPI spec)
router.put('/:id',
  body('scheduledDate').optional().isISO8601(),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
  body('status').optional().isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  validate,
  async (req, res, next) => {
    try {
      const fields = [];
      const p = { id: req.params.id, bid: req.user.branchId };
      if (req.body.scheduledDate)     { fields.push('scheduled_date = :scheduledDate');         p.scheduledDate     = req.body.scheduledDate; }
      if (req.body.durationMinutes)   { fields.push('duration_minutes = :durationMinutes');     p.durationMinutes   = req.body.durationMinutes; }
      if (req.body.status)            { fields.push('status = :status');                        p.status            = req.body.status; }
      if (req.body.reason !== undefined) { fields.push('reason = :reason');                    p.reason            = req.body.reason; }
      if (req.body.notes  !== undefined) { fields.push('notes = :notes');                       p.notes             = req.body.notes; }
      if (req.body.vetId)             { fields.push('vet_id = :vetId');                         p.vetId             = req.body.vetId; }
      if (req.body.appointmentTypeId) { fields.push('appointment_type_id = :appointmentTypeId'); p.appointmentTypeId = req.body.appointmentTypeId; }
      if (fields.length === 0) return R.badRequest(res, 'No fields to update');

      await db.query(
        `UPDATE appointments SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = :id AND branch_id = :bid`,
        p
      );
      return R.noContent(res);
    } catch (e) {
      logAppointmentsError('PUT /appointments/:id', e, { appointmentId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

router.patch('/:id/status',
  body('status').isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE appointments SET status = :status, updated_at = NOW()
         WHERE id = :id AND branch_id = :bid`,
        { status: req.body.status, id: req.params.id, bid: req.user.branchId }
      );
      return R.noContent(res);
    } catch (e) {
      logAppointmentsError('PATCH /appointments/:id/status', e, { appointmentId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

const postTriage = [
  body('priority').isIn(['immediate', 'urgent', 'less_urgent', 'non_urgent']),
  body('chiefComplaint').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const {
        priority, chiefComplaint,
        heartRate, respiratoryRate, temperature,
        systolicBp, mucousMembranes,
        consciousnessLevel, painScore, notes,
      } = req.body;

      const appt = await db.queryOne(
        `SELECT id FROM appointments WHERE id = :id AND branch_id = :bid`,
        { id: req.params.id, bid: req.user.branchId }
      );
      if (!appt) return R.notFound(res, 'Turno no encontrado');

      const [r] = await db.query(
        `INSERT INTO emergency_triage
           (appointment_id, priority, chief_complaint,
            heart_rate, respiratory_rate, temperature_celsius,
            systolic_bp, mucous_membranes,
            consciousness_level, pain_score, notes,
            triaged_by)
         VALUES (:apptId, :priority, :cc, :hr, :rr, :temp,
                 :sbp, :mm, :cl, :pain, :notes, :user)`,
        {
          apptId: req.params.id,
          priority,
          cc: chiefComplaint,
          hr: heartRate || null,
          rr: respiratoryRate || null,
          temp: temperature || null,
          sbp: systolicBp || null,
          mm: mucousMembranes || null,
          cl: consciousnessLevel || null,
          pain: painScore || null,
          notes: notes || null,
          user: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) {
      logAppointmentsError('POST /appointments/:id/triage', e, { appointmentId: req.params.id, userId: req.user?.userId, body: req.body });
      next(e);
    }
  },
];

router.post('/:id/triage', ...postTriage);

module.exports = {
  router,
  postTriage,
};
