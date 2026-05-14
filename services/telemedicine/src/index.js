'use strict';

require('dotenv').config();

const path = require('path');
const { buildApp, guardWrite, startService } = require('../../../shared/serviceBase');

const sessionsRouter = require('./routes/sessions.routes');
const statsRouter = require('./routes/stats.routes');
const platformsRouter = require('./routes/platforms.routes');

const PORT = process.env.PORT || 3010;

const app = buildApp('telemedicine', (app, requirePerm) => {
  app.use('/tele/sessions', requirePerm('telemedicine:read'), guardWrite('telemedicine'), sessionsRouter);
  app.use('/tele/stats', requirePerm('telemedicine:read'), statsRouter);
  app.use('/tele/platforms', requirePerm('telemedicine:read'), platformsRouter);
  app.get('/tele/webrtc/config', requirePerm('telemedicine:read'), ...sessionsRouter.getWebrtcConfig);
}, {
  specPath: path.join(__dirname, 'openapi.yaml'),
});

startService(app, 'telemedicine', PORT);
