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
