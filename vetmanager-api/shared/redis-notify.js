'use strict';

/**
 * Helper for any microservice to publish real-time notifications
 * to the gateway WebSocket via Redis pub/sub.
 *
 * Usage:
 *   const notify = require('../../../shared/redis-notify');
 *   await notify.toUsers([userId], 'critical_lab', { message: 'Valor crítico detectado', patientId: 5 });
 *   await notify.toBranch(branchId, 'new_appointment', { ... });
 */

const { createClient } = require('redis');

let publisher;

async function getPublisher() {
  if (!publisher) {
    publisher = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    publisher.on('error', (e) => console.error('[redis-notify]', e.message));
    await publisher.connect();
  }
  return publisher;
}

/**
 * Send notification to specific user IDs.
 * @param {number[]} userIds
 * @param {string}   type      e.g. 'critical_lab', 'appointment_reminder'
 * @param {object}   data      payload to send
 * @param {object}   [options] { severity: 'info'|'warning'|'critical', actionUrl }
 */
async function toUsers(userIds, type, data, options = {}) {
  const pub = await getPublisher();
  await pub.publish('notifications', JSON.stringify({
    type,
    targetUserIds: userIds.map(String),
    data: { ...data, severity: options.severity || 'info', actionUrl: options.actionUrl },
    ts: new Date().toISOString(),
  }));
}

/**
 * Send notification to all users in a branch.
 */
async function toBranch(branchId, type, data, options = {}) {
  const pub = await getPublisher();
  await pub.publish('notifications', JSON.stringify({
    type,
    branchId: String(branchId),
    data: { ...data, severity: options.severity || 'info' },
    ts: new Date().toISOString(),
  }));
}

/**
 * Send notification to all users in an org.
 */
async function toOrg(orgId, type, data, options = {}) {
  const pub = await getPublisher();
  await pub.publish('notifications', JSON.stringify({
    type,
    orgId: String(orgId),
    data: { ...data, severity: options.severity || 'info' },
    ts: new Date().toISOString(),
  }));
}

/**
 * Predefined critical events (match with DB trigger alerts)
 */
const events = {
  criticalLab:      (userId, patientName, testName, value) =>
    toUsers([userId], 'critical_lab', { patientName, testName, value }, { severity: 'critical' }),

  criticalVitals:   (userId, patientName, vital, value) =>
    toUsers([userId], 'critical_vitals', { patientName, vital, value }, { severity: 'critical' }),

  lowStock:         (branchId, itemName, qty) =>
    toBranch(branchId, 'low_stock', { itemName, qty }, { severity: 'warning' }),

  newAppointment:   (vetId, patientName, date) =>
    toUsers([vetId], 'new_appointment', { patientName, date }, { severity: 'info' }),

  teleSessionReady: (clientId, vetName, sessionCode) =>
    toUsers([clientId], 'tele_session_ready', { vetName, sessionCode }, { severity: 'info' }),

  invoiceOverdue:   (clientUserId, invoiceNumber, amount) =>
    toUsers([clientUserId], 'invoice_overdue', { invoiceNumber, amount }, { severity: 'warning' }),
};

module.exports = { toUsers, toBranch, toOrg, events };
