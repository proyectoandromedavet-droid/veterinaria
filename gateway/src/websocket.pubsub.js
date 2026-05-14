'use strict';

const { createRedisClient, connectRedis } = require('../../shared/redis');
const { logger } = require('./middleware/logger');

let redisSubscriber;
let redisPublisher;

async function getRedisClients() {
  if (!redisSubscriber) {
    redisSubscriber = createRedisClient('gateway-ws-sub');
    redisPublisher = createRedisClient('gateway-ws-pub');
    await connectRedis(redisSubscriber, 'gateway-ws-sub');
    await connectRedis(redisPublisher, 'gateway-ws-pub');
  }
  return { sub: redisSubscriber, pub: redisPublisher };
}

async function subscribeNotifications(onMessage) {
  const { sub } = await getRedisClients();
  await sub.subscribe('notifications', (message) => {
    try {
      const payload = JSON.parse(message);
      onMessage(payload);
    } catch (error) {
      logger.warn('WS: bad Redis message', { message, error: error?.message });
    }
  });
}

async function publishNotification(payload) {
  const { pub } = await getRedisClients();
  await pub.publish('notifications', JSON.stringify(payload));
}

module.exports = {
  getRedisClients,
  subscribeNotifications,
  publishNotification,
};
