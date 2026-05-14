'use strict';

const { Router } = require('express');
const { db, R } = require('./_common');

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM tele_platforms WHERE is_active = TRUE ORDER BY name`);
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

module.exports = router;
