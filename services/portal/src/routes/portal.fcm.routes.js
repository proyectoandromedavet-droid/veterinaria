'use strict';

const { Router } = require('express');
const { db, R, portalAuth, fcm, publishPortalEvent, vBody, validate } = require('../portal.common');

const router = Router();

router.post('/register',
  portalAuth,
  vBody('token').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { token, platform = 'web', deviceName } = req.body;
      await db.query(
        `INSERT INTO user_fcm_tokens (user_id, org_id, token, platform, device_name, is_active, last_used_at)
         VALUES (:uid, :oid, :token, :platform, :device, 1, NOW())
         ON DUPLICATE KEY UPDATE user_id=:uid, is_active=1, last_used_at=NOW()`,
        { uid: req.owner.clientId, oid: req.owner.orgId || 0, token, platform, device: deviceName || null }
      );

      await fcm.subscribeToTopic([token], `owner_${req.owner.clientId}`).catch((err) => {
        console.warn('[portal] fcm subscribe failed', err.message);
      });
      publishPortalEvent('portal.owner.fcm_registered', {
        clientId: req.owner.clientId,
        orgId: req.owner.orgId || null,
        platform,
        deviceName: deviceName || null,
      }, req);
      return R.ok(res, { message: 'Token FCM registrado' });
    } catch (e) { next(e); }
  }
);

module.exports = router;
