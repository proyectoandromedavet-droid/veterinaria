'use strict';

function splitCsvHeader(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequestContext(headers = {}) {
  return {
    userId: headers['x-user-id'] || null,
    orgId: headers['x-org-id'] || null,
    branchId: headers['x-branch-id'] || null,
    roles: splitCsvHeader(headers['x-user-roles']),
    email: headers['x-user-email'] || null,
    jti: headers['x-jti'] || null,
    requestId: headers['x-request-id'] || null,
    traceId: headers['x-trace-id'] || null,
    spanId: headers['x-span-id'] || null,
    parentSpanId: headers['x-parent-span-id'] || null,
    traceparent: headers.traceparent || headers.Traceparent || null,
  };
}

function fromHeaders(req, _res, next) {
  req.user = getRequestContext(req.headers);
  req.requestId = req.user.requestId || req.requestId || null;
  req.traceId = req.user.traceId || req.traceId || null;
  req.spanId = req.spanId || req.user.spanId || null;
  req.parentSpanId = req.parentSpanId || req.user.parentSpanId || null;
  req.traceparent = req.traceparent || req.user.traceparent || null;
  if (req.res?.locals) {
    req.res.locals.requestId = req.requestId;
    req.res.locals.traceId = req.traceId;
    req.res.locals.spanId = req.spanId;
    req.res.locals.userId = req.user.userId;
    req.res.locals.orgId = req.user.orgId;
    req.res.locals.branchId = req.user.branchId;
  }
  next();
}

function requireOrgContext(req, res, next) {
  if (req.user?.orgId) return next();
  return res.status(401).json({
    success: false,
    error: { message: 'Missing organization context', code: 'ORG_CONTEXT_REQUIRED' },
  });
}

function requireBranchContext(req, res, next) {
  if (req.user?.branchId) return next();
  return res.status(400).json({
    success: false,
    error: { message: 'Missing branch context', code: 'BRANCH_CONTEXT_REQUIRED' },
  });
}

module.exports = {
  splitCsvHeader,
  getRequestContext,
  fromHeaders,
  requireOrgContext,
  requireBranchContext,
};
