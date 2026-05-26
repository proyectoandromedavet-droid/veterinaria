'use strict';

// OT-091: migrating from bcryptjs to argon2id via shared/passwordHash abstraction.
// pwHash.verify() auto-detects bcrypt vs argon2 hashes; pwHash.hash() produces argon2id.
// On successful bcrypt login, transparent re-hashing to argon2id is triggered automatically.
const bcrypt  = require('bcryptjs');  // kept for recovery-code hashing (low-risk path)
const pwHash  = require('../../../../shared/passwordHash');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db             = require('../../../../shared/db');
const jwt            = require('../../../../shared/jwt');
const R              = require('../../../../shared/response');
const { getRedisSingleton } = require('../../../../shared/redis');
const twoFactor      = require('../../../../shared/twoFactor');
const { enforcePassword } = require('../../../../shared/passwordPolicy');
const { captureFingerprint } = require('../../../../shared/deviceFingerprint');
const { enqueueJob } = require('../../../../shared/notificationRetry');
const oidc = require('../../../../shared/oidc');
const { getEffectivePermissions } = require('../../../../shared/rbac');
const { createLogger } = require('../../../../shared/logger');
const { resolveCookiePolicy } = require('../../../../shared/cookiePolicy');
const { formatDateTime } = require('../../../../shared/locale');
const {
  getDependencyMode,
  recordDependencyDegradation,
  logDependencyIssue,
  dependencyFailureResponse,
} = require('../../../../shared/dependencyPolicy');
const { encrypt: encryptField, decrypt: decryptField } = require('../../../../shared/encryption'); // BUG-008

const log = createLogger('auth-controller');

function getAccessRevocationTtlSec() {
  return Math.max(60, parseInt(process.env.JWT_REVOCATION_TTL_SEC || '900', 10));
}

// ── Redis ─────────────────────────────────────────────────────────────────────
async function getRedis() {
  return getRedisSingleton('auth-controller', 'auth-controller');
}

function getSessionSecurityMode() {
  return getDependencyMode(
    'auth_session_security',
    process.env.NODE_ENV === 'production' ? 'strict' : 'degraded'
  );
}

function sessionSecurityError(context, cause) {
  const err = new Error('Session security backend unavailable');
  err.code = 'AUTH_SESSION_SECURITY_UNAVAILABLE';
  err.context = context;
  err.cause = cause;
  return err;
}

function isSessionSecurityError(err) {
  return err?.code === 'AUTH_SESSION_SECURITY_UNAVAILABLE';
}

function sessionSecurityUnavailable(res, err) {
  res.setHeader('Retry-After', '30');
  return dependencyFailureResponse(res, {
    statusCode: 503,
    message: 'Authentication service temporarily unavailable — session security backend is offline',
    code: 'AUTH_016',
    details: {
      context: err?.context || 'redis',
      retryable: true,
      mode: 'strict',
    },
  });
}

function logRedisWarning(context, err) {
  log.warn('redis', {
    context,
    message: err?.message,
    code: err?.code,
  });
}

function logAuth401(req, endpoint, extra = {}) {
  log.warn('401', {
    endpoint,
    requestId: req.headers['x-request-id'] || req.requestId || null,
    hasAuthorization: Boolean(req.headers.authorization),
    hasRefreshCookie: Boolean(req.cookies?.refreshToken),
    userId: req.user?.userId || req.user?.id || null,
    ...extra,
  });
}

async function runRedis(context, op, opts = {}) {
  const mode = getSessionSecurityMode();
  try {
    const redis = await getRedis();
    if (!redis?.isReady) {
      recordDependencyDegradation('auth_session_security', mode, opts.critical && mode === 'strict' ? 'blocked' : 'degraded', { service: 'auth' });
      if (opts.critical && mode === 'strict') throw sessionSecurityError(context);
      return null;
    }
    return await op(redis);
  } catch (err) {
    if (isSessionSecurityError(err)) throw err;
    recordDependencyDegradation('auth_session_security', mode, opts.critical && mode === 'strict' ? 'blocked' : 'degraded', { service: 'auth' });
    logDependencyIssue(log, 'auth_session_security', mode, 'Redis session security operation failed', err, { context });
    logRedisWarning(context, err);
    if (opts.critical && mode === 'strict') throw sessionSecurityError(context, err);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getActiveSessionJtis(userId) {
  const rows = await db.query(
    `SELECT jti
     FROM sessions
     WHERE user_id = :userId
       AND is_revoked = FALSE
       AND jti IS NOT NULL`,
    { userId }
  );
  return rows.map(row => row.jti).filter(Boolean);
}

async function revokeSessionJtis(jtis, context) {
  if (!jtis.length) return;
  await runRedis(context, async (redis) => {
    const multi = redis.multi();
    for (const jti of jtis) {
      multi.setEx(`revoked:${jti}`, getAccessRevocationTtlSec(), '1');
    }
    await multi.exec();
  }, { critical: true });
}

function parseUserAgent(ua = '') {
  if (/mobile/i.test(ua))  return 'mobile';
  if (/tablet/i.test(ua))  return 'tablet';
  return 'desktop';
}

function setSessionCookies(req, res, accessToken, refreshToken) {
  const configuredSameSite = String(process.env.AUTH_COOKIE_SAME_SITE || 'none').toLowerCase();
  const secureOverride = process.env.AUTH_COOKIE_SECURE === 'true'
    ? true
    : process.env.AUTH_COOKIE_SECURE === 'false'
      ? false
      : undefined;
  const { secure, sameSite } = resolveCookiePolicy(req, {
    sameSite: configuredSameSite,
    secureOverride,
  });
  const cookieBase = {
    httpOnly: true,
    secure,
    sameSite,
  };

  res.cookie('accessToken', accessToken, {
    ...cookieBase,
    maxAge: 15 * 60 * 1000,
    path:   '/',
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieBase,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path:   '/api/v1/auth',
  });
}

function clearSessionCookies(res) {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/api/v1/auth' });
}

/**
 * Exponential backoff brute-force guard.
 *
 * Tracks failed attempts per (email + IP) in Redis.
 * Lockout window doubles on each threshold crossing:
 *   attempt 1-3  → no lock
 *   attempt 4    → locked 30 s
 *   attempt 5    → locked 1 min
 *   attempt 6    → locked 2 min
 *   attempt 7+   → locked 15 min (cap)
 *
 * Returns { locked: true, retryAfter: <seconds> } or { locked: false }.
 */
// ── Brute force: thresholds por IP+email ─────────────────────────────────────
const BF_THRESHOLDS = [
  { attempts: 4, lockSecs: 30 },
  { attempts: 5, lockSecs: 60 },
  { attempts: 6, lockSecs: 120 },
  { attempts: 7, lockSecs: 900 },  // 15 min cap
];
const BF_COUNTER_TTL = 3600; // reset counter after 1 h of no attempts

// ── Account-level lockout: por email solo (independiente de IP) ───────────────
// Protege contra ataques distribuidos donde el atacante rota IPs.
// Umbrales más permisivos que el per-IP para reducir falsos positivos.
const ACCT_THRESHOLDS = [
  { attempts: 10, lockSecs: 300   },   // 10 intentos → 5 min
  { attempts: 15, lockSecs: 1800  },   // 15 intentos → 30 min
  { attempts: 20, lockSecs: 86400 },   // 20 intentos → 24 h (bloqueo severo)
];
const ACCT_COUNTER_TTL = 7200; // ventana de conteo: 2h

async function checkBruteForce(email, ip) {
  try {
    const redis = await getRedis();

    // 1. Verificar lockout por IP+email
    const lockKey = `bf:lock:${email}:${ip}`;
    const lockedIp = await redis.get(lockKey);
    if (lockedIp) {
      const ttl = await redis.ttl(lockKey);
      return { locked: true, retryAfter: Math.max(ttl, 1), reason: 'ip' };
    }

    // 2. Verificar lockout por cuenta (email solo — sin importar IP)
    const acctLockKey = `bf:acct:lock:${email}`;
    const lockedAcct  = await redis.get(acctLockKey);
    if (lockedAcct) {
      const ttl = await redis.ttl(acctLockKey);
      return { locked: true, retryAfter: Math.max(ttl, 1), reason: 'account' };
    }

    return { locked: false };
  } catch (err) {
    log.warn('Brute force status lookup failed', { error: err.message, email });
    return { locked: false };
  }
}

async function recordFailedAttempt(email, ip) {
  try {
    const redis = await getRedis();

    // Incrementar contador IP+email
    const key     = `bf:${email}:${ip}`;
    const lockKey = `bf:lock:${email}:${ip}`;
    const attempts = await redis.incr(key);
    await redis.expire(key, BF_COUNTER_TTL);
    const rule = [...BF_THRESHOLDS].reverse().find(r => attempts >= r.attempts);
    if (rule) {
      await redis.setEx(lockKey, rule.lockSecs, '1');
    }

    // Incrementar contador de cuenta (email solo)
    const acctKey     = `bf:acct:${email}`;
    const acctLockKey = `bf:acct:lock:${email}`;
    const acctAttempts = await redis.incr(acctKey);
    await redis.expire(acctKey, ACCT_COUNTER_TTL);
    const acctRule = [...ACCT_THRESHOLDS].reverse().find(r => acctAttempts >= r.attempts);
    if (acctRule) {
      await redis.setEx(acctLockKey, acctRule.lockSecs, '1');
    }
  } catch (err) {
    log.warn('Brute force counter update failed', { error: err.message, email, ip });
  }
}

async function clearBruteForce(email, ip) {
  try {
    const redis = await getRedis();
    // Limpiar ambos contadores al login exitoso
    await redis.del(`bf:${email}:${ip}`);
    await redis.del(`bf:lock:${email}:${ip}`);
    await redis.del(`bf:acct:${email}`);
    await redis.del(`bf:acct:lock:${email}`);
  } catch (err) {
    log.warn('Brute force counter clear failed', { error: err.message, email, ip });
  }
}

async function buildTokenPair(user, roles) {
  const jti = uuidv4();
  const payload = {
    jti,
    userId:   user.id,
    email:    user.email,
    orgId:    user.organization_id,
    branchId: user.branch_id,
    roles,
  };
  const accessToken  = jwt.signAccess(payload);
  const refreshToken = jwt.signRefresh({ jti, userId: user.id });
  return { accessToken, refreshToken, jti };
}

async function ensureUserRoles(userId) {
  const roleRows = await db.query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :userId AND ur.is_active = TRUE`,
    { userId }
  );
  return roleRows.map((r) => r.name);
}

// OT-072: parallelize Redis lookups instead of sequential N+1 pattern
async function getUserPermissions(roles, orgId) {
  const allPerms = await Promise.all(
    (roles || []).map((role) => getEffectivePermissions(role, orgId))
  );
  const merged = new Set(allPerms.flat());
  return [...merged];
}

async function persistSession(req, user, refreshToken, jti) {
  const ip = req.ip;
  const ua = req.headers['user-agent'] || '';
  const sessionWriteResult = await db.query(
    `INSERT INTO sessions
       (user_id, session_token, jti, ip_address, user_agent, device_type, expires_at)
     VALUES (:userId, :token, :jti, :ip, :ua, :device, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    {
      userId: user.id,
      token: jwt.hashToken(refreshToken),
      jti,
      ip,
      ua,
      device: parseUserAgent(ua),
    }
  );
  const sessionResult = Array.isArray(sessionWriteResult)
    ? sessionWriteResult[0]
    : sessionWriteResult;
  const sessionId = sessionResult?.insertId || null;
  if (sessionId) {
    await captureFingerprint(sessionId, req.headers['x-device-fingerprint']).catch(() => {});
  }
  return sessionId;
}

async function finalizeLogin(res, req, user, roles, responseData = null) {
  const { accessToken, refreshToken, jti } = await buildTokenPair(user, roles);
  const permissions = await getUserPermissions(roles, user.organization_id);
  await persistSession(req, user, refreshToken, jti);
  setSessionCookies(req, res, accessToken, refreshToken);
  return {
    accessToken,
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    user: responseData
      ? { ...responseData, permissions }
      : {
          id: user.id,
          email: user.email,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          orgId: user.organization_id,
          branchId: user.branch_id,
          roles,
          permissions,
        },
  };
}

async function loadSsoConfig(provider, options = {}) {
  const rows = await db.query(
    `SELECT osc.*, o.name AS organization_name
     FROM organization_sso_configs osc
     JOIN organizations o ON o.id = osc.organization_id
     WHERE osc.provider = :provider AND osc.is_active = 1`,
    { provider: oidc.normalizeProvider(provider) }
  );

  if (!rows.length) return null;
  if (options.orgId) return rows.find((row) => row.organization_id === Number(options.orgId)) || null;

  const emailDomain = String(options.email || '').split('@')[1]?.toLowerCase();
  if (!emailDomain) return rows[0];

  return rows.find((row) => {
    try {
      const domains = JSON.parse(row.allowed_domains || '[]').map((d) => String(d).toLowerCase());
      return domains.includes(emailDomain);
    } catch {
      return false;
    }
  }) || null;
}

let apiKeysSchemaPromise;
async function getApiKeysColumns() {
  if (!apiKeysSchemaPromise) {
    apiKeysSchemaPromise = db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'api_keys'`
    ).then((rows) => new Set(rows.map((row) => row.COLUMN_NAME)));
  }
  return apiKeysSchemaPromise;
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 */
async function login(req, res) {
  const { email, password } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'] || '';

  // ── Exponential-backoff brute-force check (Redis layer) ───────────────────
  const bf = await checkBruteForce(email, ip);
  if (bf.locked) {
    res.setHeader('Retry-After', bf.retryAfter);
    return R.tooMany(res, `Too many failed attempts. Try again in ${bf.retryAfter} seconds.`);
  }

  // Check lockout via stored procedure (DB-level lockout as second layer — fail-open)
  try {
    const [proc] = await db.callProc('sp_login_attempt', [email, ip]);
    const result  = proc?.[0];
    if (result?.locked) {
      return R.tooMany(res, `Account locked. Try again after ${result.locked_until}`);
    }
  } catch (spErr) {
    log.error('sp_login_attempt failed (skipping)', { message: spErr.message });
  }

  const user = await db.queryOne(
    `SELECT u.*, b.organization_id
     FROM users u
     JOIN branches b ON u.branch_id = b.id
     WHERE u.email = :email AND u.is_active = TRUE`,
    { email }
  );

  // OT-091: use pwHash.verify() which handles both bcrypt and argon2id hashes
  const passwordValid = user && await pwHash.verify(password, user.password_hash);
  if (!user || !passwordValid) {
    // Redis: backoff exponencial por IP+email y por cuenta
    await recordFailedAttempt(email, ip);
    // BD: registrar intento fallido y aplicar lockout a nivel de cuenta
    if (user?.id) {
      await db.callProc('sp_record_failed_login', [email, ip]).catch(() => {});
    }
    // Historial de login
    await db.query(
      `INSERT INTO login_history (user_id, ip_address, user_agent, success, failure_reason)
       VALUES (:userId, :ip, :ua, FALSE, 'invalid_credentials')`,
      { userId: user?.id || null, ip, ua }
    );
    logAuth401(req, 'POST /auth/login', { reason: 'invalid_credentials' });
    return R.unauthorized(res, 'Invalid email or password');
  }

  const roles = await ensureUserRoles(user.id);

  // OT-091: transparent hash upgrade — if the stored hash is bcrypt and argon2 is
  // now available, re-hash the verified password and update the DB silently.
  if (pwHash.isLegacyHash(user.password_hash) && pwHash.isArgon2Available()) {
    pwHash.hash(password).then((newHash) =>
      db.query('UPDATE users SET password_hash = :h WHERE id = :id', { h: newHash, id: user.id })
    ).catch((e) => log.warn('Hash upgrade failed', { userId: user.id, error: e.message }));
  }

  // Limpiar contadores de brute force (Redis + BD) al login exitoso
  await clearBruteForce(email, ip);
  await db.callProc('sp_clear_failed_logins', [user.id]).catch(() => {});

  // Record successful login
  await db.query(
    `INSERT INTO login_history (user_id, ip_address, user_agent, success)
     VALUES (:userId, :ip, :ua, TRUE)`,
    { userId: user.id, ip, ua }
  );

  // Notify if this IP has not been seen in the last 30 days for this user
  const seenBefore = await db.queryOne(
    `SELECT 1 FROM login_history
     WHERE user_id = :userId AND ip_address = :ip AND success = TRUE
       AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
       AND id != LAST_INSERT_ID()
     LIMIT 1`,
    { userId: user.id, ip }
  );
  if (!seenBefore) {
    enqueueJob({
      channel: 'email',
      payload: {
        kind:      'new_device_login',
        to:        user.email,
        name:      `${user.first_name} ${user.last_name}`,
        ip,
        userAgent: ua,
        time:      formatDateTime(new Date()),
      },
      createdBy: user.id,
      orgId: user.organization_id,
      branchId: user.branch_id,
    }).catch(() => {});
  }

  // ── 2FA gate — if enabled, issue a short-lived pending token ─────────────
  if (user.two_factor_enabled) {
    const pendingToken = jwt.signAccess({ scope: '2fa_pending', userId: user.id });
    return R.ok(res, { requiresTwoFactor: true, pendingToken });
  }

  const payload = await finalizeLogin(res, req, user, roles, {
    id: user.id,
    email: user.email,
    name: `${user.first_name} ${user.last_name}`,
    orgId: user.organization_id,
    branchId: user.branch_id,
    roles,
  });

  return R.ok(res, payload);
}

/**
 * POST /auth/refresh
 *
 * Implements refresh token rotation with reuse detection.
 *
 * Flow:
 *   1. Verify JWT signature.
 *   2. Check Redis for `rt:used:{hash}` — if hit, the token was already rotated
 *      (possible theft). Revoke the session immediately and return 401.
 *   3. Look up the live session by token hash.
 *   4. Rotate: issue new pair, update DB, store old hash in Redis for 5 min.
 *   5. Revoke old access token JTI via `revoked:{jti}`.
 */
async function refresh(req, res) {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    logAuth401(req, 'POST /auth/refresh', { reason: 'missing_refresh_cookie' });
    return R.unauthorized(res, 'Missing refresh token cookie');
  }

  let decoded;
  try {
    decoded = jwt.verifyRefresh(refreshToken);
  } catch (err) {
    log.warn('Refresh token verification failed', { error: err.message });
    logAuth401(req, 'POST /auth/refresh', { reason: 'invalid_or_expired_refresh_token' });
    return R.unauthorized(res, 'Invalid or expired refresh token');
  }

  const tokenHash = jwt.hashToken(refreshToken);

  // ── Reuse detection ────────────────────────────────────────────────────────
  // If this hash was already rotated away, a stolen token is being replayed.
  let reusedSessionId;
  try {
    reusedSessionId = await runRedis('refresh.reuse-check', (redis) =>
      redis.get(`rt:used:${tokenHash}`), { critical: true }
    );
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }
  if (reusedSessionId) {
    // Revoke the session that was created after this token was stolen.
    await db.query(
      `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW()
       WHERE id = :id`,
      { id: reusedSessionId }
    );
    // Also revoke the current JTI if stored
    const stolenSession = await db.queryOne(
      `SELECT jti FROM sessions WHERE id = :id`, { id: reusedSessionId }
    );
    if (stolenSession?.jti) {
      try {
        await runRedis('refresh.revoke-stolen-jti', (redis) =>
        redis.setEx(`revoked:${stolenSession.jti}`, getAccessRevocationTtlSec(), '1'), { critical: true }
        );
      } catch (err) {
        if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
        throw err;
      }
    }
    await runRedis('refresh.clear-used-marker', (redis) =>
      redis.del(`rt:used:${tokenHash}`)
    );
    return R.unauthorized(res, 'Refresh token already used — possible token theft. All sessions revoked.');
  }

  // ── Normal lookup ──────────────────────────────────────────────────────────
  const session = await db.queryOne(
    `SELECT s.*, 
          u.email, 
          u.first_name, 
          u.last_name,
          u.branch_id,
          b.organization_id
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     JOIN branches b ON u.branch_id = b.id
     WHERE s.session_token = :hash 
       AND s.is_revoked = FALSE 
       AND s.expires_at > NOW()`,
    { hash: tokenHash }
  );

  if (!session) {
    clearSessionCookies(res);
    logAuth401(req, 'POST /auth/refresh', {
      reason: 'refresh_session_not_found',
    });
    return R.unauthorized(res, 'Refresh session not found');
  }

  // Revoke old access JTI
  try {
    await runRedis('refresh.revoke-old-jti', (redis) =>
      redis.setEx(`revoked:${session.jti}`, getAccessRevocationTtlSec(), '1'), { critical: true }
    );
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }

  const roles = await db.query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :uid AND ur.is_active = TRUE`,
    { uid: session.user_id }
  );

  const user = {
    id:              session.user_id,
    email:           session.email,
    branch_id:       session.branch_id || null,
    organization_id: session.organization_id,
  };

  const { accessToken, refreshToken: newRefresh, jti } = await buildTokenPair(user, roles.map(r => r.name));
  const newHash = jwt.hashToken(newRefresh);

  // Rotate session token in DB
  await db.query(
    `UPDATE sessions
     SET session_token = :newHash, jti = :jti, last_activity_at = NOW()
     WHERE id = :id`,
    { newHash, jti, id: session.id }
  );

  // Mark old hash as "used" — 10 min window accounts for clock skew + network latency
  try {
    await runRedis('refresh.mark-used', (redis) =>
      redis.setEx(`rt:used:${tokenHash}`, 10 * 60, String(session.id)), { critical: true }
    );
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }

  setSessionCookies(req, res, accessToken, newRefresh);

  return R.ok(res, { accessToken });
}

/**
 * POST /auth/logout
 */
async function logout(req, res) {
  const userId = req.user.userId;
  const jti    = req.user.jti;

  // Revoke current token
  if (jti) {
    try {
      await runRedis('logout.revoke-jti', (redis) =>
      redis.setEx(`revoked:${jti}`, getAccessRevocationTtlSec(), '1'), { critical: true }
      );
    } catch (err) {
      if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
      throw err;
    }
  }

  // Mark session as revoked
  await db.query(
    `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW()
     WHERE jti = :jti AND user_id = :userId`,
    { jti, userId }
  );

  clearSessionCookies(res);
  return R.noContent(res);
}

/**
 * POST /auth/logout-all  — revoke all sessions
 */
async function logoutAll(req, res) {
  const sessions = await db.query(
    `SELECT jti FROM sessions
     WHERE user_id = :userId
       AND is_revoked = FALSE
       AND expires_at > NOW()
       AND jti IS NOT NULL`,
    { userId: req.user.userId }
  );
  await db.callProc('sp_revoke_user_sessions', [req.user.userId]);
  if (sessions.length) {
    try {
      await runRedis('logout-all.revoke-jtis', async (redis) => {
        const multi = redis.multi();
        for (const session of sessions) {
          multi.setEx(`revoked:${session.jti}`, getAccessRevocationTtlSec(), '1');
        }
        await multi.exec();
      }, { critical: true });
    } catch (err) {
      if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
      throw err;
    }
  }
  clearSessionCookies(res);
  return R.noContent(res);
}

async function syncRecentRevocations(limit = 500) {
  const ttlSec = getAccessRevocationTtlSec();
  const rows = await db.query(
    `SELECT jti
     FROM sessions
     WHERE is_revoked = TRUE
       AND revoked_at >= DATE_SUB(NOW(), INTERVAL :ttlSec SECOND)
       AND jti IS NOT NULL
     ORDER BY revoked_at DESC
     LIMIT :limit`,
    { ttlSec, limit }
  );
  if (!rows.length) return 0;

  await runRedis('revocation-sync.recent-jtis', async (redis) => {
    const multi = redis.multi();
    for (const row of rows) {
      multi.setEx(`revoked:${row.jti}`, ttlSec, '1');
    }
    await multi.exec();
  });

  return rows.length;
}

/**
 * GET /auth/me
 */
async function me(req, res) {
  const user = await db.queryOne(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
            u.license_number, u.is_active, u.created_at,
            b.id AS branch_id, b.name AS branch_name,
            o.id AS org_id, o.name AS org_name
     FROM users u
     JOIN branches b ON u.branch_id = b.id
     JOIN organizations o ON b.organization_id = o.id
     WHERE u.id = :id`,
    { id: req.user.userId }
  );
  if (!user) return R.notFound(res, 'User not found');

  const roles = await db.query(
    `SELECT r.name, r.display_name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :id AND ur.is_active = TRUE`,
    { id: req.user.userId }
  );

  const roleNames = roles.map((role) => role.name);
  const permissions = await getUserPermissions(roleNames, user.org_id);

  return R.ok(res, { ...user, roles, permissions });
}

/**
 * POST /auth/password-reset/request
 */
async function requestPasswordReset(req, res) {
  const { email } = req.body;
  const user = await db.queryOne(
    `SELECT id FROM users WHERE email = :email AND is_active = TRUE`,
    { email }
  );

  // Always return 200 to avoid email enumeration
  if (!user) return R.ok(res, { message: 'If that email exists, a reset link was sent.' });

  const token   = jwt.generateOpaqueToken();
  const hash    = jwt.hashToken(token);
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES (:userId, :hash, :expires)
     ON DUPLICATE KEY UPDATE token_hash = :hash, expires_at = :expires, used_at = NULL`,
    { userId: user.id, hash, expires }
  );

  // Send reset email (fire-and-forget)
  const userRecord = await db.queryOne(
    `SELECT email FROM users WHERE id = :id`, { id: user.id }
  );
  if (userRecord) {
    enqueueJob({
      channel: 'email',
      payload: {
        kind: 'password_reset',
        to: userRecord.email,
        token,
        expiresInMinutes: 60,
      },
      createdBy: user.id,
    }).catch(() => {});
  }

  // Token is sent by email only — never exposed in response (even in dev)
  return R.ok(res, { message: 'If that email exists, a reset link was sent.' });
}

/**
 * POST /auth/password-reset/confirm
 */
async function confirmPasswordReset(req, res) {
  const { token, newPassword } = req.body;
  const hash = jwt.hashToken(token);

  const record = await db.queryOne(
    `SELECT prt.*, u.id AS user_id, u.email, u.first_name, u.last_name
     FROM password_reset_tokens prt
     JOIN users u ON prt.user_id = u.id
     WHERE prt.token_hash = :hash
       AND prt.expires_at > NOW()
       AND prt.used_at IS NULL`,
    { hash }
  );

  if (!record) return R.badRequest(res, 'Invalid or expired reset token');

  // Validar fortaleza de la nueva contraseña antes de hashear
  try {
    enforcePassword(newPassword, {
      email:     record.email,
      firstName: record.first_name,
      lastName:  record.last_name,
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      error: { message: e.message, code: e.code, details: e.details?.errors },
    });
  }

  const passwordHash = await pwHash.hash(newPassword);
  const sessionJtis = await getActiveSessionJtis(record.user_id);
  try {
    await revokeSessionJtis(sessionJtis, 'password-reset.revoke-session-jtis');
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }

  await db.transaction(async (conn) => {
    await conn.execute(
      `UPDATE users SET password_hash = ?, failed_login_attempts = 0,
                        locked_until = NULL, updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, record.user_id]
    );
    await conn.execute(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = ?`,
      [hash]
    );
    // Revoke all sessions
    await conn.execute(
      `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW()
       WHERE user_id = ? AND is_revoked = FALSE`,
      [record.user_id]
    );
  });

  return R.ok(res, { message: 'Password updated successfully. Please log in again.' });
}

/**
 * POST /auth/change-password
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const user = await db.queryOne(
    `SELECT id, password_hash, email, first_name, last_name FROM users WHERE id = :id`,
    { id: req.user.userId }
  );
  if (!user) return R.notFound(res, 'User not found');

  if (!(await pwHash.verify(currentPassword, user.password_hash))) {
    return R.badRequest(res, 'Current password is incorrect');
  }

  // Validar fortaleza antes de hashear
  try {
    enforcePassword(newPassword, {
      email:     user.email,
      firstName: user.first_name,
      lastName:  user.last_name,
    });
  } catch (e) {
    return res.status(400).json({
      success: false,
      error: { message: e.message, code: e.code, details: e.details?.errors },
    });
  }

  // Verificar que la nueva contraseña no sea igual a la actual
  if (await pwHash.verify(newPassword, user.password_hash)) {
    return R.badRequest(res, 'La nueva contraseña no puede ser igual a la actual');
  }

  const hash = await pwHash.hash(newPassword);
  const sessionJtis = await getActiveSessionJtis(req.user.userId);
  try {
    await revokeSessionJtis(sessionJtis, 'change-password.revoke-session-jtis');
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }

  await db.transaction(async (conn) => {
    await conn.query(
      `UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id`,
      { hash, id: req.user.userId }
    );
    await conn.query(
      `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW()
       WHERE user_id = :id AND is_revoked = FALSE`,
      { id: req.user.userId }
    );
  });

  return R.ok(res, { message: 'Password changed successfully' });
}

/**
 * GET /auth/sessions  — list active sessions
 */
async function listSessions(req, res) {
  const rows = await db.query(
    `SELECT id, ip_address, user_agent, device_type, created_at, last_activity_at, expires_at
     FROM sessions
     WHERE user_id = :uid AND is_revoked = FALSE AND expires_at > NOW()
     ORDER BY last_activity_at DESC`,
    { uid: req.user.userId }
  );
  return R.ok(res, rows);
}

/**
 * DELETE /auth/sessions/:id  — revoke a specific session
 */
async function revokeSession(req, res) {
  const { id } = req.params;
  const session = await db.queryOne(
    `SELECT jti FROM sessions WHERE id = :id AND user_id = :uid`,
    { id, uid: req.user.userId }
  );
  if (!session) return R.notFound(res, 'Session not found');

  try {
    await runRedis('revoke-session.revoke-jti', (redis) =>
    redis.setEx(`revoked:${session.jti}`, getAccessRevocationTtlSec(), '1'), { critical: true }
    );
  } catch (err) {
    if (isSessionSecurityError(err)) return sessionSecurityUnavailable(res, err);
    throw err;
  }
  await db.query(
    `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE id = :id`,
    { id }
  );
  return R.noContent(res);
}

/**
 * GET /auth/api-keys
 */
async function listApiKeys(req, res) {
  const limit = Math.min(Math.max(parseInt(`${req.query.limit || '100'}`, 10) || 100, 1), 200);
  const cols = await getApiKeysColumns();
  const activeExpr = cols.has('is_active') ? 'is_active' : (cols.has('active') ? 'active' : '1');
  const revokedExpr = cols.has('revoked_at') ? 'revoked_at' : 'NULL';
  const rows = await db.query(
    `SELECT id, name, key_prefix, scopes, last_used_at, expires_at,
            ${activeExpr} AS is_active, ${revokedExpr} AS revoked_at, created_at
     FROM api_keys
     WHERE user_id = :uid
     ORDER BY created_at DESC
     LIMIT :limit`,
    { uid: req.user.userId, limit }
  );
  return R.ok(res, rows, { limit });
}

/**
 * POST /auth/api-keys
 */
// BUG-013: scopes de API key permitidos
const ALLOWED_API_KEY_SCOPES = new Set([
  'read', 'write', 'admin',
  'patients:read', 'patients:write',
  'medical:read', 'medical:write',
  'billing:read', 'billing:write',
  'lab:read', 'lab:write',
  'reports:read',
  'notifications:send',
  'webhooks:manage',
]);

async function createApiKey(req, res) {
  const { name, scopes = [], expiresAt } = req.body;

  // BUG-013: validar que los scopes sean conocidos
  if (!Array.isArray(scopes) || scopes.some((s) => !ALLOWED_API_KEY_SCOPES.has(String(s)))) {
    return R.badRequest(res, `Scopes inválidos. Permitidos: ${[...ALLOWED_API_KEY_SCOPES].join(', ')}`);
  }

  // BUG-014: validar expiresAt con cap máximo de 1 año
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (isNaN(exp.getTime()) || exp <= new Date()) {
      return R.badRequest(res, 'expiresAt debe ser una fecha futura válida');
    }
    const maxExpiry = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    if (exp > maxExpiry) {
      return R.badRequest(res, 'expiresAt no puede ser mayor a 1 año');
    }
  }

  const cols = await getApiKeysColumns();
  const rawKey   = jwt.generateOpaqueToken();
  const keyHash  = jwt.hashToken(rawKey);
  const prefix   = rawKey.slice(0, 16);  // 16 chars = 64-bit entropy prefix
  const insertCols = ['user_id', 'name', 'key_hash', 'key_prefix', 'scopes', 'expires_at'];
  const insertVals = [':userId', ':name', ':hash', ':prefix', ':scopes', ':expires'];
  const params = {
    userId: req.user.userId,
    orgId: req.user.orgId,
    branchId: req.user.branchId,
    name,
    hash: keyHash,
    prefix,
    scopes: JSON.stringify(scopes),
    expires: expiresAt || null,
  };
  if (cols.has('organization_id')) {
    insertCols.push('organization_id');
    insertVals.push(':orgId');
  }
  if (cols.has('branch_id')) {
    insertCols.push('branch_id');
    insertVals.push(':branchId');
  }
  if (cols.has('allowed_ips')) {
    insertCols.push('allowed_ips');
    insertVals.push('NULL');
  }
  if (cols.has('active') && !cols.has('is_active')) {
    insertCols.push('active');
    insertVals.push('1');
  }
  if (cols.has('is_active')) {
    insertCols.push('is_active');
    insertVals.push('1');
  }

  await db.query(
    `INSERT INTO api_keys (${insertCols.join(', ')})
     VALUES (${insertVals.join(', ')})`,
    params
  );

  // Only return raw key once
  return R.created(res, { prefix, rawKey, message: 'Store this key securely — it will not be shown again.' });
}

/**
 * DELETE /auth/api-keys/:id
 */
async function deleteApiKey(req, res) {
  const { id } = req.params;
  const cols = await getApiKeysColumns();
  const setClauses = [];
  if (cols.has('is_active')) setClauses.push('is_active = FALSE');
  if (cols.has('active')) setClauses.push('active = FALSE');
  if (cols.has('revoked_at')) setClauses.push('revoked_at = NOW()');
  if (cols.has('deleted_at')) setClauses.push('deleted_at = COALESCE(deleted_at, NOW())');
  if (!setClauses.length) return R.badRequest(res, 'API key schema missing disable columns');
  await db.query(
    `UPDATE api_keys SET ${setClauses.join(', ')} WHERE id = :id AND user_id = :uid`,
    { id, uid: req.user.userId }
  );
  return R.noContent(res);
}

/**
 * POST /internal/validate-api-key  (called by gateway only)
 */
async function validateApiKey(req, res) {
  const { apiKey } = req.body;
  if (!apiKey) return R.badRequest(res, 'apiKey required');

  const cols = await getApiKeysColumns();
  const activePredicate = cols.has('is_active')
    ? 'ak.is_active = TRUE'
    : (cols.has('active') ? 'ak.active = TRUE' : '1 = 1');
  const deletedPredicate = cols.has('deleted_at') ? 'AND ak.deleted_at IS NULL' : '';
  const hash = jwt.hashToken(apiKey);
  const key = await db.queryOne(
    `SELECT ak.*, u.email, u.branch_id, b.organization_id
     FROM api_keys ak
     JOIN users u ON ak.user_id = u.id
     JOIN branches b ON u.branch_id = b.id
     WHERE ak.key_hash = :hash
       AND ${activePredicate}
       ${deletedPredicate}
       AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
    { hash }
  );

  if (!key) return R.unauthorized(res, 'Invalid API key');

  // Update last used
  await db.query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = :id`, { id: key.id });

  const roles = await db.query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :uid AND ur.is_active = TRUE`,
    { uid: key.user_id }
  );

  return R.ok(res, {
    userId:   key.user_id,
    email:    key.email,
    orgId:    key.organization_id,
    branchId: key.branch_id,
    roles:    roles.map(r => r.name),
    scopes:   JSON.parse(key.scopes || '[]'),
  });
}

// ── 2FA controllers ───────────────────────────────────────────────────────────

/**
 * POST /auth/2fa/setup  — generate secret + QR code
 */
async function setup2fa(req, res) {
  const user = await db.queryOne(
    `SELECT id, email, two_factor_enabled FROM users WHERE id = :id`,
    { id: req.user.userId }
  );
  if (!user) return R.notFound(res, 'User not found');
  if (user.two_factor_enabled) return R.conflict(res, '2FA is already enabled');

  const { secret, otpauthUrl, qrDataUrl } = await twoFactor.setupTwoFactor(user.id, user.email);

  // Temporarily store unconfirmed secret (user must verify before enabling)
  // BUG-008: cifrar el secreto TOTP en reposo
  await db.query(
    `UPDATE users SET two_factor_secret = :secret WHERE id = :id`,
    { secret: encryptField(secret), id: user.id }
  );

  return R.ok(res, { qrDataUrl, otpauthUrl, message: 'Scan QR code then call POST /auth/2fa/verify to confirm' });
}

/**
 * POST /auth/2fa/verify  — confirm setup with a valid TOTP code
 */
async function verify2fa(req, res) {
  const { token } = req.body;
  if (!token) return R.badRequest(res, 'token required');

  const user = await db.queryOne(
    `SELECT id, email, two_factor_secret, two_factor_enabled FROM users WHERE id = :id`,
    { id: req.user.userId }
  );
  if (!user)               return R.notFound(res, 'User not found');
  if (!user.two_factor_secret) return R.badRequest(res, 'Run POST /auth/2fa/setup first');
  if (user.two_factor_enabled) return R.conflict(res, '2FA already verified');

  // BUG-008: descifrar el secreto TOTP antes de verificar
  const valid = twoFactor.verifyTwoFactor(decryptField(user.two_factor_secret), token);
  if (!valid) return R.badRequest(res, 'Invalid or expired TOTP token');

  const recoveryCodes = twoFactor.generateRecoveryCodes(8);
  // Recovery codes are one-time-use TOTP backup tokens, not user login passwords.
  // Kept on bcrypt intentionally — they are never re-hashed/upgraded and the
  // comparison path (verifyRecoveryCode) uses bcrypt.compare directly.
  const bcryptCodes   = await Promise.all(recoveryCodes.map(c => bcrypt.hash(c, 10)));

  await db.transaction(async (conn) => {
    await conn.execute(
      `UPDATE users SET two_factor_enabled = 1, updated_at = NOW() WHERE id = ?`,
      [user.id]
    );
    // Store hashed recovery codes
    for (const hash of bcryptCodes) {
      await conn.execute(
        `INSERT INTO two_factor_recovery_codes (user_id, code_hash) VALUES (?, ?)`,
        [user.id, hash]
      );
    }
  });

  // Send confirmation email (fire-and-forget)
  enqueueJob({
    channel: 'email',
    payload: { kind: '2fa_enabled', to: user.email, name: user.email },
    createdBy: user.id,
  }).catch(() => {});

  return R.ok(res, {
    message: '2FA enabled. Store recovery codes securely.',
    recoveryCodes,   // Shown only once
  });
}

/**
 * DELETE /auth/2fa  — disable 2FA (requires TOTP confirmation)
 */
async function disable2fa(req, res) {
  const { token } = req.body;
  if (!token) return R.badRequest(res, 'token required');

  const user = await db.queryOne(
    `SELECT id, two_factor_secret, two_factor_enabled FROM users WHERE id = :id`,
    { id: req.user.userId }
  );
  if (!user)                    return R.notFound(res, 'User not found');
  if (!user.two_factor_enabled) return R.badRequest(res, '2FA is not enabled');

  // BUG-008: descifrar el secreto TOTP antes de verificar
  const valid = twoFactor.verifyTwoFactor(decryptField(user.two_factor_secret), token);
  if (!valid) return R.badRequest(res, 'Invalid TOTP token');

  await db.query(
    `UPDATE users SET two_factor_enabled = 0, two_factor_secret = NULL, updated_at = NOW() WHERE id = :id`,
    { id: user.id }
  );
  await db.query(`DELETE FROM two_factor_recovery_codes WHERE user_id = :id`, { id: user.id });

  return R.ok(res, { message: '2FA disabled' });
}

/**
 * POST /auth/2fa/challenge  — verify TOTP during login (called after password check)
 *
 * Requires a signed `pendingToken` issued by /auth/login when 2FA is required.
 * This prevents an attacker from targeting arbitrary userIds without knowing the password.
 */
async function challenge2fa(req, res) {
  const { pendingToken, token, code } = req.body;
  const oneTimeCode = token || code;
  if (!pendingToken || !oneTimeCode) return R.badRequest(res, 'pendingToken and token required');

  // Verify the short-lived pending token signed after password success
  let pending;
  try {
    pending = jwt.verifyAccess(pendingToken);
  } catch (err) {
    log.warn('2FA pending token verification failed', { error: err.message });
    logAuth401(req, 'POST /auth/2fa/challenge', { reason: 'invalid_or_expired_pending_token' });
    return R.unauthorized(res, 'Invalid or expired pending token');
  }
  if (pending.scope !== '2fa_pending') return R.unauthorized(res, 'Invalid pending token scope');

  const userId = pending.userId;

  const user = await db.queryOne(
    `SELECT id, email, two_factor_secret, two_factor_enabled, branch_id
     FROM users WHERE id = :id AND is_active = TRUE`,
    { id: userId }
  );
  if (!user || !user.two_factor_enabled) return R.badRequest(res, 'Invalid 2FA challenge');

  // BUG-006/010: burned token — previene replay del código TOTP y race condition paralela
  const totpKey = `totp:used:${userId}:${oneTimeCode}`;
  const redis = await getRedisSingleton().catch(() => null);
  if (redis) {
    const already = await redis.set(totpKey, '1', 'NX', 'EX', 90).catch(() => null);
    if (already === null) {
      // SET NX falló: el código ya fue usado en esta ventana
      logAuth401(req, 'POST /auth/2fa/challenge', { reason: 'totp_replay' });
      return R.unauthorized(res, 'Invalid TOTP token');
    }
  }

  // BUG-008: descifrar el secreto TOTP antes de verificar
  const valid = twoFactor.verifyTwoFactor(decryptField(user.two_factor_secret), oneTimeCode);
  if (!valid) {
    // Liberar el burned token si el código era inválido (para no bloquear al usuario)
    if (redis) redis.del(totpKey).catch(() => {});
    logAuth401(req, 'POST /auth/2fa/challenge', { reason: 'invalid_totp_token' });
    return R.unauthorized(res, 'Invalid TOTP token');
  }

  // BUG-007: invalidar el pendingToken tras uso exitoso
  if (pending.jti && redis) {
    const pendingTtl = Math.max(0, (pending.exp || 0) - Math.floor(Date.now() / 1000));
    if (pendingTtl > 0) redis.set(`revoked:${pending.jti}`, '1', 'EX', pendingTtl).catch(() => {});
  }

  // Build full token pair after successful 2FA
  const orgRow = await db.queryOne(
    `SELECT organization_id FROM branches WHERE id = :id`, { id: user.branch_id }
  );
  const roles = await db.query(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :uid AND ur.is_active = TRUE`, { uid: user.id }
  );
  const payload = await finalizeLogin(
    res,
    req,
    { ...user, organization_id: orgRow?.organization_id },
    roles.map(r => r.name)
  );

  return R.ok(res, { accessToken: payload.accessToken });
}

async function ssoConnect(req, res) {
  const provider = oidc.normalizeProvider(req.params.provider);
  const configRow = await loadSsoConfig(provider, {
    orgId: req.query.orgId,
    email: req.query.email,
  });
  if (!configRow) return R.notFound(res, 'SSO configuration not found for provider/domain');

  const config = {
    ...oidc.getEnvConfig(provider),
    clientId: configRow.client_id,
    clientSecret: configRow.client_secret,
    issuer: configRow.issuer,
    scopes: JSON.parse(configRow.scopes || '["openid","email","profile"]'),
  };
  const authFlow = await oidc.buildAuthorizationUrl(provider, config);
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const defaultRedirect = `${frontendUrl}/login?sso=success`;
  let safeRedirectTo = defaultRedirect;
  if (req.query.redirectTo) {
    try {
      const parsed = new URL(req.query.redirectTo, frontendUrl);
      const allowedOrigin = new URL(frontendUrl).origin;
      if (parsed.origin === allowedOrigin) safeRedirectTo = parsed.href;
    } catch { /* ignore invalid URL */ }
  }

  await runRedis('sso.connect.store-state', (redis) =>
    redis.setEx(`sso:state:${authFlow.state}`, 600, JSON.stringify({
      provider,
      nonce: authFlow.nonce,
      verifier: authFlow.verifier,
      orgId: configRow.organization_id,
      redirectTo: safeRedirectTo,
    }))
  );

  return res.redirect(authFlow.url);
}

async function ssoCallback(req, res) {
  const provider = oidc.normalizeProvider(req.params.provider);
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  if (error) {
    // OT-106: log the specific provider error internally, expose only a generic code
    log.warn('[sso] Provider returned error', { provider, error: String(error) });
    return res.redirect(`${frontendUrl}/login?sso_error=provider_error`);
  }
  if (!code || !state) return R.badRequest(res, 'Missing code/state');

  const stateRaw = await runRedis('sso.callback.load-state', (redis) => redis.get(`sso:state:${state}`));
  if (!stateRaw) return res.redirect(`${frontendUrl}/login?sso_error=invalid_state`);
  await runRedis('sso.callback.consume-state', (redis) => redis.del(`sso:state:${state}`));

  const stateData = JSON.parse(stateRaw);
  const configRow = await loadSsoConfig(provider, { orgId: stateData.orgId });
  if (!configRow) return res.redirect(`${frontendUrl}/login?sso_error=sso_not_configured`);

  const config = {
    ...oidc.getEnvConfig(provider),
    clientId: configRow.client_id,
    clientSecret: configRow.client_secret,
    issuer: configRow.issuer,
    scopes: JSON.parse(configRow.scopes || '["openid","email","profile"]'),
  };
  const tokenResponse = await oidc.exchangeCode(provider, config, code, stateData.verifier);

  let claims;
  try {
    claims = await oidc.verifyIdToken(provider, config, tokenResponse.id_token, {
      nonce: stateData.nonce,
    });
  } catch (err) {
    log.warn('[sso] ID token verification failed', { provider, error: err.message });
    return res.redirect(`${frontendUrl}/login?sso_error=invalid_token`);
  }

  const email = String(claims.email || '').toLowerCase();
  if (claims.email_verified === false) {
    return res.redirect(`${frontendUrl}/login?sso_error=email_not_verified`);
  }
  const emailDomain = email.split('@')[1];
  let allowedDomains;
  try {
    allowedDomains = JSON.parse(configRow.allowed_domains || '[]').map((d) => String(d).toLowerCase());
  } catch {
    // OT-106: don't reveal internal config structure — log internally
    log.warn('[sso] allowed_domains parse failed', { provider, orgId: stateData.orgId });
    return res.redirect(`${frontendUrl}/login?sso_error=auth_error`);
  }
  if (!email || (allowedDomains.length && !allowedDomains.includes(emailDomain))) {
    // OT-106: 'domain_not_allowed' is kept as-is — it is informative to the user without
    // leaking internal configuration details
    return res.redirect(`${frontendUrl}/login?sso_error=domain_not_allowed`);
  }

  let user = await db.queryOne(
    `SELECT u.*, b.organization_id
     FROM users u
     JOIN branches b ON b.id = u.branch_id
     WHERE LOWER(u.email) = :email AND u.is_active = TRUE`,
    { email }
  );

  if (!user && configRow.auto_provision) {
    let branchId = configRow.default_branch_id;
    if (!branchId) {
      const branchRow = await db.queryOne(
        `SELECT id FROM branches WHERE organization_id = :orgId ORDER BY id ASC LIMIT 1`,
        { orgId: configRow.organization_id }
      );
      branchId = branchRow?.id || null;
    }
    // OT-106: 'branch_missing' reveals internal provisioning details — use generic code
    if (!branchId) {
      log.warn('[sso] auto-provision failed: no branch found', { provider, orgId: configRow.organization_id });
      return res.redirect(`${frontendUrl}/login?sso_error=provisioning_error`);
    }

    const passwordHash = await pwHash.hash(crypto.randomUUID());
    const firstName = claims.given_name || claims.name?.split(' ')[0] || 'SSO';
    const lastName = claims.family_name || claims.name?.split(' ').slice(1).join(' ') || provider.toUpperCase();

    const [created] = await db.query(
      `INSERT INTO users
         (branch_id, first_name, last_name, email, password_hash, is_active, created_at, updated_at)
       VALUES
         (:branchId, :firstName, :lastName, :email, :passwordHash, 1, NOW(), NOW())`,
      { branchId, firstName, lastName, email, passwordHash }
    );
    const role = await db.queryOne(`SELECT id FROM roles WHERE name = :name`, { name: configRow.default_role });
    if (role?.id) {
      await db.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active, created_at)
         VALUES (:userId, :roleId, NULL, 1, NOW())`,
        { userId: created.insertId, roleId: role.id }
      );
    }
    user = await db.queryOne(
      `SELECT u.*, b.organization_id
       FROM users u
       JOIN branches b ON b.id = u.branch_id
       WHERE u.id = :id`,
      { id: created.insertId }
    );
  }

  if (!user || Number(user.organization_id) !== Number(configRow.organization_id)) {
    return res.redirect(`${frontendUrl}/login?sso_error=user_not_allowed`);
  }

  const roles = await ensureUserRoles(user.id);
  await finalizeLogin(res, req, user, roles);
  return res.redirect(stateData.redirectTo || `${frontendUrl}/`);
}

module.exports = {
  login, refresh, logout, logoutAll, me,
  syncRecentRevocations,
  requestPasswordReset, confirmPasswordReset, changePassword,
  listSessions, revokeSession,
  listApiKeys, createApiKey, deleteApiKey,
  validateApiKey,
  setup2fa, verify2fa, disable2fa, challenge2fa,
  ssoConnect, ssoCallback,
  // Exported for unit testing only
  _checkBruteForce: checkBruteForce,
  _recordFailedAttempt: recordFailedAttempt,
  _clearBruteForce: clearBruteForce,
};
