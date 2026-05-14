'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { tenantLimiter } = require('../../middleware/rateLimiter');
const { makeServiceProxy } = require('../proxy.factory');

function registerBillingRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'billing/consolidated', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'invoices', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'payments/mp/webhook', makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'payments', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'price-lists', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'inventory', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'suppliers', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'purchase-orders', authMiddleware, tenantLimiter, makeServiceProxy('billing'));
}

module.exports = { registerBillingRoutes };
