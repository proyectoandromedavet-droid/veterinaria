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

const { processPending } = require('./dispatcher');

const INTERVAL_MS = parseInt(process.env.WEBHOOK_POLL_MS || '15000');

let timer = null;
let running = false;

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
  // Fire immediately on startup too
  tick();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop };
