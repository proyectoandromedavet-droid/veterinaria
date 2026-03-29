'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const swaggerUi  = require('swagger-ui-express');
const YAML       = require('yamljs');

const corsMiddleware  = require('./middleware/cors');
const { apiLimiter, tenantLimiter } = require('./middleware/rateLimiter');
const { morganMiddleware, logger }  = require('./middleware/logger');
const { correlationId }             = require('../../shared/correlationId');
const { subdomainMiddleware }       = require('./middleware/subdomain');
const { versioningMiddleware }      = require('./middleware/versioning');
const { dlpMiddleware }             = require('./middleware/dlp');
const { registerProxies }          = require('./routes/proxy');
const { attachWebSocket }          = require('./websocket');

const {
  helmetMiddleware,
  hppMiddleware,
  compressionMiddleware,
  sanitize,
  requestId,
  ipGuard,
  idempotency,
} = require('../../shared/security');

const { httpMetrics, metricsHandler } = require('../../shared/metrics');
const { auditMiddleware }             = require('../../shared/audit');
const { wafMiddleware }               = require('../../shared/waf');
const webhookWorker                   = require('../../shared/webhooks/worker');
const { appErrorHandler }             = require('../../shared/errors');

const app    = express();
const server = http.createServer(app);
const PORT   = parseInt(process.env.PORT || '4050');
const V      = process.env.API_VERSION || 'v1';

// ── Security headers (must be first) ─────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(compressionMiddleware);

// ── Correlation ID (trace_id) — debe ir antes de cualquier log ───────────────
app.use(correlationId);

// ── Request ID + IP guard ─────────────────────────────────────────────────────
app.use(requestId);
app.use(ipGuard);

// ── Subdomain tenant resolver ─────────────────────────────────────────────────
app.use(subdomainMiddleware);

// ── CORS + logging ────────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(morganMiddleware);

// ── Body parsing + sanitization ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(hppMiddleware);
app.use(sanitize);

// ── WAF — pattern-based attack detection ──────────────────────────────────────
app.use(wafMiddleware);

// ── Rate limiting (global) ────────────────────────────────────────────────────
app.use(`/api/${V}`, apiLimiter);

// ── Idempotency ───────────────────────────────────────────────────────────────
app.use(idempotency);

// ── HTTP metrics ──────────────────────────────────────────────────────────────
app.use(httpMetrics('gateway'));

// ── Audit logging ─────────────────────────────────────────────────────────────
app.use(auditMiddleware({ mode: 'mutations' }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks  = {};
  const latency = {};
  let healthy   = true;

  // Redis ping
  try {
    const { getClient } = require('../../shared/cache');
    const t0     = Date.now();
    const client = await getClient();
    await client.ping();
    checks.redis  = 'ok';
    latency.redis = Date.now() - t0;
  } catch {
    checks.redis = 'degraded';
  }

  res.status(healthy ? 200 : 503).json({
    status:  healthy ? 'ok' : 'degraded',
    service: 'gateway',
    version: V,
    uptime:  Math.floor(process.uptime()),
    ts:      new Date().toISOString(),
    checks,
    latency,
  });
});

// ── Deep health check — agrega estado de todos los servicios ─────────────────
const SERVICE_URLS = {
  auth:          process.env.SERVICE_AUTH          || 'http://localhost:4051',
  patients:      process.env.SERVICE_PATIENTS      || 'http://localhost:4052',
  medical:       process.env.SERVICE_MEDICAL       || 'http://localhost:4053',
  lab:           process.env.SERVICE_LAB           || 'http://localhost:4054',
  billing:       process.env.SERVICE_BILLING       || 'http://localhost:4055',
  telemedicine:  process.env.SERVICE_TELEMEDICINE  || 'http://localhost:4056',
  grooming:      process.env.SERVICE_GROOMING      || 'http://localhost:4057',
  reports:       process.env.SERVICE_REPORTS       || 'http://localhost:4058',
  notifications: process.env.SERVICE_NOTIFICATIONS || 'http://localhost:4059',
  portal:        process.env.SERVICE_PORTAL        || 'http://localhost:4060',
  ai:            process.env.SERVICE_AI            || 'http://localhost:4061',
};

app.get('/health/deep', async (_req, res) => {
  const TIMEOUT_MS = 3000;
  const results    = {};
  let   allOk      = true;

  await Promise.all(
    Object.entries(SERVICE_URLS).map(async ([name, baseUrl]) => {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const resp = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
        clearTimeout(tid);
        const body = await resp.json().catch(() => ({}));
        results[name] = {
          status:  resp.ok ? (body.status || 'ok') : 'error',
          latency: Date.now() - t0,
          checks:  body.checks || undefined,
        };
        if (!resp.ok) allOk = false;
      } catch (e) {
        results[name] = { status: 'unreachable', latency: Date.now() - t0, error: e.message };
        allOk = false;
      }
    })
  );

  res.status(allOk ? 200 : 207).json({
    status:   allOk ? 'ok' : 'degraded',
    service:  'gateway',
    version:  V,
    ts:       new Date().toISOString(),
    services: results,
  });
});

// ── Prometheus metrics endpoint ───────────────────────────────────────────────
// Restrict to internal network via IP_WHITELIST or leave open in dev
app.get('/metrics', metricsHandler);

// ── Swagger UI ────────────────────────────────────────────────────────────────
const openApiPath = path.join(__dirname, '../docs/openapi.yaml');
try {
  const swaggerDoc = YAML.load(openApiPath);
  app.use(`/api/${V}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'VetManager Pro API',
    swaggerOptions: { persistAuthorization: true },
  }));
  logger.info(`Swagger UI at /api/${V}/docs`);
} catch (_) {
  logger.warn('openapi.yaml not found — Swagger UI disabled');
}

// ── OpenAPI request validation ────────────────────────────────────────────────
// Validates incoming request bodies, params and query strings against the spec.
// Only active when openapi.yaml exists and OPENAPI_VALIDATE != 'false'.
if (process.env.OPENAPI_VALIDATE !== 'false') {
  try {
    const { middleware: openApiValidator } = require('express-openapi-validator');
    app.use(openApiValidator({
      apiSpec:           openApiPath,
      validateRequests:  true,
      validateResponses: false,   // response validation has high overhead in proxy
      ignorePaths:       /^\/health|^\/metrics|^\/api\/v\d+\/docs/,
    }));
    // Map validation errors to standard error envelope
    app.use((err, _req, res, next) => {
      if (err.status === 400 && err.errors) {
        return res.status(400).json({
          success: false,
          error:   { message: 'Request validation failed', code: 'VALIDATION_ERROR', details: err.errors },
        });
      }
      next(err);
    });
    logger.info('OpenAPI request validation enabled');
  } catch (_) {
    logger.warn('express-openapi-validator not available — request validation disabled');
  }
}

// ── API versioning headers (Deprecation, Sunset, API-Version) ─────────────────
app.use(versioningMiddleware);

// ── DLP — Data Loss Prevention ────────────────────────────────────────────────
app.use(dlpMiddleware);

// ── Proxy routes to microservices ─────────────────────────────────────────────
registerProxies(app);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   { message: `Route not found: ${req.method} ${req.path}` },
  });
});

// ── AppError handler ──────────────────────────────────────────────────────────
app.use(appErrorHandler);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: { message: 'Invalid JSON body' } });
  }
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ success: false, error: { message: err.message } });
  }
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId: req.requestId });
  res.status(500).json({ success: false, error: { message: 'Internal server error' } });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
attachWebSocket(server).catch((e) => logger.error('WS init error', { error: e.message }));

// ── Webhook worker ────────────────────────────────────────────────────────────
if (process.env.WEBHOOK_WORKER !== 'false') {
  webhookWorker.start();
  logger.info('Webhook worker started');
}

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info(`Gateway running on port ${PORT}`, { env: process.env.NODE_ENV, version: V });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`${signal} received — closing server`);
  webhookWorker.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Prevent unhandled promise rejections (e.g. Redis SCRIPT unavailable) from crashing the process
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection — process kept alive', { reason: String(reason?.message || reason) });
});
