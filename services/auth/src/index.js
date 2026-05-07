'use strict';

require('dotenv').config();
require('express-async-errors'); // patch Express to forward async errors to error handler

const path         = require('path');
const express      = require('express');
const cookieParser = require('cookie-parser');
const { getJwks } = require('../../../shared/jwt');
const { scanSuspiciousAccessPatterns } = require('../../../shared/securityAlerts');
const {
  helmetMiddleware,
  hppMiddleware,
  compressionMiddleware,
  sanitize,
  requestId,
} = require('../../../shared/security');
const { requireInternalSig } = require('../../../shared/internalAuth');
const { withOpenApiValidation, startService } = require('../../../shared/serviceBase');
const { appErrorHandler } = require('../../../shared/errors');
const { createLogger }    = require('../../../shared/logger');
const log = createLogger('auth');
const app  = express();
const PORT = parseInt(process.env.PORT || '3001');
let alertScanInterval = null;

// ── Security headers ──────────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(compressionMiddleware);
app.use(requestId);

// ── Cookie + Body parsing + sanitization ─────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '256kb' }));  // auth payloads never need to be large
app.use(hppMiddleware);
app.use(sanitize);

// ── OpenAPI request validation (auto-enables if spec exists) ──────────────────
// ignorePaths: only validate the main auth endpoints defined in the spec
withOpenApiValidation(app, path.join(__dirname, 'openapi.yaml'), {
  ignorePaths:      /^\/(?:admin|audit|schema|me|\.well-known)\//,
  validateSecurity: false,  // auth is handled by our own middleware, not the spec
});

// Routes
app.use('/', require('./routes/auth.routes'));
app.use('/audit', requireInternalSig, require('./routes/audit-export.routes'));
app.use('/admin/rbac', require('./routes/admin-rbac.routes'));
app.use('/admin/features', require('./routes/admin-feature-flags.routes'));
app.use('/admin/auth', require('./routes/admin-auth.routes'));
app.use('/admin/preview', require('./routes/admin-table-preview.routes'));
app.use('/admin', require('./routes/admin-users.routes'));
app.use('/admin/data-governance', requireInternalSig, require('./routes/data-governance.routes'));
app.use('/admin/plugins', requireInternalSig, require('./routes/plugins.routes'));
app.use('/me', requireInternalSig, require('./routes/ui-schema.routes'));

// JWKS — public key endpoint for RS256 token verification
// Returns all active keys (includes old key during rotation grace period)
app.get('/.well-known/jwks.json', (_req, res) => {
  try {
    res.json(getJwks());
  } catch {
    res.status(503).json({ error: 'JWKS not available' });
  }
});

// Health
app.get('/health', async (_req, res) => {
  const checks  = {};
  const latency = {};
  let healthy   = true;

  try {
    const t0 = Date.now();
    const db = require('../../../shared/db');
    await db.getPool().execute('SELECT 1');
    checks.db  = 'ok';
    latency.db = Date.now() - t0;
  } catch {
    checks.db = 'error';
    healthy   = false;
  }

  try {
    const t0    = Date.now();
    const cache = require('../../../shared/cache');
    const redis = await cache.getClient();
    await redis.ping();
    checks.redis  = 'ok';
    latency.redis = Date.now() - t0;
  } catch {
    checks.redis = 'degraded';
  }

  const mem = process.memoryUsage();
  checks.memory = {
    heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
  };

  res.status(healthy ? 200 : 503).json({
    status:  healthy ? 'ok' : 'degraded',
    service: 'auth',
    version: process.env.APP_VERSION || '1.0.0',
    uptime:  Math.floor(process.uptime()),
    ts:      new Date().toISOString(),
    checks,
    latency,
  });
});

app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'auth', ts: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  try {
    const db = require('../../../shared/db');
    await db.getPool().execute('SELECT 1');
    res.status(200).json({ status: 'ready', service: 'auth', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'not_ready', service: 'auth', ts: new Date().toISOString() });
  }
});

app.use('/schema', require('./routes/schema.routes'));

// Error handler
app.use(appErrorHandler);
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { message: 'Invalid JSON body' } });
  }
  log.error(err.message, { stack: err.stack, traceId: req.headers['x-trace-id'] });
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ success: false, error: { message: isProd ? 'Internal server error' : err.message } });
});

if (process.env.NODE_ENV !== 'test') {
  startService(app, 'auth', PORT, { drainMs: 10_000 });
  alertScanInterval = setInterval(() => {
    scanSuspiciousAccessPatterns(parseInt(process.env.SECURITY_ALERT_SCAN_WINDOW_MINUTES || '1', 10)).catch(() => {});
  }, Math.max(30000, parseInt(process.env.SECURITY_ALERT_SCAN_INTERVAL_MS || '60000', 10)));
}

module.exports = app;
