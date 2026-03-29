'use strict';
/**
 * Plugin: Audit Enhanced
 * Enriquece el audit log con metadata adicional (user-agent, duración de request).
 */
const logger = require('../shared/logger');

module.exports = {
  id:          'audit-enhanced',
  name:        'Enhanced Audit Logging',
  version:     '1.0.0',
  description: 'Adds request duration and user-agent to audit logs',

  hooks: {
    before: (req, _res) => {
      req._pluginStartTime = Date.now();
      return null; // no abortar
    },

    after: (req, res) => {
      const duration = req._pluginStartTime ? Date.now() - req._pluginStartTime : null;
      const userId   = req.headers?.['x-user-id'];
      const orgId    = req.headers?.['x-org-id'];

      if (res.statusCode >= 400 && userId) {
        logger.info('[audit-enhanced] Request completed', {
          userId, orgId,
          method:     req.method,
          path:       req.path,
          status:     res.statusCode,
          durationMs: duration,
          userAgent:  req.headers?.['user-agent']?.slice(0, 100),
        });
      }
    },
  },
};
