'use strict';
/**
 * Device Fingerprint — detecta cambio de dispositivo en sesiones activas.
 * El cliente envía X-Device-Fingerprint en cada request.
 * Al login, se guarda el fingerprint en user_sessions.
 * En requests posteriores, si cambia → security event.
 *
 * Flag-gated: DEVICE_FINGERPRINT_ENABLED=true en env
 */
const crypto = require('crypto');
const db     = require('./db');
const logger = require('./logger');

const ENABLED = () => process.env.DEVICE_FINGERPRINT_ENABLED === 'true';

/**
 * Normaliza el fingerprint del header (trunca a 64 chars, lowercase hex).
 */
function normalizeFingerprint(raw) {
  if (!raw) return null;
  // Si ya es hex, usar directo; si no, hashear
  if (/^[a-f0-9]{8,64}$/i.test(raw)) return raw.toLowerCase().slice(0, 64);
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Guarda el fingerprint del dispositivo al crear sesión.
 * Llamar desde el controller de login tras crear la sesión.
 */
async function recordDeviceFingerprint(sessionId, rawFingerprint) {
  if (!ENABLED()) return;
  const fp = normalizeFingerprint(rawFingerprint);
  if (!fp || !sessionId) return;

  try {
    await db.query(
      'UPDATE user_sessions SET device_fingerprint = :fp WHERE id = :sessionId',
      { fp, sessionId },
    );
  } catch (err) {
    logger.warn('[deviceFingerprint] Failed to record fingerprint', { err: err.message });
  }
}

/**
 * Middleware que verifica que el fingerprint del request coincide con el de la sesión.
 * Solo actúa si el header X-Device-Fingerprint está presente.
 * No bloquea — solo loguea el evento de seguridad y continúa.
 */
async function checkDeviceFingerprint(req, _res, next) {
  if (!ENABLED()) return next();

  const rawFp    = req.headers['x-device-fingerprint'];
  const sessionId = req.headers['x-session-id'];

  if (!rawFp || !sessionId) return next();

  try {
    const fp  = normalizeFingerprint(rawFp);
    const row = await db.queryOne(
      'SELECT device_fingerprint, user_id, org_id FROM user_sessions WHERE id = :sessionId AND expires_at > NOW()',
      { sessionId },
    );

    if (!row || !row.device_fingerprint) return next();

    if (row.device_fingerprint !== fp) {
      // Fingerprint cambió — loguear evento de seguridad
      logger.warn('[deviceFingerprint] Device change detected', {
        userId:    row.user_id,
        orgId:     row.org_id,
        sessionId,
        stored:    row.device_fingerprint.slice(0, 8) + '...',
        incoming:  fp.slice(0, 8) + '...',
      });

      // Registrar en security_events si la tabla existe
      try {
        await db.query(
          `INSERT INTO security_events (user_id, org_id, event_type, details, ip_address)
           VALUES (:userId, :orgId, 'device_change', :details, :ip)`,
          {
            userId:  row.user_id,
            orgId:   row.org_id,
            details: JSON.stringify({ sessionId, newFp: fp.slice(0, 16) }),
            ip:      req.ip || null,
          },
        );
      } catch { /* tabla puede no existir aún */ }
    }
  } catch (err) {
    logger.warn('[deviceFingerprint] Check failed', { err: err.message });
  }

  next(); // siempre continúa — no bloquea
}

module.exports = { captureFingerprint: recordDeviceFingerprint, checkDeviceFingerprint, normalizeFingerprint };
