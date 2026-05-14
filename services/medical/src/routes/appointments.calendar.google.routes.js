'use strict';

const { Router } = require('express');
const { db, R, calendar, logAppointmentsError } = require('./appointments.common');

const router = Router();

router.get('/calendar/connect', async (req, res, next) => {
  try {
    const url = calendar.getAuthUrl(req.user.userId);
    return R.ok(res, { authUrl: url });
  } catch (e) {
    logAppointmentsError('GET /appointments/calendar/connect', e, { userId: req.user?.userId });
    next(e);
  }
});

router.get('/calendar/status', async (req, res, next) => {
  try {
    const connected = await calendar.isConnected(req.user.userId);
    return R.ok(res, { connected });
  } catch (e) {
    logAppointmentsError('GET /appointments/calendar/status', e, { userId: req.user?.userId });
    next(e);
  }
});

router.delete('/calendar/disconnect', async (req, res, next) => {
  try {
    await calendar.revokeAccess(req.user.userId);
    return R.ok(res, { message: 'Google Calendar desconectado' });
  } catch (e) {
    logAppointmentsError('DELETE /appointments/calendar/disconnect', e, { userId: req.user?.userId });
    next(e);
  }
});

router.get('/calendar/events', async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString();
    const to = req.query.to || new Date(Date.now() + 30 * 86_400_000).toISOString();
    const events = await calendar.listEvents(req.user.userId, from, to);
    return R.ok(res, events);
  } catch (e) {
    if (e.code === 'GCAL_NOT_CONNECTED') return R.badRequest(res, 'Google Calendar no conectado. Usa /appointments/calendar/connect');
    logAppointmentsError('GET /appointments/calendar/events', e, { userId: req.user?.userId, query: req.query });
    next(e);
  }
});

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
    logAppointmentsError('POST /appointments/:id/calendar/sync', e, { appointmentId: req.params.id, userId: req.user?.userId });
    next(e);
  }
});

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
    logAppointmentsError('DELETE /appointments/:id/calendar/sync', e, { appointmentId: req.params.id, userId: req.user?.userId });
    next(e);
  }
});

module.exports = { router };
