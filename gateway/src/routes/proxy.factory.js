'use strict';

const { createProxyMiddleware } = require('http-proxy-middleware');
const { getBreaker } = require('../../../shared/circuitBreaker');
const { signRequest, HEADER: INTERNAL_SIG_HEADER } = require('../../../shared/internalAuth');
const { SERVICE_FALLBACKS, resolveRuntimeServiceTarget } = require('../../../shared/serviceTargets');
const { buildOutgoingTraceHeaders, exportClientSpan } = require('../../../shared/tracing');
const { logger } = require('../middleware/logger');

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

function resolveOrgContext(req) {
  return req.user?.orgId || req.tenantOrgId || req.publicOrgIdHint || '';
}

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
      error(_err, req, res) {
        breaker?.onFailure();
        exportClientSpan({
          serviceName: 'gateway',
          operation: `${req?.method || 'GET'} ${req?.originalUrl || '/'}`,
          targetService: name || 'unknown',
          traceId: req?.traceId,
          parentSpanId: req?.spanId,
          startedAt: req?._proxyStartedAtHr || process.hrtime.bigint(),
          error: _err,
          tags: { path: req?.originalUrl || '/' },
        }).catch(() => {});
        logger.error('Gateway proxy upstream error', {
          service: name || 'unknown',
          target,
          method: req?.method,
          path: req?.originalUrl,
          requestId: req?.requestId,
          error: _err?.message,
        });
        res.status(502).json({
          success: false,
          error: {
            message: 'Service temporarily unavailable',
            code: 'UPSTREAM_ERROR',
            ...(req?.requestId ? { requestId: req.requestId } : {}),
            ...(req?.traceId ? { traceId: req.traceId } : {}),
          },
        });
      },
      proxyRes(proxyRes, req) {
        if (proxyRes.statusCode >= 500) breaker?.onFailure();
        else breaker?.onSuccess();
        exportClientSpan({
          serviceName: 'gateway',
          operation: `${req.method} ${req.originalUrl}`,
          targetService: name || 'unknown',
          traceId: req.traceId,
          parentSpanId: req.spanId,
          startedAt: req._proxyStartedAtHr || process.hrtime.bigint(),
          statusCode: proxyRes.statusCode,
          tags: { path: req.originalUrl },
        }).catch(() => {});
        logger.info('Gateway proxy response', {
          service: name || 'unknown',
          method: req.method,
          path: req.originalUrl,
          upstreamStatus: proxyRes.statusCode,
          latencyMs: Date.now() - (req._proxyStartedAt || Date.now()),
          requestId: req.requestId,
        });
      },
      proxyReq(proxyReq, req) {
        req._proxyStartedAt = Date.now();
        req._proxyStartedAtHr = process.hrtime.bigint();
        for (const header of DANGEROUS_BROWSER_HEADERS) {
          proxyReq.removeHeader(header);
        }

        if (req.user) {
          proxyReq.setHeader('X-User-Id', req.user.userId || '');
          proxyReq.setHeader('X-Org-Id', resolveOrgContext(req));
          proxyReq.setHeader('X-Branch-Id', req.user.branchId || '');
          proxyReq.setHeader('X-User-Roles', (req.user.roles || []).join(','));
          proxyReq.setHeader('X-User-Email', req.user.email || '');
          proxyReq.setHeader('X-JTI', req.user.jti || '');
        } else if (req.tenantOrgId) {
          proxyReq.setHeader('X-Org-Id', req.tenantOrgId);
        } else if (req.publicOrgIdHint) {
          proxyReq.setHeader('X-Org-Id', req.publicOrgIdHint);
        }

        proxyReq.setHeader('X-Request-Id', req.headers['x-request-id'] || req.requestId || Date.now().toString());
        const traceHeaders = buildOutgoingTraceHeaders(req);
        proxyReq.setHeader('X-Trace-Id', traceHeaders['X-Trace-Id']);
        proxyReq.setHeader('X-Parent-Span-Id', traceHeaders['X-Parent-Span-Id']);
        proxyReq.setHeader('X-Span-Id', traceHeaders['X-Span-Id']);
        proxyReq.setHeader('traceparent', traceHeaders.traceparent);
        proxyReq.setHeader('X-Forwarded-For', req.ip);

        const sigPath = (proxyReq.path || req.path).split('?')[0];
        const sig = signRequest(req.method, sigPath, resolveOrgContext(req));
        if (sig) proxyReq.setHeader(INTERNAL_SIG_HEADER, sig);

        if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
          const bodyData = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
    },
  });

  if (!breaker) return proxy;

  return (req, res, next) => {
    if (!breaker.canRequest()) {
      logger.warn('Gateway proxy circuit open', {
        service: name,
        method: req.method,
        path: req.originalUrl,
        requestId: req.requestId,
      });
      return res.status(503).json({
        success: false,
        error: {
          message: 'Service temporarily unavailable',
          code: 'CIRCUIT_OPEN',
          service: name,
          ...(req.requestId ? { requestId: req.requestId } : {}),
          ...(req.traceId ? { traceId: req.traceId } : {}),
        },
      });
    }
    proxy(req, res, next);
  };
}

const STRIP_API_VERSION = (_path, req) => req.originalUrl.replace(/^\/api\/v[12]\//, '/');

function makeServiceProxy(name, pathRewrite) {
  const rw = pathRewrite !== undefined ? pathRewrite : STRIP_API_VERSION;
  return makeProxy(SERVICES[name], rw, name);
}

module.exports = {
  SERVICES,
  STRIP_API_VERSION,
  resolveOrgContext,
  makeProxy,
  makeServiceProxy,
};
