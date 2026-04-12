'use strict';
/**
 * DLP middleware para el gateway.
 *
 * Dos fases:
 *   1. PRE-REQUEST  — si el usuario ya superó el umbral en la ventana actual,
 *                     rechaza con 429 ANTES de proxiar al microservicio.
 *   2. POST-RESPONSE — intercepta la respuesta y acumula el conteo en Redis.
 *                      Si el nuevo total supera el umbral, la respuesta igual
 *                      se entrega pero el usuario queda bloqueado en la próxima.
 */

const dlp    = require('../../../shared/dlp');
const cache  = require('../../../shared/cache');
const logger = require('../../../shared/logger');

const LIST_PATH_PATTERN = /\/(patients|clients|medical-records|lab-orders|invoices|appointments|records)/;
const EXPORT_THRESHOLD   = parseInt(process.env.DLP_EXPORT_THRESHOLD   || '1000');
const EXPORT_WINDOW_SECS = parseInt(process.env.DLP_EXPORT_WINDOW_SECS || '300');

async function dlpMiddleware(req, res, next) {
  // Solo aplicar en métodos GET a paths de listado
  if (req.method !== 'GET') return next();
  if (!LIST_PATH_PATTERN.test(req.path)) return next();

  const userId = req.user?.userId || req.headers['x-user-id'];
  const orgId  = req.user?.orgId  || req.headers['x-org-id'];

  if (!userId || !orgId) return next();

  // ── Fase 1: pre-check — bloquear si ya excedió en ventana anterior ───────────
  try {
    const client = await cache.getClient();
    const current = parseInt(await client.get(`dlp:export:${orgId}:${userId}`) || '0');
    if (current > EXPORT_THRESHOLD) {
      logger.warn('[dlp-middleware] Pre-check blocked — threshold exceeded', { userId, orgId, current });
      return res.status(429).json({
        success: false,
        error: {
          message: 'Mass export limit reached. Contact support if this is unexpected.',
          code:    'DLP_EXPORT_BLOCKED',
        },
      });
    }
  } catch (err) {
    // DLP is a secondary control — fail-open but log with high severity
    logger.error('[dlp-middleware] Pre-check failed — Redis unavailable, DLP bypassed', { err: err.message, userId, orgId });
  }

  // ── Fase 2: post-response — acumular conteo después de recibir la respuesta ──
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    try {
      let recordCount = 0;
      if (body?.meta?.total) {
        recordCount = parseInt(body.meta.total) || 0;
      } else if (Array.isArray(body?.data)) {
        recordCount = body.data.length;
      }

      if (recordCount > 0) {
        dlp.trackExport(userId, orgId, recordCount).catch(err => {
          logger.warn('[dlp-middleware] trackExport failed', { err: err.message });
        });
      }
    } catch { /* ignorar */ }

    return originalJson(body);
  };

  next();
}

module.exports = { dlpMiddleware };
