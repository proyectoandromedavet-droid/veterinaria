'use strict';

require('dotenv').config();

const path = require('path');
const { buildApp, startService } = require('../../../shared/serviceBase');
const { log } = require('./notifications.common');
const { startRuntime } = require('./bootstrap/runtime');

const coreRoutes = require('./routes/notifications.core.routes');
const remindersRoutes = require('./routes/notifications.reminders.routes');
const messageSendRoutes = require('./routes/messages.send.routes');
const messageTemplateRoutes = require('./routes/messages.template.routes');
const messageReminderRoutes = require('./routes/messages.reminders.routes');
const messageBulkRoutes = require('./routes/messages.bulk.routes');
const messageHistoryRoutes = require('./routes/messages.history.routes');
const fcmRoutes = require('./routes/notifications.fcm.routes');

const PORT = parseInt(process.env.PORT || '3009', 10);
const retryIntervalMs = parseInt(process.env.NOTIFICATION_RETRY_INTERVAL_MS || '30000', 10);

const app = buildApp('notifications', (app) => {
  app.use('/notifications', coreRoutes);
  app.use('/notifications/reminders', remindersRoutes);
  app.use('/notifications/messages/send', messageSendRoutes);
  app.use('/notifications/messages/template', messageTemplateRoutes);
  app.use('/notifications/messages/reminder', messageReminderRoutes);
  app.use('/notifications/messages/bulk-reminders', messageBulkRoutes);
  app.use('/notifications/messages', messageHistoryRoutes);
  app.use('/notifications/fcm', fcmRoutes);
}, {
  specPath: path.join(__dirname, 'openapi.yaml'),
});

if (process.env.NODE_ENV !== 'test') {
  startService(app, 'notifications', PORT, {
    onStarted: () => startRuntime({
      retryIntervalMs,
    }),
    onShutdown: async ({ startupState }) => {
      if (startupState?.retryInterval) clearInterval(startupState.retryInterval);
      if (startupState?.stopEventBus) {
        await startupState.stopEventBus().catch((err) => log.warn('event bus stop failed', { err: err.message }));
      }
    },
  });
}

module.exports = app;
