'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { getAllStatus } = require('../../../../shared/circuitBreaker');
const { listServices } = require('../../../../shared/serviceRegistry');

function registerPlatformRoutes(app, registerVersioned) {
  registerVersioned(app, 'get', 'health/services', authMiddleware, (_req, res) =>
    res.json({ success: true, data: getAllStatus() })
  );
  registerVersioned(app, 'get', 'platform/services', authMiddleware, async (_req, res) =>
    res.json({ success: true, data: await listServices().catch(() => []) })
  );
}

module.exports = { registerPlatformRoutes };
