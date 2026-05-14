'use strict';

/**
 * Webhook worker — runs processPending() on a fixed interval.
 * Start from gateway or a dedicated worker process.
 *
 * Usage:
 *   const { start, stop } = require('./shared/webhooks/worker');
 *   start();  // begin polling
 *   stop();   // graceful shutdown
 */

const { enqueue, processPending } = require('./dispatcher');
const eventBus = require('../eventBus');
const { createLogger } = require('../logger');

const INTERVAL_MS = parseInt(process.env.WEBHOOK_POLL_MS || '15000');
const log = createLogger('webhook-worker');

let timer = null;
let running = false;
let stopEventBus = null;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processPending();
  } catch (err) {
    log.warn('Webhook worker tick failed', { error: err.message });
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, INTERVAL_MS);
  if (!stopEventBus) {
    const consumerName = `webhook-worker-${process.env.HOSTNAME || process.pid}`;
    eventBus.subscribe(consumerName, async ({ topic, payload, meta }) => {
      await enqueue({
        event: topic,
        payload,
        orgId: meta?.orgId || payload?.orgId || null,
      });
      await processPending();
    }).then((stopper) => {
      stopEventBus = stopper;
    }).catch((err) => {
      log.warn('Webhook worker subscription failed', { error: err.message });
    });
  }
  // Fire immediately on startup too
  tick();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (stopEventBus) {
    stopEventBus().catch?.((err) => {
      log.warn('Webhook worker stop failed', { error: err.message });
    });
    stopEventBus = null;
  }
}

module.exports = { start, stop };
