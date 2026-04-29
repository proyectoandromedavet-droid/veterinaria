'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db       = require('../../../../shared/db');
const R        = require('../../../../shared/response');
const calendar = require('../../../../shared/calendar');
const icalLib  = require('../../../../shared/ical');

const router = Router();
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

const getAppointmentTypes = [async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id,
              name,
              NULL AS code,
              NULL AS category,
              default_duration_minutes,
              color_hex,
              COALESCE(requires_prep, 0) AS requires_fasting
       FROM appointment_types
       WHERE COALESCE(is_active, 1) = TRUE
         AND (organization_id IS NULL OR organization_id = :orgId)
         AND (branch_id IS NULL OR branch_id = :branchId)
       ORDER BY name`
      ,
      { orgId: req.user.orgId, branchId: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
}];

// GET /appointments
router.get('/', async (req, res, next) => {
  try {
    const { date, vetId, status, patientId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['a.branch_id = :branchId', 'p.organization_id = :orgId'];
    const params = { branchId: req.user.branchId, orgId: req.user.orgId, limit: parseInt(limit), offset: parseInt(offset) };

    if (date)      { conditions.push('DATE(a.scheduled_date) = :date');   params.date = date; }
    if (vetId)     { conditions.push('a.vet_id = :vetId');                params.vetId = vetId; }
    if (status)    { conditions.push('a.status = :status');               params.status = status; }
    if (patientId) { conditions.push('a.patient_id = :patientId');        params.patientId = patientId; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const rows = await db.query(
      `SELECT a.id, a.scheduled_date, a.duration_minutes, a.status, a.is_emergency,
              a.reason, a.notes,
              p.id AS patient_id, p.name AS patient_name,
              sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name, cl.phone AS owner_phone,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              at2.name AS appointment_type,
              mr.id AS medical_record_id, mr.status AS record_status
       FROM appointments a
       JOIN patients     p   ON a.patient_id       = p.id
       JOIN species      sp  ON p.species_id        = sp.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients      cl  ON po.client_id        = cl.id
       JOIN users        u   ON a.vet_id            = u.id
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       LEFT JOIN medical_records mr ON mr.appointment_id = a.id
       ${where}
       ORDER BY a.scheduled_date ASC
       LIMIT :limit OFFSET :offset`,
      params
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /appointments/today
router.get('/today', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_today_appointments WHERE branch_id = :bid ORDER BY scheduled_date`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /appointments/types
router.get('/types', ...getAppointmentTypes);

// GET /appointments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const appt = await db.queryOne(
      `SELECT a.*, at2.name AS type_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM appointments a
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       JOIN patients p ON a.patient_id = p.id
       JOIN species  sp ON p.species_id = sp.id
       JOIN users    u  ON a.vet_id     = u.id
       WHERE a.id = :id AND a.branch_id = :bid AND p.organization_id = :orgId`,
      { id: req.params.id, bid: req.user.branchId, orgId: req.user.orgId }
    );
    if (!appt) return R.notFound(res);
    return R.ok(res, appt);
  } catch (e) { next(e); }
});

// POST /appointments
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

      const [r] = await db.query(
        `INSERT INTO appointments
           (branch_id, patient_id, vet_id, scheduled_date, duration_minutes,
            appointment_type_id, reason, notes, is_emergency, status)
         VALUES (:bid, :pid, :vid, :date, :dur, :typeId, :reason, :notes, :emerg, 'scheduled')`,
        {
          bid: req.user.branchId, pid: patientId, vid: vetId,
          date: scheduledDate, dur: durationMinutes,
          typeId: appointmentTypeId || null, reason: reason || null,
          notes: notes || null, emerg: isEmergency ? 1 : 0,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// PATCH /appointments/:id/status
router.patch('/:id/status',
  body('status').isIn(['scheduled','confirmed','in_progress','completed','cancelled','no_show']),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE appointments SET status = :status, updated_at = NOW()
         WHERE id = :id AND branch_id = :bid`,
        { status: req.body.status, id: req.params.id, bid: req.user.branchId }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

const postTriage = [
  body('priority').isIn(['immediate','urgent','less_urgent','non_urgent']),
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
          apptId: req.params.id, priority, cc: chiefComplaint,
          hr: heartRate || null, rr: respiratoryRate || null,
          temp: temperature || null, sbp: systolicBp || null,
          mm: mucousMembranes || null, cl: consciousnessLevel || null,
          pain: painScore || null, notes: notes || null,
          user: req.user.userId,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  },
];

// POST /appointments/:id/triage
router.post('/:id/triage', ...postTriage);

// ─── iCal ─────────────────────────────────────────────────────────────────────

// GET /appointments/:id/ical  — descarga .ics de la cita
router.get('/:id/ical', async (req, res, next) => {
  try {
    const appt = await db.queryOne(
      `SELECT a.*, at2.name AS type_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone AS owner_phone, cl.email AS owner_email,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM appointments a
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       JOIN patients p   ON a.patient_id  = p.id
       JOIN species  sp  ON p.species_id  = sp.id
       JOIN users    u   ON a.vet_id      = u.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients  cl  ON po.client_id  = cl.id
       WHERE a.id = :id AND a.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!appt) return R.notFound(res);

    // Datos de la clínica (branch)
    const branch = await db.queryOne(
      `SELECT b.name, b.address, b.phone,
              o.email AS clinic_email
       FROM branches b
       JOIN organizations o ON b.organization_id = o.id
       WHERE b.id = :bid`,
      { bid: req.user.branchId }
    );

    const clinic = {
      name    : branch?.name,
      address : branch?.address,
      phone   : branch?.phone,
      email   : branch?.clinic_email,
    };

    const icsContent = icalLib.generateAppointmentIcs(appt, clinic);
    const filename   = `cita-${appt.id}-${appt.patient_name.replace(/\s+/g, '_')}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(icsContent);
  } catch (e) { next(e); }
});

// GET /appointments/agenda/ical?date=YYYY-MM-DD  — agenda del día en .ics
router.get('/agenda/ical', async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const appointments = await db.query(
      `SELECT a.*, at2.name AS type_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone AS owner_phone, cl.email AS owner_email,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM appointments a
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       JOIN patients p   ON a.patient_id  = p.id
       JOIN species  sp  ON p.species_id  = sp.id
       JOIN users    u   ON a.vet_id      = u.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients  cl  ON po.client_id  = cl.id
       WHERE DATE(a.scheduled_date) = :date AND a.branch_id = :bid AND p.organization_id = :orgId
       ORDER BY a.scheduled_date ASC`,
      { date, bid: req.user.branchId, orgId: req.user.orgId }
    );

    const branch = await db.queryOne(
      `SELECT b.name, b.address, b.phone, o.email AS clinic_email
       FROM branches b
       JOIN organizations o ON b.organization_id = o.id
       WHERE b.id = :bid`,
      { bid: req.user.branchId }
    );

    const clinic = {
      name    : branch?.name,
      address : branch?.address,
      phone   : branch?.phone,
      email   : branch?.clinic_email,
    };

    const icsContent = icalLib.generateAgendaIcs(appointments, clinic);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="agenda-${date}.ics"`);
    res.send(icsContent);
  } catch (e) { next(e); }
});

// ─── Google Calendar OAuth ────────────────────────────────────────────────────

// GET /appointments/calendar/connect  — devuelve URL para autorizar Google
router.get('/calendar/connect', async (req, res, next) => {
  try {
    const url = calendar.getAuthUrl(req.user.userId);
    return R.ok(res, { authUrl: url });
  } catch (e) { next(e); }
});

// GET /appointments/calendar/status  — verifica si el user tiene Google conectado
router.get('/calendar/status', async (req, res, next) => {
  try {
    const connected = await calendar.isConnected(req.user.userId);
    return R.ok(res, { connected });
  } catch (e) { next(e); }
});

// DELETE /appointments/calendar/disconnect  — revoca acceso Google
router.delete('/calendar/disconnect', async (req, res, next) => {
  try {
    await calendar.revokeAccess(req.user.userId);
    return R.ok(res, { message: 'Google Calendar desconectado' });
  } catch (e) { next(e); }
});

// GET /appointments/calendar/events?from=&to=  — lista eventos del calendario Google
router.get('/calendar/events', async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString();
    const to   = req.query.to   || new Date(Date.now() + 30 * 86_400_000).toISOString();
    const events = await calendar.listEvents(req.user.userId, from, to);
    return R.ok(res, events);
  } catch (e) {
    if (e.code === 'GCAL_NOT_CONNECTED') return R.badRequest(res, 'Google Calendar no conectado. Usa /appointments/calendar/connect');
    next(e);
  }
});

// POST /appointments/:id/calendar/sync  — sincroniza una cita con Google Calendar
router.post('/:id/calendar/sync', async (req, res, next) => {
  try {
    const appt = await db.queryOne(
      `SELECT a.*, at2.name AS type_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone AS owner_phone,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM appointments a
       LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
       JOIN patients p  ON a.patient_id = p.id
       JOIN species  sp ON p.species_id = sp.id
       JOIN users    u  ON a.vet_id     = u.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients  cl ON po.client_id = cl.id
       WHERE a.id = :id AND a.branch_id = :bid AND p.organization_id = :orgId`,
      { id: req.params.id, bid: req.user.branchId, orgId: req.user.orgId }
    );
    if (!appt) return R.notFound(res);

    const result = appt.google_event_id
      ? await calendar.updateEvent(req.user.userId, appt)
      : await calendar.createEvent(req.user.userId, appt);

    return R.ok(res, result);
  } catch (e) {
    if (e.code === 'GCAL_NOT_CONNECTED') return R.badRequest(res, 'Google Calendar no conectado. Usa /appointments/calendar/connect');
    next(e);
  }
});

// DELETE /appointments/:id/calendar/sync  — elimina el evento de Google Calendar
router.delete('/:id/calendar/sync', async (req, res, next) => {
  try {
    const appt = await db.queryOne(
      `SELECT a.id, a.google_event_id
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       WHERE a.id = :id AND a.branch_id = :bid AND p.organization_id = :orgId`,
      { id: req.params.id, bid: req.user.branchId, orgId: req.user.orgId }
    );
    if (!appt) return R.notFound(res);
    if (!appt.google_event_id) return R.badRequest(res, 'Esta cita no tiene evento en Google Calendar');

    await calendar.deleteEvent(req.user.userId, appt.google_event_id);
    return R.ok(res, { message: 'Evento eliminado de Google Calendar' });
  } catch (e) {
    if (e.code === 'GCAL_NOT_CONNECTED') return R.badRequest(res, 'Google Calendar no conectado');
    next(e);
  }
});

module.exports = router;
module.exports.postTriage = postTriage;
module.exports.getAppointmentTypes = getAppointmentTypes;
