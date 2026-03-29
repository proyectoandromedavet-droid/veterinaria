'use strict';

const { Router } = require('express');
const { body, query, param, validationResult } = require('express-validator');
const db   = require('../../../../shared/db');
const R    = require('../../../../shared/response');
const gdpr = require('../../../../shared/gdpr');

const router = Router();

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

// ── GET /clients ──────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const branchId = req.user.branchId;

    let where = 'WHERE c.branch_id = :branchId AND c.is_active = TRUE';
    const params = { branchId, limit: parseInt(limit), offset: parseInt(offset) };

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
         LEFT JOIN patient_owners po ON po.client_id = c.id AND po.ownership_type = 'primary'
         ${where}
         GROUP BY c.id
         ORDER BY c.last_name, c.first_name
         LIMIT :limit OFFSET :offset`,
        params
      ),
      db.query(`SELECT COUNT(*) AS total FROM clients c ${where}`, { branchId, ...(search && { s: `%${search}%` }) }),
    ]);

    return R.paginated(res, rows, total, page, limit);
  } catch (e) { next(e); }
});

// ── GET /clients/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const client = await db.queryOne(
      `SELECT c.*,
              co.name AS country_name,
              cu.code AS currency_code
       FROM clients c
       LEFT JOIN countries  co ON c.country_code  = co.code
       LEFT JOIN currencies cu ON c.currency_id   = cu.id
       WHERE c.id = :id AND c.branch_id = :branchId`,
      { id: req.params.id, branchId: req.user.branchId }
    );
    if (!client) return R.notFound(res, 'Client not found');

    const [pets, contacts] = await Promise.all([
      db.query(
        `SELECT p.id, p.name, p.chip_number,
                sp.common_name AS species, b.name AS breed, p.sex, p.birthdate, p.is_active
         FROM patients p
         JOIN patient_owners po ON po.patient_id = p.id AND po.client_id = :cid
         LEFT JOIN species sp ON p.species_id = sp.id
         LEFT JOIN breeds  b  ON p.breed_id   = b.id
         ORDER BY p.name`,
        { cid: req.params.id }
      ),
      db.query(
        `SELECT name, relationship, phone, email, is_primary
         FROM client_emergency_contacts WHERE client_id = :cid ORDER BY is_primary DESC`,
        { cid: req.params.id }
      ),
    ]);

    return R.ok(res, { ...client, pets, emergencyContacts: contacts });
  } catch (e) { next(e); }
});

// ── POST /clients ─────────────────────────────────────────────────────────────
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

      const [result] = await db.query(
        `INSERT INTO clients
           (branch_id, first_name, last_name, email, phone,
            document_type, document_number,
            address, city, state_id, country_code, postal_code,
            currency_id, tax_id, notes)
         VALUES
           (:branchId, :fn, :ln, :email, :phone,
            :docType, :docNum,
            :addr, :city, :stateId, :country, :postal,
            :curId, :taxId, :notes)`,
        {
          branchId: req.user.branchId,
          fn: firstName, ln: lastName, email: email || null, phone,
          docType: documentType || 'dni', docNum: documentNumber || null,
          addr: address || null, city: city || null, stateId: stateId || null,
          country: countryCode || null, postal: postalCode || null,
          curId: currencyId || null, taxId: taxId || null, notes: notes || null,
        }
      );

      return R.created(res, { id: result.insertId });
    } catch (e) { next(e); }
  }
);

// ── PUT /clients/:id ──────────────────────────────────────────────────────────
router.put('/:id',
  body('firstName').optional().notEmpty().trim(),
  body('email').optional().isEmail().normalizeEmail(),
  validate,
  async (req, res, next) => {
    try {
      const allowed = [
        'first_name','last_name','email','phone','document_type','document_number',
        'address','city','state_id','country_code','postal_code','tax_id','notes',
      ];
      const map = {
        firstName:'first_name', lastName:'last_name', documentType:'document_type',
        documentNumber:'document_number', stateId:'state_id', countryCode:'country_code',
        postalCode:'postal_code', taxId:'tax_id',
      };

      const sets = [];
      const params = { id: req.params.id, branchId: req.user.branchId };
      for (const [k, v] of Object.entries(req.body)) {
        const col = map[k] || k;
        if (allowed.includes(col)) { sets.push(`${col} = :${col}`); params[col] = v; }
      }
      if (!sets.length) return R.badRequest(res, 'No valid fields to update');

      await db.query(
        `UPDATE clients SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = :id AND branch_id = :branchId`,
        params
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// ── DELETE /clients/:id  (soft delete) ────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await db.query(
      `UPDATE clients SET is_active = FALSE, updated_at = NOW()
       WHERE id = :id AND branch_id = :branchId`,
      { id: req.params.id, branchId: req.user.branchId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ─── GDPR / Ley 25.326 ───────────────────────────────────────────────────────

// GET /clients/:id/gdpr/consents — listar consentimientos
router.get('/:id/gdpr/consents', async (req, res, next) => {
  try {
    const consents = await gdpr.getConsents(req.params.id);
    return R.ok(res, consents);
  } catch (e) { next(e); }
});

// POST /clients/:id/gdpr/consents — registrar consentimiento
router.post('/:id/gdpr/consents',
  body('consentType').isIn(['marketing','analytics','third_party','telemedicine','photo','data_sharing','terms','privacy']),
  body('granted').isBoolean(),
  async (req, res, next) => {
    try {
      const { consentType, granted, source, version } = req.body;
      const result = await gdpr.recordConsent({
        clientId    : req.params.id,
        consentType,
        granted     : granted === true || granted === 'true',
        source      : source || 'staff',
        ip          : req.ip,
        userAgent   : req.headers['user-agent'],
        version,
      });

      // Audit trail
      await db.query(
        `INSERT INTO gdpr_audit_trail (client_id, user_id, action, performed_by, ip_address, details)
         VALUES (:cid, NULL, :action, :uid, :ip, :det)`,
        {
          cid    : req.params.id,
          action : `consent.${granted ? 'granted' : 'withdrawn'}.${consentType}`,
          uid    : req.user.userId,
          ip     : req.ip,
          det    : JSON.stringify({ consentType, granted, source }),
        }
      ).catch(() => {});

      return R.created(res, result);
    } catch (e) { next(e); }
  }
);

// DELETE /clients/:id/gdpr/consents — retirar todos los consentimientos no esenciales
router.delete('/:id/gdpr/consents', async (req, res, next) => {
  try {
    await gdpr.withdrawAllConsents(req.params.id, 'staff');
    return R.noContent(res);
  } catch (e) { next(e); }
});

// GET /clients/:id/gdpr/export — exportar todos los datos personales (ARCO Acceso)
router.get('/:id/gdpr/export', async (req, res, next) => {
  try {
    const data = await gdpr.exportPersonalData(req.params.id, req.user.orgId);

    // Registrar en audit trail
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

// POST /clients/:id/gdpr/requests — crear solicitud ARCO
router.post('/:id/gdpr/requests',
  body('requestType').isIn(['access','erasure','portability','rectification','restriction','objection']),
  async (req, res, next) => {
    try {
      const result = await gdpr.createDataRequest({
        clientId    : req.params.id,
        requestType : req.body.requestType,
        notes       : req.body.notes,
        handledBy   : req.user.userId,
      });
      return R.created(res, result);
    } catch (e) { next(e); }
  }
);

// GET /clients/gdpr/requests — listar solicitudes ARCO del branch
router.get('/gdpr/requests', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['c.branch_id = :bid'];
    const p      = { bid: req.user.branchId, limit: parseInt(limit), offset: parseInt(offset) };
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

// PATCH /clients/gdpr/requests/:reqId — actualizar estado de solicitud
router.patch('/gdpr/requests/:reqId',
  body('status').isIn(['in_progress','completed','rejected']),
  async (req, res, next) => {
    try {
      await gdpr.updateDataRequest(req.params.reqId, req.body.status, req.user.userId);
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

// DELETE /clients/:id/gdpr/erase — anonimizar datos personales (Derecho al Olvido)
router.delete('/:id/gdpr/erase', async (req, res, next) => {
  try {
    // Verificar que hay una solicitud de erasure completada o crear automáticamente
    const result = await gdpr.anonymizeClient(req.params.id, req.user.orgId, req.user.userId);
    return R.ok(res, result);
  } catch (e) {
    if (e.code === 'CLIENT_NOT_FOUND') return R.notFound(res);
    next(e);
  }
});

// GET /clients/gdpr/retention — candidatos a anonimizar por política de retención
router.get('/gdpr/retention', async (req, res, next) => {
  try {
    const candidates = await gdpr.findRetentionCandidates(req.user.orgId);
    return R.ok(res, candidates, { policies: gdpr.getRetentionPolicies() });
  } catch (e) { next(e); }
});

// ─── Firma digital de documentos ──────────────────────────────────────────────

const { signDocument, verifyDocument, getPublicKeyPem } = require('../../../../shared/digitalSignature');

// GET /clients/signatures/public-key — clave pública para verificar firmas
router.get('/signatures/public-key', (_req, res) => {
  const pem = getPublicKeyPem();
  res.setHeader('Content-Type', 'text/plain');
  res.send(pem);
});

// POST /clients/signatures/verify — verificar firma de un documento
router.post('/signatures/verify', async (req, res, next) => {
  try {
    const { document, signature } = req.body;
    if (!document || !signature) return R.badRequest(res, 'document y signature requeridos');
    const result = verifyDocument(document, signature);
    return R.ok(res, result);
  } catch (e) { next(e); }
});

module.exports = router;
