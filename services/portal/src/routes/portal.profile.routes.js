'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { db, R, portalAuth, validate, vBody, PASSWORD_POLICY, log } = require('../portal.common');

const router = Router();

router.get('/', portalAuth, async (req, res, next) => {
  try {
    const client = await db.queryOne(
      `SELECT id, first_name, last_name, email, phone, address, city,
              document_type, document_number, created_at
       FROM clients WHERE id=:id`,
      { id: req.owner.clientId }
    );
    if (!client) return R.notFound(res, 'Cuenta no encontrada');
    return R.ok(res, client);
  } catch (e) { next(e); }
});

router.put('/',
  portalAuth,
  vBody('firstName').optional().notEmpty(),
  vBody('lastName').optional().notEmpty(),
  vBody('phone').optional(),
  validate,
  async (req, res, next) => {
    try {
      const { firstName, lastName, phone, address, city } = req.body;
      await db.query(
        `UPDATE clients SET
           first_name=COALESCE(:fn, first_name),
           last_name=COALESCE(:ln, last_name),
           phone=COALESCE(:phone, phone),
           address=COALESCE(:addr, address),
           city=COALESCE(:city, city),
           updated_at=NOW()
         WHERE id=:id`,
        { fn: firstName || null, ln: lastName || null, phone: phone || null, addr: address || null, city: city || null, id: req.owner.clientId }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

router.put('/password',
  portalAuth,
  vBody('currentPassword').notEmpty(),
  vBody('newPassword').isLength({ min: 10 }).matches(PASSWORD_POLICY),
  validate,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const client = await db.queryOne(`SELECT portal_password_hash FROM clients WHERE id=:id`, { id: req.owner.clientId });
      if (!await bcrypt.compare(currentPassword, client.portal_password_hash)) {
        return R.badRequest(res, 'Contrasena actual incorrecta');
      }

      await db.query(
        `UPDATE clients SET portal_password_hash=:hash, updated_at=NOW() WHERE id=:id`,
        { hash: await bcrypt.hash(newPassword, 12), id: req.owner.clientId }
      );
      return R.ok(res, { message: 'Contrasena actualizada' });
    } catch (e) {
      log.warn('portal password update failed', { err: e.message });
      next(e);
    }
  }
);

module.exports = router;
