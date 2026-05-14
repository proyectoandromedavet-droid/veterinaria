'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate, logGroomingError } = require('../grooming.common');

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await db.query(`SELECT * FROM grooming_service_types WHERE is_active = TRUE ORDER BY name`);
    return R.ok(res, rows);
  } catch (e) {
    logGroomingError('GET /grooming/service-types', e);
    next(e);
  }
});

router.post('/', body('name').notEmpty(), validate, async (req, res, next) => {
  try {
    const { name, description, basePriceSmall, basePriceMedium, basePriceLarge, durationMinSmall, durationMinMedium, durationMinLarge } = req.body;
    const [r] = await db.query(
      `INSERT INTO grooming_service_types
         (name, description, base_price_small, base_price_medium, base_price_large, duration_min_small, duration_min_medium, duration_min_large)
       VALUES (:name,:desc,:ps,:pm,:pl,:ds,:dm,:dl)`,
      {
        name, desc: description || null, ps: basePriceSmall || null, pm: basePriceMedium || null, pl: basePriceLarge || null,
        ds: durationMinSmall || null, dm: durationMinMedium || null, dl: durationMinLarge || null,
      }
    );
    return R.created(res, { id: r.insertId });
  } catch (e) { next(e); }
});

module.exports = router;
