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

const INTERVAL_MS = parseInt(process.env.WEBHOOK_POLL_MS || '15000');

let timer = null;
let running = false;
let stopEventBus = null;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processPending();
  } catch (_) {
    // log silently — don't crash the process
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
    }).catch(() => {});
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
    stopEventBus().catch?.(() => {});
    stopEventBus = null;
  }
}

module.exports = { start, stop };
