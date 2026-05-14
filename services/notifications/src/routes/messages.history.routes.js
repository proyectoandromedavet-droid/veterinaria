'use strict';

const express = require('express');
const {
  R,
  db,
  log,
  requireUserContext,
} = require('../notifications.common');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (!requireUserContext(req, res)) return;
    const { channel, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds = ['branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(limit, 10), offset: parseInt(offset, 10) };
    if (channel) {
      conds.push('channel = :channel');
      p.channel = channel;
    }

    const rows = await db.query(
      `SELECT id, channel, to_number, template_name, message_preview,
              status, twilio_sid, error_message, sent_at
       FROM message_logs
       WHERE ${conds.join(' AND ')}
       ORDER BY sent_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (err) {
    log.warn('message history failed', { err: err.message });
    next(err);
  }
});

module.exports = router;
