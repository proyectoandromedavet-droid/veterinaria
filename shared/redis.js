'use strict';

const { createClient } = require('redis');

const singletons = new Map();
const connectedLabels = new Set();
const disabledLabels = new Set();

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function hasUsableRedisUrl() {
  const url = (process.env.REDIS_URL || '').trim();
  return url && !url.includes('${{');
}

function parseRedisFamily(url) {
  try {
    const parsed = new URL(url);
    const family = parsed.searchParams.get('family');
    if (family === '0' || family === '4' || family === '6') return parseInt(family, 10);
    if (parsed.hostname === 'redis.railway.internal') return 0;
  } catch (_) {}
  return undefined;
}

function buildRedisOptions(overrides = {}) {
  const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '3000', 10);
  const reconnectStrategy = overrides.reconnectStrategy ?? false;

  if (hasUsableRedisUrl()) {
    const url = process.env.REDIS_URL.trim();
    const family = parseRedisFamily(url);
    return {
      url,
      socket: {
        connectTimeout,
        ...(family !== undefined ? { family } : {}),
        reconnectStrategy,
      },
      ...overrides,
    };
  }

  return {
    socket: {
      host: process.env.REDIS_HOST || process.env.REDISHOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || process.env.REDISPORT || '6379', 10),
      connectTimeout,
      reconnectStrategy,
      tls: isTruthy(process.env.REDIS_TLS),
    },
    username: process.env.REDIS_USER || process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || process.env.REDISPASSWORD || undefined,
    ...overrides,
  };
}

function logRedisError(label, err) {
  console.warn(`[redis][${label}]`, {
    message: err?.message,
    code: err?.code,
  });
}

function logRedisConnected(label) {
  if (connectedLabels.has(label)) return;
  connectedLabels.add(label);
  console.info(`[redis][${label}] connected`);
}

function logRedisDisabled(label, err) {
  if (disabledLabels.has(label)) return;
  disabledLabels.add(label);
  console.warn(`[redis][${label}] disabled/fallback`, {
    message: err?.message,
    code: err?.code,
  });
}

function createRedisClient(label, overrides = {}) {
  const client = createClient(buildRedisOptions(overrides));
  client.on('error', (err) => logRedisError(label, err));
  return client;
}

async function connectRedis(client, label, { optional = true } = {}) {
  if (client.isReady) return client;

  try {
    if (!client.isOpen) {
      await client.connect();
    }
    if (client.isReady) logRedisConnected(label);
  } catch (err) {
    logRedisError(label, err);
    logRedisDisabled(label, err);
    if (!optional) throw err;
  }

  return client;
}

async function getRedisSingleton(name, label = name, overrides = {}, opts = {}) {
  let client = singletons.get(name);
  if (!client) {
    client = createRedisClient(label, overrides);
    singletons.set(name, client);
  }
  return connectRedis(client, label, opts);
}

function resetRedisSingletons() {
  singletons.clear();
  connectedLabels.clear();
  disabledLabels.clear();
}

module.exports = {
  buildRedisOptions,
  createRedisClient,
  connectRedis,
  getRedisSingleton,
  resetRedisSingletons,
};
