'use strict';

const { authMiddleware } = require('../../middleware/auth');
const { authLimiter, passwordResetLimiter, tenantLimiter } = require('../../middleware/rateLimiter');
const { tenantMismatchGuard } = require('../../middleware/subdomain');
const { makeServiceProxy } = require('../proxy.factory');

const AUTH_PUBLIC = ['/login', '/refresh', '/register', '/password-reset', '/google', '/sso', '/.well-known', '/internal'];
const STRIP_AUTH_PREFIX = (_path, req) => req.originalUrl.replace(/^\/api\/v[12]\/auth/, '') || '/';

function registerAuthRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'auth/login', authLimiter);
  registerVersioned(app, 'use', 'auth/refresh', authLimiter);
  registerVersioned(app, 'use', 'auth/password-reset', passwordResetLimiter);

  const authProxy = makeServiceProxy('auth', STRIP_AUTH_PREFIX);
  registerVersioned(app, 'use', 'auth', (req, res, next) => {
    if (AUTH_PUBLIC.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      return authProxy(req, res, next);
    }
    next();
  });
  registerVersioned(app, 'use', 'auth', authMiddleware, tenantMismatchGuard, tenantLimiter, authProxy);
}

module.exports = { registerAuthRoutes, AUTH_PUBLIC, STRIP_AUTH_PREFIX };
