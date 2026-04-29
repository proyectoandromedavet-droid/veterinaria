'use strict';

const cors = require('cors');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// In production, ALLOWED_ORIGINS must be explicitly set and cannot be '*'
if (IS_PRODUCTION) {
  if (allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS must be set in production (e.g. https://app.example.com)');
  }
  if (allowedOrigins.includes('*')) {
    throw new Error('ALLOWED_ORIGINS cannot be "*" in production — set explicit origins');
  }
}

const corsOptions = {
  origin(origin, callback) {
    // Allow server-to-server requests (no Origin header)
    if (!origin) return callback(null, true);

    // Development only: allow all origins if explicitly set to '*' or list is empty
    if (!IS_PRODUCTION && (allowedOrigins.includes('*') || allowedOrigins.length === 0)) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  methods:            ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders:     ['Content-Type', 'Authorization', 'X-API-Key', 'X-Branch-Id', 'X-Request-Id', 'X-CSRF-Token'],
  exposedHeaders:     ['X-Total-Count', 'X-Page', 'X-Limit', 'X-Request-Id'],
  credentials:        true,
  maxAge:             86400,   // preflight cache 24h
  optionsSuccessStatus: 204,
};

module.exports = cors(corsOptions);
