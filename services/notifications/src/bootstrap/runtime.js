'use strict';

const { log, getRedis, processPendingJobs, eventBus } = require('../notifications.common');

async function startRuntime({ retryIntervalMs, onEventBusMessage }) {
  await getRedis().catch((err) => log.warn('Redis not available at startup', { err: err.message }));

  const stopEventBus = await eventBus.subscribe(
    'notifications-service',
    async (event) => {
      if (onEventBusMessage) {
        await onEventBusMessage(event);
        return;
      }
      log.info('event-bus message', { topic: event.topic, ts: event.ts });
    },
    ['notifications.push']
  ).catch((err) => {
    log.warn('event bus subscription failed', { err: err.message });
    return null;
  });

  const retryInterval = setInterval(() => {
    processPendingJobs().catch((err) => log.warn('retry worker error', { err: err.message }));
  }, retryIntervalMs);

  return { stopEventBus, retryInterval };
}

module.exports = { startRuntime };
