'use strict';

const { createProxyMiddleware } = require('http-proxy-middleware');
const { authMiddleware }        = require('../middleware/auth');
const { authLimiter, passwordResetLimiter, tenantLimiter } = require('../middleware/rateLimiter');
const { getBreaker, getAllStatus } = require('../../../shared/circuitBreaker');
const { requireFeature }          = require('../../../shared/featureFlags');
const { signRequest, HEADER: INTERNAL_SIG_HEADER } = require('../../../shared/internalAuth');
const { tenantMismatchGuard }     = require('../middleware/subdomain');
const { injectVersionHeader }     = require('../middleware/versioning');

const API_VERSIONS = ['v1', 'v2'];

/**
 * Registers a route under both /api/v1/<pathSuffix> and /api/v2/<pathSuffix>.
 * The injectVersionHeader middleware is prepended so downstream services
 * can inspect X-API-Version.
 *
 * @param {import('express').Application} app
 * @param {string} method - express app method ('use', 'get', 'post', etc.)
 * @param {string} pathSuffix - path after /api/vN/ (e.g. 'patients')
 * @param {...Function} middlewares - middleware chain
 */
function registerVersioned(app, method, pathSuffix, ...middlewares) {
  for (const version of API_VERSIONS) {
    app[method](`/api/${version}/${pathSuffix}`, injectVersionHeader(version), ...middlewares);
  }
}

const SERVICES = {
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

/**
 * Create a proxy middleware with optional circuit breaker.
 * @param {string} target      — upstream URL
 * @param {object} pathRewrite — path rewrite map
 * @param {string} [name]      — service name for circuit breaker registry
 */
function makeProxy(target, pathRewrite = {}, name) {
  const breaker = name ? getBreaker(name) : null;

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error(err, req, res) {
        breaker?.onFailure();
        res.status(502).json({
          success: false,
          error:   { message: 'Service temporarily unavailable', code: 'UPSTREAM_ERROR' },
        });
      },
      proxyRes(proxyRes) {
        if (proxyRes.statusCode >= 500) breaker?.onFailure();
        else breaker?.onSuccess();
      },
      proxyReq(proxyReq, req) {
        // Forward user info to downstream services as internal headers
        if (req.user) {
          proxyReq.setHeader('X-User-Id',    req.user.userId  || '');
          proxyReq.setHeader('X-Org-Id',     req.user.orgId   || '');
          proxyReq.setHeader('X-Branch-Id',  req.user.branchId || req.headers['x-branch-id'] || '');
          proxyReq.setHeader('X-User-Roles', (req.user.roles || []).join(','));
          proxyReq.setHeader('X-User-Email', req.user.email  || '');
        }
        proxyReq.setHeader('X-Request-Id',   req.headers['x-request-id'] || req.requestId || Date.now().toString());
        proxyReq.setHeader('X-Trace-Id',     req.traceId || '');
        proxyReq.setHeader('X-Forwarded-For', req.ip);
        // Internal service auth — HMAC signature for gateway→service trust
        const sig = signRequest(req.method, req.path, req.user?.orgId || req.headers['x-org-id'] || '');
        if (sig) proxyReq.setHeader(INTERNAL_SIG_HEADER, sig);
        // Re-buffer parsed body LAST — write() commits headers so all setHeader calls must precede it
        if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
    },
  });

  if (!breaker) return proxy;

  // Wrap proxy with circuit breaker gate
  return (req, res, next) => {
    if (!breaker.canRequest()) {
      return res.status(503).json({
        success: false,
        error:   { message: 'Service temporarily unavailable', code: 'CIRCUIT_OPEN', service: name },
      });
    }
    proxy(req, res, next);
  };
}

/** Convenience: builds proxy using SERVICES registry and circuit breaker by name. */
function makeServiceProxy(name, pathRewrite = {}) {
  return makeProxy(SERVICES[name], pathRewrite, name);
}

/**
 * Register all service routes on the Express app.
 * Each route is registered under both /api/v1/ and /api/v2/.
 * Legacy paths without version prefix are kept as deprecated aliases
 * (backward compatibility — the Deprecation header is set by versioningMiddleware).
 *
 * @param {import('express').Application} app
 */
function registerProxies(app) {
  // ── Circuit breaker status (internal — protegido por auth) ────────────────
  registerVersioned(app, 'get', 'health/services', authMiddleware, (_req, res) =>
    res.json({ success: true, data: getAllStatus() })
  );

  // ── AUTH (public endpoints, no JWT required) ─────────────────────────────
  registerVersioned(app, 'use', 'auth/login',           authLimiter, makeServiceProxy('auth'));
  registerVersioned(app, 'use', 'auth/refresh',         authLimiter, makeServiceProxy('auth'));
  registerVersioned(app, 'use', 'auth/password-reset',  passwordResetLimiter, makeServiceProxy('auth'));
  registerVersioned(app, 'use', 'auth/register',        makeServiceProxy('auth'));
  // Google OAuth callback — público (Google redirige aquí con ?code=)
  registerVersioned(app, 'use', 'auth/google/callback', makeServiceProxy('auth'));
  // JWKS — clave pública RS256 para verificación externa
  registerVersioned(app, 'use', 'auth/.well-known',     makeServiceProxy('auth'));

  // ── AUTH (protected) ─────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'auth', authMiddleware, tenantMismatchGuard, tenantLimiter, makeServiceProxy('auth'));

  // ── PATIENTS & CLIENTS ───────────────────────────────────────────────────
  registerVersioned(app, 'use', 'clients',   authMiddleware, tenantMismatchGuard, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'patients',  authMiddleware, tenantMismatchGuard, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'species',   authMiddleware, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'breeds',    authMiddleware, tenantLimiter, makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'branches',  authMiddleware, tenantLimiter, makeServiceProxy('patients'));

  // ── BILLING CONSOLIDADO ──────────────────────────────────────────────────
  registerVersioned(app, 'use', 'billing/consolidated', authMiddleware, tenantLimiter, makeServiceProxy('billing'));

  // ── GDPR / FIRMA DIGITAL (pública para verificación) ─────────────────────
  registerVersioned(app, 'use', 'clients/signatures/public-key', makeServiceProxy('patients'));
  registerVersioned(app, 'use', 'clients/signatures/verify',     makeServiceProxy('patients'));

  // ── MEDICAL ──────────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'appointments',    authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'medical-records', authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'triage',          authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'prescriptions',   authMiddleware, tenantLimiter, makeServiceProxy('medical'));
  registerVersioned(app, 'use', 'follow-ups',      authMiddleware, tenantLimiter, makeServiceProxy('medical'));

  // ── LAB & IMAGING ────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'lab',              authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'imaging',          authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'pathology',        authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'surgeries',        authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'hospitalizations', authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'vaccinations',     authMiddleware, tenantLimiter, makeServiceProxy('lab'));
  registerVersioned(app, 'use', 'deworming',        authMiddleware, tenantLimiter, makeServiceProxy('lab'));

  // ── BILLING ──────────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'invoices',             authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'payments/mp/webhook',  makeServiceProxy('billing'));  // público — llamado por MP
  registerVersioned(app, 'use', 'payments',             authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'price-lists',          authMiddleware, tenantLimiter, makeServiceProxy('billing'));
  registerVersioned(app, 'use', 'inventory',            authMiddleware, tenantLimiter, makeServiceProxy('billing'));

  // ── TELEMEDICINE ─────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'tele',     authMiddleware, tenantLimiter, makeServiceProxy('telemedicine'));

  // ── GROOMING ─────────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'grooming', authMiddleware, tenantLimiter, makeServiceProxy('grooming'));

  // ── REPORTS ──────────────────────────────────────────────────────────────
  registerVersioned(app, 'use', 'reports',  authMiddleware, tenantLimiter, makeServiceProxy('reports'));

  // ── NOTIFICATIONS (WebSocket upgrade handled separately) ─────────────────
  registerVersioned(app, 'use', 'notifications/fcm', authMiddleware, tenantLimiter, makeServiceProxy('notifications'));
  registerVersioned(app, 'use', 'notifications',     authMiddleware, tenantLimiter, makeServiceProxy('notifications'));

  // ── PORTAL DE DUEÑOS (auth propia — sin authMiddleware de staff) ──────────
  registerVersioned(app, 'use', 'portal/auth', makeServiceProxy('portal'));   // público
  registerVersioned(app, 'use', 'portal',      makeServiceProxy('portal'));   // token validado internamente

  // ── IA — diagnóstico, imágenes, chatbot, riesgo ───────────────────────────
  // Feature flag gates each AI sub-feature; fallback to generic 'ai_diagnosis'
  registerVersioned(app, 'use', 'ai/diagnosis', authMiddleware, tenantLimiter, requireFeature('ai_diagnosis'),      makeServiceProxy('ai'));
  registerVersioned(app, 'use', 'ai/images',    authMiddleware, tenantLimiter, requireFeature('ai_image_analysis'), makeServiceProxy('ai'));
  registerVersioned(app, 'use', 'ai/chat',      authMiddleware, tenantLimiter, requireFeature('ai_chatbot'),        makeServiceProxy('ai'));
  registerVersioned(app, 'use', 'ai/patients',  authMiddleware, tenantLimiter, requireFeature('ai_risk_assessment'),makeServiceProxy('ai'));
  registerVersioned(app, 'use', 'ai',           authMiddleware, tenantLimiter, makeServiceProxy('ai'));
}

module.exports = { registerProxies, SERVICES, makeProxy, makeServiceProxy };
