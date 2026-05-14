'use strict';

const { Router } = require('express');
const { db, R, portalAuth } = require('../portal.common');

const router = Router();

router.get('/', portalAuth, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT ts.id, COALESCE(ts.scheduled_at, ts.session_date) AS session_date,
              ts.status, ts.session_type, ts.chief_complaint,
              ts.meeting_url, ts.duration_minutes,
              COALESCE(tr.overall_score, ts.rating) AS rating,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM tele_sessions ts
       JOIN patients p     ON ts.patient_id=p.id
       JOIN species sp     ON p.species_id=sp.id
       JOIN users u        ON COALESCE(ts.vet_id, ts.veterinarian_id)=u.id
       JOIN patient_owners po ON po.patient_id=p.id AND po.client_id=:cid
       LEFT JOIN tele_ratings tr ON tr.session_id = ts.id
       ORDER BY ts.session_date DESC`,
      { cid: req.owner.clientId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
