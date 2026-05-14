'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const { makeServiceProxy } = require('../proxy.factory');

function registerEngagementRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'tele', authMiddleware, tenantLimiter, makeServiceProxy('telemedicine'));
  registerVersioned(app, 'use', 'grooming', authMiddleware, tenantLimiter, makeServiceProxy('grooming'));
  registerVersioned(app, 'use', 'reports', authMiddleware, tenantLimiter, makeServiceProxy('reports'));
  registerVersioned(app, 'use', 'notifications/fcm', authMiddleware, tenantLimiter, makeServiceProxy('notifications'));
  registerVersioned(app, 'use', 'notifications', authMiddleware, tenantLimiter, makeServiceProxy('notifications'));
  registerVersioned(app, 'use', 'documents', authMiddleware, tenantLimiter, makeServiceProxy('documents'));
}

module.exports = { registerEngagementRoutes };
