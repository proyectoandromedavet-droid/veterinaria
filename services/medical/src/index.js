'use strict';

require('dotenv').config();

const path = require('path');
const { buildApp, guardWrite, startService } = require('../../../shared/serviceBase');
const apptRouter   = require('./routes/appointments.routes');
const mrRouter     = require('./routes/medical-records.routes');
const rulesRouter  = require('./routes/rules.routes');

const app = buildApp('medical', (app, requirePerm) => {
  app.use('/appointments',    requirePerm('appointments:read'),    guardWrite('appointments'),    apptRouter);
  app.use('/medical-records', requirePerm('medical_records:read'), guardWrite('medical_records'), mrRouter);
  app.use('/triage',          requirePerm('appointments:create'),  apptRouter);   // triage ya requiere :create
  app.use('/prescriptions',   requirePerm('medical_records:read'), guardWrite('medical_records'), mrRouter);
  app.use('/follow-ups',      requirePerm('medical_records:read'), guardWrite('medical_records'), mrRouter);
  app.use('/rules',           requirePerm('settings:read'),        guardWrite('settings'),        rulesRouter);
}, { specPath: path.join(__dirname, 'openapi.yaml') });

const PORT = parseInt(process.env.PORT || '3003');
startService(app, 'medical', PORT);
