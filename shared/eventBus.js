'use strict';

const { getRedisSingleton } = require('./redis');

const STREAM = process.env.EVENT_BUS_STREAM || 'vetmanager:events';
const GROUP  = process.env.EVENT_BUS_GROUP || 'vetmanager';

async function getRedis() {
  return getRedisSingleton('event-bus', 'event-bus');
}

async function ensureGroup(redis) {
  try {
    await redis.xGroupCreate(STREAM, GROUP, '0', { MKSTREAM: true });
  } catch (err) {
    if (!String(err?.message || '').includes('BUSYGROUP')) throw err;
  }
}

async function publish(topic, payload, meta = {}) {
  const redis = await getRedis();
  if (!redis?.isReady) return null;
  return redis.xAdd(STREAM, '*', {
    topic,
    payload: JSON.stringify(payload || {}),
    meta: JSON.stringify(meta || {}),
    ts: new Date().toISOString(),
  });
}

async function subscribe(consumerName, handler, topics = []) {
  const redis = await getRedis();
  if (!redis?.isReady) return async () => {};
  await ensureGroup(redis);
  let stopped = false;

  async function loop() {
    while (!stopped) {
      const rows = await redis.xReadGroup(
        GROUP,
        consumerName,
        { key: STREAM, id: '>' },
        { COUNT: 20, BLOCK: 5000 }
      ).catch(() => null);

      if (!rows?.length) continue;
      for (const stream of rows) {
        for (const message of stream.messages || []) {
          const topic = message.message.topic;
          if (topics.length && !topics.includes(topic)) {
            await redis.xAck(STREAM, GROUP, message.id).catch(() => {});
            continue;
          }
          try {
            await handler({
              id: message.id,
              topic,
              payload: JSON.parse(message.message.payload || '{}'),
              meta: JSON.parse(message.message.meta || '{}'),
              ts: message.message.ts,
            });
            await redis.xAck(STREAM, GROUP, message.id);
          } catch (err) {
            console.warn('[event-bus]', { topic, message: err?.message });
          }
        }
      }
    }
  }

  loop().catch((err) => console.warn('[event-bus] loop', err?.message));
  return async () => { stopped = true; };
}

module.exports = {
  publish,
  subscribe,
};
