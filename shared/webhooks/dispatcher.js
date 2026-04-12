'use strict';

/**
 * Webhook dispatcher — mirrors apipersonal webhook system.
 *
 * Fetches pending webhook_deliveries, fires HTTP POST with HMAC signature,
 * records result, and applies exponential back-off on failure.
 *
 * Max retries: 5 (backoff: 1m, 5m, 30m, 2h, 8h)
 */

const axios  = require('axios');
const { URL } = require('url');
const db     = require('../db');
const { sign, HEADER } = require('./signature');
const { webhookDeliveries } = require('../metrics');

// SSRF protection: block requests to private/loopback/link-local addresses
const BLOCKED_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|::1|0\.0\.0\.0|169\.254\.\d+\.\d+|fd[0-9a-f]{2}:.*)$/i;

function isSafeWebhookUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const hostname = u.hostname;
    if (BLOCKED_HOSTS.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

const MAX_RETRIES = 5;
const BACKOFF_MS  = [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000];

/**
 * Enqueue a webhook event for all subscribers of that event type.
 *
 * @param {object} opts
 * @param {string} opts.event      e.g. 'patient.created'
 * @param {object} opts.payload    JSON-serialisable event data
 * @param {number} [opts.orgId]    scope to org (null = all orgs)
 */
async function enqueue({ event, payload, orgId = null }) {
  // Find all active webhook endpoints subscribed to this event (or wildcard *)
  const endpoints = await db.query(
    `SELECT we.id, we.url, we.secret
       FROM webhook_endpoints we
       JOIN webhook_subscriptions ws ON ws.endpoint_id = we.id
      WHERE we.is_active = 1
        AND (ws.event_type = :event OR ws.event_type = '*')
        AND (:orgId IS NULL OR we.org_id = :orgId)`,
    { event, orgId },
  );

  if (!endpoints.length) return;

  const payloadJson = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });

  for (const ep of endpoints) {
    await db.query(
      `INSERT INTO webhook_deliveries
         (endpoint_id, event_type, payload, status, next_attempt_at, created_at)
       VALUES (:endpointId, :event, :payload, 'pending', NOW(), NOW())`,
      { endpointId: ep.id, event, payload: payloadJson },
    );
  }
}

/**
 * Process one batch of pending deliveries.
 * Called by the worker on each tick.
 */
async function processPending() {
  const rows = await db.query(
    `SELECT wd.id, wd.endpoint_id, wd.event_type, wd.payload, wd.attempt_count,
            we.url, we.secret
       FROM webhook_deliveries wd
       JOIN webhook_endpoints  we ON we.id = wd.endpoint_id
      WHERE wd.status = 'pending'
        AND wd.next_attempt_at <= NOW()
      LIMIT 50
      FOR UPDATE SKIP LOCKED`,
  );

  await Promise.allSettled(rows.map(deliver));
}

async function deliver(row) {
  const { id, url, secret, payload, attempt_count } = row;
  const attempt = (attempt_count || 0) + 1;
  const sig     = sign(payload, secret || '');

  let success = false;
  let responseStatus = null;
  let responseBody   = null;
  let errorMessage   = null;

  // SSRF guard — reject internal/private addresses before making the request
  if (!isSafeWebhookUrl(url)) {
    errorMessage = `SSRF blocked: delivery to '${url}' is not allowed`;
    await db.query(
      `UPDATE webhook_deliveries
          SET status = 'failed', attempt_count = :attempt, last_attempt_at = NOW(),
              error_message = :errorMessage
        WHERE id = :id`,
      { id, attempt, errorMessage }
    );
    return;
  }

  try {
    const resp = await axios.post(url, JSON.parse(payload), {
      headers: {
        'Content-Type': 'application/json',
        [HEADER]:        sig,
        'X-Webhook-Event': row.event_type,
        'X-Delivery-Id':   String(id),
      },
      timeout: 10_000,
    });

    success        = resp.status >= 200 && resp.status < 300;
    responseStatus = resp.status;
    responseBody   = JSON.stringify(resp.data).slice(0, 2048);
  } catch (err) {
    errorMessage   = err.message?.slice(0, 512);
    responseStatus = err.response?.status || null;
    responseBody   = err.response ? JSON.stringify(err.response.data).slice(0, 2048) : null;
  }

  const status = success
    ? 'delivered'
    : attempt >= MAX_RETRIES ? 'failed' : 'pending';

  const nextAttemptAt = (!success && attempt < MAX_RETRIES)
    ? new Date(Date.now() + (BACKOFF_MS[attempt - 1] || BACKOFF_MS[BACKOFF_MS.length - 1]))
    : null;

  await db.query(
    `UPDATE webhook_deliveries
        SET status           = :status,
            attempt_count    = :attempt,
            last_attempt_at  = NOW(),
            next_attempt_at  = :nextAttemptAt,
            response_status  = :responseStatus,
            response_body    = :responseBody,
            error_message    = :errorMessage
      WHERE id = :id`,
    { id, status, attempt, nextAttemptAt, responseStatus, responseBody, errorMessage },
  );

  webhookDeliveries?.inc({ event: row.event_type, result: success ? 'success' : 'failure' });
}

module.exports = { enqueue, processPending };
