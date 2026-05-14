'use strict';

const { logger } = require('./middleware/logger');
const { config } = require('./config');

const userSockets = new Map();

function normalizeId(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return roles.map((role) => String(role).trim().toLowerCase()).filter(Boolean);
}

function socketMatchesScope(ws, payload) {
  const userContext = ws.userContext || {};
  const targetUserIds = Array.isArray(payload.targetUserIds)
    ? payload.targetUserIds.map((id) => String(id))
    : [];
  const targetRoles = Array.isArray(payload.targetRoles)
    ? payload.targetRoles.map((role) => String(role).trim().toLowerCase()).filter(Boolean)
    : [];
  const targetOrgId = normalizeId(payload.orgId);
  const targetBranchId = normalizeId(payload.branchId);

  if (targetUserIds.length && !targetUserIds.includes(userContext.userId)) return false;
  if (targetOrgId && userContext.orgId !== targetOrgId) return false;
  if (targetBranchId && userContext.branchId !== targetBranchId) return false;
  if (targetRoles.length && !targetRoles.some((role) => userContext.roles.includes(role))) return false;

  return true;
}

function registerSocket(user, ws, req) {
  const userId = String(user.userId);
  if (!userSockets.has(userId)) userSockets.set(userId, new Set());
  userSockets.get(userId).add(ws);
  ws.userContext = {
    userId,
    orgId: normalizeId(user.orgId),
    branchId: normalizeId(user.branchId),
    roles: normalizeRoles(user.roles),
  };

  logger.info('WS: client connected', { userId, ip: req.socket.remoteAddress });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (error) {
      logger.warn('WS: invalid message payload', { userId, error: error?.message });
    }
  });

  ws.on('close', () => {
    userSockets.get(userId)?.delete(ws);
    if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);
    logger.info('WS: client disconnected', { userId });
  });

  ws.send(JSON.stringify({ type: 'connected', userId, roles: user.roles }));
}

function broadcast(payload) {
  const { type, data } = payload;
  if (!type) {
    logger.warn('WS: notification dropped - missing type', { payload });
    return;
  }

  const hasScopedTargets =
    (Array.isArray(payload.targetUserIds) && payload.targetUserIds.length > 0) ||
    (Array.isArray(payload.targetRoles) && payload.targetRoles.length > 0) ||
    payload.orgId !== undefined ||
    payload.branchId !== undefined;

  const message = JSON.stringify({ type, data, ts: new Date().toISOString() });

  if (Array.isArray(payload.targetUserIds) && payload.targetUserIds.length > 0) {
    for (const uid of payload.targetUserIds) {
      const sockets = userSockets.get(String(uid));
      if (!sockets) continue;
      for (const ws of sockets) {
        if (ws.readyState === 1 && socketMatchesScope(ws, payload)) ws.send(message);
      }
    }
    return;
  }

  for (const [, sockets] of userSockets) {
    for (const ws of sockets) {
      if (ws.readyState !== 1) continue;
      if (!hasScopedTargets || socketMatchesScope(ws, payload)) {
        ws.send(message);
      }
    }
  }
}

function attachHeartbeat(wss) {
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, config.wsHeartbeatIntervalMs);

  wss.on('close', () => clearInterval(heartbeatInterval));
}

module.exports = {
  userSockets,
  registerSocket,
  broadcast,
  attachHeartbeat,
};
