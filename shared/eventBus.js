'use strict';

const { getRedisSingleton } = require('./redis');
const { createLogger } = require('./logger');

const STREAM = process.env.EVENT_BUS_STREAM || 'vetmanager:events';
const GROUP = process.env.EVENT_BUS_GROUP || 'vetmanager';
const DLQ_STREAM = process.env.EVENT_BUS_DLQ_STREAM || `${STREAM}:dlq`;
const log = createLogger('event-bus');

let _eventBusMessages;
function getEventBusMessagesMetric() {
  if (_eventBusMessages) return _eventBusMessages;
  try {
    _eventBusMessages = require('./metrics').eventBusMessages;
  } catch (err) {
    log.warn('Event bus metric unavailable', { error: err.message });
  }
  return _eventBusMessages;
}

function count(topic, direction, result) {
  getEventBusMessagesMetric()?.inc({ topic: topic || 'unknown', direction, result });
}

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
  if (!redis?.isReady) {
    count(topic, 'publish', 'unavailable');
    log.warn('Event bus publish skipped - Redis unavailable', { topic });
    return null;
  }

  try {
    const id = await redis.xAdd(STREAM, '*', {
      topic,
      payload: JSON.stringify(payload || {}),
      meta: JSON.stringify(meta || {}),
      ts: new Date().toISOString(),
    });
    count(topic, 'publish', 'success');
    return id;
  } catch (err) {
    count(topic, 'publish', 'failure');
    log.warn('Event bus publish failed', { topic, message: err?.message, code: err?.code });
    throw err;
  }
}

async function writeDlq(redis, consumerName, envelope, err) {
  await redis.xAdd(DLQ_STREAM, '*', {
    topic: envelope.topic,
    payload: JSON.stringify(envelope.payload || {}),
    meta: JSON.stringify(envelope.meta || {}),
    ts: envelope.ts || new Date().toISOString(),
    consumer: consumerName,
    error: JSON.stringify({
      message: err?.message,
      code: err?.code,
      failedAt: new Date().toISOString(),
    }),
  });
  count(envelope.topic, 'consume', 'dlq');
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

          const envelope = {
            id: message.id,
            topic,
            payload: JSON.parse(message.message.payload || '{}'),
            meta: JSON.parse(message.message.meta || '{}'),
            ts: message.message.ts,
          };

          try {
            await handler(envelope);
            await redis.xAck(STREAM, GROUP, message.id);
            count(topic, 'consume', 'success');
          } catch (err) {
            count(topic, 'consume', 'failure');
            try {
              await writeDlq(redis, consumerName, envelope, err);
              await redis.xAck(STREAM, GROUP, message.id);
            } catch (dlqErr) {
              log.warn('Event bus DLQ write failed', {
                topic,
                consumerName,
                message: dlqErr?.message,
                originalError: err?.message,
              });
            }
          }
        }
      }
    }
  }

  loop().catch((err) => log.warn('Event bus loop failed', { consumerName, message: err?.message }));
  return async () => { stopped = true; };
}

module.exports = {
  publish,
  subscribe,
  DLQ_STREAM,
};
