'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const { makeServiceProxy } = require('../proxy.factory');

function registerMedicalRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'appointments', authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'medical-records', authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'triage', authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'prescriptions', authMiddleware, tenantLimiter, makeServiceProxy('medical'));
}

module.exports = { registerMedicalRoutes };
