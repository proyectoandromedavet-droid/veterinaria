'use strict';

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');

const db          = require('../../../../shared/db');
const jwt         = require('../../../../shared/jwt');
const R           = require('../../../../shared/response');
const twoFactor   = require('../../../../shared/twoFactor');
const {
  send2faEnabled,
  sendPasswordReset: sendPwResetEmail,
  sendNewDeviceLogin,
} = require('../../../../shared/email');

// ── Redis ─────────────────────────────────────────────────────────────────────
let redisClient;
async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({
      socket:   { host: process.env.REDIS_HOST || 'redis', port: parseInt(process.env.REDIS_PORT || '6379') },
      password: process.env.REDIS_PASSWORD || undefined,
    });
    await redisClient.connect();
  }
  return redisClient;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseUserAgent(ua = '') {
  if (/mobile/i.test(ua))  return 'mobile';
  if (/tablet/i.test(ua))  return 'tablet';
  return 'desktop';
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
const BF_THRESHOLDS = [
  { attempts: 4, lockSecs: 30 },
  { attempts: 5, lockSecs: 60 },
  { attempts: 6, lockSecs: 120 },
  { attempts: 7, lockSecs: 900 },  // 15 min cap
];
const BF_COUNTER_TTL = 3600; // reset counter after 1 h of no attempts

async function checkBruteForce(email, ip) {
  try {
    const redis = await getRedis();
    const key   = `bf:${email}:${ip}`;

    const lockKey = `bf:lock:${email}:${ip}`;
    const locked  = await redis.get(lockKey);
    if (locked) {
      const ttl = await redis.ttl(lockKey);
      return { locked: true, retryAfter: Math.max(ttl, 1) };
    }
    return { locked: false };
  } catch (_) {
    return { locked: false }; // fail-open: don't block on Redis error
  }
}

async function recordFailedAttempt(email, ip) {
  try {
    const redis   = await getRedis();
    const key     = `bf:${email}:${ip}`;
    const lockKey = `bf:lock:${email}:${ip}`;

    const attempts = await redis.incr(key);
    await redis.expire(key, BF_COUNTER_TTL);

    const rule = [...BF_THRESHOLDS].reverse().find(r => attempts >= r.attempts);
    if (rule) {
      await redis.setEx(lockKey, rule.lockSecs, '1');
    }
  } catch (_) {}
}

async function clearBruteForce(email, ip) {
  try {
    const redis = await getRedis();
    await redis.del(`bf:${email}:${ip}`);
    await redis.del(`bf:lock:${email}:${ip}`);
  } catch (_) {}
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

  // Check lockout via stored procedure (DB-level lockout as second layer)
  const [proc] = await db.callProc('sp_login_attempt', [email, ip]);
  const result  = proc?.[0];

  if (!result) return R.serverError(res, 'Login procedure failed');

  if (result.locked) {
    return R.tooMany(res, `Account locked. Try again after ${result.locked_until}`);
  }

  const user = await db.queryOne(
    `SELECT u.*, b.organization_id
     FROM users u
     JOIN branches b ON u.branch_id = b.id
     WHERE u.email = :email AND u.is_active = TRUE`,
    { email }
  );

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    // Record failed attempt for exponential backoff
    await recordFailedAttempt(email, ip);
    // Record failed attempt in login_history
    await db.query(
      `INSERT INTO login_history (user_id, ip_address, user_agent, success, failure_reason)
       VALUES (:userId, :ip, :ua, FALSE, 'invalid_credentials')`,
      { userId: user?.id || null, ip, ua }
    );
    return R.unauthorized(res, 'Invalid email or password');
  }

  // Get roles
  const roleRows = await db.query(
    `SELECT r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :userId AND ur.is_active = TRUE`,
    { userId: user.id }
  );
  const roles = roleRows.map((r) => r.name);

  const { accessToken, refreshToken, jti } = await buildTokenPair(user, roles);

  // Clear brute-force counter on success
  await clearBruteForce(email, ip);

  // Store session
  await db.query(
    `INSERT INTO sessions
       (user_id, session_token, jti, ip_address, user_agent, device_type, expires_at)
     VALUES (:userId, :token, :jti, :ip, :ua, :device, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
    {
      userId: user.id,
      token:  jwt.hashToken(refreshToken),
      jti,
      ip,
      ua,
      device: parseUserAgent(ua),
    }
  );

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
    sendNewDeviceLogin({
      to:        user.email,
      name:      `${user.first_name} ${user.last_name}`,
      ip,
      userAgent: ua,
      time:      new Date().toLocaleString('es-AR', { timeZone: process.env.TZ || 'America/Argentina/Buenos_Aires' }),
    }).catch(() => {});
  }

  return R.ok(res, {
    accessToken,
    refreshToken,
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    user: {
      id:       user.id,
      email:    user.email,
      name:     `${user.first_name} ${user.last_name}`,
      orgId:    user.organization_id,
      branchId: user.branch_id,
      roles,
    },
  });
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
  const { refreshToken } = req.body;
  if (!refreshToken) return R.badRequest(res, 'refreshToken required');

  let decoded;
  try {
    decoded = jwt.verifyRefresh(refreshToken);
  } catch (_) {
    return R.unauthorized(res, 'Invalid or expired refresh token');
  }

  const tokenHash = jwt.hashToken(refreshToken);
  const redis     = await getRedis();

  // ── Reuse detection ────────────────────────────────────────────────────────
  // If this hash was already rotated away, a stolen token is being replayed.
  const reusedSessionId = await redis.get(`rt:used:${tokenHash}`);
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
      await redis.setEx(`revoked:${stolenSession.jti}`, 15 * 60, '1');
    }
    await redis.del(`rt:used:${tokenHash}`);
    return R.unauthorized(res, 'Refresh token already used — possible token theft. All sessions revoked.');
  }

  // ── Normal lookup ──────────────────────────────────────────────────────────
  const session = await db.queryOne(
    `SELECT s.*, u.email, u.first_name, u.last_name, b.organization_id
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     JOIN branches b ON u.branch_id = b.id
     WHERE s.session_token = :hash AND s.is_revoked = FALSE AND s.expires_at > NOW()`,
    { hash: tokenHash }
  );
  if (!session) return R.unauthorized(res, 'Refresh token not found or expired');

  // Revoke old access JTI
  await redis.setEx(`revoked:${session.jti}`, 15 * 60, '1');

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
  await redis.setEx(`rt:used:${tokenHash}`, 10 * 60, String(session.id));

  return R.ok(res, { accessToken, refreshToken: newRefresh });
}

/**
 * POST /auth/logout
 */
async function logout(req, res) {
  const userId = req.user.userId;
  const jti    = req.user.jti;

  // Revoke current token
  const redis = await getRedis();
  await redis.setEx(`revoked:${jti}`, 15 * 60, '1');

  // Mark session as revoked
  await db.query(
    `UPDATE sessions SET is_revoked = TRUE, revoked_at = NOW()
     WHERE jti = :jti AND user_id = :userId`,
    { jti, userId }
  );

  return R.noContent(res);
}

/**
 * POST /auth/logout-all  — revoke all sessions
 */
async function logoutAll(req, res) {
  await db.callProc('sp_revoke_user_sessions', [req.user.userId]);
  return R.noContent(res);
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

  return R.ok(res, { ...user, roles });
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
    sendPwResetEmail({ to: userRecord.email, token, expiresInMinutes: 60 }).catch(() => {});
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
    `SELECT prt.*, u.id AS user_id
     FROM password_reset_tokens prt
     JOIN users u ON prt.user_id = u.id
     WHERE prt.token_hash = :hash
       AND prt.expires_at > NOW()
       AND prt.used_at IS NULL`,
    { hash }
  );

  if (!record) return R.badRequest(res, 'Invalid or expired reset token');

  const passwordHash = await bcrypt.hash(newPassword, 12);

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
    `SELECT id, password_hash FROM users WHERE id = :id`,
    { id: req.user.userId }
  );

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    return R.badRequest(res, 'Current password is incorrect');
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db.query(
    `UPDATE users SET password_hash = :hash, updated_at = NOW() WHERE id = :id`,
    { hash, id: req.user.userId }
  );

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

  const redis = await getRedis();
  await redis.setEx(`revoked:${session.jti}`, 15 * 60, '1');
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
  const rows = await db.query(
    `SELECT id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at
     FROM api_keys WHERE user_id = :uid ORDER BY created_at DESC`,
    { uid: req.user.userId }
  );
  return R.ok(res, rows);
}

/**
 * POST /auth/api-keys
 */
async function createApiKey(req, res) {
  const { name, scopes = [], expiresAt } = req.body;
  const rawKey   = jwt.generateOpaqueToken();
  const keyHash  = jwt.hashToken(rawKey);
  const prefix   = rawKey.slice(0, 16);  // 16 chars = 64-bit entropy prefix

  await db.query(
    `INSERT INTO api_keys (user_id, branch_id, name, key_hash, key_prefix, scopes, expires_at)
     VALUES (:userId, :branchId, :name, :hash, :prefix, :scopes, :expires)`,
    {
      userId:   req.user.userId,
      branchId: req.user.branchId,
      name,
      hash:     keyHash,
      prefix,
      scopes:   JSON.stringify(scopes),
      expires:  expiresAt || null,
    }
  );

  // Only return raw key once
  return R.created(res, { prefix, rawKey, message: 'Store this key securely — it will not be shown again.' });
}

/**
 * DELETE /auth/api-keys/:id
 */
async function deleteApiKey(req, res) {
  const { id } = req.params;
  await db.query(
    `UPDATE api_keys SET is_active = FALSE WHERE id = :id AND user_id = :uid`,
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

  const hash = jwt.hashToken(apiKey);
  const key = await db.queryOne(
    `SELECT ak.*, u.email, b.organization_id
     FROM api_keys ak
     JOIN users u ON ak.user_id = u.id
     JOIN branches b ON ak.branch_id = b.id
     WHERE ak.key_hash = :hash
       AND ak.is_active = TRUE
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
  await db.query(
    `UPDATE users SET two_factor_secret = :secret WHERE id = :id`,
    { secret, id: user.id }
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

  const valid = twoFactor.verifyTwoFactor(user.two_factor_secret, token);
  if (!valid) return R.badRequest(res, 'Invalid or expired TOTP token');

  const recoveryCodes = twoFactor.generateRecoveryCodes(8);
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
  send2faEnabled({ to: user.email, name: user.email }).catch(() => {});

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

  const valid = twoFactor.verifyTwoFactor(user.two_factor_secret, token);
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
 */
async function challenge2fa(req, res) {
  const { userId, token } = req.body;
  if (!userId || !token) return R.badRequest(res, 'userId and token required');

  const user = await db.queryOne(
    `SELECT id, email, two_factor_secret, two_factor_enabled, branch_id
     FROM users WHERE id = :id AND is_active = TRUE`,
    { id: userId }
  );
  if (!user || !user.two_factor_enabled) return R.badRequest(res, 'Invalid 2FA challenge');

  const valid = twoFactor.verifyTwoFactor(user.two_factor_secret, token);
  if (!valid) return R.unauthorized(res, 'Invalid TOTP token');

  // Build full token pair after successful 2FA
  const orgRow = await db.queryOne(
    `SELECT organization_id FROM branches WHERE id = :id`, { id: user.branch_id }
  );
  const roles = await db.query(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = :uid AND ur.is_active = TRUE`, { uid: user.id }
  );
  const { accessToken, refreshToken } = await buildTokenPair(
    { ...user, organization_id: orgRow?.organization_id },
    roles.map(r => r.name)
  );

  return R.ok(res, { accessToken, refreshToken });
}

module.exports = {
  login, refresh, logout, logoutAll, me,
  requestPasswordReset, confirmPasswordReset, changePassword,
  listSessions, revokeSession,
  listApiKeys, createApiKey, deleteApiKey,
  validateApiKey,
  setup2fa, verify2fa, disable2fa, challenge2fa,
  // Exported for unit testing only
  _checkBruteForce: checkBruteForce,
  _recordFailedAttempt: recordFailedAttempt,
  _clearBruteForce: clearBruteForce,
};
