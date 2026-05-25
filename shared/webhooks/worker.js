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
const { getRedisSingleton } = require('../redis');
const { createLogger } = require('../logger');

const INTERVAL_MS = parseInt(process.env.WEBHOOK_POLL_MS || '15000');
const LOCK_TTL_MS = INTERVAL_MS + 5000;
const LOCK_KEY = `webhook-worker:poll-lock:${process.env.NODE_ENV || 'dev'}`;
const log = createLogger('webhook-worker');

let timer = null;
let running = false;
let stopEventBus = null;

const LOCK_HOLDER = `${process.env.HOSTNAME || String(process.pid)}`;

async function tryAcquireLock() {
  try {
    const redis = await getRedisSingleton('webhook-lock', 'webhook-worker');
    const holder = `${LOCK_HOLDER}:${Date.now()}`;
    const result = await redis.set(LOCK_KEY, holder, { NX: true, PX: LOCK_TTL_MS });
    if (result === 'OK') {
      tryAcquireLock._holder = holder;
      return true;
    }
    return false;
  } catch {
    return true; // Redis unavailable — allow processing (fail open, not fail blocked)
  }
}

async function releaseLock() {
  try {
    const redis = await getRedisSingleton('webhook-lock', 'webhook-worker');
    const holder = tryAcquireLock._holder;
    if (!holder) return;
    // Atomically release only if we still hold the lock
    await redis.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
      { keys: [LOCK_KEY], arguments: [holder]
    });
    tryAcquireLock._holder = null;
  } catch {}
}

async function tick() {
  if (running) return;
  const acquired = await tryAcquireLock();
  if (!acquired) return; // another instance is already processing
  running = true;
  try {
    await processPending();
  } catch (err) {
    log.warn('Webhook worker tick failed', { error: err.message });
  } finally {
    running = false;
    await releaseLock();
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
    }, [], { groupName: 'webhook-worker' }).then((stopper) => {
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
