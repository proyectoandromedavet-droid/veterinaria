'use strict';

const { Router } = require('express');
const { body, db, R, validate, logAppointmentsError } = require('./appointments.common');

const router = Router();

router.post('/',
  body('patientId').isInt(),
  body('vetId').isInt(),
  body('scheduledDate').isISO8601(),
  body('durationMinutes').optional().isInt({ min: 5, max: 480 }),
  body('reason').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, vetId, scheduledDate, durationMinutes = 30,
        appointmentTypeId, reason, notes, isEmergency = false,
      } = req.body;

      const patient = await db.queryOne(
        `SELECT p.id
           FROM patients p
          WHERE p.id = :pid
            AND p.organization_id = :orgId
            AND (
              :branchId IS NULL
              OR EXISTS (
                SELECT 1
                  FROM patient_owners po
                  JOIN clients c ON c.id = po.client_id
                 WHERE po.patient_id = p.id
                   AND c.branch_id = :branchId
                   AND po.deleted_at IS NULL
              )
            )`,
        { pid: patientId, orgId: req.user.orgId, branchId: req.user.branchId || null }
      );
      if (!patient) return R.notFound(res, 'Paciente no encontrado');

      let branchId = req.user.branchId || null;
      if (!branchId && vetId) {
        const vet = await db.queryOne('SELECT branch_id FROM users WHERE id = :vid', { vid: vetId });
        branchId = vet?.branch_id || null;
      }
      if (branchId && vetId) {
        const vet = await db.queryOne('SELECT id FROM users WHERE id = :vid AND branch_id = :bid', { vid: vetId, bid: branchId });
        if (!vet) return R.forbidden(res, 'Veterinario fuera de sucursal');
      }

      // Verificar solapamiento de horarios ANTES del INSERT
      const overlap = await db.queryOne(
        `SELECT id FROM appointments
         WHERE vet_id = :vid
           AND status NOT IN ('cancelled', 'no_show')
           AND scheduled_date < DATE_ADD(:sched, INTERVAL :dur MINUTE)
           AND DATE_ADD(scheduled_date, INTERVAL COALESCE(duration_minutes, 30) MINUTE) > :sched
           AND branch_id = :bid
         LIMIT 1 FOR UPDATE`,
        { vid: vetId, sched: scheduledDate, dur: durationMinutes || 30, bid: branchId }
      );
      if (overlap) return R.conflict(res, 'El veterinario ya tiene un turno en ese horario');

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
  body('vetId').optional().isInt({ min: 1 }),
  body('appointmentTypeId').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  body('reason').optional({ nullable: true }).isString().isLength({ max: 1000 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  validate,
  async (req, res, next) => {
    try {
      const fields = [];
      // SEC: orgId incluido en WHERE para evitar IDOR cross-org
      const p = { id: req.params.id, bid: req.user.branchId, orgId: req.user.orgId };
      if (req.body.scheduledDate)                { fields.push('scheduled_date = :scheduledDate');           p.scheduledDate     = req.body.scheduledDate; }
      if (req.body.durationMinutes != null)       { fields.push('duration_minutes = :durationMinutes');       p.durationMinutes   = req.body.durationMinutes; }
      if (req.body.status)                        { fields.push('status = :status');                          p.status            = req.body.status; }
      if (req.body.reason !== undefined)          { fields.push('reason = :reason');                          p.reason            = req.body.reason; }
      if (req.body.notes  !== undefined)          { fields.push('notes = :notes');                            p.notes             = req.body.notes; }
      if (req.body.vetId) {
        // SEC: verificar que el veterinario pertenezca a la misma sucursal
        const vet = await db.queryOne(
          `SELECT id FROM users WHERE id = :vid AND branch_id = :bid`,
          { vid: req.body.vetId, bid: req.user.branchId }
        );
        if (!vet) return R.forbidden(res, 'Veterinario fuera de sucursal');
        fields.push('vet_id = :vetId');
        p.vetId = req.body.vetId;
      }
      if (req.body.appointmentTypeId) { fields.push('appointment_type_id = :appointmentTypeId'); p.appointmentTypeId = req.body.appointmentTypeId; }
      if (fields.length === 0) return R.badRequest(res, 'No fields to update');

      // SEC: WHERE incluye orgId via JOIN con patients para prevenir IDOR cross-org
      // y excluye turnos en estado terminal para evitar reabrir citas cerradas
      const [result] = await db.query(
        `UPDATE appointments a
         JOIN patients p ON p.id = a.patient_id
         SET ${fields.map((f) => `a.${f}`).join(', ')}, a.updated_at = NOW()
         WHERE a.id = :id
           AND a.branch_id = :bid
           AND p.organization_id = :orgId
           AND a.status NOT IN ('completed', 'cancelled', 'no_show')`,
        p
      );
      if (!result.affectedRows) return R.notFound(res, 'Turno no encontrado o no modificable');
      return R.noContent(res);
    } catch (e) {
      logAppointmentsError('PUT /appointments/:id', e, { appointmentId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

// Transiciones de estado válidas (TOCTOU: el UPDATE verifica el estado previo en el WHERE)
const VALID_STATUS_TRANSITIONS = {
  scheduled:   ['confirmed', 'in_progress', 'cancelled', 'no_show'],
  confirmed:   ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
  no_show:     [],
};

router.patch('/:id/status',
  body('status').isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  body('previousStatus').isIn(['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  validate,
  async (req, res, next) => {
    try {
      const { status, previousStatus } = req.body;
      const allowed = VALID_STATUS_TRANSITIONS[previousStatus] || [];
      if (!allowed.includes(status)) {
        return R.badRequest(res, `Transicion de estado invalida: ${previousStatus} → ${status}`);
      }
      // TOCTOU: la transición solo ocurre si el estado actual en DB coincide con previousStatus
      const [result] = await db.query(
        `UPDATE appointments SET status = :status, updated_at = NOW()
         WHERE id = :id AND branch_id = :bid AND status = :prevStatus`,
        { status, id: req.params.id, bid: req.user.branchId, prevStatus: previousStatus }
      );
      if (!result.affectedRows) {
        return R.conflict(res, 'El estado del turno ya fue modificado por otra operacion o no encontrado');
      }
      return R.noContent(res);
    } catch (e) {
      logAppointmentsError('PATCH /appointments/:id/status', e, { appointmentId: req.params.id, branchId: req.user?.branchId, body: req.body });
      next(e);
    }
  }
);

const postTriage = [
  body('priority').isIn(['immediate', 'urgent', 'less_urgent', 'non_urgent']),
  body('chiefComplaint').notEmpty().isString().isLength({ max: 2000 }),
  body('notes').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body('mucousMembranes').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('consciousnessLevel').optional({ nullable: true }).isString().isLength({ max: 200 }),
  body('painScore').optional({ nullable: true }).isInt({ min: 0, max: 10 }),
  body('heartRate').optional({ nullable: true }).isInt({ min: 0, max: 400 }),
  body('respiratoryRate').optional({ nullable: true }).isInt({ min: 0, max: 200 }),
  body('temperature').optional({ nullable: true }).isFloat({ min: 30, max: 45 }),
  body('systolicBp').optional({ nullable: true }).isInt({ min: 0, max: 400 }),
  validate,
  async (req, res, next) => {
    try {
      const {
        priority, chiefComplaint,
        heartRate, respiratoryRate, temperature,
        systolicBp, mucousMembranes,
        consciousnessLevel, painScore, notes,
      } = req.body;

      // SEC: verificar branchId Y orgId para evitar IDOR cross-org
      const appt = await db.queryOne(
        `SELECT a.id FROM appointments a
         JOIN patients p ON p.id = a.patient_id
         WHERE a.id = :id AND a.branch_id = :bid AND p.organization_id = :orgId`,
        { id: req.params.id, bid: req.user.branchId, orgId: req.user.orgId }
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
