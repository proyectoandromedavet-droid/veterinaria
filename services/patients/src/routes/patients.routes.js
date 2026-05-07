'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');
const { cacheMiddleware, httpCacheHeaders } = require('../../../../shared/cache');

const router = Router();

const ALLOWED_MIME_SIGNATURES = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],
};
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

function deletedPredicate(cols, alias) {
  return cols.has('deleted_at') ? `${alias}.deleted_at IS NULL` : '1 = 1';
}

function sanitizeFilename(name) {
  return path.basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 120);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '20') * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return cb(null, false);
    file.originalname = sanitizeFilename(file.originalname);
    cb(null, true);
  },
});

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

function logPatientsError(route, err, meta = {}) {
  console.error(`[patients] ${route} failed`, {
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    sqlState: err?.sqlState,
    sqlMessage: err?.sqlMessage,
    sql: err?.sql,
    meta,
    stack: err?.stack,
  });
}

let _patientSchemaPromise;
async function getPatientSchema() {
  if (!_patientSchemaPromise) {
    _patientSchemaPromise = db.query(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (
           'patients',
           'clients',
           'patient_owners',
           'appointments',
           'medical_records',
           'vaccinations',
           'deworming_records',
           'surgeries',
           'hospitalizations',
           'tele_sessions',
           'grooming_appointments',
           'patient_allergies',
           'patient_chronic_conditions'
         )`
    ).then((rows) => {
      const schema = {};
      for (const row of rows) {
        if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = new Set();
        schema[row.TABLE_NAME].add(row.COLUMN_NAME);
      }
      return schema;
    });
  }
  return _patientSchemaPromise;
}

async function getPatientListSchema() {
  return getPatientSchema();
}

function boolFromQuery(value, defaultValue = 1) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (['1', 1, true, 'true', 'yes'].includes(value)) return 1;
  if (['0', 0, false, 'false', 'no'].includes(value)) return 0;
  return defaultValue;
}

async function ensurePatientVisible(patientId, user) {
  const schema = await getPatientSchema();
  const patientCols = schema.patients || new Set();
  const clientCols = schema.clients || new Set();
  const ownerCols = schema.patient_owners || new Set();

  const scopes = [];
  if (patientCols.has('organization_id')) scopes.push('p.organization_id = :orgId');
  if (clientCols.has('branch_id')) {
    scopes.push(
       `EXISTS (
         SELECT 1
         FROM patient_owners po
         JOIN clients cl ON cl.id = po.client_id
         WHERE po.patient_id = p.id
           AND ${deletedPredicate(ownerCols, 'po')}
           AND ${deletedPredicate(clientCols, 'cl')}
           ${ownerCols.has('active') ? 'AND po.active = 1' : ''}
           AND cl.branch_id = :branchId
       )`
    );
  }
  if (!scopes.length) throw new Error('Patients visibility schema unsupported');

  return db.queryOne(
    `SELECT p.id
     FROM patients p
     WHERE p.id = :id
       AND ${deletedPredicate(patientCols, 'p')}
       AND (${scopes.join(' OR ')})
     LIMIT 1`,
    { id: patientId, orgId: user.orgId, branchId: user.branchId }
  );
}

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
    const parsedPage = Math.max(parseInt(`${page}`, 10) || 1, 1);
    const isActive = isActiveQuery ?? isActiveLegacy ?? 'true';
    const limit = Math.min(parseInt(`${req.query.limit || '20'}`, 10) || 20, 100);
    const offset = (parsedPage - 1) * limit;
    const branchId = req.user.branchId;
    const orgId = req.user.orgId;
    const schema = await getPatientListSchema();
    const patientCols = schema.patients || new Set();
    const clientCols = schema.clients || new Set();
    const ownerCols = schema.patient_owners || new Set();

    const activeCol = patientCols.has('is_active') ? 'p.is_active' : (patientCols.has('active') ? 'p.active' : null);
    const chipCol = patientCols.has('chip_number')
      ? `COALESCE(p.chip_number, ${patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL'})`
      : (patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL');
    const hcCol = patientCols.has('hc_number') ? 'p.hc_number' : 'NULL';
    const tattooCol = patientCols.has('tattoo_number') ? 'p.tattoo_number' : (patientCols.has('tattoo_code') ? 'p.tattoo_code' : 'NULL');
    const sexCol = patientCols.has('sex')
      ? 'p.sex'
      : (patientCols.has('gender') ? `CASE p.gender WHEN 'M' THEN 'male' WHEN 'F' THEN 'female' ELSE 'unknown' END` : `'unknown'`);
    const birthdateCol = patientCols.has('birthdate')
      ? `COALESCE(p.birthdate, ${patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL')})`
      : (patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL'));
    const coatJoinCol = patientCols.has('coat_color_id') ? 'p.coat_color_id' : (patientCols.has('color_id') ? 'p.color_id' : null);
    const bodyConditionCol = patientCols.has('body_condition_score') ? 'p.body_condition_score' : 'NULL';
    const ownerPhoneCol = clientCols.has('phone') ? 'cl.phone' : (clientCols.has('phone_primary') ? 'cl.phone_primary' : 'NULL');
    const scopeConditions = [];
    if (clientCols.has('branch_id')) scopeConditions.push('cl.branch_id = :branchId');
    if (patientCols.has('organization_id')) scopeConditions.push('p.organization_id = :orgId');
    const ownerPrimaryCondition = ownerCols.has('active')
      ? `po.ownership_type = 'primary' AND po.active = 1`
      : `po.ownership_type = 'primary'`;

    if (!scopeConditions.length) {
      throw new Error('Patients list schema unsupported: missing clients.branch_id and patients.organization_id');
    }

    const conditions = [
      `(${scopeConditions.join(' OR ')})`,
      deletedPredicate(patientCols, 'p'),
      deletedPredicate(clientCols, 'cl'),
      deletedPredicate(ownerCols, 'po'),
    ];
    const params = { branchId, orgId, limit, offset };

    if (isActive !== 'all' && activeCol) {
      conditions.push(`${activeCol} = :isActive`);
      params.isActive = boolFromQuery(isActive, 1);
    }
    if (search) {
      conditions.push(`(p.name LIKE :s OR ${hcCol} LIKE :s OR ${chipCol} LIKE :s OR ${tattooCol} LIKE :s OR CONCAT(cl.first_name,' ',cl.last_name) LIKE :s)`);
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
        `SELECT p.id, p.name, ${hcCol} AS hc_number,
                ${chipCol} AS chip_number,
                ${sexCol} AS sex,
                ${birthdateCol} AS birthdate,
                ${activeCol || '1'} AS is_active,
                sp.common_name AS species, b.name AS breed, co.name AS coat_color,
                CONCAT(cl.first_name,' ',cl.last_name) AS primary_owner,
                cl.id AS owner_id, ${ownerPhoneCol} AS owner_phone,
                p.photo_url, p.weight_kg, ${bodyConditionCol} AS body_condition_score
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND ${ownerPrimaryCondition}
         JOIN clients cl ON po.client_id = cl.id
         LEFT JOIN species sp ON p.species_id = sp.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         LEFT JOIN coat_colors co ON ${coatJoinCol ? `${coatJoinCol} = co.id` : '1 = 0'}
         ${where}
         ORDER BY p.name
         LIMIT :limit OFFSET :offset`,
        params
      ),
      db.query(
        `SELECT COUNT(DISTINCT p.id) AS total
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND ${ownerPrimaryCondition}
         JOIN clients cl ON po.client_id = cl.id
         LEFT JOIN species sp ON p.species_id = sp.id
         ${where}`,
        countParams
      ),
    ]);

    return R.paginated(res, rows, total, parsedPage, limit);
  } catch (e) {
    logPatientsError('GET /patients', e, {
      branchId: req.user?.branchId,
      orgId: req.user?.orgId,
      query: req.query,
    });
    next(e);
  }
});

router.get('/species/all',
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, () => 'ref:species:all'),
  getSpeciesAll);

router.get('/breeds/all',
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, (req) => `ref:breeds:${req.query.speciesId || 'all'}`),
  getBreedsAll);

router.get('/breeds',
  httpCacheHeaders({ maxAge: 600, scope: 'public' }),
  cacheMiddleware(600, (req) => `ref:breeds:${req.query.speciesId || 'all'}`),
  getBreedsAll);

router.get('/:id', async (req, res, next) => {
  try {
    const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
    if (!visiblePatient) return R.notFound(res, 'Patient not found');

    const schema = await getPatientSchema();
    const patientCols = schema.patients || new Set();
    const clientCols = schema.clients || new Set();
    const ownerCols = schema.patient_owners || new Set();
    const allergyCols = schema.patient_allergies || new Set();
    const conditionCols = schema.patient_chronic_conditions || new Set();

    const chipExpr = patientCols.has('chip_number')
      ? `COALESCE(p.chip_number, ${patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL'})`
      : (patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL');
    const birthExpr = patientCols.has('birthdate')
      ? `COALESCE(p.birthdate, ${patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL')})`
      : (patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL'));
    const activeExpr = patientCols.has('is_active') ? 'p.is_active' : (patientCols.has('active') ? 'p.active' : '1');
    const colorJoinExpr = patientCols.has('coat_color_id') ? 'p.coat_color_id' : (patientCols.has('color_id') ? 'p.color_id' : null);
    const ownerPhoneExpr = clientCols.has('phone') ? 'cl.phone' : (clientCols.has('phone_primary') ? 'cl.phone_primary' : 'NULL');
    const ownerActiveFilter = ownerCols.has('active') ? 'AND po.active = 1' : '';
    const allergyActiveFilter = allergyCols.has('is_active') ? 'AND is_active = TRUE' : '';
    const conditionActiveFilter = conditionCols.has('is_active') ? 'AND is_active = TRUE' : '';

    const patient = await db.queryOne(
      `SELECT p.*,
              ${patientCols.has('hc_number') ? 'p.hc_number' : 'NULL'} AS hc_number,
              ${chipExpr} AS chip_number,
              ${birthExpr} AS birthdate,
              ${activeExpr} AS is_active,
              sp.common_name AS species_name, sp.scientific_name,
              b.name AS breed_name,
              co.name AS coat_color_name
       FROM patients p
       LEFT JOIN species sp ON p.species_id = sp.id
       LEFT JOIN breeds b ON p.breed_id = b.id
       LEFT JOIN coat_colors co ON ${colorJoinExpr ? `${colorJoinExpr} = co.id` : '1 = 0'}
       WHERE p.id = :id
         AND ${deletedPredicate(patientCols, 'p')}`,
      { id: req.params.id }
    );
    if (!patient) return R.notFound(res, 'Patient not found');

    const [owners, allergies, conditions] = await Promise.all([
      db.query(
        `SELECT cl.id, cl.first_name, cl.last_name, cl.email, ${ownerPhoneExpr} AS phone,
                po.ownership_type, po.start_date, po.end_date, po.notes
         FROM patient_owners po
         JOIN clients cl ON po.client_id = cl.id
         WHERE po.patient_id = :pid
           AND ${deletedPredicate(ownerCols, 'po')}
           AND ${deletedPredicate(clientCols, 'cl')}
           ${ownerActiveFilter}
         ORDER BY FIELD(po.ownership_type,'primary','secondary')`,
        { pid: req.params.id }
      ),
      db.query(`SELECT * FROM patient_allergies WHERE patient_id = :pid ${allergyActiveFilter}`, { pid: req.params.id }),
      db.query(`SELECT * FROM patient_chronic_conditions WHERE patient_id = :pid ${conditionActiveFilter}`, { pid: req.params.id }),
    ]);

    return R.ok(res, { ...patient, owners, allergies, chronicConditions: conditions });
  } catch (e) { next(e); }
});

router.get('/:id/timeline', async (req, res, next) => {
  try {
    const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
    if (!visiblePatient) return R.notFound(res, 'Patient not found');

    const schema = await getPatientSchema();
    const patientId = req.params.id;
    const timeline = [];
    const sources = [
      {
        table: 'appointments',
        type: 'appointment',
        sql: `SELECT id,
                     COALESCE(scheduled_date, appointment_date, created_at) AS event_at,
                     status,
                     reason AS title,
                     notes
              FROM appointments
              WHERE patient_id = :patientId`,
      },
      {
        table: 'medical_records',
        type: 'medical_record',
        sql: `SELECT id,
                     COALESCE(recorded_at, visit_date, created_at) AS event_at,
                     COALESCE(diagnosis, chief_complaint, notes, 'Medical record') AS title,
                     treatment,
                     notes
              FROM medical_records
              WHERE patient_id = :patientId`,
      },
      {
        table: 'vaccinations',
        type: 'vaccination',
        sql: `SELECT id,
                     COALESCE(administered_at, application_date, created_at) AS event_at,
                     COALESCE(vaccine_name, name, 'Vaccination') AS title,
                     notes
              FROM vaccinations
              WHERE patient_id = :patientId`,
      },
      {
        table: 'deworming_records',
        type: 'deworming',
        sql: `SELECT id,
                     COALESCE(administered_at, application_date, created_at) AS event_at,
                     COALESCE(product_name, medication_name, 'Deworming') AS title,
                     notes
              FROM deworming_records
              WHERE patient_id = :patientId`,
      },
      {
        table: 'surgeries',
        type: 'surgery',
        sql: `SELECT id,
                     COALESCE(performed_at, surgery_date, created_at) AS event_at,
                     COALESCE(procedure_name, surgery_type, 'Surgery') AS title,
                     notes
              FROM surgeries
              WHERE patient_id = :patientId`,
      },
      {
        table: 'hospitalizations',
        type: 'hospitalization',
        sql: `SELECT id,
                     COALESCE(admitted_at, admission_date, created_at) AS event_at,
                     COALESCE(reason, diagnosis, 'Hospitalization') AS title,
                     status,
                     notes
              FROM hospitalizations
              WHERE patient_id = :patientId`,
      },
      {
        table: 'tele_sessions',
        type: 'telemedicine',
        sql: `SELECT id,
                     COALESCE(started_at, scheduled_for, created_at) AS event_at,
                     COALESCE(topic, reason, 'Telemedicine session') AS title,
                     status,
                     notes
              FROM tele_sessions
              WHERE patient_id = :patientId`,
      },
      {
        table: 'grooming_appointments',
        type: 'grooming',
        sql: `SELECT id,
                     COALESCE(scheduled_date, appointment_date, created_at) AS event_at,
                     COALESCE(service_name, notes, 'Grooming') AS title,
                     status,
                     notes
              FROM grooming_appointments
              WHERE patient_id = :patientId`,
      },
    ];

    await Promise.all(
      sources
        .filter((source) => schema[source.table]?.has('patient_id'))
        .map(async (source) => {
          const rows = await db.query(source.sql, { patientId });
          for (const row of rows) timeline.push({ ...row, type: source.type });
        })
    );

    timeline.sort((a, b) => {
      const left = a.event_at ? new Date(a.event_at).getTime() : 0;
      const right = b.event_at ? new Date(b.event_at).getTime() : 0;
      return right - left;
    });

    return R.ok(res, timeline);
  } catch (e) { next(e); }
});

router.post('/',
  body('name').notEmpty().trim(),
  body('speciesId').isInt(),
  body('primaryOwnerId').isInt(),
  body('sex').isIn(['male', 'female', 'unknown']),
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
      const schema = await getPatientSchema();
      const patientCols = schema.patients || new Set();
      const clientCols = schema.clients || new Set();
      const ownerCols = schema.patient_owners || new Set();

      await db.transaction(async (conn) => {
        // Admin users may have no branchId — look up client in the org without branch filter
        const userBranchId = req.user.branchId || null;
        let ownerQuery, ownerParams;
        if (userBranchId) {
          ownerQuery = `SELECT id, branch_id FROM clients WHERE id = :clientId AND branch_id = :branchId ${clientCols.has('organization_id') ? 'AND organization_id = :orgId' : ''}`;
          ownerParams = { clientId: primaryOwnerId, branchId: userBranchId, orgId: req.user.orgId };
        } else {
          ownerQuery = `SELECT id, branch_id FROM clients WHERE id = :clientId ${clientCols.has('organization_id') ? 'AND organization_id = :orgId' : ''}`;
          ownerParams = { clientId: primaryOwnerId, orgId: req.user.orgId };
        }
        const owner = await conn.queryOne(ownerQuery, ownerParams);
        if (!owner) throw new Error('Primary owner not found in current organization/branch');

        const branchId = userBranchId || owner.branch_id || null;

        const columns = ['name', 'species_id'];
        const values = [':name', ':speciesId'];
        const params = {
          name,
          speciesId,
          breedId: breedId || null,
          coatColorId: coatColorId || null,
          sex,
          birthdate: birthdate || null,
          chipNumber: chipNumber || null,
          tattooNumber: tattooNumber || null,
          passportNumber: passportNumber || null,
          weightKg: weightKg || null,
          bodyConditionScore: bodyConditionScore || null,
          isNeutered: isNeutered ? 1 : 0,
          isDeceased: isDeceased ? 1 : 0,
          photoUrl: photoUrl || null,
          notes: notes || null,
          orgId: req.user.orgId,
          branchId,
        };

        if (patientCols.has('organization_id')) { columns.push('organization_id'); values.push(':orgId'); }
        if (patientCols.has('hc_number')) { columns.push('hc_number'); values.push(':hcNumber'); }
        if (patientCols.has('branch_id')) { columns.push('branch_id'); values.push(':branchId'); }
        if (patientCols.has('breed_id')) { columns.push('breed_id'); values.push(':breedId'); }
        if (patientCols.has('coat_color_id')) { columns.push('coat_color_id'); values.push(':coatColorId'); }
        if (patientCols.has('color_id')) { columns.push('color_id'); values.push(':coatColorId'); }
        if (patientCols.has('sex')) { columns.push('sex'); values.push(':sex'); }
        if (patientCols.has('gender')) { columns.push('gender'); values.push(`CASE :sex WHEN 'male' THEN 'M' WHEN 'female' THEN 'F' ELSE 'U' END`); }
        if (patientCols.has('birthdate')) { columns.push('birthdate'); values.push(':birthdate'); }
        if (patientCols.has('birth_date')) { columns.push('birth_date'); values.push(':birthdate'); }
        if (patientCols.has('date_of_birth')) { columns.push('date_of_birth'); values.push(':birthdate'); }
        if (patientCols.has('chip_number')) { columns.push('chip_number'); values.push(':chipNumber'); }
        if (patientCols.has('microchip_number')) { columns.push('microchip_number'); values.push(':chipNumber'); }
        if (patientCols.has('tattoo_number')) { columns.push('tattoo_number'); values.push(':tattooNumber'); }
        if (patientCols.has('tattoo_code')) { columns.push('tattoo_code'); values.push(':tattooNumber'); }
        if (patientCols.has('passport_number')) { columns.push('passport_number'); values.push(':passportNumber'); }
        if (patientCols.has('weight_kg')) { columns.push('weight_kg'); values.push(':weightKg'); }
        if (patientCols.has('body_condition_score')) { columns.push('body_condition_score'); values.push(':bodyConditionScore'); }
        if (patientCols.has('is_sterilized')) { columns.push('is_sterilized'); values.push(':isNeutered'); }
        if (patientCols.has('is_deceased')) { columns.push('is_deceased'); values.push(':isDeceased'); }
        if (patientCols.has('is_active')) { columns.push('is_active'); values.push('1'); }
        if (patientCols.has('active')) { columns.push('active'); values.push('1'); }
        if (patientCols.has('photo_url')) { columns.push('photo_url'); values.push(':photoUrl'); }
        if (patientCols.has('notes')) { columns.push('notes'); values.push(':notes'); }

        const [r] = await conn.query(
          `INSERT INTO patients (${columns.join(', ')})
           VALUES (${values.join(', ')})`,
          {
            ...params,
            hcNumber: `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`,
          }
        );
        const patientId = r.insertId;

        if (patientCols.has('hc_number')) {
          await conn.query(
            `UPDATE patients
                SET hc_number = :hcNumber
              WHERE id = :patientId`,
            {
              patientId,
              hcNumber: `HC${String(patientId).padStart(6, '0')}`,
            }
          );
        }

        const ownerColumns = ['patient_id', 'client_id', 'ownership_type', 'start_date'];
        const ownerValues = [':patientId', ':clientId', `'primary'`, 'CURDATE()'];
        if (ownerCols.has('active')) {
          ownerColumns.push('active');
          ownerValues.push('1');
        }

        await conn.query(
          `INSERT INTO patient_owners (${ownerColumns.join(', ')})
           VALUES (${ownerValues.join(', ')})`,
          { patientId, clientId: primaryOwnerId }
        );
      });

      return R.created(res, { message: 'Patient created' });
    } catch (e) { next(e); }
  }
);

router.put('/:id',
  body('name').optional().notEmpty().trim(),
  body('sex').optional().isIn(['male', 'female', 'unknown']),
  body('bodyConditionScore').optional().isInt({ min: 1, max: 9 }),
  validate,
  async (req, res, next) => {
    try {
      const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
      if (!visiblePatient) return R.notFound(res, 'Patient not found');

      const schema = await getPatientSchema();
      const patientCols = schema.patients || new Set();
      const rawMap = {
        name: ['name'],
        breedId: ['breed_id'],
        coatColorId: ['coat_color_id', 'color_id'],
        sex: ['sex', 'gender'],
        birthdate: ['birthdate', 'birth_date', 'date_of_birth'],
        birthDate: ['birthdate', 'birth_date', 'date_of_birth'],
        chipNumber: ['chip_number', 'microchip_number'],
        microchip: ['chip_number', 'microchip_number'],
        microchipNumber: ['chip_number', 'microchip_number'],
        tattooNumber: ['tattoo_number', 'tattoo_code'],
        passportNumber: ['passport_number'],
        weightKg: ['weight_kg'],
        bodyConditionScore: ['body_condition_score'],
        isNeutered: ['is_sterilized'],
        isDeceased: ['is_deceased'],
        photoUrl: ['photo_url'],
        notes: ['notes'],
        isActive: ['is_active', 'active'],
      };

      const sets = [];
      const params = { id: req.params.id };
      for (const [key, value] of Object.entries(req.body)) {
        const targets = rawMap[key] || (patientCols.has(key) ? [key] : []);
        for (const column of targets) {
          if (!patientCols.has(column)) continue;
          const paramKey = `${column}_${sets.length}`;
          sets.push(`\`${column}\` = :${paramKey}`);
          if (column === 'gender') params[paramKey] = value === 'male' ? 'M' : (value === 'female' ? 'F' : 'U');
          else if (column === 'is_active' || column === 'active') params[paramKey] = boolFromQuery(value, 1);
          else params[paramKey] = value;
        }
      }
      if (!sets.length) return R.badRequest(res, 'No valid fields');

      await db.query(
        `UPDATE patients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = :id`,
        params
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

router.post('/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return R.badRequest(res, 'No file uploaded or invalid file type');

    const buf = req.file.buffer;
    const mimeOk = Object.values(ALLOWED_MIME_SIGNATURES).some((sigs) =>
      sigs.some((sig) => buf.slice(0, sig.length).equals(sig))
    );
    if (!mimeOk) return R.badRequest(res, 'Invalid file content - upload rejected');

    const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
    if (!visiblePatient) return R.notFound(res, 'Patient not found');

    const safeFilename = sanitizeFilename(req.file.originalname);
    const url = `/uploads/patients/${req.params.id}/${Date.now()}-${safeFilename}`;
    await db.query(
      `UPDATE patients SET photo_url = :url WHERE id = :id`,
      { url, id: req.params.id }
    );
    return R.ok(res, { url });
  } catch (e) { next(e); }
});

router.get('/:id/owners', async (req, res, next) => {
  try {
    const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
    if (!visiblePatient) return R.notFound(res, 'Patient not found');

    const schema = await getPatientSchema();
    const clientCols = schema.clients || new Set();
    const ownerCols = schema.patient_owners || new Set();
    const ownerPhoneExpr = clientCols.has('phone') ? 'cl.phone' : (clientCols.has('phone_primary') ? 'cl.phone_primary' : 'NULL');

    const owners = await db.query(
      `SELECT cl.id, cl.first_name, cl.last_name, cl.email, ${ownerPhoneExpr} AS phone,
              po.ownership_type, po.start_date, po.end_date, po.notes
       FROM patient_owners po
       JOIN clients cl ON cl.id = po.client_id
       WHERE po.patient_id = :patientId
         AND ${deletedPredicate(ownerCols, 'po')}
         AND ${deletedPredicate(clientCols, 'cl')}
         ${ownerCols.has('active') ? 'AND po.active = 1' : ''}
       ORDER BY FIELD(po.ownership_type, 'primary', 'secondary', 'temporary_guardian', 'foster'), cl.last_name, cl.first_name`,
      { patientId: req.params.id }
    );
    return R.ok(res, owners);
  } catch (e) { next(e); }
});

router.post('/:id/owners',
  body('clientId').isInt(),
  body('ownershipType').isIn(['secondary', 'temporary_guardian', 'foster']),
  validate,
  async (req, res, next) => {
    try {
      const visiblePatient = await ensurePatientVisible(req.params.id, req.user);
      if (!visiblePatient) return R.notFound(res, 'Patient not found');

      const schema = await getPatientSchema();
      const clientCols = schema.clients || new Set();
      const ownerCols = schema.patient_owners || new Set();

      await db.transaction(async (conn) => {
        const client = await conn.queryOne(
          `SELECT id
           FROM clients
           WHERE id = :clientId
             AND branch_id = :branchId
             AND ${deletedPredicate(clientCols, 'clients')}
             ${clientCols.has('organization_id') ? 'AND organization_id = :orgId' : ''}`,
          { clientId: req.body.clientId, branchId: req.user.branchId, orgId: req.user.orgId }
        );
        if (!client) throw new Error('Client not found in current organization/branch');

        const existing = await conn.queryOne(
          `SELECT id
           FROM patient_owners
           WHERE patient_id = :patientId AND client_id = :clientId
           LIMIT 1`,
          { patientId: req.params.id, clientId: req.body.clientId }
        );

        if (existing) {
          const sets = ['ownership_type = :ownershipType', 'start_date = COALESCE(start_date, CURDATE())', 'end_date = NULL'];
          if (ownerCols.has('active')) sets.push('active = 1');
          await conn.query(
            `UPDATE patient_owners
             SET ${sets.join(', ')}
             WHERE id = :id`,
            { id: existing.id, ownershipType: req.body.ownershipType }
          );
          return;
        }

        const columns = ['patient_id', 'client_id', 'ownership_type', 'start_date'];
        const values = [':patientId', ':clientId', ':ownershipType', 'CURDATE()'];
        if (ownerCols.has('active')) {
          columns.push('active');
          values.push('1');
        }
        await conn.query(
          `INSERT INTO patient_owners (${columns.join(', ')})
           VALUES (${values.join(', ')})`,
          { patientId: req.params.id, clientId: req.body.clientId, ownershipType: req.body.ownershipType }
        );
      });

      return R.created(res, { patientId: parseInt(req.params.id, 10), clientId: req.body.clientId });
    } catch (e) { next(e); }
  }
);

router.post('/:id/allergies',
  body('allergen').notEmpty(),
  body('severity').isIn(['mild', 'moderate', 'severe']),
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
          pid: req.params.id,
          name: conditionName,
          code: diagnosisCode || null,
          date: diagnosedAt || null,
          managed: managedWith || null,
          notes: notes || null,
        }
      );
      return R.created(res);
    } catch (e) { next(e); }
  }
);

router.delete('/:id/allergies/:aid', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE patient_allergies SET is_active = 0 WHERE id = :aid AND patient_id = :pid`,
      { aid: req.params.aid, pid: req.params.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

router.delete('/:id/chronic-conditions/:cid', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE patient_chronic_conditions SET is_active = 0 WHERE id = :cid AND patient_id = :pid`,
      { cid: req.params.cid, pid: req.params.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

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
      const isSchemaDrift = /Unknown column|doesn't exist|ER_BAD_FIELD_ERROR|ER_NO_SUCH_TABLE/i.test(msg);
      if (!isSchemaDrift) throw err;

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

async function getBreedsAll(req, res, next) {
  try {
    const { speciesId } = req.query;
    const where = speciesId ? 'WHERE species_id = :sid' : '';
    const rows = await db.query(
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

router.get('/breeds',
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
