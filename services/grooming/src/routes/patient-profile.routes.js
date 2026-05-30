'use strict';

const { Router } = require('express');
const { body } = require('express-validator');
const { db, R, validate } = require('../grooming.common');

const router = Router();

router.get('/:patientId', async (req, res, next) => {
  try {
    const profile = await db.queryOne(`SELECT * FROM patient_grooming_profile WHERE patient_id = :pid`, { pid: req.params.patientId });
    return R.ok(res, profile);
  } catch (e) { next(e); }
});

router.post('/:patientId', body('preferredGroomingStyle').optional(), validate, async (req, res, next) => {
  try {
    const { preferredGroomingStyle, coatType, regularGroomingFrequency, behaviorWithGrooming, muzzleRequired, sedationHistory, preferredProducts, allergicToProducts, knownIssues, notes } = req.body;
    await db.query(
      `INSERT INTO patient_grooming_profile
         (patient_id, preferred_grooming_style, coat_type, regular_grooming_frequency,
          behavior_with_grooming, muzzle_required, sedation_history,
          preferred_products, allergic_to_products, known_issues, notes)
       VALUES (:pid,:style,:coat,:freq,:beh,:muzzle,:sed,:prods,:allerg,:issues,:notes)
       ON DUPLICATE KEY UPDATE preferred_grooming_style=VALUES(preferred_grooming_style), coat_type=VALUES(coat_type), regular_grooming_frequency=VALUES(regular_grooming_frequency), behavior_with_grooming=VALUES(behavior_with_grooming), muzzle_required=VALUES(muzzle_required), sedation_history=VALUES(sedation_history), preferred_products=VALUES(preferred_products), allergic_to_products=VALUES(allergic_to_products), known_issues=VALUES(known_issues), notes=VALUES(notes), updated_at=NOW()`,
      {
        pid: req.params.patientId, style: preferredGroomingStyle || null, coat: coatType || null, freq: regularGroomingFrequency || null,
        beh: behaviorWithGrooming || null, muzzle: muzzleRequired ? 1 : 0, sed: sedationHistory ? JSON.stringify(sedationHistory) : null,
        prods: preferredProducts || null, allerg: allergicToProducts || null, issues: knownIssues || null, notes: notes || null,
      }
    );
    return R.created(res);
  } catch (e) { next(e); }
});

module.exports = router;
