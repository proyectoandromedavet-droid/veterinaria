'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const {
  db,
  R,
  log,
  sendWelcome,
  sendNewDeviceLogin,
  sendPasswordReset,
  authLimiter,
  validate,
  buildOwnerToken,
  buildOwnerRefresh,
  publishPortalEvent,
  PASSWORD_POLICY,
  vBody,
} = require('../portal.common');

const router = Router();

router.post('/register',
  authLimiter,
  vBody('email').isEmail().normalizeEmail(),
  vBody('password').isLength({ min: 10 }).matches(PASSWORD_POLICY),
  vBody('firstName').notEmpty(),
  vBody('lastName').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { email, password, firstName, lastName, phone } = req.body;
      const orgId = req.headers['x-org-id'] || null;

      const existing = await db.queryOne(
        `SELECT id FROM clients WHERE email=:email AND portal_password_hash IS NOT NULL`,
        { email }
      );
      if (existing) return R.conflict(res, 'Ya existe una cuenta con ese email');

      const hash = await bcrypt.hash(password, 12);
      const client = await db.queryOne(
        `SELECT c.id, COALESCE(c.organization_id, b.organization_id) AS organization_id
         FROM clients c
         LEFT JOIN branches b ON c.branch_id = b.id
         WHERE c.email=:email
         LIMIT 1`,
        { email }
      );

      if (client) {
        await db.query(
          `UPDATE clients SET portal_password_hash=:hash, updated_at=NOW() WHERE id=:id`,
          { hash, id: client.id }
        );
        const accessToken = buildOwnerToken({ ...client, email });
        const refreshToken = buildOwnerRefresh(client);
        sendWelcome({ to: email, name: firstName, orgName: 'VetManager Pro' }).catch((err) => log.warn('welcome email failed', { err: err.message }));
        publishPortalEvent('portal.owner.registered', { clientId: client.id, email, orgId: client.organization_id || orgId || null }, req);
        return R.created(res, { accessToken, refreshToken });
      }

      if (!orgId) return R.badRequest(res, 'Se requiere x-org-id para registrar una cuenta portal');
      const branch = await db.queryOne(
        `SELECT id
         FROM branches
         WHERE organization_id = :orgId
         ORDER BY id
         LIMIT 1`,
        { orgId }
      );
      if (!branch) return R.notFound(res, 'No hay sucursales disponibles para la organizacion');

      const r = await db.query(
        `INSERT INTO clients (branch_id, first_name, last_name, email, phone, portal_password_hash, organization_id)
         VALUES (:branchId, :fn, :ln, :email, :phone, :hash, :orgId)`,
        { branchId: branch.id, fn: firstName, ln: lastName, email, phone: phone || null, hash, orgId }
      );
      const accessToken = buildOwnerToken({ id: r.insertId, organization_id: orgId, email });
      const refreshToken = buildOwnerRefresh({ id: r.insertId });
      sendWelcome({ to: email, name: firstName, orgName: 'VetManager Pro' }).catch((err) => log.warn('welcome email failed', { err: err.message }));
      publishPortalEvent('portal.owner.registered', { clientId: r.insertId, email, orgId }, req);
      return R.created(res, { accessToken, refreshToken });
    } catch (e) { next(e); }
  }
);

router.post('/login',
  authLimiter,
  vBody('email').isEmail().normalizeEmail(),
  vBody('password').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const client = await db.queryOne(
        `SELECT c.id, c.first_name, c.last_name, c.email, c.portal_password_hash,
                COALESCE(c.organization_id, b.organization_id) AS organization_id,
                c.is_active
         FROM clients c
         LEFT JOIN branches b ON c.branch_id = b.id
         WHERE c.email=:email`,
        { email }
      );
      if (!client || !client.portal_password_hash) return R.unauthorized(res, 'Email o contrasena incorrectos');
      if (!client.is_active) return R.forbidden(res, 'Cuenta desactivada');

      const ok = await bcrypt.compare(password, client.portal_password_hash);
      if (!ok) return R.unauthorized(res, 'Email o contrasena incorrectos');

      const accessToken = buildOwnerToken(client);
      const refreshToken = buildOwnerRefresh(client);

      const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
      const ua = req.headers['user-agent'] || 'desconocido';
      const seenBefore = await db.queryOne(
        `SELECT 1 FROM login_history
         WHERE user_id = :id AND ip_address = :ip AND success = TRUE
           AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT 1`,
        { id: client.id, ip }
      ).catch((err) => {
        log.warn('login history lookup failed', { err: err.message });
        return true;
      });

      if (!seenBefore) {
        sendNewDeviceLogin({
          to: client.email,
          name: client.first_name,
          ip,
          userAgent: ua,
          time: new Date().toLocaleString('es-AR', { timeZone: process.env.TZ || 'America/Argentina/Buenos_Aires' }),
        }).catch((err) => log.warn('new device email failed', { err: err.message }));
      }

      db.query(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success)
         VALUES (:id, :ip, :ua, TRUE)`,
        { id: client.id, ip, ua }
      ).catch((err) => log.warn('login history insert failed', { err: err.message }));

      publishPortalEvent('portal.owner.logged_in', { clientId: client.id, email: client.email, orgId: client.organization_id || null, ip }, req, { ip });
      return R.ok(res, { accessToken, refreshToken, owner: { id: client.id, name: `${client.first_name} ${client.last_name}`, email: client.email } });
    } catch (e) { next(e); }
  }
);

router.post('/refresh',
  vBody('refreshToken').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const decoded = require('../portal.common').jwt.verifyRefresh(req.body.refreshToken);
      if (decoded.role !== 'owner') return R.unauthorized(res, 'Token invalido');

      const client = await db.queryOne(
        `SELECT c.id, c.email, COALESCE(c.organization_id, b.organization_id) AS organization_id
         FROM clients c
         LEFT JOIN branches b ON c.branch_id = b.id
         WHERE c.id=:id AND c.is_active=1`,
        { id: decoded.clientId }
      );
      if (!client) return R.unauthorized(res, 'Cuenta no encontrada');

      return R.ok(res, { accessToken: buildOwnerToken(client), refreshToken: buildOwnerRefresh(client) });
    } catch (err) {
      log.warn('portal refresh failed', { err: err.message });
      return R.unauthorized(res, 'Token invalido o expirado');
    }
  }
);

router.post('/forgot-password',
  vBody('email').isEmail().normalizeEmail(),
  validate,
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const client = await db.queryOne(`SELECT id FROM clients WHERE email=:email`, { email });

      if (client) {
        const token = require('../portal.common').jwt.generateOpaqueToken();
        const hash = require('../portal.common').jwt.hashToken(token);
        await db.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES (:id, :hash, DATE_ADD(NOW(), INTERVAL 1 HOUR))
           ON DUPLICATE KEY UPDATE token_hash=:hash, expires_at=DATE_ADD(NOW(), INTERVAL 1 HOUR), used_at=NULL`,
          { id: client.id, hash }
        );
        sendPasswordReset({ to: email, token, expiresInMinutes: 60 }).catch((err) => log.warn('password reset email failed', { err: err.message }));
      }

      return R.ok(res, { message: 'Si ese email existe, recibira un enlace de recuperacion.' });
    } catch (e) { next(e); }
  }
);

module.exports = router;
