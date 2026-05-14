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
    const { channel = 'whatsapp', to, template, vars = {} } = req.body;
    if (!to || !template) return R.badRequest(res, 'to y template son requeridos');

    let result;
    try {
      result = await messaging.sendTemplate(channel, to, template, vars);
    } catch (err) {
      await queueNotificationRetry({ channel: 'template', payload: { channel, to, template, vars }, req });
      return res.status(202).json({ success: true, queued: true, message: 'Template queued for retry', error: err.message });
    }
    await logMessage({ channel, to, message: result.body, result: result.results, userId: req.user.userId, branchId: req.user.branchId, template });
    return R.ok(res, result);
  } catch (err) {
    log.warn('template send failed', { err: err.message });
    next(err);
  }
});

module.exports = router;
