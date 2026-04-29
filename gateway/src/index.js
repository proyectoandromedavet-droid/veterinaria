'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const swaggerUi  = require('swagger-ui-express');
const YAML       = require('yamljs');

const cookieParser    = require('cookie-parser');
const corsMiddleware  = require('./middleware/cors');
const { apiLimiter, tenantLimiter } = require('./middleware/rateLimiter');
const { morganMiddleware, logger }  = require('./middleware/logger');
const { correlationId }             = require('../../shared/correlationId');
const { subdomainMiddleware }       = require('./middleware/subdomain');
const { sanitizeIncomingHeaders }    = require('../middleware/sanitizeIncomingHeaders');
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
  dnsRebindingGuard,
  contentTypeGuard,
  cacheHeaders,
} = require('../../shared/security');

const { httpMetrics, metricsHandler } = require('../../shared/metrics');
const { auditMiddleware }             = require('../../shared/audit');
const { wafMiddleware }               = require('../../shared/waf');
const webhookWorker                   = require('../../shared/webhooks/worker');
const { appErrorHandler }             = require('../../shared/errors');
const { csrfToken, csrfProtect }      = require('../../shared/csrf');
const { securityTxtHandler }          = require('./routes/security-txt');

const app    = express();
const server = http.createServer(app);
const PORT   = parseInt(process.env.PORT || '4050');
const V      = process.env.API_VERSION || 'v1';

// ── Security.txt (RFC 9116) ───────────────────────────────────────────────────
app.get('/.well-known/security.txt', securityTxtHandler);

// ── CSRF Token endpoint ───────────────────────────────────────────────────────
// El frontend debe llamar GET /csrf-token antes de cualquier mutación.
// La cookie _csrf se setea y el token se retorna en el body para ponerlo en X-CSRF-Token.
app.get('/csrf-token', csrfToken);

// ── Health check — before all middleware so it's always reachable ─────────────
app.get('/health', async (_req, res) => {
  const checks  = {};
  const latency = {};

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

  res.status(200).json({
    status:  'ok',
    service: 'gateway',
    version: V,
    uptime:  Math.floor(process.uptime()),
    ts:      new Date().toISOString(),
    checks,
    latency,
  });
});

// ── Security headers (must be first) ─────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmetMiddleware);
app.use(compressionMiddleware);

// ── Correlation ID (trace_id) — debe ir antes de cualquier log ───────────────
app.use(correlationId);

// ── Request ID + IP guard + DNS Rebinding ────────────────────────────────────
app.use(requestId);
app.use(ipGuard);
app.use(dnsRebindingGuard);
app.use(sanitizeIncomingHeaders);

// ── Subdomain tenant resolver ─────────────────────────────────────────────────
app.use(subdomainMiddleware);

// ── Cookie parser (requerido para CSRF y sesiones) ────────────────────────────
app.use(cookieParser());

// ── CORS + logging ────────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(morganMiddleware);

// ── Body parsing + sanitization ───────────────────────────────────────────────
// Límite configurable via JSON_BODY_LIMIT. Default: 512kb para APIs REST.
// Para endpoints de upload usar multipart (createUploader de fileUpload.js).
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '512kb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_BODY_LIMIT }));
app.use(hppMiddleware);
app.use(sanitize);

// ── Content-Type guard ────────────────────────────────────────────────────────
app.use(contentTypeGuard);

// ── Cache headers (anti-cache-poisoning) ──────────────────────────────────────
app.use(cacheHeaders);

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
// Restricted to METRICS_TOKEN bearer auth (or localhost in dev)
app.get('/metrics', (req, res, next) => {
  const metricsToken = process.env.METRICS_TOKEN;
  if (metricsToken) {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${metricsToken}`) {
      return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    }
  } else if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: { message: 'Metrics disabled — set METRICS_TOKEN' } });
  }
  next();
}, metricsHandler);

// ── Swagger UI ────────────────────────────────────────────────────────────────
// Disabled in production unless SWAGGER_ENABLED=true is explicitly set
const openApiPath = path.join(__dirname, '../docs/openapi.yaml');
const swaggerEnabled = process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true';
if (swaggerEnabled) {
  try {
    const swaggerDoc = YAML.load(openApiPath);
    app.use(`/api/${V}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
      customSiteTitle: 'VetManager Pro API',
      swaggerOptions: { persistAuthorization: false },
    }));
    logger.info(`Swagger UI at /api/${V}/docs`);
  } catch (_) {
    logger.warn('openapi.yaml not found — Swagger UI disabled');
  }
} else {
  app.use(`/api/${V}/docs`, (_req, res) => res.status(404).json({ success: false, error: { message: 'Not found' } }));
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

// ── CSRF Protection (aplica a rutas mutantes de API) ─────────────────────────
app.use(`/api/${V}`, csrfProtect);

// ── DLP — Data Loss Prevention ────────────────────────────────────────────────
app.use(dlpMiddleware);

// ── Proxy routes to microservices ─────────────────────────────────────────────
registerProxies(app);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    requestId: req.headers['x-request-id'] || req.requestId || null,
    userId: req.user?.userId || req.user?.id || null,
  });
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found',
      path: req.originalUrl,
      method: req.method,
    },
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
  if (err.status === 404 || err.statusCode === 404 || err.name === 'NotFoundError' || /not found/i.test(err.message || '')) {
    logger.warn('Route not found', {
      method: req.method,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      path: req.path,
      requestId: req.headers['x-request-id'] || req.requestId || null,
      userId: req.user?.userId || req.user?.id || null,
      error: err.message,
    });
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
      },
    });
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
