'use strict';

const { WebSocketServer } = require('ws');
const { createClient }    = require('redis');
const { verifyAccess }    = require('../../shared/jwt');
const { logger }          = require('./middleware/logger');

// ── Orígenes permitidos para WebSocket ───────────────────────────────────────
// En producción, debe coincidir con ALLOWED_ORIGINS.
// En desarrollo se permiten localhost y 127.0.0.1.
function isAllowedOrigin(origin) {
  if (!origin) return false;  // conexiones sin Origin header → rechazar (no son browsers)

  const allowedRaw = process.env.ALLOWED_ORIGINS || '';

  // Desarrollo: permitir localhost siempre
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    } catch { return false; }
  }

  if (!allowedRaw) return false;

  const allowed = allowedRaw.split(',').map(o => o.trim().toLowerCase()).filter(Boolean);
  const originLower = origin.toLowerCase().replace(/\/$/, '');
  return allowed.some(a => originLower === a || originLower.startsWith(`${a}/`));
}

// Redis pub/sub for inter-service broadcasting
let redisSubscriber;
let redisPublisher;

async function getRedisClients() {
  if (!redisSubscriber) {
    const opts = {
      socket: {
        host:     process.env.REDIS_HOST || 'localhost',
        port:     parseInt(process.env.REDIS_PORT || '6379'),
      },
      password: process.env.REDIS_PASSWORD || undefined,
    };
    redisSubscriber = createClient(opts);
    redisPublisher  = createClient(opts);
    await redisSubscriber.connect();
    await redisPublisher.connect();
  }
  return { sub: redisSubscriber, pub: redisPublisher };
}

// Map: userId → Set<WebSocket>
const userSockets = new Map();

function getTokenFromRequest(req) {
  // 1. Authorization header (Bearer token)
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) return header.slice(7);

  // 2. Query param ?token= (fallback para clientes que no pueden enviar headers)
  try {
    const url = new URL(req.url, 'http://localhost');
    const t   = url.searchParams.get('token');
    if (t) return t;
  } catch { /* ignore */ }

  return null;
}

/**
 * Attach WebSocket server to the HTTP server.
 * Clients connect to: ws://host/ws?token=<access_token>
 */
async function attachWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const { sub } = await getRedisClients();

  // Subscribe to all notification channels published by services
  await sub.subscribe('notifications', (message) => {
    try {
      const payload = JSON.parse(message);
      broadcast(payload);
    } catch (e) {
      logger.warn('WS: bad Redis message', { message });
    }
  });

  wss.on('connection', async (ws, req) => {
    // 1. Validar origen (previene DNS rebinding y conexiones cross-origin no autorizadas)
    const origin = req.headers['origin'];
    if (!isAllowedOrigin(origin)) {
      logger.warn('WS: connection rejected — invalid origin', { origin, ip: req.socket.remoteAddress });
      ws.close(4003, 'Origin not allowed');
      return;
    }

    // 2. Extraer y verificar token JWT
    const token = getTokenFromRequest(req);
    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    let user;
    try {
      user = verifyAccess(token);
    } catch (_) {
      ws.close(4001, 'Invalid or expired token');
      return;
    }

    // 3. Verificar revocación en Redis (misma lista negra que el middleware HTTP)
    if (user.jti) {
      try {
        const { sub } = await getRedisClients();
        // Usar el subscriber para no mezclar con pub/sub — creamos cliente temporal si hace falta
        const revokeCheck = createClient({
          socket:   { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') },
          password: process.env.REDIS_PASSWORD || undefined,
        });
        await revokeCheck.connect().catch(() => {});
        const revoked = revokeCheck.isReady ? await revokeCheck.get(`revoked:${user.jti}`) : null;
        await revokeCheck.quit().catch(() => {});
        if (revoked) {
          logger.warn('WS: connection rejected — revoked token', { userId: user.userId });
          ws.close(4001, 'Token revoked');
          return;
        }
      } catch (e) {
        logger.warn('WS: revocation check failed — continuing', { error: e.message });
      }
    }

    const userId = String(user.userId);
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId).add(ws);

    logger.info('WS: client connected', { userId, ip: req.socket.remoteAddress });

    // Heartbeat
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch (_) {}
    });

    ws.on('close', () => {
      userSockets.get(userId)?.delete(ws);
      if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);
      logger.info('WS: client disconnected', { userId });
    });

    ws.send(JSON.stringify({ type: 'connected', userId, roles: user.roles }));
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, parseInt(process.env.WS_HEARTBEAT_INTERVAL || '30000'));

  wss.on('close', () => clearInterval(heartbeatInterval));

  logger.info('WebSocket server attached at /ws');
  return wss;
}

/**
 * Broadcast a notification payload to specific users or roles.
 * @param {{ type, targetUserIds?, targetRoles?, orgId?, branchId?, data }} payload
 */
function broadcast(payload) {
  const { type, targetUserIds, data } = payload;
  const message = JSON.stringify({ type, data, ts: new Date().toISOString() });

  if (targetUserIds && targetUserIds.length) {
    for (const uid of targetUserIds) {
      const sockets = userSockets.get(String(uid));
      if (!sockets) continue;
      for (const ws of sockets) {
        if (ws.readyState === 1) ws.send(message);
      }
    }
    return;
  }

  // Broadcast to all connected clients (filtered by org if needed)
  for (const [, sockets] of userSockets) {
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(message);
    }
  }
}

/**
 * Publish a notification from any service via Redis.
 * Other services should use this function through their own Redis publisher.
 */
async function publishNotification(payload) {
  const { pub } = await getRedisClients();
  await pub.publish('notifications', JSON.stringify(payload));
}

module.exports = { attachWebSocket, publishNotification, broadcast };
