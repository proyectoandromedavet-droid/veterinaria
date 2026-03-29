'use strict';

/**
 * shared/correlationId.js
 * Middleware que inyecta un X-Trace-Id único en cada request.
 *
 * - Si el cliente (o load balancer) ya envía X-Trace-Id → lo reutiliza.
 * - Si no hay trace ID → genera uno con crypto.randomUUID().
 * - Normaliza el header en req.headers para que llegue a los servicios downstream.
 * - Devuelve el trace ID en el response header X-Trace-Id.
 * - Expone req.traceId para que el resto del código pueda usarlo en logs.
 */

const { randomUUID } = require('crypto');

function correlationId(req, res, next) {
  const traceId = req.headers['x-trace-id'] || randomUUID();
  req.traceId = traceId;
  req.headers['x-trace-id'] = traceId;   // propagar a servicios downstream vía proxy
  res.setHeader('X-Trace-Id', traceId);
  next();
}

module.exports = { correlationId };
