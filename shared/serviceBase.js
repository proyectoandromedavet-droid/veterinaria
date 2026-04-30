'use strict';

/**
 * Creates a standard Express service app with:
 * - JSON parsing
 * - User injection from gateway headers
 * - RBAC helper
 * - Health endpoint
 * - Error handler
 */

const express = require('express');
const { hasPermissionDynamic } = require('./rbac');
const { createLogger }        = require('./logger');
const { appErrorHandler }     = require('./errors');
const { requireInternalSig }  = require('./internalAuth');

function fromHeaders(req, _res, next) {
  req.user = {
    userId:   req.headers['x-user-id'],
    orgId:    req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'] || null,
    roles:    (req.headers['x-user-roles'] || '').split(',').filter(Boolean),
    email:    req.headers['x-user-email'],
  };
  next();
}

function requirePerm(perm) {
  return async (req, res, next) => {
    const allowed = await hasPermissionDynamic(req.user?.roles || [], perm, req.user?.orgId || null);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error:   { message: `Forbidden: requires '${perm}'` },
      });
    }
    next();
  };
}

/**
 * Method-based write guard.
 * Complements the base `:read` check applied at router mount level.
 *
 *   GET / HEAD / OPTIONS → pass through (covered by the :read check above)
 *   POST   → resource:create
 *   PUT    → resource:update
 *   PATCH  → resource:update
 *   DELETE → resource:delete
 *
 * Usage:
 *   app.use('/clients', requirePerm('clients:read'), guardWrite('clients'), clientsRouter);
 */
function guardWrite(resource) {
  const map = {
    POST  : `${resource}:create`,
    PUT   : `${resource}:update`,
    PATCH : `${resource}:update`,
    DELETE: `${resource}:delete`,
  };
  return async (req, res, next) => {
    const needed = map[req.method];
    if (!needed) return next();
    const allowed = await hasPermissionDynamic(req.user?.roles || [], needed, req.user?.orgId || null);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error:   { message: `Forbidden: requires '${needed}'` },
      });
    }
    next();
  };
}

/**
 * Attach OpenAPI request validation to an Express app if a spec file exists.
 * Silently skips when express-openapi-validator is not installed or spec not found.
 *
 * @param {Express}  app
 * @param {string}   specPath  — absolute path to openapi.yaml / openapi.json
 * @param {object}   [opts]    — express-openapi-validator options overrides
 */
function withOpenApiValidation(app, specPath, opts = {}) {
  if (process.env.OPENAPI_VALIDATE === 'false') return;
  try {
    const fs = require('fs');
    if (!fs.existsSync(specPath)) return;
    const { middleware: openApiValidator } = require('express-openapi-validator');
    app.use(openApiValidator({
      apiSpec:           specPath,
      validateRequests:  { allowUnknownQueryParameters: true, coerceTypes: false },
      validateResponses: false,
      validateSecurity:  false,   // security enforced by HMAC + RBAC, not by spec
      ignorePaths:       /^\/health/,
      ...opts,
    }));
    // Map validation errors to standard error envelope
    app.use((err, _req, res, next) => {
      if (err.status === 400 && err.errors) {
        return res.status(400).json({
          success: false,
          error: { message: 'Request validation failed', code: 'VALIDATION_ERROR', details: err.errors },
        });
      }
      next(err);
    });
  } catch (_) { /* validator not available or spec missing */ }
}

function buildApp(serviceName, routesFn, opts = {}) {
  const log = createLogger(serviceName);
  const app = express();
  const publicHealthPath = /^\/health(?:\/(?:live|ready|deep))?$/;
  app.use(express.json({ limit: '10mb' }));
  // Zero-trust: all routes except /health require a valid gateway HMAC signature
  app.use((req, res, next) => {
    if (publicHealthPath.test(req.path)) return next();
    return requireInternalSig(req, res, next);
  });
  app.use(fromHeaders);

  // OpenAPI request validation (if specPath provided)
  if (opts.specPath) withOpenApiValidation(app, opts.specPath, opts.openApiOpts || {});

  // ── Healthcheck real — verifica DB, Redis, circuit breakers y memoria ────
  async function runHealthChecks() {
    const checks  = {};
    const latency = {};
    let healthy   = true;

    // Ping DB
    try {
      const t0 = Date.now();
      const db = require('./db');
      await db.getPool().execute('SELECT 1');
      checks.db  = 'ok';
      latency.db = Date.now() - t0;
    } catch {
      checks.db  = 'error';
      healthy    = false;
    }

    // Ping Redis
    try {
      const t0    = Date.now();
      const cache = require('./cache');
      const redis = await cache.getClient();
      await redis.ping();
      checks.redis  = 'ok';
      latency.redis = Date.now() - t0;
    } catch {
      checks.redis = 'degraded'; // Redis degradado no mata el servicio
    }

    // Circuit breakers
    try {
      const { getAllStatus } = require('./circuitBreaker');
      const breakers = getAllStatus();
      checks.circuitBreakers = breakers.length === 0
        ? 'none'
        : breakers.map(b => ({ name: b.name, state: b.state, failures: b.failures }));
      // Any OPEN circuit makes service degraded (but not unhealthy)
      if (breakers.some(b => b.state === 'OPEN')) checks._circuitOpen = true;
    } catch {
      checks.circuitBreakers = 'unavailable';
    }

    // Memory
    const mem = process.memoryUsage();
    checks.memory = {
      heapUsedMb:  Math.round(mem.heapUsed  / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb:       Math.round(mem.rss       / 1024 / 1024),
    };

    return { healthy, checks, latency };
  }

  app.get('/health', async (req, res) => {
    const { healthy, checks, latency } = await runHealthChecks();
    res.status(healthy ? 200 : 503).json({
      status:  healthy ? 'ok' : 'degraded',
      service: serviceName,
      version: process.env.APP_VERSION || '1.0.0',
      uptime:  Math.floor(process.uptime()),
      ts:      new Date().toISOString(),
      traceId: req.headers['x-trace-id'] || null,
      checks,
      latency,
    });
  });

  // /health/deep — alias explícito para load balancers avanzados
  app.get('/health/deep', async (req, res) => {
    const { healthy, checks, latency } = await runHealthChecks();
    const hasOpenCircuit = checks._circuitOpen === true;
    delete checks._circuitOpen;
    res.status(healthy ? 200 : 503).json({
      status:  healthy ? 'ok' : (hasOpenCircuit ? 'degraded' : 'error'),
      service: serviceName,
      version: process.env.APP_VERSION || '1.0.0',
      uptime:  Math.floor(process.uptime()),
      ts:      new Date().toISOString(),
      traceId: req.headers['x-trace-id'] || null,
      checks,
      latency,
    });
  });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status:  'ok',
      service: serviceName,
      ts:      new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (req, res) => {
    const { healthy, checks, latency } = await runHealthChecks();
    res.status(healthy ? 200 : 503).json({
      status:  healthy ? 'ready' : 'not_ready',
      service: serviceName,
      ts:      new Date().toISOString(),
      checks,
      latency,
      traceId: req.headers['x-trace-id'] || null,
    });
  });

  function logNotFound(req, err) {
    log.warn('Route not found', {
      service: serviceName,
      method: req.method,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      path: req.path,
      requestId: req.headers['x-request-id'] || req.requestId || null,
      userId: req.user?.userId || req.user?.id || null,
      error: err?.message || 'not found',
    });
  }

  function isNotFoundLike(err) {
    return err?.status === 404
      || err?.statusCode === 404
      || err?.name === 'NotFoundError'
      || err?.code === 'NOT_FOUND'
      || /(^|\s)not found(\s|$)/i.test(err?.message || '');
  }

  routesFn(app, requirePerm);

  // 404
  app.use((req, res) =>
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        path: req.originalUrl,
        method: req.method,
      },
    })
  );

  // AppError handler — convierte errores tipados a responses estándar
  app.use(appErrorHandler);

  // Error handler — nunca filtrar stack traces ni queries SQL en producción
  app.use((err, req, res, _next) => {
    const isProd = process.env.NODE_ENV === 'production';
    log.error(err.message, { stack: err.stack, traceId: req.headers['x-trace-id'] });

    if (isNotFoundLike(err)) {
      logNotFound(req, err);
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

    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: { message: 'Duplicate entry', code: 'DUPLICATE_ENTRY' } });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(422).json({ success: false, error: { message: 'Referenced resource not found', code: 'FK_VIOLATION' } });
    }

    const message = isProd ? 'Internal server error' : (err.message || 'Internal server error');
    res.status(500).json({ success: false, error: { message, code: 'INTERNAL_ERROR' } });
  });

  return app;
}

/**
 * Start a service with graceful shutdown.
 * Handles SIGTERM + SIGINT: stops accepting new requests, waits for in-flight
 * requests, then closes DB pool and exits cleanly.
 *
 * @param {Express} app
 * @param {string}  serviceName
 * @param {number}  port
 * @param {object}  [opts]
 * @param {number}  [opts.drainMs=10000]  Max ms to wait for in-flight requests
 * @returns {http.Server}
 */
function startService(app, serviceName, port, { drainMs = 10_000 } = {}) {
  const http   = require('http');
  const log    = createLogger(serviceName);
  const server = http.createServer(app);

  server.listen(port, () =>
    log.info(`${serviceName} running on port ${port}`, { env: process.env.NODE_ENV })
  );

  function shutdown(signal) {
    log.info(`${signal} received — starting graceful shutdown`);

    // Stop accepting new connections
    server.close(async () => {
      log.info('HTTP server closed — draining resources');

      // Close DB pool
      try {
        const db = require('./db');
        await db.getPool().end();
        log.info('DB pool closed');
      } catch { /* pool may not have been created */ }

      // Disconnect Redis client
      try {
        const cache = require('./cache');
        const redis = await cache.getClient();
        await redis.quit();
        log.info('Redis connection closed');
      } catch { /* redis may not have been used */ }

      log.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Force exit if drain takes too long
    setTimeout(() => {
      log.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, drainMs).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  return server;
}

module.exports = { buildApp, fromHeaders, requirePerm, guardWrite, startService, withOpenApiValidation };
