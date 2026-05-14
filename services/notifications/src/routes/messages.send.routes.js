'use strict';

const express = require('express');
const {
  R,
  log,
  messaging,
  queueNotificationRetry,
  logMessage,
} = require('../notifications.common');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { channel = 'whatsapp', to, message } = req.body;
    if (!to || !message) return R.badRequest(res, 'to y message son requeridos');
    if (!['sms', 'whatsapp', 'both'].includes(channel)) return R.badRequest(res, 'channel debe ser sms, whatsapp o both');

    let result;
    try {
      if (channel === 'sms') result = await messaging.sendSms(to, message);
      if (channel === 'whatsapp') result = await messaging.sendWhatsApp(to, message);
      if (channel === 'both') {
        const [sms, wa] = await Promise.allSettled([
          messaging.sendSms(to, message),
          messaging.sendWhatsApp(to, message),
        ]);
        result = { sms: sms.value || sms.reason?.message, whatsapp: wa.value || wa.reason?.message };
        if (sms.status === 'rejected') await queueNotificationRetry({ channel: 'sms', payload: { to, message }, req });
        if (wa.status === 'rejected') await queueNotificationRetry({ channel: 'whatsapp', payload: { to, message }, req });
      }
    } catch (err) {
      await queueNotificationRetry({ channel, payload: { to, message }, req });
      return res.status(202).json({ success: true, queued: true, message: 'Notification queued for retry', error: err.message });
    }

    await logMessage({ channel, to, message, result, userId: req.user.userId, branchId: req.user.branchId });
    return R.ok(res, result);
  } catch (err) {
    log.warn('message send failed', { err: err.message });
    next(err);
  }
});

module.exports = router;
