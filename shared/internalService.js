'use strict';

const { HEADER: INTERNAL_SIG_HEADER, signRequest } = require('./internalAuth');
const { resolveRuntimeServiceTarget } = require('./serviceTargets');
const { buildOutgoingTraceHeaders, exportClientSpan } = require('./tracing');

async function callInternalService(serviceName, { method, path, body = null, headers = {}, timeoutMs = 3000, traceContext = null }) {
  const target = await resolveRuntimeServiceTarget(serviceName);
  const startedAt = process.hrtime.bigint();
  const requestHeaders = {
    'Content-Type': 'application/json',
    ...buildOutgoingTraceHeaders(traceContext || headers, {}),
    ...headers,
  };

  try {
    const response = await fetch(`${target}${path}`, {
      method,
      headers: requestHeaders,
      body: body === null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    exportClientSpan({
      serviceName: traceContext?.serviceName || 'internal-service',
      operation: `${method.toUpperCase()} ${path}`,
      targetService: serviceName,
      traceId: requestHeaders['X-Trace-Id'],
      parentSpanId: traceContext?.spanId || headers['X-Span-Id'] || null,
      startedAt,
      statusCode: response.status,
      tags: { 'http.url': `${target}${path}` },
    }).catch(() => {});

    return response;
  } catch (error) {
    exportClientSpan({
      serviceName: traceContext?.serviceName || 'internal-service',
      operation: `${method.toUpperCase()} ${path}`,
      targetService: serviceName,
      traceId: requestHeaders['X-Trace-Id'],
      parentSpanId: traceContext?.spanId || headers['X-Span-Id'] || null,
      startedAt,
      error,
      tags: { 'http.url': `${target}${path}` },
    }).catch(() => {});
    throw error;
  }
}

function buildSignedInternalHeaders(method, path, orgId, extraHeaders = {}) {
  return {
    ...extraHeaders,
    [INTERNAL_SIG_HEADER]: signRequest(method, path, orgId || ''),
  };
}

module.exports = {
  callInternalService,
  buildSignedInternalHeaders,
  INTERNAL_SIG_HEADER,
};
