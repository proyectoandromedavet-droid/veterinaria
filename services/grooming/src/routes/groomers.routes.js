'use strict';

const { Router } = require('express');
const { db, R, logGroomingError } = require('../grooming.common');

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(`SELECT g.id, g.commission_type, g.commission_value, g.specializations, g.is_active, CONCAT(u.first_name,' ',u.last_name) AS name, u.email, u.phone
                                 FROM groomers g JOIN users u ON g.user_id = u.id
                                 WHERE g.branch_id = :bid AND g.is_active = TRUE ORDER BY u.first_name`, { bid: req.user.branchId });
    return R.ok(res, rows);
  } catch (e) {
    logGroomingError('GET /grooming/groomers', e, { branchId: req.user?.branchId });
    next(e);
  }
});

router.get('/performance', async (req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM v_groomer_performance WHERE branch_id = :bid ORDER BY total_revenue DESC`, { bid: req.user.branchId });
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

router.get('/:id/commissions', async (req, res, next) => {
  try {
    const { from, to, paid } = req.query;
    const conds = ['gcr.groomer_id = :gid'];
    const p = { gid: req.params.id };
    if (from) { conds.push('gcr.earned_at >= :from'); p.from = from; }
    if (to) { conds.push('gcr.earned_at <= :to'); p.to = to; }
    if (paid !== undefined) { conds.push('gcr.is_paid = :paid'); p.paid = paid === 'true' ? 1 : 0; }
    const rows = await db.query(
      `SELECT gcr.*, ga.scheduled_at, p.name AS patient_name
       FROM groomer_commission_records gcr
       JOIN grooming_appointments ga ON gcr.grooming_appointment_id = ga.id
       JOIN patients p ON ga.patient_id = p.id
       WHERE ${conds.join(' AND ')}
       ORDER BY gcr.earned_at DESC`,
      p
    );
    const [{ total_pending }] = await db.query(`SELECT COALESCE(SUM(commission_amount),0) AS total_pending FROM groomer_commission_records WHERE groomer_id=:gid AND is_paid=FALSE`, { gid: req.params.id });
    return R.ok(res, { records: rows, totalPending: total_pending });
  } catch (e) { next(e); }
});

module.exports = router;
