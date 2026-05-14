'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const { tenantMismatchGuard } = require('../../middleware/subdomain');
const { makeServiceProxy } = require('../proxy.factory');

function registerPatientsRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'clients', authMiddleware, tenantMismatchGuard, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'patients', authMiddleware, tenantMismatchGuard, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'species', authMiddleware, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'breeds', authMiddleware, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'branches', authMiddleware, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'clients/signatures/public-key', makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'clients/signatures/verify', makeServiceProxy('patients'));
}

module.exports = { registerPatientsRoutes };
