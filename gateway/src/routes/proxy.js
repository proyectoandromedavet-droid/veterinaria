'use strict';

const { createProxyMiddleware } = require('http-proxy-middleware');
const { authMiddleware }        = require('../middleware/auth');
const { authLimiter, passwordResetLimiter, tenantLimiter } = require('../middleware/rateLimiter');
const { getBreaker, getAllStatus } = require('../../../shared/circuitBreaker');
const { requireFeature }          = require('../../../shared/featureFlags');
const { signRequest, HEADER: INTERNAL_SIG_HEADER } = require('../../../shared/internalAuth');
const { tenantMismatchGuard }     = require('../middleware/subdomain');
const { injectVersionHeader }     = require('../middleware/versioning');
const { listServices } = require('../../../shared/serviceRegistry');
const { SERVICE_FALLBACKS, resolveRuntimeServiceTarget } = require('../../../shared/serviceTargets');

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

const SERVICES = SERVICE_FALLBACKS;

const DANGEROUS_BROWSER_HEADERS = [
  'x-user-id',
  'x-user-email',
  'x-user-roles',
  'x-jti',
  'x-org-id',
  'x-tenant-id',
  'x-branch-id',
  'x-internal-sig',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
];

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
    router: async () => {
      if (!name) return target;
      return resolveRuntimeServiceTarget(name);
    },
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
        for (const header of DANGEROUS_BROWSER_HEADERS) {
          proxyReq.removeHeader(header);
        }
        // Forward user info to downstream services as internal headers
        if (req.user) {
          proxyReq.setHeader('X-User-Id',    req.user.userId  || '');
          proxyReq.setHeader('X-Org-Id',     req.user.orgId   || req.tenantOrgId || '');
          proxyReq.setHeader('X-Branch-Id',  req.user.branchId || '');
          proxyReq.setHeader('X-User-Roles', (req.user.roles || []).join(','));
          proxyReq.setHeader('X-User-Email', req.user.email  || '');
          proxyReq.setHeader('X-JTI',        req.user.jti || '');
        } else if (req.tenantOrgId) {
          proxyReq.setHeader('X-Org-Id', req.tenantOrgId);
        }
        proxyReq.setHeader('X-Request-Id',   req.headers['x-request-id'] || req.requestId || Date.now().toString());
        proxyReq.setHeader('X-Trace-Id',     req.traceId || '');
        proxyReq.setHeader('X-Forwarded-For', req.ip);
        // Internal service auth — HMAC signature for gateway→service trust
        const sig = signRequest(req.method, req.path, req.user?.orgId || req.tenantOrgId || '');
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

/**
 * Universal pathRewrite: strips /api/v1/ or /api/v2/ from the original URL.
 * Needed because app.use('/api/v1/patients', proxy) causes Express to set
 * req.url = '/' (stripping the full prefix). Using req.originalUrl restores
 * the full path, then we remove only the version prefix.
 * e.g. /api/v1/patients/123 → /patients/123
 *      /api/v1/appointments?date=x → /appointments?date=x
 */
const STRIP_API_VERSION = (_path, req) => req.originalUrl.replace(/^\/api\/v[12]\//, '/');

/** Convenience: builds proxy using SERVICES registry and circuit breaker by name. */
function makeServiceProxy(name, pathRewrite) {
  // Default: use universal rewrite. Pass {} explicitly to disable (auth catch-all).
  const rw = pathRewrite !== undefined ? pathRewrite : STRIP_API_VERSION;
  return makeProxy(SERVICES[name], rw, name);
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
  registerVersioned(app, 'get', 'platform/services', authMiddleware, async (_req, res) =>
    res.json({ success: true, data: await listServices().catch(() => []) })
  );

  // ── AUTH ─────────────────────────────────────────────────────────────────
  // Rate limiters only — no proxy here; fall through to catch-all so req.url is correct
  registerVersioned(app, 'use', 'auth/login',          authLimiter);
  registerVersioned(app, 'use', 'auth/refresh',        authLimiter);
  registerVersioned(app, 'use', 'auth/password-reset', passwordResetLimiter);

  // Auth proxy: pass {} to disable universal rewrite — catch-all already sets req.url correctly
  const _authProxy = makeServiceProxy('auth', {});
  // Paths that bypass JWT — checked against req.path inside the /api/vN/auth mount
  const AUTH_PUBLIC = ['/login', '/refresh', '/register', '/password-reset', '/google', '/sso', '/.well-known', '/internal'];

  // Public catch-all: forward without JWT check
  registerVersioned(app, 'use', 'auth', (req, res, next) => {
    if (AUTH_PUBLIC.some(p => req.path === p || req.path.startsWith(p + '/'))) {
      return _authProxy(req, res, next);
    }
    next();  // protected path → fall through
  });

  // Protected catch-all: JWT + tenant checks
  registerVersioned(app, 'use', 'auth', authMiddleware, tenantMismatchGuard, tenantLimiter, _authProxy);

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
