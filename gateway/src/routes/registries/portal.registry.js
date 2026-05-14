'use strict';

const { makeServiceProxy } = require('../proxy.factory');

function registerPortalRoutes(app, registerVersioned) {
  registerVersioned(app, 'use', 'portal/auth', makeServiceProxy('portal'));
  registerVersioned(app, 'use', 'portal', makeServiceProxy('portal'));
}

module.exports = { registerPortalRoutes };
