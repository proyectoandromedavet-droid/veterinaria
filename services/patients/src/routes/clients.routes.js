'use strict';

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../../../../shared/db');
const R = require('../../../../shared/response');
const gdpr = require('../../../../shared/gdpr');
const { signDocument, verifyDocument, getPublicKeyPem } = require('../../../../shared/digitalSignature');

const router = Router();

function deletedPredicate(cols, alias) {
  return cols.has('deleted_at') ? `${alias}.deleted_at IS NULL` : '1 = 1';
}

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

let _clientSchemaPromise;
async function getClientSchema() {
  if (!_clientSchemaPromise) {
    _clientSchemaPromise = db.query(
      `SELECT TABLE_NAME, COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('clients', 'patients', 'patient_owners')`
    ).then((rows) => {
      const schema = {};
      for (const row of rows) {
        if (!schema[row.TABLE_NAME]) schema[row.TABLE_NAME] = new Set();
        schema[row.TABLE_NAME].add(row.COLUMN_NAME);
      }
      return schema;
    });
  }
  return _clientSchemaPromise;
}

router.get('/', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const parsedPage = Math.max(parseInt(`${page}`, 10) || 1, 1);
    const parsedLimit = Math.min(parseInt(`${limit}`, 10) || 20, 100);
    const offset = (parsedPage - 1) * parsedLimit;
    const branchId = req.user.branchId;
    const schema = await getClientSchema();
    const clientCols = schema.clients || new Set();
    const ownerCols = schema.patient_owners || new Set();
    const activeExpr = clientCols.has('is_active') ? 'c.is_active' : (clientCols.has('active') ? 'c.active' : '1');
    const clientDeleted = deletedPredicate(clientCols, 'c');
    const ownerDeleted = deletedPredicate(ownerCols, 'po');

    let where = `WHERE c.branch_id = :branchId AND ${activeExpr} = TRUE AND ${clientDeleted}`;
    const params = { branchId, limit: parsedLimit, offset };
    if (search) {
      where += ` AND (c.first_name LIKE :s OR c.last_name LIKE :s OR c.email LIKE :s OR c.phone LIKE :s OR c.document_number LIKE :s)`;
      params.s = `%${search}%`;
    }

    const [rows, [{ total }]] = await Promise.all([
      db.query(
        `SELECT c.id, c.first_name, c.last_name, c.email, c.phone,
                c.document_type, c.document_number,
                c.city, c.outstanding_balance, c.created_at,
                COUNT(DISTINCT po.patient_id) AS pet_count
         FROM clients c
         LEFT JOIN patient_owners po ON po.client_id = c.id
           AND po.ownership_type = 'primary'
           AND ${ownerDeleted}
           ${ownerCols.has('active') ? 'AND po.active = 1' : ''}
         ${where}
         GROUP BY c.id
         ORDER BY c.last_name, c.first_name
         LIMIT :limit OFFSET :offset`,
        params
      ),
      db.query(
        `SELECT COUNT(*) AS total
         FROM clients c
         ${where}`,
        search ? { branchId, s: `%${search}%` } : { branchId }
      ),
    ]);

    return R.paginated(res, rows, total, parsedPage, parsedLimit);
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const schema = await getClientSchema();
    const patientCols = schema.patients || new Set();
    const clientCols = schema.clients || new Set();
    const ownerCols = schema.patient_owners || new Set();

    const client = await db.queryOne(
      `SELECT c.*,
              co.name AS country_name,
              cu.code AS currency_code
       FROM clients c
       LEFT JOIN countries co ON c.country_code = co.code
       LEFT JOIN currencies cu ON c.currency_id = cu.id
       WHERE c.id = :id
         AND c.branch_id = :branchId
         AND ${deletedPredicate(clientCols, 'c')}
         ${clientCols.has('organization_id') ? 'AND c.organization_id = :orgId' : ''}`,
      { id: req.params.id, branchId: req.user.branchId, orgId: req.user.orgId }
    );
    if (!client) return R.notFound(res, 'Client not found');

    const chipExpr = patientCols.has('chip_number')
      ? `COALESCE(p.chip_number, ${patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL'})`
      : (patientCols.has('microchip_number') ? 'p.microchip_number' : 'NULL');
    const birthExpr = patientCols.has('birthdate')
      ? `COALESCE(p.birthdate, ${patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL')})`
      : (patientCols.has('birth_date') ? 'p.birth_date' : (patientCols.has('date_of_birth') ? 'p.date_of_birth' : 'NULL'));
    const activeExpr = patientCols.has('is_active') ? 'p.is_active' : (patientCols.has('active') ? 'p.active' : '1');

    const [pets, contacts] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, ${chipExpr} AS chip_number,
                sp.common_name AS species, b.name AS breed, p.sex, ${birthExpr} AS birthdate, ${activeExpr} AS is_active
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND po.client_id = :cid AND ${deletedPredicate(ownerCols, 'po')}
         LEFT JOIN species sp ON p.species_id = sp.id
         LEFT JOIN breeds b ON p.breed_id = b.id
         WHERE ${deletedPredicate(patientCols, 'p')}
         ORDER BY p.name`,
        { cid: req.params.id }
      ),
      db.query(
        `SELECT name, relationship, phone, email, is_primary
         FROM client_emergency_contacts
         WHERE client_id = :cid
           ${clientCols.has('deleted_at') ? 'AND deleted_at IS NULL' : ''}
         ORDER BY is_primary DESC`,
        { cid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...client, pets, emergencyContacts: contacts });
  } catch (e) { next(e); }
});

router.post('/',
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('phone').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const {
        firstName, lastName, email, phone,
        documentType, documentNumber,
        address, city, stateId, countryCode, postalCode,
        currencyId, taxId, notes,
      } = req.body;
      const schema = await getClientSchema();
      const clientCols = schema.clients || new Set();

      // Admin users may have no branchId — fall back to org's first branch
      let branchId = req.user.branchId || null;
      if (!branchId && req.user.orgId) {
        const br = await db.queryOne('SELECT id FROM branches WHERE organization_id = :orgId ORDER BY id LIMIT 1', { orgId: req.user.orgId });
        branchId = br?.id || null;
      }

      const columns = ['branch_id', 'first_name', 'last_name', 'phone'];
      const values = [':branchId', ':fn', ':ln', ':phone'];
      const params = {
        branchId,
        orgId: req.user.orgId,
        fn: firstName,
        ln: lastName,
        email: email || null,
        phone,
        docType: documentType || 'dni',
        docNum: documentNumber || null,
        addr: address || null,
        city: city || null,
        stateId: stateId || null,
        country: countryCode || null,
        postal: postalCode || null,
        curId: currencyId || null,
        taxId: taxId || null,
        notes: notes || null,
      };

      if (clientCols.has('organization_id')) { columns.push('organization_id'); values.push(':orgId'); }
      if (clientCols.has('email')) { columns.push('email'); values.push(':email'); }
      if (clientCols.has('document_type')) { columns.push('document_type'); values.push(':docType'); }
      if (clientCols.has('document_number')) { columns.push('document_number'); values.push(':docNum'); }
      if (clientCols.has('address')) { columns.push('address'); values.push(':addr'); }
      if (clientCols.has('city')) { columns.push('city'); values.push(':city'); }
      if (clientCols.has('state_id')) { columns.push('state_id'); values.push(':stateId'); }
      if (clientCols.has('country_code')) { columns.push('country_code'); values.push(':country'); }
      if (clientCols.has('postal_code')) { columns.push('postal_code'); values.push(':postal'); }
      if (clientCols.has('currency_id')) { columns.push('currency_id'); values.push(':curId'); }
      if (clientCols.has('tax_id')) { columns.push('tax_id'); values.push(':taxId'); }
      if (clientCols.has('notes')) { columns.push('notes'); values.push(':notes'); }
      if (clientCols.has('is_active')) { columns.push('is_active'); values.push('1'); }
      if (clientCols.has('active')) { columns.push('active'); values.push('1'); }

      const [result] = await db.query(
        `INSERT INTO clients (${columns.join(', ')})
         VALUES (${values.join(', ')})`,
        params
      );

      return R.created(res, { id: result.insertId });
    } catch (e) { next(e); }
  }
);

router.put('/:id',
  body('firstName').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  validate,
  async (req, res, next) => {
    try {
      const schema = await getClientSchema();
      const clientCols = schema.clients || new Set();
      const rawMap = {
        firstName: ['first_name'],
        lastName: ['last_name'],
        email: ['email'],
        phone: ['phone'],
        documentType: ['document_type'],
        documentNumber: ['document_number'],
        address: ['address'],
        city: ['city'],
        stateId: ['state_id'],
        countryCode: ['country_code'],
        postalCode: ['postal_code'],
        taxId: ['tax_id'],
        notes: ['notes'],
        isActive: ['is_active', 'active'],
      };

      const sets = [];
      const params = { id: req.params.id, branchId: req.user.branchId, orgId: req.user.orgId };
      for (const [key, value] of Object.entries(req.body)) {
        const targets = rawMap[key] || [];
        for (const column of targets) {
          if (!clientCols.has(column)) continue;
          const paramKey = `${column}_${sets.length}`;
          sets.push(`${column} = :${paramKey}`);
          params[paramKey] = (column === 'is_active' || column === 'active')
            ? (['1', 1, true, 'true'].includes(value) ? 1 : 0)
            : value;
        }
      }
      if (!sets.length) return R.badRequest(res, 'No valid fields to update');

      await db.query(
        `UPDATE clients SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = :id
           AND branch_id = :branchId
           AND ${deletedPredicate(clientCols, 'clients')}
           ${clientCols.has('organization_id') ? 'AND organization_id = :orgId' : ''}`,
        params
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    const schema = await getClientSchema();
    const clientCols = schema.clients || new Set();
    const activeColumn = clientCols.has('is_active') ? 'is_active' : (clientCols.has('active') ? 'active' : null);
    if (!activeColumn) return R.badRequest(res, 'Client schema missing active column');
    const deletedSet = clientCols.has('deleted_at') ? ', deleted_at = NOW()' : '';

    await db.query(
      `UPDATE clients SET ${activeColumn} = FALSE${deletedSet}, updated_at = NOW()
       WHERE id = :id AND branch_id = :branchId
       AND ${deletedPredicate(clientCols, 'clients')}
       ${clientCols.has('organization_id') ? 'AND organization_id = :orgId' : ''}`,
      { id: req.params.id, branchId: req.user.branchId, orgId: req.user.orgId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

router.get('/:id/gdpr/consents', async (req, res, next) => {
  try {
    const consents = await gdpr.getConsents(req.params.id);
    return R.ok(res, consents);
  } catch (e) { next(e); }
});

router.post('/:id/gdpr/consents',
  body('consentType').isIn(['marketing', 'analytics', 'third_party', 'telemedicine', 'photo', 'data_sharing', 'terms', 'privacy']),
  body('granted').isBoolean(),
  async (req, res, next) => {
    try {
      const { consentType, granted, source, version } = req.body;
      const result = await gdpr.recordConsent({
        clientId: req.params.id,
        consentType,
        granted: granted === true || granted === 'true',
        source: source || 'staff',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        version,
      });

      await db.query(
        `INSERT INTO gdpr_audit_trail (client_id, user_id, action, performed_by, ip_address, details)
         VALUES (:cid, NULL, :action, :uid, :ip, :det)`,
        {
          cid: req.params.id,
          action: `consent.${granted ? 'granted' : 'withdrawn'}.${consentType}`,
          uid: req.user.userId,
          ip: req.ip,
          det: JSON.stringify({ consentType, granted, source }),
        }
      ).catch(() => {});

      return R.created(res, result);
    } catch (e) { next(e); }
  }
);

router.delete('/:id/gdpr/consents', async (req, res, next) => {
  try {
    await gdpr.withdrawAllConsents(req.params.id, 'staff');
    return R.noContent(res);
  } catch (e) { next(e); }
});

router.get('/:id/gdpr/export', async (req, res, next) => {
  try {
    const data = await gdpr.exportPersonalData(req.params.id, req.user.orgId);
    await db.query(
      `INSERT INTO gdpr_audit_trail (client_id, user_id, action, performed_by, ip_address)
       VALUES (:cid, NULL, 'access.export', :uid, :ip)`,
      { cid: req.params.id, uid: req.user.userId, ip: req.ip }
    ).catch(() => {});

    const format = req.query.format || 'json';
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="datos-personales-${req.params.id}.json"`);
      return res.send(JSON.stringify(data, null, 2));
    }
    return R.ok(res, data);
  } catch (e) {
    if (e.code === 'CLIENT_NOT_FOUND') return R.notFound(res);
    next(e);
  }
});

router.post('/:id/gdpr/requests',
  body('requestType').isIn(['access', 'erasure', 'portability', 'rectification', 'restriction', 'objection']),
  async (req, res, next) => {
    try {
      const result = await gdpr.createDataRequest({
        clientId: req.params.id,
        requestType: req.body.requestType,
        notes: req.body.notes,
        handledBy: req.user.userId,
      });
      return R.created(res, result);
    } catch (e) { next(e); }
  }
);

router.get('/gdpr/requests', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = ((parseInt(`${page}`, 10) || 1) - 1) * (parseInt(`${limit}`, 10) || 20);
    const conds = ['c.branch_id = :bid'];
    const p = { bid: req.user.branchId, limit: parseInt(`${limit}`, 10) || 20, offset };
    if (status) { conds.push('gdr.status = :status'); p.status = status; }

    const rows = await db.query(
      `SELECT gdr.*, CONCAT(c.first_name,' ',c.last_name) AS client_name, c.email,
              CONCAT(u.first_name,' ',u.last_name) AS handled_by_name
       FROM gdpr_data_requests gdr
       JOIN clients c ON gdr.client_id = c.id
       LEFT JOIN users u ON gdr.handled_by = u.id
       WHERE ${conds.join(' AND ')}
       ORDER BY gdr.due_date ASC, gdr.created_at DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

router.patch('/gdpr/requests/:reqId',
  body('status').isIn(['in_progress', 'completed', 'rejected']),
  async (req, res, next) => {
    try {
      await gdpr.updateDataRequest(req.params.reqId, req.body.status, req.user.userId);
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

router.delete('/:id/gdpr/erase', async (req, res, next) => {
  try {
    const result = await gdpr.anonymizeClient(req.params.id, req.user.orgId, req.user.userId);
    return R.ok(res, result);
  } catch (e) {
    if (e.code === 'CLIENT_NOT_FOUND') return R.notFound(res);
    next(e);
  }
});

router.get('/gdpr/retention', async (req, res, next) => {
  try {
    const candidates = await gdpr.findRetentionCandidates(req.user.orgId);
    return R.ok(res, candidates, { policies: gdpr.getRetentionPolicies() });
  } catch (e) { next(e); }
});

router.get('/signatures/public-key', (_req, res) => {
  const pem = getPublicKeyPem();
  res.setHeader('Content-Type', 'text/plain');
  res.send(pem);
});

router.post('/signatures/verify', async (req, res, next) => {
  try {
    const { document, signature } = req.body;
    if (!document || !signature) return R.badRequest(res, 'document y signature requeridos');
    const result = verifyDocument(document, signature);
    return R.ok(res, result);
  } catch (e) { next(e); }
});

module.exports = router;
