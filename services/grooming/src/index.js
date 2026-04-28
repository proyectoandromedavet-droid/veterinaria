'use strict';

require('dotenv').config();

const { Router }  = require('express');
const { body, validationResult } = require('express-validator');
const { buildApp, guardWrite, startService } = require('../../../shared/serviceBase');
const db = require('../../../shared/db');
const R  = require('../../../shared/response');

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
};

function logGroomingError(route, err, meta = {}) {
  console.error(`[grooming][${route}]`, {
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    sqlState: err?.sqlState,
    sqlMessage: err?.sqlMessage,
    sql: err?.sql,
    stack: err?.stack,
    ...meta,
  });
}

// ── Appointments ──────────────────────────────────────────────────────────────
const apptRouter = Router();

apptRouter.get('/', async (req, res, next) => {
  try {
    const { date, groomerId, status, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['ga.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
    if (date)      { conds.push('DATE(ga.scheduled_at) = :date');  p.date = date; }
    if (groomerId) { conds.push('ga.groomer_id = :gid');           p.gid  = groomerId; }
    if (status)    { conds.push('ga.status = :status');            p.status = status; }

    const rows = await db.query(
      `SELECT ga.id, ga.scheduled_at, ga.estimated_duration_minutes, ga.status,
              ga.estimated_price, ga.final_price, ga.pickup_required, ga.pickup_address,
              p.name AS patient_name, sp.common_name AS species, p.photo_url,
              b.name AS breed, p.sex,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.phone,
              CONCAT(u.first_name,' ',u.last_name) AS groomer_name,
              GROUP_CONCAT(gst.name SEPARATOR ', ') AS services
       FROM grooming_appointments ga
       JOIN patients p     ON ga.patient_id  = p.id
       JOIN species  sp    ON p.species_id   = sp.id
       JOIN clients  cl    ON ga.client_id   = cl.id
       JOIN groomers g     ON ga.groomer_id  = g.id
       JOIN users    u     ON g.user_id      = u.id
       LEFT JOIN breeds    b  ON p.breed_id  = b.id
       LEFT JOIN grooming_appointment_services gas ON gas.grooming_appointment_id = ga.id
       LEFT JOIN grooming_service_types gst ON gas.service_type_id = gst.id
       WHERE ${conds.join(' AND ')}
       GROUP BY ga.id
       ORDER BY ga.scheduled_at ASC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

apptRouter.get('/today', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_grooming_today WHERE branch_id = :bid ORDER BY scheduled_at`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

apptRouter.get('/:id', async (req, res, next) => {
  try {
    const appt = await db.queryOne(
      `SELECT ga.*,
              p.name AS patient_name, p.sex, p.photo_url,
              sp.common_name AS species, b.name AS breed,
              CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
              cl.phone AS client_phone, cl.email AS client_email,
              CONCAT(u.first_name,' ',u.last_name) AS groomer_name,
              g.id AS groomer_id
       FROM grooming_appointments ga
       JOIN patients p  ON ga.patient_id = p.id
       JOIN species  sp ON p.species_id  = sp.id
       JOIN clients  cl ON ga.client_id  = cl.id
       JOIN groomers g  ON ga.groomer_id = g.id
       JOIN users    u  ON g.user_id     = u.id
       LEFT JOIN breeds b ON p.breed_id  = b.id
       WHERE ga.id = :id AND ga.branch_id = :bid`,
      { id: req.params.id, bid: req.user.branchId }
    );
    if (!appt) return R.notFound(res);

    const [services, profile, record] = await Promise.all([
      db.query(
        `SELECT gst.id, gst.name, gst.base_price_small, gas.price_charged, gas.notes
         FROM grooming_appointment_services gas
         JOIN grooming_service_types gst ON gas.service_type_id = gst.id
         WHERE gas.grooming_appointment_id = :id`,
        { id: req.params.id }
      ),
      db.queryOne(
        `SELECT * FROM patient_grooming_profile WHERE patient_id = :pid`,
        { pid: appt.patient_id }
      ),
      db.queryOne(
        `SELECT * FROM grooming_records WHERE grooming_appointment_id = :id`,
        { id: req.params.id }
      ),
    ]);

    return R.ok(res, { ...appt, services, groomingProfile: profile, record });
  } catch (e) { next(e); }
});

apptRouter.post('/',
  body('patientId').isInt(),
  body('clientId').isInt(),
  body('groomerId').isInt(),
  body('scheduledAt').isISO8601(),
  body('services').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const {
        patientId, clientId, groomerId, scheduledAt, services,
        estimatedDurationMinutes = 90, pickupRequired, pickupAddress,
        deliveryRequired, deliveryAddress, notes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO grooming_appointments
           (branch_id, patient_id, client_id, groomer_id, scheduled_at,
            estimated_duration_minutes, pickup_required, pickup_address,
            delivery_required, delivery_address, notes, status)
         VALUES (:bid,:pid,:cid,:gid,:sched,:dur,:pickup,:paddr,:del,:daddr,:notes,'scheduled')`,
        {
          bid: req.user.branchId, pid: patientId, cid: clientId, gid: groomerId,
          sched: scheduledAt, dur: estimatedDurationMinutes,
          pickup: pickupRequired ? 1 : 0, paddr: pickupAddress || null,
          del: deliveryRequired ? 1 : 0, daddr: deliveryAddress || null,
          notes: notes || null,
        }
      );
      const apptId = r.insertId;

      let totalEstimate = 0;
      for (const svc of services) {
        const serviceType = await db.queryOne(
          `SELECT * FROM grooming_service_types WHERE id = :id`, { id: svc.serviceTypeId }
        );
        const price = svc.priceCharged ?? serviceType?.base_price_medium ?? 0;
        totalEstimate += parseFloat(price);

        await db.query(
          `INSERT INTO grooming_appointment_services
             (grooming_appointment_id, service_type_id, price_charged, notes)
           VALUES (?,?,?,?)`,
          [apptId, svc.serviceTypeId, price, svc.notes || null]
        );
      }

      await db.query(
        `UPDATE grooming_appointments SET estimated_price = ? WHERE id = ?`,
        [totalEstimate, apptId]
      );

      return R.created(res, { id: apptId, estimatedPrice: totalEstimate });
    } catch (e) { next(e); }
  }
);

apptRouter.patch('/:id/status',
  body('status').isIn(['scheduled','confirmed','in_progress','ready','completed','cancelled','no_show']),
  validate,
  async (req, res, next) => {
    try {
      await db.query(
        `UPDATE grooming_appointments SET status=:status, updated_at=NOW()
         WHERE id=:id AND branch_id=:bid`,
        { status: req.body.status, id: req.params.id, bid: req.user.branchId }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// POST /grooming/appointments/:id/record  (what was actually done)
apptRouter.post('/:id/record',
  body('servicesPerformed').isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const {
        servicesPerformed, productsUsed, beforePhotoUrl, afterPhotoUrl,
        behaviorObservations, coatCondition, skinCondition,
        vetReferralRequired, vetReferralReason,
        finalPrice, groomingNotes,
      } = req.body;

      const [r] = await db.query(
        `INSERT INTO grooming_records
           (grooming_appointment_id, services_performed, products_used,
            before_photo_url, after_photo_url,
            behavior_observations, coat_condition, skin_condition,
            vet_referral_required, vet_referral_reason,
            final_price, notes, recorded_by)
         VALUES (:aid,:svc,:prod,:before,:after,:beh,:coat,:skin,:vetref,:vetreason,:price,:notes,:uid)`,
        {
          aid: req.params.id,
          svc:  JSON.stringify(servicesPerformed),
          prod: productsUsed ? JSON.stringify(productsUsed) : null,
          before: beforePhotoUrl || null, after: afterPhotoUrl || null,
          beh: behaviorObservations || null, coat: coatCondition || null,
          skin: skinCondition || null, vetref: vetReferralRequired ? 1 : 0,
          vetreason: vetReferralReason || null, price: finalPrice || null,
          notes: groomingNotes || null, uid: req.user.userId,
        }
      );

      if (finalPrice) {
        await db.query(
          `UPDATE grooming_appointments SET final_price=:price, status='completed', updated_at=NOW()
           WHERE id=:id`,
          { price: finalPrice, id: req.params.id }
        );
      }
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// POST /grooming/appointments/:id/rating
apptRouter.post('/:id/rating',
  body('overallScore').isInt({ min: 1, max: 5 }),
  validate,
  async (req, res, next) => {
    try {
      const { overallScore, qualityScore, timelinessScore, grooomerFriendlinessScore, comment, recommendGroomer } = req.body;
      await db.query(
        `INSERT INTO grooming_ratings
           (grooming_appointment_id, client_id, overall_score, quality_score,
            timeliness_score, groomer_friendliness_score, comment, would_recommend)
         VALUES (:aid,:cid,:overall,:qual,:time,:friendly,:comment,:rec)`,
        {
          aid: req.params.id, cid: req.user.userId,
          overall: overallScore, qual: qualityScore || null,
          time: timelinessScore || null, friendly: grooomerFriendlinessScore || null,
          comment: comment || null, rec: recommendGroomer ? 1 : 0,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── Groomers ──────────────────────────────────────────────────────────────────
const groomersRouter = Router();

groomersRouter.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT g.id, g.commission_type, g.commission_value, g.specializations, g.is_active,
              CONCAT(u.first_name,' ',u.last_name) AS name, u.email, u.phone
       FROM groomers g JOIN users u ON g.user_id = u.id
       WHERE g.branch_id = :bid AND g.is_active = TRUE ORDER BY u.first_name`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) {
    logGroomingError('GET /grooming/groomers', e, {
      branchId: req.user?.branchId,
      orgId: req.user?.organizationId || req.user?.orgId,
      query: req.query,
    });
    next(e);
  }
});

groomersRouter.get('/performance', async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM v_groomer_performance WHERE branch_id = :bid ORDER BY total_revenue DESC`,
      { bid: req.user.branchId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

groomersRouter.get('/:id/commissions', async (req, res, next) => {
  try {
    const { from, to, paid } = req.query;
    const conds = ['gcr.groomer_id = :gid'];
    const p = { gid: req.params.id };
    if (from) { conds.push('gcr.earned_at >= :from'); p.from = from; }
    if (to)   { conds.push('gcr.earned_at <= :to');   p.to   = to; }
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
    const [{ total_pending }] = await db.query(
      `SELECT COALESCE(SUM(commission_amount),0) AS total_pending
       FROM groomer_commission_records WHERE groomer_id=:gid AND is_paid=FALSE`,
      { gid: req.params.id }
    );
    return R.ok(res, { records: rows, totalPending: total_pending });
  } catch (e) { next(e); }
});

// GET /grooming/patient-profile/:patientId
const profileRouter = Router();
profileRouter.get('/:patientId', async (req, res, next) => {
  try {
    const profile = await db.queryOne(
      `SELECT * FROM patient_grooming_profile WHERE patient_id = :pid`,
      { pid: req.params.patientId }
    );
    return R.ok(res, profile);
  } catch (e) { next(e); }
});

profileRouter.post('/:patientId',
  body('preferredGroomingStyle').optional(),
  async (req, res, next) => {
    try {
      const {
        preferredGroomingStyle, coatType, regularGroomingFrequency,
        behaviorWithGrooming, muzzleRequired, sedationHistory,
        preferredProducts, allergicToProducts, knownIssues, notes,
      } = req.body;

      await db.query(
        `INSERT INTO patient_grooming_profile
           (patient_id, preferred_grooming_style, coat_type, regular_grooming_frequency,
            behavior_with_grooming, muzzle_required, sedation_history,
            preferred_products, allergic_to_products, known_issues, notes)
         VALUES (:pid,:style,:coat,:freq,:beh,:muzzle,:sed,:prods,:allerg,:issues,:notes)
         ON DUPLICATE KEY UPDATE
           preferred_grooming_style=VALUES(preferred_grooming_style),
           behavior_with_grooming=VALUES(behavior_with_grooming),
           muzzle_required=VALUES(muzzle_required),
           updated_at=NOW()`,
        {
          pid: req.params.patientId, style: preferredGroomingStyle || null,
          coat: coatType || null, freq: regularGroomingFrequency || null,
          beh: behaviorWithGrooming || null, muzzle: muzzleRequired ? 1 : 0,
          sed: sedationHistory ? JSON.stringify(sedationHistory) : null,
          prods: preferredProducts || null, allerg: allergicToProducts || null,
          issues: knownIssues || null, notes: notes || null,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── Service types ─────────────────────────────────────────────────────────────
const serviceTypesRouter = Router();

serviceTypesRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT * FROM grooming_service_types WHERE is_active = TRUE ORDER BY name`
    );
    return R.ok(res, rows);
  } catch (e) {
    logGroomingError('GET /grooming/service-types', e);
    next(e);
  }
});

serviceTypesRouter.post('/',
  body('name').notEmpty(),
  async (req, res, next) => {
    try {
      const { name, description, basePriceSmall, basePriceMedium, basePriceLarge,
              durationMinSmall, durationMinMedium, durationMinLarge } = req.body;
      const [r] = await db.query(
        `INSERT INTO grooming_service_types
           (name, description, base_price_small, base_price_medium, base_price_large,
            duration_min_small, duration_min_medium, duration_min_large)
         VALUES (:name,:desc,:ps,:pm,:pl,:ds,:dm,:dl)`,
        {
          name, desc: description || null,
          ps: basePriceSmall || null, pm: basePriceMedium || null, pl: basePriceLarge || null,
          ds: durationMinSmall || null, dm: durationMinMedium || null, dl: durationMinLarge || null,
        }
      );
      return R.created(res, { id: r.insertId });
    } catch (e) { next(e); }
  }
);

// ── App ───────────────────────────────────────────────────────────────────────
const app = buildApp('grooming', (app, requirePerm) => {
  app.use('/grooming/appointments',    requirePerm('grooming:read'),   guardWrite('grooming'),  apptRouter);
  app.use('/grooming/groomers',        requirePerm('grooming:read'),   guardWrite('grooming'),  groomersRouter);
  app.use('/grooming/patient-profile', requirePerm('grooming:read'),   guardWrite('grooming'),  profileRouter);
  app.use('/grooming/service-types',   requirePerm('grooming:read'),   guardWrite('grooming'),  serviceTypesRouter);
});

const PORT = parseInt(process.env.PORT || '3007');
if (process.env.NODE_ENV !== 'test') {
  startService(app, 'grooming', PORT);
}

module.exports = app;
