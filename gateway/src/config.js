'use strict';

const { getSecret } = require('../../shared/secrets');

function readBoolean(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function readInt(name, defaultValue) {
  const raw = parseInt(process.env[name] || `${defaultValue}`, 10);
  return Number.isFinite(raw) ? raw : defaultValue;
}

function readCsv(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

const currentApiVersion = process.env.API_VERSION || 'v1';
const supportedApiVersions = [...new Set(readCsv('API_VERSIONS', ['v1', 'v2', currentApiVersion]))];
const defaultApiVersion = process.env.API_DEFAULT_VERSION || currentApiVersion;

// Validar JSON_BODY_LIMIT contra un conjunto de valores aceptados para evitar
// que un valor de entorno malicioso cause OOM (e.g. "999gb").
const ALLOWED_BODY_LIMITS = new Set(['100kb', '256kb', '512kb', '1mb', '2mb', '5mb']);
const _rawBodyLimit = (process.env.JSON_BODY_LIMIT || '512kb').toLowerCase();
const _jsonBodyLimit = ALLOWED_BODY_LIMITS.has(_rawBodyLimit) ? _rawBodyLimit : '512kb';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: readInt('PORT', 4050),
  apiVersion: currentApiVersion,
  defaultApiVersion,
  supportedApiVersions,
  jsonBodyLimit: _jsonBodyLimit,
  metricsToken: getSecret('METRICS_TOKEN', { defaultValue: '' }) || '',
  swaggerEnabled: process.env.NODE_ENV !== 'production' || readBoolean('SWAGGER_ENABLED', false),
  openApiValidate: process.env.OPENAPI_VALIDATE !== 'false',
  webhookWorkerEnabled: process.env.WEBHOOK_WORKER !== 'false',
  auditMode: process.env.AUDIT_MODE || 'all',
  wsHeartbeatIntervalMs: readInt('WS_HEARTBEAT_INTERVAL', 30000),
  dlp: {
    exportThreshold: readInt('DLP_EXPORT_THRESHOLD', 1000),
    exportWindowSecs: readInt('DLP_EXPORT_WINDOW_SECS', 300),
  },
};

module.exports = { config, readBoolean, readInt, readCsv };
