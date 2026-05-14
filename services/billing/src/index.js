'use strict';

require('dotenv').config();

const path = require('path');
const { buildApp, startService, guardWrite } = require('../../../shared/serviceBase');
const { router: stripeRouter } = require('./routes/stripe.routes');
const { invoicesRouter, paymentsRouter, priceListsRouter, inventoryRouter, suppliersRouter, purchaseOrdersRouter, consolidatedRouter, mpRouter, mpWebhookRouter, afipRouter } = require('./routes/billing.routes');

const app = buildApp('billing', (app, requirePerm) => {
  app.use('/invoices', requirePerm('invoices:read'), guardWrite('invoices'), invoicesRouter);
  app.use('/invoices', requirePerm('invoices:create'), afipRouter);
  app.use('/payments/mp/webhook', mpWebhookRouter);
  app.use('/payments/mp', requirePerm('payments:create'), mpRouter);
  app.use('/payments', requirePerm('payments:create'), paymentsRouter);
  app.use('/price-lists', requirePerm('invoices:read'), guardWrite('invoices'), priceListsRouter);
  app.use('/inventory', requirePerm('inventory:read'), guardWrite('inventory'), inventoryRouter);
  app.use('/suppliers', requirePerm('inventory:read'), guardWrite('inventory'), suppliersRouter);
  app.use('/purchase-orders', requirePerm('inventory:read'), guardWrite('inventory'), purchaseOrdersRouter);
  app.use('/billing/consolidated', requirePerm('reports:read'), consolidatedRouter);
  app.use('/billing', requirePerm('billing:read'), stripeRouter);
}, { specPath: path.join(__dirname, 'openapi.yaml') });

const PORT = parseInt(process.env.PORT || '4055');
if (process.env.NODE_ENV !== 'test') {
  startService(app, 'billing', PORT);
}

module.exports = app;
