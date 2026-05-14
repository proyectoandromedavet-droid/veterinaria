'use strict';

const express = require('express');
const {
  R,
  db,
  log,
  messaging,
  queueNotificationRetry,
  reminderDueExpr,
} = require('../notifications.common');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { channel = 'both', daysAhead = 1 } = req.body;

    const reminders = await db.query(
      `SELECT r.id, r.reminder_type, ${reminderDueExpr('r')} AS due_date,
              p.name AS pet_name,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone,
              b.name AS clinic_name
       FROM reminders r
       JOIN patients p        ON r.patient_id = p.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients cl         ON po.client_id = cl.id
       JOIN branches b         ON r.branch_id = b.id
       WHERE r.branch_id = :bid
         AND r.status = 'pending'
         AND r.scheduled_send_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL :days DAY)
         AND cl.phone IS NOT NULL`,
      { bid: req.user.branchId, days: daysAhead }
    );

    let sent = 0;
    let failed = 0;
    for (const r of reminders) {
      try {
        const retryPayload = {
          channel,
          to: r.phone,
          template: 'appointmentReminder',
          vars: {
            ownerName: r.owner_name,
            petName: r.pet_name,
            date: new Date(r.due_date).toLocaleDateString('es-AR'),
            time: new Date(r.due_date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
            vetName: 'su veterinario',
            clinicName: r.clinic_name,
          },
        };
        await messaging.sendTemplate(channel, retryPayload.to, retryPayload.template, retryPayload.vars);
        await db.query(`UPDATE reminders SET status='sent', sent_at=NOW() WHERE id=:id`, { id: r.id });
        sent++;
      } catch (err) {
        await queueNotificationRetry({
          channel: 'template',
          payload: {
            channel,
            to: r.phone,
            template: 'appointmentReminder',
            vars: {
              ownerName: r.owner_name,
              petName: r.pet_name,
              date: new Date(r.due_date).toLocaleDateString('es-AR'),
              time: new Date(r.due_date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
              vetName: 'su veterinario',
              clinicName: r.clinic_name,
            },
          },
          req,
        }).catch((retryErr) => log.warn('bulk reminder retry queue failed', { err: retryErr.message, reminderId: r.id }));
        failed++;
      }
    }

    return R.ok(res, { total: reminders.length, sent, failed });
  } catch (err) {
    log.warn('bulk reminders failed', { err: err.message });
    next(err);
  }
});

module.exports = router;
