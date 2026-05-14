'use strict';

const db = require('../../../shared/db');
const jwt = require('../../../shared/jwt');
const R = require('../../../shared/response');
const mp = require('../../../shared/mercadopago');
const { decryptRows } = require('../../../shared/encryption');
const { sendPasswordReset, sendWelcome, sendNewDeviceLogin } = require('../../../shared/email');
const { sendTemplate } = require('../../../shared/messaging');
const fcm = require('../../../shared/fcm');
const eventBus = require('../../../shared/eventBus');
const {
  getNotificationSchema,
  notificationExpr,
  notificationReadAtExpr,
  notificationMarkReadSet,
  notificationOrderExpr,
} = require('../../../shared/notificationLogSchema');
const { createLogger } = require('../../../shared/logger');
const rateLimit = require('express-rate-limit');
const { body: vBody, validationResult: vResult } = require('express-validator');

const log = createLogger('portal');
const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' } },
});

function validate(req, res, next) {
  const errors = vResult(req);
  if (!errors.isEmpty()) return R.badRequest(res, 'Validacion fallida', errors.array());
  next();
}

async function portalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return R.unauthorized(res, 'Token requerido');

  try {
    const decoded = jwt.verifyAccess(token);
    if (decoded.role !== 'owner') return R.forbidden(res, 'Acceso exclusivo para duenios');
    req.owner = decoded;
    next();
  } catch (err) {
    log.warn('portal auth failed', { err: err.message });
    return R.unauthorized(res, 'Token invalido o expirado');
  }
}

function buildOwnerToken(client) {
  return jwt.signAccess({
    jti: require('uuid').v4(),
    clientId: client.id,
    email: client.email,
    orgId: client.organization_id || null,
    role: 'owner',
  });
}

function buildOwnerRefresh(client) {
  return jwt.signRefresh({ clientId: client.id, role: 'owner' });
}

function publishPortalEvent(topic, payload, req, extraMeta = {}) {
  const meta = {
    orgId: req.owner?.orgId || req.headers['x-org-id'] || null,
    clientId: req.owner?.clientId || payload.clientId || null,
    branchId: payload.branchId || null,
    source: 'portal',
    ...extraMeta,
  };
  return eventBus.publish(topic, payload, meta).catch((err) => {
    log.warn('portal event publish failed', { err: err.message, topic });
  });
}

module.exports = {
  db,
  jwt,
  R,
  mp,
  fcm,
  decryptRows,
  sendPasswordReset,
  sendWelcome,
  sendNewDeviceLogin,
  sendTemplate,
  getNotificationSchema,
  notificationExpr,
  notificationReadAtExpr,
  notificationMarkReadSet,
  notificationOrderExpr,
  authLimiter,
  validate,
  portalAuth,
  buildOwnerToken,
  buildOwnerRefresh,
  publishPortalEvent,
  log,
  PASSWORD_POLICY,
  vBody,
};
