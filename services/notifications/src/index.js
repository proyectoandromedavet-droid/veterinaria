'use strict';

require('dotenv').config();

const http    = require('http');
const express = require('express');
const db        = require('../../../shared/db');
const R         = require('../../../shared/response');
const messaging = require('../../../shared/messaging');
const fcm       = require('../../../shared/fcm');
const { createRedisClient, connectRedis } = require('../../../shared/redis');

const app    = express();
const server = http.createServer(app);
const PORT   = parseInt(process.env.PORT || '3009');

app.use(express.json());

// ── User context from gateway headers ────────────────────────────────────────
app.use((req, _res, next) => {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
  };
  next();
});

// ── Redis pub/sub ─────────────────────────────────────────────────────────────
let redisPub, redisSub;

async function getRedis() {
  if (!redisPub) {
    redisPub = createRedisClient('notifications-pub');
    redisSub = createRedisClient('notifications-sub');
    await Promise.all([
      connectRedis(redisPub, 'notifications-pub'),
      connectRedis(redisSub, 'notifications-sub'),
    ]);
    if (redisPub.isReady && redisSub.isReady) {
      console.log('[notifications] Redis connected');
    } else {
      console.warn('[notifications] Redis unavailable, continuing in degraded mode');
    }
  }
  return { pub: redisPub, sub: redisSub };
}

// ── In-memory notification store (real impl would use DB table) ──────────────
// Uses notification_logs table from DB

// ── REST: GET /notifications ──────────────────────────────────────────────────
app.get('/notifications', async (req, res, next) => {
  try {
    const { unreadOnly = 'false', page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const where  = unreadOnly === 'true' ? 'AND nl.read_at IS NULL' : '';

    const rows = await db.query(
      `SELECT nl.id, nl.notification_type, nl.title, nl.message, nl.severity,
              nl.sent_at, nl.read_at, nl.action_url,
              nl.related_entity_type, nl.related_entity_id
       FROM notification_logs nl
       WHERE nl.user_id = :uid ${where}
       ORDER BY nl.sent_at DESC
       LIMIT :limit OFFSET :offset`,
      { uid: req.user.userId, limit: parseInt(limit), offset: parseInt(offset) }
    );
    const [{ unread }] = await db.query(
      `SELECT COUNT(*) AS unread FROM notification_logs WHERE user_id=:uid AND read_at IS NULL`,
      { uid: req.user.userId }
    );
    return R.ok(res, rows, { unreadCount: unread });
  } catch (e) { next(e); }
});

// ── REST: PATCH /notifications/:id/read ──────────────────────────────────────
app.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notification_logs SET read_at = NOW() WHERE id = :id AND user_id = :uid`,
      { id: req.params.id, uid: req.user.userId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── REST: PATCH /notifications/read-all ──────────────────────────────────────
app.patch('/notifications/read-all', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notification_logs SET read_at = NOW() WHERE user_id = :uid AND read_at IS NULL`,
      { uid: req.user.userId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── REST: POST /notifications/push  (internal use by other services) ──────────
app.post('/notifications/push', async (req, res, next) => {
  try {
    const {
      targetUserIds, targetRoles, branchId, orgId,
      type, title, message, severity = 'info',
      relatedEntityType, relatedEntityId, actionUrl,
    } = req.body;

    // Save to DB for each target user
    if (targetUserIds?.length) {
      for (const uid of targetUserIds) {
        await db.query(
          `INSERT INTO notification_logs
             (user_id, branch_id, notification_type, title, message, severity,
              related_entity_type, related_entity_id, action_url)
           VALUES (:uid,:bid,:type,:title,:msg,:sev,:entType,:entId,:url)`,
          {
            uid, bid: branchId || req.user.branchId,
            type, title, msg: message, sev: severity,
            entType: relatedEntityType || null, entId: relatedEntityId || null,
            url: actionUrl || null,
          }
        );
      }
    }

    // Publish to Redis → gateway WebSocket
    const { pub } = await getRedis();
    await pub.publish('notifications', JSON.stringify({
      type, targetUserIds, targetRoles, orgId, branchId, data: { title, message, severity, actionUrl },
    }));

    return R.created(res, { delivered: targetUserIds?.length || 0 });
  } catch (e) { next(e); }
});

// ── REST: POST /notifications/reminders/generate ─────────────────────────────
app.post('/notifications/reminders/generate', async (req, res, next) => {
  try {
    const results = await db.callProc('sp_generate_reminders', [req.user.branchId, 7]);
    return R.ok(res, { generated: results[0]?.[0]?.generated || 0 });
  } catch (e) { next(e); }
});

// ── REST: GET /notifications/reminders ───────────────────────────────────────
app.get('/notifications/reminders', async (req, res, next) => {
  try {
    const { status, type, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['r.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('r.status = :status'); p.status = status; }
    if (type)   { conds.push('r.reminder_type = :type'); p.type = type; }

    const rows = await db.query(
      `SELECT r.id, r.reminder_type, r.due_date, r.status, r.message,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name, cl.phone, cl.email
       FROM reminders r
       JOIN patients p     ON r.patient_id  = p.id
       JOIN species  sp    ON p.species_id  = sp.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type='primary'
       JOIN clients  cl    ON po.client_id  = cl.id
       WHERE ${conds.join(' AND ')}
       ORDER BY r.due_date ASC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── Mensajería: SMS + WhatsApp ────────────────────────────────────────────────

/**
 * POST /notifications/messages/send
 * Envío manual de SMS o WhatsApp a un número.
 * Body: { channel, to, message }
 */
app.post('/notifications/messages/send', async (req, res, next) => {
  try {
    const { channel = 'whatsapp', to, message } = req.body;
    if (!to || !message) return R.badRequest(res, 'to y message son requeridos');
    if (!['sms', 'whatsapp', 'both'].includes(channel)) return R.badRequest(res, 'channel debe ser sms, whatsapp o both');

    let result;
    if (channel === 'sms')       result = await messaging.sendSms(to, message);
    if (channel === 'whatsapp')  result = await messaging.sendWhatsApp(to, message);
    if (channel === 'both') {
      const [sms, wa] = await Promise.allSettled([
        messaging.sendSms(to, message),
        messaging.sendWhatsApp(to, message),
      ]);
      result = { sms: sms.value || sms.reason?.message, whatsapp: wa.value || wa.reason?.message };
    }

    await logMessage({ channel, to, message, result, userId: req.user.userId, branchId: req.user.branchId });
    return R.ok(res, result);
  } catch (e) { next(e); }
});

/**
 * POST /notifications/messages/template
 * Envío usando template predefinido.
 * Body: { channel, to, template, vars }
 */
app.post('/notifications/messages/template', async (req, res, next) => {
  try {
    const { channel = 'whatsapp', to, template, vars = {} } = req.body;
    if (!to || !template) return R.badRequest(res, 'to y template son requeridos');

    const result = await messaging.sendTemplate(channel, to, template, vars);
    await logMessage({ channel, to, message: result.body, result: result.results, userId: req.user.userId, branchId: req.user.branchId, template });
    return R.ok(res, result);
  } catch (e) { next(e); }
});

/**
 * POST /notifications/messages/reminder/:reminderId
 * Envía el recordatorio de un reminder pendiente por SMS y/o WhatsApp.
 */
app.post('/notifications/messages/reminder/:reminderId', async (req, res, next) => {
  try {
    const { channel = 'both' } = req.body;
    const reminder = await db.queryOne(
      `SELECT r.id, r.reminder_type, r.message, r.due_date,
              p.name AS pet_name,
              CONCAT(cl.first_name,' ',cl.last_name) AS owner_name,
              cl.phone, cl.email,
              b.name AS clinic_name
       FROM reminders r
       JOIN patients p      ON r.patient_id = p.id
       JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
       JOIN clients cl       ON po.client_id = cl.id
       JOIN branches b       ON r.branch_id = b.id
       WHERE r.id = :id AND r.branch_id = :bid`,
      { id: req.params.reminderId, bid: req.user.branchId }
    );
    if (!reminder) return R.notFound(res, 'Recordatorio no encontrado');
    if (!reminder.phone) return R.badRequest(res, 'El cliente no tiene teléfono registrado');

    const result = await messaging.sendTemplate(channel, reminder.phone, 'appointmentReminder', {
      ownerName:  reminder.owner_name,
      petName:    reminder.pet_name,
      date:       new Date(reminder.due_date).toLocaleDateString('es-AR'),
      time:       new Date(reminder.due_date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      vetName:    'su veterinario',
      clinicName: reminder.clinic_name,
    });

    // Marcar recordatorio como enviado
    await db.query(
      `UPDATE reminders SET status = 'sent', sent_at = NOW() WHERE id = :id`,
      { id: reminder.id }
    );

    await logMessage({ channel, to: reminder.phone, message: result.body, result: result.results, userId: req.user.userId, branchId: req.user.branchId, relatedId: reminder.id, relatedType: 'reminder' });
    return R.ok(res, result);
  } catch (e) { next(e); }
});

/**
 * POST /notifications/messages/bulk-reminders
 * Envía todos los recordatorios pendientes del día por WhatsApp/SMS.
 */
app.post('/notifications/messages/bulk-reminders', async (req, res, next) => {
  try {
    const { channel = 'both', daysAhead = 1 } = req.body;

    const reminders = await db.query(
      `SELECT r.id, r.reminder_type, r.due_date,
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
         AND r.due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL :days DAY)
         AND cl.phone IS NOT NULL`,
      { bid: req.user.branchId, days: daysAhead }
    );

    let sent = 0, failed = 0;
    for (const r of reminders) {
      try {
        await messaging.sendTemplate(channel, r.phone, 'appointmentReminder', {
          ownerName:  r.owner_name,
          petName:    r.pet_name,
          date:       new Date(r.due_date).toLocaleDateString('es-AR'),
          time:       new Date(r.due_date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          vetName:    'su veterinario',
          clinicName: r.clinic_name,
        });
        await db.query(`UPDATE reminders SET status='sent', sent_at=NOW() WHERE id=:id`, { id: r.id });
        sent++;
      } catch (_) { failed++; }
    }

    return R.ok(res, { total: reminders.length, sent, failed });
  } catch (e) { next(e); }
});

/**
 * GET /notifications/messages
 * Historial de mensajes enviados.
 */
app.get('/notifications/messages', async (req, res, next) => {
  try {
    const { channel, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (channel) { conds.push('channel = :channel'); p.channel = channel; }

    const rows = await db.query(
      `SELECT id, channel, to_number, template_name, message_preview,
              status, twilio_sid, error_message, sent_at
       FROM message_logs
       WHERE ${conds.join(' AND ')}
       ORDER BY sent_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ── Helper: registrar mensaje en DB ──────────────────────────────────────────
async function logMessage({ channel, to, message, result, userId, branchId, template, relatedId, relatedType }) {
  try {
    const sid    = Array.isArray(result) ? result[0]?.sid : result?.sid;
    const status = Array.isArray(result) ? (result.some(r => r.sid) ? 'sent' : 'failed') : (result?.sid ? 'sent' : 'failed');
    const error  = Array.isArray(result) ? result.find(r => r.error)?.error : result?.error;

    await db.query(
      `INSERT INTO message_logs
         (branch_id, user_id, channel, to_number, template_name, message_preview,
          status, twilio_sid, error_message, related_entity_type, related_entity_id, sent_at)
       VALUES (:bid, :uid, :ch, :to, :tmpl, :preview, :status, :sid, :err, :relType, :relId, NOW())`,
      {
        bid:     branchId,
        uid:     userId || null,
        ch:      channel,
        to,
        tmpl:    template || null,
        preview: message?.slice(0, 255),
        status,
        sid:     sid || null,
        err:     error || null,
        relType: relatedType || null,
        relId:   relatedId || null,
      }
    );
  } catch (_) {} // no bloquear por fallo de log
}

// ── FCM: registro de tokens ───────────────────────────────────────────────────

/**
 * POST /notifications/fcm/register
 * El cliente envía su FCM token al iniciar sesión o al obtener uno nuevo.
 * Body: { token, platform, deviceName }
 */
app.post('/notifications/fcm/register', async (req, res, next) => {
  try {
    const { token, platform = 'web', deviceName } = req.body;
    if (!token) return R.badRequest(res, 'token requerido');

    // Upsert: si el token ya existe lo reactiva, si no lo crea
    await db.query(
      `INSERT INTO user_fcm_tokens (user_id, org_id, branch_id, token, platform, device_name, is_active, last_used_at)
       VALUES (:uid, :oid, :bid, :token, :platform, :device, 1, NOW())
       ON DUPLICATE KEY UPDATE
         user_id=:uid, org_id=:oid, branch_id=:bid,
         platform=:platform, device_name=:device,
         is_active=1, last_used_at=NOW(), updated_at=NOW()`,
      { uid: req.user.userId, oid: req.user.orgId, bid: req.user.branchId||null, token, platform, device: deviceName||null }
    );

    // Suscribir al topic de la org y la sucursal
    const topics = [`org_${req.user.orgId}`];
    if (req.user.branchId) topics.push(`branch_${req.user.branchId}`);
    for (const role of req.user.roles || []) topics.push(`role_${req.user.orgId}_${role}`);

    await Promise.allSettled(topics.map(t => fcm.subscribeToTopic([token], t)));

    return R.ok(res, { message: 'Token FCM registrado' });
  } catch (e) { next(e); }
});

/**
 * DELETE /notifications/fcm/unregister
 * El cliente desregistra su token (al cerrar sesión).
 * Body: { token }
 */
app.delete('/notifications/fcm/unregister', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return R.badRequest(res, 'token requerido');

    await db.query(
      `UPDATE user_fcm_tokens SET is_active=0, updated_at=NOW()
       WHERE token=:token AND user_id=:uid`,
      { token, uid: req.user.userId }
    );

    // Desuscribir de todos los topics
    const topics = [
      `org_${req.user.orgId}`,
      `branch_${req.user.branchId}`,
      ...( req.user.roles||[]).map(r => `role_${req.user.orgId}_${r}`),
    ].filter(Boolean);

    await Promise.allSettled(topics.map(t => fcm.unsubscribeFromTopic([token], t)));

    return R.noContent(res);
  } catch (e) { next(e); }
});

/**
 * GET /notifications/fcm/tokens
 * Lista los tokens activos del usuario.
 */
app.get('/notifications/fcm/tokens', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, platform, device_name, last_used_at, created_at
       FROM user_fcm_tokens
       WHERE user_id=:uid AND is_active=1
       ORDER BY last_used_at DESC`,
      { uid: req.user.userId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

/**
 * POST /notifications/fcm/send
 * Envío manual de push (admin/sistema).
 * Body: { targetUserIds?, topic?, title, body, data?, imageUrl? }
 */
app.post('/notifications/fcm/send', async (req, res, next) => {
  try {
    const { targetUserIds, topic, title, body: msgBody, data, imageUrl } = req.body;
    if (!title || !msgBody) return R.badRequest(res, 'title y body requeridos');

    const payload = { title, body: msgBody, data, imageUrl };
    let result;

    if (topic) {
      // Enviar a topic (org/branch/role)
      await fcm.sendToTopic(topic, payload);
      result = { method: 'topic', topic };
    } else if (targetUserIds?.length) {
      // Obtener tokens de los usuarios destino
      const tokenRows = await db.query(
        `SELECT token FROM user_fcm_tokens
         WHERE user_id IN (:uids) AND is_active=1`,
        { uids: targetUserIds }
      );
      const tokens = tokenRows.map(r => r.token);
      if (!tokens.length) return R.ok(res, { sent: 0, message: 'Sin tokens registrados' });

      result = await fcm.sendToMultiple(tokens, payload);

      // Desactivar tokens inválidos
      if (result.failedTokens.length) {
        await db.query(
          `UPDATE user_fcm_tokens SET is_active=0 WHERE token IN (:tokens)`,
          { tokens: result.failedTokens }
        );
      }
    } else {
      return R.badRequest(res, 'Especificar targetUserIds o topic');
    }

    return R.ok(res, result);
  } catch (e) { next(e); }
});

// ── Integración: cuando se hace push interno → también FCM ───────────────────
// Override del endpoint /notifications/push para agregar FCM
const _originalPushHandler = app._router?.stack?.find(l => l.route?.path === '/notifications/push');

app.post('/notifications/fcm/broadcast', async (req, res, next) => {
  try {
    const { orgId, branchId, roles, title, body: msgBody, data, imageUrl } = req.body;
    if (!title || !msgBody) return R.badRequest(res, 'title y body requeridos');

    const payload = { title, body: msgBody, data, imageUrl };
    const results = [];

    // Enviar a org
    if (orgId) {
      await fcm.sendToTopic(`org_${orgId}`, payload).catch(() => {});
      results.push(`org_${orgId}`);
    }
    // Enviar a sucursal
    if (branchId) {
      await fcm.sendToTopic(`branch_${branchId}`, payload).catch(() => {});
      results.push(`branch_${branchId}`);
    }
    // Enviar a roles
    if (roles?.length && orgId) {
      for (const role of roles) {
        await fcm.sendToTopic(`role_${orgId}_${role}`, payload).catch(() => {});
        results.push(`role_${orgId}_${role}`);
      }
    }

    return R.ok(res, { topics: results });
  } catch (e) { next(e); }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notifications' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[notifications]', err.message);
  res.status(500).json({ success: false, error: { message: err.message } });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  await getRedis().catch(e => console.warn('[notifications] Redis not available:', e.message));
  console.log(`[notifications] running on port ${PORT}`);
});
