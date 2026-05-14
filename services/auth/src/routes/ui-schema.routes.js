'use strict';

const { Router }        = require('express');
const cache             = require('../../../../shared/cache');
const { generateUiSchema } = require('../../../../shared/uiSchema');
const { getFlags }      = require('../../../../shared/featureFlags');
const { createLogger }   = require('../../../../shared/logger');
const R = require('../../../../shared/response');

const router = Router();
const UI_SCHEMA_TTL = 60; // segundos
const log = createLogger('auth-ui-schema');

/**
 * GET /me/ui-schema
 * Retorna el schema de UI personalizado para el usuario autenticado.
 * Usa X-User-* headers inyectados por el gateway (mismo patrón que todo el sistema).
 */
router.get('/me/ui-schema', async (req, res, next) => {
  try {
    const userId   = req.headers['x-user-id'];
    const orgId    = req.headers['x-org-id'];
    const branchId = req.headers['x-branch-id'];
    const rolesRaw = req.headers['x-user-roles'] || '';
    const email    = req.headers['x-user-email'] || '';

    if (!userId || !orgId) {
      return R.error(res, 401, 'Authentication required', null, 'AUTH_001');
    }

    const roles = rolesRaw.split(',').map(r => r.trim()).filter(Boolean);
    const user  = { userId, orgId, branchId, roles, email };

    // Cache por usuario
    const cacheKey = `ui-schema:${userId}:${orgId}`;

    let redisClient;
    try {
      redisClient = await cache.getClient();
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return res.json({ success: true, data: JSON.parse(cached), cached: true });
      }
    } catch (err) {
      log.warn('UI schema cache unavailable', { error: err.message, userId, orgId });
    }

    // Obtener feature flags del org
    let flags = {};
    try {
      flags = await getFlags(orgId);
    } catch (err) {
      log.warn('Feature flags unavailable for UI schema', { error: err.message, orgId });
    }

    const schema = await generateUiSchema(user, flags);

    // Guardar en cache
    try {
      if (redisClient) {
        await redisClient.setEx(cacheKey, UI_SCHEMA_TTL, JSON.stringify(schema));
      }
    } catch (err) {
      log.warn('UI schema cache write failed', { error: err.message, userId, orgId });
    }

    res.json({ success: true, data: schema, cached: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
