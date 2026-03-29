'use strict';

const cors = require('cors');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const corsOptions = {
  origin(origin, callback) {
    // In production: require an Origin header — reject requests without it
    if (!origin) {
      if (IS_PRODUCTION) {
        return callback(new Error('CORS: Origin header required'));
      }
      // In dev/staging: allow no-origin (Postman, server-to-server, curl)
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
