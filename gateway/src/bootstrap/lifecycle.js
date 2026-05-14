'use strict';

const { logger } = require('../middleware/logger');
const { config } = require('../config');

function attachRuntime(server, { port, version, attachWebSocket, webhookWorker }) {
  let webhookWorkerStarted = false;

  attachWebSocket(server).catch((error) => logger.error('WS init error', { error: error.message }));

  if (config.webhookWorkerEnabled) {
    webhookWorker.start();
    webhookWorkerStarted = true;
    logger.info('Webhook worker started');
  }

  server.listen(port, () => {
    logger.info(`Gateway running on port ${port}`, { env: config.env, version });
  });

  function shutdown(signal) {
    logger.info(`${signal} received - closing server`);
    if (webhookWorkerStarted) webhookWorker.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection - process kept alive', { reason: String(reason?.message || reason) });
  });
}

module.exports = { attachRuntime };
