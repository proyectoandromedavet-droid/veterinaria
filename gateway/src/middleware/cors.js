'use strict';

const cors = require('cors');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server requests (no Origin header)
    if (!origin) return callback(null, true);

    // Wildcard: allow all origins
    if (allowedOrigins.includes('*') || allowedOrigins.length === 0) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods:            ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:     ['Content-Type', 'Authorization', 'X-API-Key', 'X-Branch-Id', 'X-Request-Id'],
  exposedHeaders:     ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Request-Id'],
  credentials:        true,
  maxAge:             86400,   // preflight cache 24h
  optionsSuccessStatus: 204,
};

module.exports = cors(corsOptions);
