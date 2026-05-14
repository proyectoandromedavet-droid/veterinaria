'use strict';

const { Router } = require('express');
const { db, R, portalAuth, sendTemplate, publishPortalEvent, vBody, validate } = require('../portal.common');

const router = Router();

router.get('/', portalAuth, async (req, res, next) => {
  try {
    const { status, upcoming, page = 1 } = req.query;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = (Math.max(parseInt(page, 10), 1) - 1) * limit;
    const conds = ['i.client_id=:cid'];
    const p = { cid: req.owner.clientId, limit, offset };
    if (status) { conds.push('a.status=:status'); p.status = status; }
    if (upcoming === 'true') conds.push('a.appointment_date >= NOW()');

    const rows = await db.query(
      `SELECT a.id, a.appointment_date, a.duration_minutes, a.status, a.reason,
              a.appointment_type, a.notes,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              b.name AS clinic_name
       FROM appointments a
       JOIN patients p     ON a.patient_id = p.id
       JOIN species sp     ON p.species_id = sp.id
       JOIN users u        ON a.veterinarian_id = u.id
       JOIN branches b     ON a.branch_id = b.id
       JOIN patient_owners i ON i.patient_id = p.id AND i.client_id=:cid
       WHERE ${conds.join(' AND ')}
       ORDER BY a.appointment_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

router.post('/',
  portalAuth,
  vBody('patientId').isInt(),
  vBody('appointmentDate').isISO8601(),
  vBody('reason').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, appointmentDate, reason, notes, branchId } = req.body;
      const owned = await db.queryOne(`SELECT 1 FROM patient_owners WHERE patient_id=:pid AND client_id=:cid`, { pid: patientId, cid: req.owner.clientId });
      if (!owned) return R.forbidden(res, 'Sin acceso a esta mascota');

      const r = await db.query(
        `INSERT INTO appointments
           (patient_id, client_id, branch_id, appointment_date, reason, notes, status, appointment_type, created_by_portal)
         VALUES (:pid, :cid, :bid, :date, :reason, :notes, 'requested', 'general', 1)`,
        { pid: patientId, cid: req.owner.clientId, bid: branchId || null, date: appointmentDate, reason, notes: notes || null }
      );

      const client = await db.queryOne(`SELECT phone, first_name FROM clients WHERE id=:id`, { id: req.owner.clientId });
      const pet = await db.queryOne(`SELECT name FROM patients WHERE id=:id`, { id: patientId });
      const branch = branchId ? await db.queryOne(`SELECT name FROM branches WHERE id=:id`, { id: branchId }) : null;

      if (client?.phone) {
        sendTemplate('whatsapp', client.phone, 'appointmentConfirm', {
          ownerName: client.first_name,
          petName: pet?.name || 'su mascota',
          date: new Date(appointmentDate).toLocaleDateString('es-AR'),
          time: new Date(appointmentDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          clinicName: branch?.name || 'la clinica',
        }).catch((err) => console.warn('[portal] appointment confirm send failed', err.message));
      }

      publishPortalEvent('portal.appointment.requested', {
        appointmentId: r.insertId,
        patientId,
        clientId: req.owner.clientId,
        branchId: branchId || null,
        orgId: req.owner.orgId || null,
        appointmentDate,
        reason,
      }, req);

      return R.created(res, { id: r.insertId, message: 'Solicitud de cita enviada. Le confirmaremos a la brevedad.' });
    } catch (e) { next(e); }
  }
);

router.patch('/:id/cancel', portalAuth, async (req, res, next) => {
  try {
    const apt = await db.queryOne(
      `SELECT a.id, a.status FROM appointments a
       JOIN patient_owners po ON po.patient_id=a.patient_id AND po.client_id=:cid
       WHERE a.id=:id`,
      { id: req.params.id, cid: req.owner.clientId }
    );
    if (!apt) return R.notFound(res, 'Cita no encontrada');
    if (!['requested', 'confirmed'].includes(apt.status)) return R.conflict(res, 'Esta cita no puede cancelarse');

    await db.query(
      `UPDATE appointments SET status='cancelled', cancellation_reason=:reason, updated_at=NOW() WHERE id=:id`,
      { reason: req.body.reason || 'Cancelado por el duenio', id: apt.id }
    );
    publishPortalEvent('portal.appointment.cancelled', {
      appointmentId: apt.id,
      clientId: req.owner.clientId,
      orgId: req.owner.orgId || null,
      reason: req.body.reason || 'Cancelado por el duenio',
    }, req);
    return R.noContent(res);
  } catch (e) { next(e); }
});

module.exports = router;
