'use strict';

require('dotenv').config();

const { Router }  = require('express');
const { body, validationResult } = require('express-validator');
const crypto      = require('crypto');
const { buildApp, guardWrite, startService } = require('../../../shared/serviceBase');
const db     = require('../../../shared/db');
const R      = require('../../../shared/response');
const webrtc = require('../../../shared/webrtc');
const fcm    = require('../../../shared/fcm');
const { sendTemplate } = require('../../../shared/messaging');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessionsRouter = Router();

sessionsRouter.get('/', async (req, res, next) => {
  try {
    const { status, vetId, date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['ts.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('ts.status = :status'); p.status = status; }
    if (vetId)  { conds.push('ts.vet_id = :vetId');  p.vetId  = vetId; }
    if (date)   { conds.push('DATE(ts.scheduled_at) = :date'); p.date = date; }

    const rows = await db.query(
      `SELECT ts.id, ts.session_code, ts.status, ts.session_type, ts.scheduled_at,
              ts.duration_minutes, ts.meeting_url, ts.platform_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.phone,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM tele_sessions ts
       JOIN patients p    ON ts.patient_id  = p.id
       JOIN species  sp   ON p.species_id   = sp.id
       JOIN clients  cl   ON ts.client_id   = cl.id
       JOIN users    u    ON ts.vet_id       = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY ts.scheduled_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

sessionsRouter.get('/today', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_tele_today WHERE branch_id = :bid ORDER BY scheduled_at`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

sessionsRouter.get('/:id', async (req, res, next) => {
  try {
    const session = await db.queryOne(
      `SELECT ts.*, tp.name AS platform_name,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.email, cl.phone,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM tele_sessions ts
       LEFT JOIN tele_platforms tp ON ts.platform_id = tp.id
       JOIN patients p    ON ts.patient_id = p.id
       JOIN species  sp   ON p.species_id  = sp.id
       JOIN clients  cl   ON ts.client_id  = cl.id
       JOIN users    u    ON ts.vet_id     = u.id
       WHERE ts.id = :id AND ts.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!session) return R.notFound(res);

    const [preAnamnesis, messages, prescriptions, docs] = await Promise.all([
      db.queryOne(`SELECT * FROM tele_pre_anamnesis WHERE session_id = :sid`, { sid: req.params.id }),
      db.query(
        `SELECT tm.id, tm.sender_type, tm.message_text, tm.sent_at, tm.is_read,
                tm.attachment_url, tm.attachment_type
         FROM tele_messages tm WHERE tm.session_id = :sid ORDER BY tm.sent_at ASC`,
        { sid: req.params.id }
      ),
      db.query(
        `SELECT tdp.*, pi.medication_name, pi.dose, pi.frequency, pi.duration_days
         FROM tele_digital_prescriptions tdp
         LEFT JOIN prescription_items pi ON pi.prescription_id = tdp.prescription_id
         WHERE tdp.session_id = :sid`,
        { sid: req.params.id }
      ),
      db.query(
        `SELECT * FROM tele_shared_documents WHERE session_id = :sid ORDER BY shared_at DESC`,
        { sid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...session, preAnamnesis, messages, prescriptions, sharedDocuments: docs });
  } catch (e) { next(e); }
});

sessionsRouter.post('/',
  body('patientId').isInt(),
  body('clientId').isInt(),
  body('vetId').isInt(),
  body('scheduledAt').isISO8601(),
  body('sessionType').isIn(['consultation','follow_up','second_opinion','emergency','prescription_renewal']),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, clientId, vetId, scheduledAt, sessionType,
        platformId, durationMinutes = 30, chiefComplaint, notes,
      } = req.body;

      // Generate unique session code
      const sessionCode = `TELE-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const [r] = await db.query(
        `INSERT INTO tele_sessions
           (branch_id, patient_id, client_id, vet_id,
            session_code, session_type, platform_id,
            scheduled_at, duration_minutes, chief_complaint, notes, status)
         VALUES (:bid,:pid,:cid,:vid,:code,:type,:plat,:sched,:dur,:cc,:notes,'scheduled')`,
        {
          bid: req.user.branchId, pid: patientId, cid: clientId, vid: vetId,
          code: sessionCode, type: sessionType, plat: platformId || null,
          sched: scheduledAt, dur: durationMinutes,
          cc: chiefComplaint || null, notes: notes || null,
        }
      );
      return R.created(res, { id: r.insertId, sessionCode });
    } catch (e) { next(e); }
  }
);

sessionsRouter.patch('/:id/status',
  body('status').isIn(['scheduled','waiting','in_progress','completed','cancelled','no_show']),
  validate,
  async (req, res, next) => {
    try {
      const updates = { status: req.body.status };
      if (req.body.status === 'in_progress') updates.started_at = new Date().toISOString();
      if (req.body.status === 'completed')   updates.ended_at   = new Date().toISOString();
      if (req.body.meetingUrl)               updates.meeting_url = req.body.meetingUrl;
      if (req.body.connectionQuality)        updates.connection_quality = req.body.connectionQuality;

      const sets = Object.keys(updates).map(k => `${k} = :${k}`).join(', ');
      await db.query(
        `UPDATE tele_sessions SET ${sets}, updated_at=NOW() WHERE id=:id AND branch_id=:bid`,
        { ...updates, id: req.params.id, bid: req.user.branchId }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// POST /tele/sessions/:id/pre-anamnesis (filled by client before session)
sessionsRouter.post('/:id/pre-anamnesis',
  body('currentSymptoms').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const {
        currentSymptoms, symptomsDuration, symptomsOnset,
        currentMedications, recentChanges, ownerConcerns,
        appetiteChange, behaviorChange, mediaUrls,
      } = req.body;

      await db.query(
        `INSERT INTO tele_pre_anamnesis
           (session_id, current_symptoms, symptoms_duration, symptoms_onset,
            current_medications, recent_changes, owner_concerns,
            appetite_change, behavior_change, media_urls, submitted_by)
         VALUES (:sid,:sym,:dur,:onset,:meds,:changes,:concerns,:app,:beh,:media,:uid)
         ON DUPLICATE KEY UPDATE
           current_symptoms=VALUES(current_symptoms), symptoms_duration=VALUES(symptoms_duration)`,
        {
          sid: req.params.id, sym: currentSymptoms, dur: symptomsDuration || null,
          onset: symptomsOnset || null, meds: currentMedications || null,
          changes: recentChanges || null, concerns: ownerConcerns || null,
          app: appetiteChange || null, beh: behaviorChange || null,
          media: mediaUrls ? JSON.stringify(mediaUrls) : null, uid: req.user.userId,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// POST /tele/sessions/:id/messages
sessionsRouter.post('/:id/messages',
  body('messageText').optional(),
  async (req, res, next) => {
    try {
      const { messageText, senderType = 'vet', attachmentUrl, attachmentType } = req.body;
      if (!messageText && !attachmentUrl) return R.badRequest(res, 'message or attachment required');

      const [r] = await db.query(
        `INSERT INTO tele_messages
           (session_id, sender_id, sender_type, message_text, attachment_url, attachment_type)
         VALUES (:sid,:uid,:type,:msg,:att,:attType)`,
        {
          sid: req.params.id, uid: req.user.userId, type: senderType,
          msg: messageText || null, att: attachmentUrl || null, attType: attachmentType || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// POST /tele/sessions/:id/prescription (digital prescription with hash)
sessionsRouter.post('/:id/prescription',
  body('prescriptionId').isInt(),
  validate,
  async (req, res, next) => {
    try {
      const { prescriptionId, validityDays = 30 } = req.body;

      // Generate digital signature hash
      const signatureData = `${prescriptionId}-${req.user.userId}-${Date.now()}`;
      const signatureHash = crypto.createHash('sha256').update(signatureData).digest('hex');
      const expiresAt = new Date(Date.now() + validityDays * 86400000).toISOString().slice(0, 10);

      const [r] = await db.query(
        `INSERT INTO tele_digital_prescriptions
           (session_id, prescription_id, vet_id, signature_hash, expires_at, status)
         VALUES (:sid,:pid,:uid,:hash,:exp,'active')`,
        {
          sid: req.params.id, pid: prescriptionId,
          uid: req.user.userId, hash: signatureHash, exp: expiresAt,
        }
      );

      return R.created(res, { id: r.insertId, signatureHash, expiresAt });
    } catch (e) { next(e); }
  }
);

// POST /tele/sessions/:id/rating
sessionsRouter.post('/:id/rating',
  body('overallScore').isInt({ min: 1, max: 5 }),
  validate,
  async (req, res, next) => {
    try {
      const { overallScore, vetScore, connectionScore, platformScore, comment } = req.body;
      await db.query(
        `INSERT INTO tele_ratings
           (session_id, rated_by, overall_score, vet_score, connection_score, platform_score, comment)
         VALUES (:sid,:uid,:overall,:vet,:conn,:plat,:comment)`,
        {
          sid: req.params.id, uid: req.user.userId,
          overall: overallScore, vet: vetScore || null,
          conn: connectionScore || null, plat: platformScore || null,
          comment: comment || null,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// GET /tele/stats (vet stats view)
const statsRouter = Router();
statsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_tele_vet_stats WHERE branch_id = :bid ORDER BY total_sessions DESC`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// GET /tele/platforms
const platformsRouter = Router();
platformsRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM tele_platforms WHERE is_active = TRUE ORDER BY name`);
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ─── WebRTC: room management ──────────────────────────────────────────────────

// GET /tele/webrtc/config — STUN/TURN servers para el browser
sessionsRouter.get('/webrtc-config', (req, res) => {
  return R.ok(res, { ...webrtc.getIceServers(), provider: webrtc.PROVIDER });
});

// POST /tele/sessions/:id/room — crear sala de video
sessionsRouter.post('/:id/room', async (req, res, next) => {
  try {
    const session = await db.queryOne(
      `SELECT ts.*, cl.email AS client_email, cl.phone AS client_phone,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name
       FROM tele_sessions ts
       JOIN clients cl ON ts.client_id = cl.id
       JOIN users   u  ON ts.vet_id    = u.id
       WHERE ts.id = :id AND ts.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!session) return R.notFound(res);

    // Verificar que no tenga ya una sala activa
    const existing = await db.queryOne(
      `SELECT id, room_name, room_url FROM webrtc_rooms
       WHERE session_id = :sid AND status IN ('created','active')`,
      { sid: req.params.id }
    );
    if (existing) {
      return R.ok(res, existing);
    }

    const roomName  = webrtc.buildRoomName(req.params.id);
    const expiresAt = Math.floor(Date.now() / 1000) + (session.duration_minutes || 60) * 60 + 900;   // +15 min buffer

    const room = await webrtc.createRoom({
      roomName,
      expiresAt,
      enableRecording   : req.body.enableRecording || false,
      maxParticipants   : 2,
    });

    // Guardar en DB
    const [r] = await db.query(
      `INSERT INTO webrtc_rooms
         (session_id, room_name, provider, provider_room_id, room_url, host_url, expires_at)
       VALUES (:sid, :name, :prov, :provId, :url, :hostUrl, FROM_UNIXTIME(:exp))`,
      {
        sid    : session.id,
        name   : room.roomName,
        prov   : webrtc.PROVIDER,
        provId : room.providerRoomId || null,
        url    : room.roomUrl || null,
        hostUrl: room.providerData?.hostRoomUrl || null,
        exp    : expiresAt,
      }
    );
    const roomId = r.insertId;

    // Actualizar meeting_url en la sesión
    await db.query(
      'UPDATE tele_sessions SET meeting_url=:url, platform_name=:prov WHERE id=:id',
      { url: room.roomUrl, prov: webrtc.PROVIDER, id: session.id }
    );

    // Notificar al cliente por WhatsApp + FCM
    if (session.client_phone) {
      sendTemplate('whatsapp', session.client_phone, 'teleSessionReady', {
        clientName : session.client_name,
        vetName    : session.vet_name,
        joinUrl    : room.roomUrl || '',
      }).catch(() => {});
    }
    await fcm.sendToTopic(`owner_${session.client_id}`, {
      title : '📹 Tu videoconsulta está lista',
      body  : `Dr. ${session.vet_name} está listo. Hacé click para unirte.`,
      data  : { sessionId: String(session.id), roomUrl: room.roomUrl || '' },
    }).catch(() => {});

    return R.created(res, { roomId, roomName: room.roomName, roomUrl: room.roomUrl, provider: webrtc.PROVIDER });
  } catch (e) { next(e); }
});

// GET /tele/sessions/:id/room — obtener sala activa
sessionsRouter.get('/:id/room', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT wr.*, COUNT(wp.id) AS participant_count
       FROM webrtc_rooms wr
       LEFT JOIN webrtc_participants wp ON wp.room_id = wr.id AND wp.left_at IS NULL
       WHERE wr.session_id = :sid
       GROUP BY wr.id
       ORDER BY wr.created_at DESC LIMIT 1`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res, 'Sala no creada todavía');
    return R.ok(res, room);
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/room/token — generar token de acceso
sessionsRouter.post('/:id/room/token', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT * FROM webrtc_rooms WHERE session_id = :sid AND status IN ('created','active')`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res, 'Sala no encontrada o expirada');

    const { identity, role = 'guest' } = req.body;
    if (!identity) return R.badRequest(res, 'identity requerido (email o userId)');

    const result = await webrtc.generateToken({
      roomName   : room.room_name,
      identity,
      role,
      ttlSeconds : 3600,
    });

    // Registrar participante
    await db.query(
      `INSERT INTO webrtc_participants (room_id, identity, role, joined_at)
       VALUES (:rid, :identity, :role, NOW())
       ON DUPLICATE KEY UPDATE joined_at = NOW(), left_at = NULL`,
      { rid: room.id, identity, role }
    );

    // Actualizar estado de sala a 'active' si era 'created'
    if (room.status === 'created') {
      await db.query(`UPDATE webrtc_rooms SET status='active' WHERE id=:id`, { id: room.id });
    }

    return R.ok(res, { ...result, roomName: room.room_name, provider: webrtc.PROVIDER });
  } catch (e) { next(e); }
});

// DELETE /tele/sessions/:id/room — cerrar sala
sessionsRouter.delete('/:id/room', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT * FROM webrtc_rooms WHERE session_id = :sid`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res, 'Sala no encontrada');

    await webrtc.deleteRoom(room.room_name).catch(() => {});
    await db.query(
      `UPDATE webrtc_rooms SET status='ended', updated_at=NOW() WHERE id=:id`,
      { id: room.id }
    );
    // Cerrar participantes activos
    await db.query(
      `UPDATE webrtc_participants SET left_at=NOW(),
         duration_sec = TIMESTAMPDIFF(SECOND, joined_at, NOW())
       WHERE room_id=:rid AND left_at IS NULL`,
      { rid: room.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── Grabaciones ──────────────────────────────────────────────────────────────

// POST /tele/sessions/:id/room/recording/start
sessionsRouter.post('/:id/room/recording/start', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT * FROM webrtc_rooms WHERE session_id=:sid AND status='active'`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res, 'No hay sala activa');

    const { recordingId } = await webrtc.startRecording(room.room_name);

    const [r] = await db.query(
      `INSERT INTO webrtc_recordings (room_id, session_id, provider_rec_id, status, started_at)
       VALUES (:rid, :sid, :recId, 'recording', NOW())`,
      { rid: room.id, sid: req.params.id, recId: recordingId }
    );
    return R.created(res, { id: r.insertId, recordingId });
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/room/recording/stop
sessionsRouter.post('/:id/room/recording/stop', async (req, res, next) => {
  try {
    const rec = await db.queryOne(
      `SELECT wr.room_name, wrec.*
       FROM webrtc_recordings wrec
       JOIN webrtc_rooms wr ON wrec.room_id = wr.id
       WHERE wrec.session_id = :sid AND wrec.status = 'recording'
       ORDER BY wrec.started_at DESC LIMIT 1`,
      { sid: req.params.id }
    );
    if (!rec) return R.notFound(res, 'No hay grabación activa');

    const result = await webrtc.stopRecording(rec.room_name, rec.provider_rec_id);

    await db.query(
      `UPDATE webrtc_recordings SET status='processing', duration_sec=:dur, ended_at=NOW(), storage_url=:url
       WHERE id=:id`,
      { dur: result.duration || null, url: result.url || null, id: rec.id }
    );
    return R.ok(res, { id: rec.id, ...result });
  } catch (e) { next(e); }
});

// GET /tele/sessions/:id/recordings
sessionsRouter.get('/:id/recordings', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT wrec.*, wr.room_name
       FROM webrtc_recordings wrec
       JOIN webrtc_rooms wr ON wrec.room_id = wr.id
       WHERE wrec.session_id = :sid
       ORDER BY wrec.created_at DESC`,
      { sid: req.params.id }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ─── Sala de espera ───────────────────────────────────────────────────────────

// GET /tele/sessions/:id/waiting-room — lista de espera
sessionsRouter.get('/:id/waiting-room', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT id FROM webrtc_rooms WHERE session_id=:sid AND status IN ('created','active')`,
      { sid: req.params.id }
    );
    if (!room) return R.ok(res, []);

    const waiting = await db.query(
      `SELECT * FROM webrtc_waiting_room WHERE room_id=:rid AND status='waiting' ORDER BY joined_at ASC`,
      { rid: room.id }
    );
    return R.ok(res, waiting);
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/waiting-room/join — cliente se anuncia en sala de espera
sessionsRouter.post('/:id/waiting-room/join', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT id FROM webrtc_rooms WHERE session_id=:sid AND status IN ('created','active')`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res, 'La sala aún no fue creada por el veterinario');

    const { identity, displayName } = req.body;
    if (!identity) return R.badRequest(res, 'identity requerido');

    const [r] = await db.query(
      `INSERT INTO webrtc_waiting_room (room_id, identity, display_name, status, joined_at)
       VALUES (:rid, :identity, :name, 'waiting', NOW())`,
      { rid: room.id, identity, name: displayName || identity }
    );

    // Notificar al vet por FCM
    const session = await db.queryOne(
      `SELECT ts.vet_id FROM tele_sessions ts WHERE ts.id=:sid`,
      { sid: req.params.id }
    );
    if (session?.vet_id) {
      await fcm.sendToTopic(`role_${req.user?.orgId || 0}_veterinarian`, {
        title : '🔔 Paciente en sala de espera',
        body  : `${displayName || identity} está esperando unirse a la videoconsulta.`,
        data  : { sessionId: String(req.params.id), waitingId: String(r.insertId) },
      }).catch(() => {});
    }

    return R.created(res, { id: r.insertId, message: 'Agregado a sala de espera. El veterinario lo admitirá en breve.' });
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/waiting-room/:wId/admit — vet admite al participante
sessionsRouter.post('/:id/waiting-room/:wId/admit', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE webrtc_waiting_room SET status='admitted', acted_at=NOW()
       WHERE id=:wId`,
      { wId: req.params.wId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/waiting-room/:wId/reject — vet rechaza al participante
sessionsRouter.post('/:id/waiting-room/:wId/reject', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE webrtc_waiting_room SET status='rejected', acted_at=NOW() WHERE id=:wId`,
      { wId: req.params.wId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── Participantes ────────────────────────────────────────────────────────────

// GET /tele/sessions/:id/room/participants
sessionsRouter.get('/:id/room/participants', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT id FROM webrtc_rooms WHERE session_id=:sid ORDER BY created_at DESC LIMIT 1`,
      { sid: req.params.id }
    );
    if (!room) return R.ok(res, []);

    const participants = await db.query(
      `SELECT * FROM webrtc_participants WHERE room_id=:rid ORDER BY joined_at DESC`,
      { rid: room.id }
    );
    return R.ok(res, participants);
  } catch (e) { next(e); }
});

// POST /tele/sessions/:id/room/participants/:identity/leave — participante sale
sessionsRouter.post('/:id/room/participants/:identity/leave', async (req, res, next) => {
  try {
    const room = await db.queryOne(
      `SELECT id FROM webrtc_rooms WHERE session_id=:sid AND status='active'`,
      { sid: req.params.id }
    );
    if (!room) return R.notFound(res);

    await db.query(
      `UPDATE webrtc_participants SET left_at=NOW(),
         duration_sec = TIMESTAMPDIFF(SECOND, joined_at, NOW())
       WHERE room_id=:rid AND identity=:identity AND left_at IS NULL`,
      { rid: room.id, identity: req.params.identity }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── App ───────────────────────────────────────────────────────────────────────
const app = buildApp('telemedicine', (app, requirePerm) => {
  app.use('/tele/sessions',         requirePerm('telemedicine:read'), guardWrite('telemedicine'), sessionsRouter);
  app.use('/tele/stats',            requirePerm('telemedicine:read'), statsRouter);
  app.use('/tele/platforms',        requirePerm('telemedicine:read'), platformsRouter);
  app.get('/tele/webrtc/config',    requirePerm('telemedicine:read'), (req, res) => {
    return R.ok(res, { ...webrtc.getIceServers(), provider: webrtc.PROVIDER });
  });
});

const PORT = parseInt(process.env.PORT || '3006');
startService(app, 'telemedicine', PORT);
