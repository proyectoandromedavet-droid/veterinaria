'use strict';

const { getRedisSingleton } = require('./redis');

const PREFIX = 'svc:registry';
const TTL_SECONDS = Math.max(15, parseInt(process.env.SERVICE_REGISTRY_TTL_SECONDS || '45', 10));

function key(name) {
  return `${PREFIX}:${name}`;
}

async function getRedis() {
  return getRedisSingleton('service-registry', 'service-registry');
}

async function registerService(name, payload) {
  const redis = await getRedis();
  if (!redis?.isReady) return false;
  await redis.setEx(key(name), TTL_SECONDS, JSON.stringify({
    ...payload,
    updatedAt: new Date().toISOString(),
  }));
  return true;
}

async function resolveServiceTarget(name, fallback = null) {
  const redis = await getRedis().catch(() => null);
  if (!redis?.isReady) return fallback;
  const raw = await redis.get(key(name));
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed.url || fallback;
  } catch {
    return fallback;
  }
}

async function listServices() {
  const redis = await getRedis().catch(() => null);
  if (!redis?.isReady) return [];
  const keys = await redis.keys(`${PREFIX}:*`);
  if (!keys.length) return [];
  const rows = await redis.mGet(keys);
  return rows
    .map((row, index) => {
      try {
        return { name: keys[index].slice(`${PREFIX}:`.length), ...JSON.parse(row) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = {
  registerService,
  resolveServiceTarget,
  listServices,
};
