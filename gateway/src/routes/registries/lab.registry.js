'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const { makeServiceProxy } = require('../proxy.factory');

function registerLabRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'lab', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'imaging', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'pathology', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'surgeries', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'hospitalizations', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'vaccinations', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'deworming', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
}

module.exports = { registerLabRoutes };
