'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path   = require('path');
const db = require('../../../../shared/db');
const R  = require('../../../../shared/response');
const { cacheMiddleware, httpCacheHeaders } = require('../../../../shared/cache');

const router  = Router();

// MIME magic bytes map for allowed file types (first bytes of buffer)
const ALLOWED_MIME_SIGNATURES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png':  [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],  // RIFF....WEBP
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],  // %PDF
};
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

function sanitizeFilename(name) {
  return path.basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120);
}

const upload  = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return cb(null, false);
    // Sanitize filename at filter stage so it's safe before reaching the handler
    file.originalname = sanitizeFilename(file.originalname);
    cb(null, true);
  },
});

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

// ── GET /patients ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      speciesId,
      species,
      isActive: isActiveQuery,
      is_active: isActiveLegacy,
      page = 1,
    } = req.query;
    const isActive = isActiveQuery ?? isActiveLegacy ?? 'true';
    const limit  = Math.min(parseInt(req.query.limit || '20'), 100);
    const offset = (Math.max(parseInt(page), 1) - 1) * limit;
    const branchId = req.user.branchId;

    const conditions = [`cl.branch_id = :branchId`];
    const params = { branchId, limit: parseInt(limit), offset: parseInt(offset) };

    if (isActive !== 'all') {
      conditions.push(`p.is_active = :isActive`);
      params.isActive = ['1', 1, true, 'true'].includes(isActive) ? 1 : 0;
    }

    if (search) {
      conditions.push(`(p.name LIKE :s OR p.chip_number LIKE :s OR p.tattoo_number LIKE :s OR CONCAT(cl.first_name,' ',cl.last_name) LIKE :s)`);
      params.s = `%${search}%`;
    }
    if (speciesId) {
      conditions.push(`p.species_id = :speciesId`);
      params.speciesId = speciesId;
    } else if (species) {
      conditions.push(`sp.common_name = :species`);
      params.species = species;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countParams = { ...params };
    delete countParams.limit;
    delete countParams.offset;

    const [rows, [{ total }]] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.chip_number, p.sex, p.birthdate, p.is_active,
                sp.common_name AS species, b.name AS breed, co.name AS coat_color,
                CONCAT(cl.first_name,' ',cl.last_name) AS primary_owner,
                cl.id AS owner_id, cl.phone AS owner_phone,
                p.photo_url, p.weight_kg, p.body_condition_score
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
         JOIN clients cl ON po.client_id = cl.id
         LEFT JOIN species     sp ON p.species_id  = sp.id
         LEFT JOIN breeds      b  ON p.breed_id    = b.id
         LEFT JOIN coat_colors co ON p.coat_color_id = co.id
         ${where}
         ORDER BY p.name
         LIMIT :limit OFFSET :offset`,
        params
      ),
      db.query(
        `SELECT COUNT(DISTINCT p.id) AS total
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
         JOIN clients cl ON po.client_id = cl.id
         LEFT JOIN species sp ON p.species_id = sp.id
         ${where}`,
        countParams
      ),
    ]);

    return R.paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
});

// ── GET /patients/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const patient = await db.queryOne(
      `SELECT p.*,
              sp.common_name AS species_name, sp.scientific_name,
              b.name AS breed_name,
              co.name AS coat_color_name
       FROM patients p
       LEFT JOIN species     sp ON p.species_id    = sp.id
       LEFT JOIN breeds      b  ON p.breed_id      = b.id
       LEFT JOIN coat_colors co ON p.coat_color_id = co.id
       WHERE p.id = :id AND p.organization_id = :orgId`,
      { id: req.params.id, orgId: req.user.orgId }
    );
    if (!patient) return R.notFound(res, 'Patient not found');

    const [owners, allergies, conditions] = await Promise.all([
      db.query(
        `SELECT cl.id, cl.first_name, cl.last_name, cl.email, cl.phone,
                po.ownership_type, po.start_date, po.end_date, po.notes
         FROM patient_owners po
         JOIN clients cl ON po.client_id = cl.id
         WHERE po.patient_id = :pid ORDER BY FIELD(po.ownership_type,'primary','secondary')`,
        { pid: req.params.id }
      ),
      db.query(`SELECT * FROM patient_allergies WHERE patient_id = :pid`, { pid: req.params.id }),
      db.query(`SELECT * FROM patient_chronic_conditions WHERE patient_id = :pid AND is_active = TRUE`, { pid: req.params.id }),
    ]);

    return R.ok(res, { ...patient, owners, allergies, chronicConditions: conditions });
  } catch (e) { next(e); }
});

// ── GET /patients/:id/timeline ────────────────────────────────────────────────
router.get('/:id/timeline', async (req, res, next) => {
  try {
    const results = await db.callProc('sp_get_patient_timeline', [req.params.id]);
    return R.ok(res, results[0]);
  } catch (e) { next(e); }
});

// ── POST /patients ────────────────────────────────────────────────────────────
router.post('/',
  body('name').notEmpty().trim(),
  body('speciesId').isInt(),
  body('primaryOwnerId').isInt(),
  body('sex').isIn(['male','female','unknown']),
  validate,
  async (req, res, next) => {
    try {
      const {
        name, speciesId, breedId, coatColorId, sex,
        birthdate: rawBirthdate, birthDate,
        chipNumber: rawChipNumber, microchip, microchipNumber,
        tattooNumber, passportNumber,
        weightKg, bodyConditionScore,
        isNeutered, isDeceased, photoUrl, notes,
        primaryOwnerId,
      } = req.body;
      const birthdate = rawBirthdate ?? birthDate;
      const chipNumber = rawChipNumber ?? microchipNumber ?? microchip;

      await db.transaction(async (conn) => {
        const [r] = await conn.execute(
          `INSERT INTO patients
             (name, species_id, breed_id, coat_color_id, sex, birthdate,
              chip_number, tattoo_number, passport_number,
              weight_kg, body_condition_score,
              is_sterilized, is_deceased, photo_url, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            name, speciesId, breedId || null, coatColorId || null,
            sex, birthdate || null,
            chipNumber || null, tattooNumber || null, passportNumber || null,
            weightKg || null, bodyConditionScore || null,
            isNeutered ? 1 : 0, isDeceased ? 1 : 0,
            photoUrl || null, notes || null,
          ]
        );
        const patientId = r.insertId;

        await conn.execute(
          `INSERT INTO patient_owners (patient_id, client_id, ownership_type, start_date)
           VALUES (?, ?, 'primary', CURDATE())`,
          [patientId, primaryOwnerId]
        );

        return patientId;
      });

      return R.created(res, { message: 'Patient created' });
    } catch (e) { next(e); }
  }
);

// ── PUT /patients/:id ─────────────────────────────────────────────────────────
router.put('/:id',
  body('name').optional().notEmpty().trim(),
  body('sex').optional().isIn(['male','female','unknown']),
  body('bodyConditionScore').optional().isInt({ min: 1, max: 9 }),
  validate,
  async (req, res, next) => {
    try {
      const allowed = ['name','breed_id','coat_color_id','sex','birthdate','chip_number',
        'tattoo_number','passport_number','weight_kg','body_condition_score',
        'is_sterilized','is_deceased','photo_url','notes'];
      const map = {
        breedId:'breed_id', coatColorId:'coat_color_id', chipNumber:'chip_number',
        birthDate:'birthdate', microchip:'chip_number', microchipNumber:'chip_number',
        tattooNumber:'tattoo_number', passportNumber:'passport_number',
        weightKg:'weight_kg', bodyConditionScore:'body_condition_score',
        isNeutered:'is_sterilized', isDeceased:'is_deceased', photoUrl:'photo_url',
      };

      const sets = [];
      const params = { id: req.params.id };
      for (const [k, v] of Object.entries(req.body)) {
        // Only accept keys that are explicitly mapped OR are already in the allowed list
        // Column name must be in the allowlist — never use raw body key as column name
        const col = map[k] || (allowed.includes(k) ? k : null);
        if (col && allowed.includes(col)) { sets.push(`\`${col}\` = :${col}`); params[col] = v; }
      }
      if (!sets.length) return R.badRequest(res, 'No valid fields');

      params.orgId = req.user.orgId;
      await db.query(
        `UPDATE patients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = :id AND organization_id = :orgId`,
        params
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// ── POST /patients/:id/photo  (file upload) ───────────────────────────────────
router.post('/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return R.badRequest(res, 'No file uploaded or invalid file type');

    // Validate file magic bytes — reject files that lie about their extension
    const buf = req.file.buffer;
    const mimeOk = Object.values(ALLOWED_MIME_SIGNATURES).some(sigs =>
      sigs.some(sig => buf.slice(0, sig.length).equals(sig))
    );
    if (!mimeOk) return R.badRequest(res, 'Invalid file content — upload rejected');

    // In production, upload to MinIO and get URL
    const safeFilename = sanitizeFilename(req.file.originalname);
    const url = `/uploads/patients/${req.params.id}/${Date.now()}-${safeFilename}`;
    await db.query(
      `UPDATE patients SET photo_url = :url WHERE id = :id AND organization_id = :orgId`,
      { url, id: req.params.id, orgId: req.user.orgId }
    );
    return R.ok(res, { url });
  } catch (e) { next(e); }
});

// ── POST /patients/:id/owners  (add co-owner) ────────────────────────────────
router.post('/:id/owners',
  body('clientId').isInt(),
  body('ownershipType').isIn(['secondary','temporary_guardian','foster']),
  validate,
  async (req, res, next) => {
    try {
      await db.callProc('sp_transfer_patient_ownership', [
        req.params.id,
        req.body.clientId,
        req.body.ownershipType,
        req.user.userId,
      ]);
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── POST /patients/:id/allergies ──────────────────────────────────────────────
router.post('/:id/allergies',
  body('allergen').notEmpty(),
  body('severity').isIn(['mild','moderate','severe']),
  validate,
  async (req, res, next) => {
    try {
      const { allergen, severity, reaction, notes } = req.body;
      await db.query(
        `INSERT INTO patient_allergies (patient_id, allergen, severity, reaction_description, notes)
         VALUES (:pid, :allergen, :severity, :reaction, :notes)`,
        { pid: req.params.id, allergen, severity, reaction: reaction || null, notes: notes || null }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── POST /patients/:id/chronic-conditions ────────────────────────────────────
router.post('/:id/chronic-conditions',
  body('conditionName').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { conditionName, diagnosisCode, diagnosedAt, managedWith, notes } = req.body;
      await db.query(
        `INSERT INTO patient_chronic_conditions
           (patient_id, condition_name, diagnosis_code, diagnosed_at, managed_with, notes)
         VALUES (:pid, :name, :code, :date, :managed, :notes)`,
        {
          pid:     req.params.id,
          name:    conditionName,
          code:    diagnosisCode || null,
          date:    diagnosedAt  || null,
          managed: managedWith  || null,
          notes:   notes        || null,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

// ── DELETE /patients/:id/allergies/:aid ───────────────────────────────────────
router.delete('/:id/allergies/:aid', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE patient_allergies SET is_active = 0 WHERE id = :aid AND patient_id = :pid`,
      { aid: req.params.aid, pid: req.params.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── DELETE /patients/:id/chronic-conditions/:cid ──────────────────────────────
router.delete('/:id/chronic-conditions/:cid', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE patient_chronic_conditions SET is_active = 0 WHERE id = :cid AND patient_id = :pid`,
      { cid: req.params.cid, pid: req.params.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ── GET /species ─────────────────────────────────────── cached 10 min ───────
async function getSpeciesAll(_req, res, next) {
  try {
    let rows;
    try {
      rows = await db.query(
        `SELECT s.*, sc.name AS category FROM species s
         JOIN species_categories sc ON s.category_id = sc.id
         WHERE s.is_active = TRUE ORDER BY sc.name, s.common_name`
      );
    } catch (err) {
      const msg = String(err?.message || '');
      const isSchemaDrift =
        /Unknown column|doesn't exist|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE/i.test(msg);

      if (!isSchemaDrift) throw err;

      // Railway/prod may still be on the legacy dump where species.active and
      // species_categories.display_name are used instead of is_active/name.
      rows = await db.query(
        `SELECT s.*, COALESCE(sc.display_name, sc.name) AS category
         FROM species s
         JOIN species_categories sc ON s.category_id = sc.id
         WHERE COALESCE(s.active, 1) = TRUE
         ORDER BY category, s.common_name`
      );
    }
    return R.ok(res, rows);
  } catch (e) { next(e); }
}

router.get('/species/all',
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, () => 'ref:species:all'),
  getSpeciesAll);

// ── GET /breeds?speciesId= ───────────────────────────── cached 10 min ───────
async function getBreedsAll(req, res, next) {
  try {
    const { speciesId } = req.query;
    const where = speciesId ? 'WHERE species_id = :sid' : '';
    const rows  = await db.query(
      `SELECT * FROM breeds ${where} ORDER BY name`,
      speciesId ? { sid: speciesId } : {}
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
}

router.get('/breeds/all',
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, (req) => `ref:breeds:${req.query.speciesId || 'all'}`),
  getBreedsAll);

module.exports = router;
module.exports.getSpeciesAll = [
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, () => 'ref:species:all'),
  getSpeciesAll,
];
module.exports.getBreedsAll = [
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, (req) => `ref:breeds:${req.query.speciesId || 'all'}`),
  getBreedsAll,
];
