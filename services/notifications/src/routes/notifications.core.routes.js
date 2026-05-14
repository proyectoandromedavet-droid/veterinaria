'use strict';

const express = require('express');
const {
  R,
  db,
  log,
  notify,
  eventBus,
  requireUserContext,
  parsePageLimit,
  getNotificationSchema,
  notificationExpr,
  notificationReadAtExpr,
  notificationUnreadPredicate,
  notificationMarkReadSet,
  notificationOrderExpr,
  buildNotificationInsert,
} = require('../notifications.common');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (!requireUserContext(req, res)) return;
    const { unreadOnly = 'false' } = req.query;
    const { limit, offset } = parsePageLimit(req.query);
    const schema = await getNotificationSchema();
    const cols = schema.notification_logs || new Set();
    const where = unreadOnly === 'true' ? `AND ${notificationUnreadPredicate(cols)}` : '';

    const rows = await db.query(
      `SELECT nl.id,
              ${notificationExpr(cols, 'nl', 'type', `'info'`)} AS notification_type,
              ${notificationExpr(cols, 'nl', 'title', `''`)} AS title,
              ${notificationExpr(cols, 'nl', 'message', `''`)} AS message,
              ${notificationExpr(cols, 'nl', 'severity', `'info'`)} AS severity,
              ${notificationExpr(cols, 'nl', 'sentAt', 'NOW()')} AS sent_at,
              ${notificationReadAtExpr(cols, 'nl')} AS read_at,
              ${notificationExpr(cols, 'nl', 'actionUrl', 'NULL')} AS action_url,
              ${notificationExpr(cols, 'nl', 'relatedEntityType', 'NULL')} AS related_entity_type,
              ${notificationExpr(cols, 'nl', 'relatedEntityId', 'NULL')} AS related_entity_id
       FROM notification_logs nl
       WHERE nl.user_id = :uid ${where}
       ORDER BY ${notificationOrderExpr(cols, 'nl')} DESC
       LIMIT :limit OFFSET :offset`,
      { uid: req.user.userId, limit, offset }
    );
    const unreadRows = await db.query(
      `SELECT COUNT(*) AS unread
       FROM notification_logs nl
       WHERE nl.user_id = :uid AND ${notificationUnreadPredicate(cols)}`,
      { uid: req.user.userId }
    );
    const unread = unreadRows[0]?.unread || 0;
    return R.ok(res, rows, { unreadCount: unread });
  } catch (err) {
    log.warn('notifications list failed', { err: err.message, traceId: req.headers['x-trace-id'] });
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    if (!requireUserContext(req, res)) return;
    const schema = await getNotificationSchema();
    const cols = schema.notification_logs || new Set();
    const setClause = notificationMarkReadSet(cols);
    if (!setClause) return R.noContent(res);

    await db.query(
      `UPDATE notification_logs SET ${setClause} WHERE id = :id AND user_id = :uid`,
      { id: req.params.id, uid: req.user.userId }
    );
    return R.noContent(res);
  } catch (err) {
    log.warn('mark notification read failed', { err: err.message, id: req.params.id });
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    if (!requireUserContext(req, res)) return;
    const schema = await getNotificationSchema();
    const cols = schema.notification_logs || new Set();
    const setClause = notificationMarkReadSet(cols);
    if (!setClause) return R.noContent(res);

    await db.query(
      `UPDATE notification_logs SET ${setClause}
       WHERE user_id = :uid AND ${notificationUnreadPredicate(cols)}`,
      { uid: req.user.userId }
    );
    return R.noContent(res);
  } catch (err) {
    log.warn('mark all notifications read failed', { err: err.message });
    next(err);
  }
});

router.post('/push', async (req, res, next) => {
  try {
    const {
      targetUserIds,
      targetRoles,
      branchId,
      orgId,
      type,
      title,
      message,
      severity = 'info',
      relatedEntityType,
      relatedEntityId,
      actionUrl,
    } = req.body;
    const schema = await getNotificationSchema();
    const cols = schema.notification_logs || new Set();

    if (targetUserIds?.length) {
      for (const uid of targetUserIds) {
        const insert = buildNotificationInsert(cols, {
          userId: uid,
          branchId: branchId || req.user.branchId || null,
          orgId: orgId || req.user.orgId || null,
          type,
          title,
          message,
          severity,
          relatedEntityType: relatedEntityType || null,
          relatedEntityId: relatedEntityId || null,
          actionUrl: actionUrl || null,
        });
        if (insert.columns.length) {
          await db.query(
            `INSERT INTO notification_logs (${insert.columns.join(', ')})
             VALUES (${insert.values.join(', ')})`,
            insert.params
          );
        }
      }
    }

    try {
      await notify.toScoped(
        { targetUserIds, targetRoles, orgId, branchId },
        type,
        { title, message, severity, actionUrl },
        { severity, actionUrl }
      );
    } catch (err) {
      log.warn('notification publish degraded', { err: err.message, type });
    }

    eventBus.publish('notifications.push', {
      type,
      targetUserIds,
      targetRoles,
      orgId,
      branchId,
      title,
      message,
      severity,
      actionUrl,
    }).catch((err) => log.warn('notification event publish failed', { err: err.message }));

    return R.created(res, { delivered: targetUserIds?.length || 0 });
  } catch (err) {
    log.warn('notification push failed', { err: err.message });
    next(err);
  }
});

router.get('/retries', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, channel, status, attempt_count, max_attempts, next_attempt_at, last_error, created_at
       FROM notification_retry_jobs
       WHERE (:orgId IS NULL OR org_id = :orgId)
       ORDER BY created_at DESC
       LIMIT 100`,
      { orgId: req.user?.orgId || null }
    );
    return R.ok(res, rows);
  } catch (err) {
    log.warn('retry list failed', { err: err.message });
    next(err);
  }
});

module.exports = router;
