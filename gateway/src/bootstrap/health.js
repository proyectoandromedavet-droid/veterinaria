'use strict';

const { listKnownServiceTargets, resolveRuntimeServiceTarget } = require('../../../shared/serviceTargets');
const { logger } = require('../middleware/logger');

async function getRedisHealth() {
  const checks = {};
  const latency = {};

  try {
    const { getClient } = require('../../../shared/cache');
    const t0 = Date.now();
    const client = await getClient();
    await client.ping();
    checks.redis = 'ok';
    latency.redis = Date.now() - t0;
  } catch (error) {
    checks.redis = 'degraded';
    logger.warn('Gateway redis health degraded', { error: error?.message });
  }

  return { checks, latency };
}

function registerHealthRoutes(app, version) {
  app.get('/health', async (_req, res) => {
    const { checks, latency } = await getRedisHealth();

    res.status(200).json({
      status: 'ok',
      service: 'gateway',
      version,
      uptime: Math.floor(process.uptime()),
      ts: new Date().toISOString(),
      checks,
      latency,
    });
  });

  app.get('/health/live', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'gateway',
      ts: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req, res) => {
    const { checks, latency } = await getRedisHealth();
    const ready = checks.redis === 'ok';

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      service: 'gateway',
      version,
      ts: new Date().toISOString(),
      checks,
      latency,
    });
  });

  app.get('/health/deep', async (_req, res) => {
    const TIMEOUT_MS = 3000;
    const results = {};
    let allOk = true;
    const services = await listKnownServiceTargets();

    await Promise.all(
      services.map(async ({ name, url: fallbackUrl, source }) => {
        const t0 = Date.now();
        try {
          const baseUrl = await resolveRuntimeServiceTarget(name) || fallbackUrl;
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
          const resp = await fetch(`${baseUrl}/health`, { signal: ctrl.signal });
          clearTimeout(tid);
          const body = await resp.json().catch(() => ({}));
          results[name] = {
            status: resp.ok ? (body.status || 'ok') : 'error',
            latency: Date.now() - t0,
            source,
            target: baseUrl,
            checks: body.checks || undefined,
          };
          if (!resp.ok) allOk = false;
        } catch (error) {
          results[name] = {
            status: 'unreachable',
            latency: Date.now() - t0,
            source,
            target: fallbackUrl,
            error: error.message,
          };
          allOk = false;
        }
      })
    );

    res.status(allOk ? 200 : 207).json({
      status: allOk ? 'ok' : 'degraded',
      service: 'gateway',
      version,
      ts: new Date().toISOString(),
      services: results,
    });
  });
}

module.exports = { registerHealthRoutes };
