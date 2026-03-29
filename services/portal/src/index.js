'use strict';

require('dotenv').config();

/**
 * Portal de dueños de mascotas — microservicio independiente.
 * Puerto: 4060
 *
 * Auth propia: los clientes NO son staff. Se autentican con la tabla `clients`,
 * tienen su propio JWT con rol 'owner' y solo ven sus propios datos.
 */

const express    = require('express');
const { Router, body, validationResult } = require('express');
const bcrypt     = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db      = require('../../../shared/db');
const jwt     = require('../../../shared/jwt');
const R       = require('../../../shared/response');
const mp      = require('../../../shared/mercadopago');
const { sendPasswordReset, sendWelcome, sendNewDeviceLogin } = require('../../../shared/email');
const { sendTemplate } = require('../../../shared/messaging');
const fcm     = require('../../../shared/fcm');

const app  = express();
const PORT = parseInt(process.env.PORT || '4060');

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Validación ────────────────────────────────────────────────────────────────
const { body: vBody, validationResult: vResult } = require('express-validator');

function validate(req, res, next) {
  const errors = vResult(req);
  if (!errors.isEmpty()) return R.badRequest(res, 'Validación fallida', errors.array());
  next();
}

// ── Auth middleware del portal ────────────────────────────────────────────────
async function portalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return R.unauthorized(res, 'Token requerido');

  try {
    const decoded = jwt.verifyAccess(token);
    if (decoded.role !== 'owner') return R.forbidden(res, 'Acceso exclusivo para dueños');
    req.owner = decoded; // { clientId, email, orgId, role }
    next();
  } catch (_) {
    return R.unauthorized(res, 'Token inválido o expirado');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildOwnerToken(client) {
  return jwt.signAccess({
    jti:      uuidv4(),
    clientId: client.id,
    email:    client.email,
    orgId:    client.organization_id || null,
    role:     'owner',
  });
}

function buildOwnerRefresh(client) {
  return jwt.signRefresh({ clientId: client.id, role: 'owner' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /portal/auth/register
 * Registro de cuenta para dueño de mascota.
 */
app.post('/portal/auth/register',
  vBody('email').isEmail().normalizeEmail(),
  vBody('password').isLength({ min: 10 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/),
  vBody('firstName').notEmpty(),
  vBody('lastName').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { email, password, firstName, lastName, phone, orgId } = req.body;

      // Verificar si ya existe una cuenta de portal
      const existing = await db.queryOne(
        `SELECT id FROM clients WHERE email=:email AND portal_password_hash IS NOT NULL`,
        { email }
      );
      if (existing) return R.conflict(res, 'Ya existe una cuenta con ese email');

      const hash = await bcrypt.hash(password, 12);

      // Si ya existe como cliente sin cuenta de portal → activar
      const client = await db.queryOne(
        `SELECT id, organization_id FROM clients WHERE email=:email LIMIT 1`,
        { email }
      );

      if (client) {
        await db.query(
          `UPDATE clients SET portal_password_hash=:hash, updated_at=NOW() WHERE id=:id`,
          { hash, id: client.id }
        );
        const accessToken  = buildOwnerToken({ ...client });
        const refreshToken = buildOwnerRefresh(client);
        sendWelcome({ to: email, name: firstName, orgName: 'VetManager Pro' }).catch(() => {});
        return R.created(res, { accessToken, refreshToken });
      }

      // Crear cliente nuevo (sin sucursal asignada aún)
      const r = await db.query(
        `INSERT INTO clients (first_name, last_name, email, phone, portal_password_hash, organization_id)
         VALUES (:fn, :ln, :email, :phone, :hash, :orgId)`,
        { fn: firstName, ln: lastName, email, phone: phone||null, hash, orgId: orgId||null }
      );
      const accessToken  = buildOwnerToken({ id: r.insertId, organization_id: orgId||null });
      const refreshToken = buildOwnerRefresh({ id: r.insertId });
      sendWelcome({ to: email, name: firstName, orgName: 'VetManager Pro' }).catch(() => {});
      return R.created(res, { accessToken, refreshToken });
    } catch (e) { next(e); }
  }
);

/**
 * POST /portal/auth/login
 */
app.post('/portal/auth/login',
  vBody('email').isEmail().normalizeEmail(),
  vBody('password').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const client = await db.queryOne(
        `SELECT id, first_name, last_name, email, portal_password_hash, organization_id, is_active
         FROM clients WHERE email=:email`,
        { email }
      );
      if (!client || !client.portal_password_hash)
        return R.unauthorized(res, 'Email o contraseña incorrectos');
      if (!client.is_active)
        return R.forbidden(res, 'Cuenta desactivada');

      const ok = await bcrypt.compare(password, client.portal_password_hash);
      if (!ok) return R.unauthorized(res, 'Email o contraseña incorrectos');

      const accessToken  = buildOwnerToken(client);
      const refreshToken = buildOwnerRefresh(client);

      // Notificar si la IP no fue vista en los últimos 30 días
      const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
      const ua = req.headers['user-agent'] || 'desconocido';
      const seenBefore = await db.queryOne(
        `SELECT 1 FROM login_history
         WHERE user_id = :id AND ip_address = :ip AND success = TRUE
           AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
         LIMIT 1`,
        { id: client.id, ip }
      ).catch(() => true);  // fail-open: don't block login if query fails

      if (!seenBefore) {
        sendNewDeviceLogin({
          to:        client.email,
          name:      client.first_name,
          ip,
          userAgent: ua,
          time:      new Date().toLocaleString('es-AR', { timeZone: process.env.TZ || 'America/Argentina/Buenos_Aires' }),
        }).catch(() => {});
      }

      // Registrar login exitoso
      db.query(
        `INSERT INTO login_history (user_id, ip_address, user_agent, success)
         VALUES (:id, :ip, :ua, TRUE)`,
        { id: client.id, ip, ua }
      ).catch(() => {});

      return R.ok(res, {
        accessToken, refreshToken,
        owner: { id: client.id, name: `${client.first_name} ${client.last_name}`, email: client.email },
      });
    } catch (e) { next(e); }
  }
);

/**
 * POST /portal/auth/refresh
 */
app.post('/portal/auth/refresh',
  vBody('refreshToken').notEmpty(), validate,
  async (req, res, next) => {
    try {
      const decoded = jwt.verifyRefresh(req.body.refreshToken);
      if (decoded.role !== 'owner') return R.unauthorized(res, 'Token inválido');

      const client = await db.queryOne(
        `SELECT id, email, organization_id FROM clients WHERE id=:id AND is_active=1`,
        { id: decoded.clientId }
      );
      if (!client) return R.unauthorized(res, 'Cuenta no encontrada');

      return R.ok(res, {
        accessToken:  buildOwnerToken(client),
        refreshToken: buildOwnerRefresh(client),
      });
    } catch (_) { return R.unauthorized(res, 'Token inválido o expirado'); }
  }
);

/**
 * POST /portal/auth/forgot-password
 */
app.post('/portal/auth/forgot-password',
  vBody('email').isEmail().normalizeEmail(), validate,
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const client = await db.queryOne(`SELECT id FROM clients WHERE email=:email`, { email });

      if (client) {
        const token = jwt.generateOpaqueToken();
        const hash  = jwt.hashToken(token);
        await db.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
           VALUES (:id, :hash, DATE_ADD(NOW(), INTERVAL 1 HOUR))
           ON DUPLICATE KEY UPDATE token_hash=:hash, expires_at=DATE_ADD(NOW(), INTERVAL 1 HOUR), used_at=NULL`,
          { id: client.id, hash }
        );
        sendPasswordReset({ to: email, token, expiresInMinutes: 60 }).catch(() => {});
      }

      return R.ok(res, { message: 'Si ese email existe, recibirá un enlace de recuperación.' });
    } catch (e) { next(e); }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PERFIL DEL DUEÑO
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/me', portalAuth, async (req, res, next) => {
  try {
    const client = await db.queryOne(
      `SELECT id, first_name, last_name, email, phone, address, city,
              document_type, document_number, created_at
       FROM clients WHERE id=:id`,
      { id: req.owner.clientId }
    );
    if (!client) return R.notFound(res, 'Cuenta no encontrada');
    return R.ok(res, client);
  } catch (e) { next(e); }
});

app.put('/portal/me',
  portalAuth,
  vBody('firstName').optional().notEmpty(),
  vBody('lastName').optional().notEmpty(),
  vBody('phone').optional(),
  validate,
  async (req, res, next) => {
    try {
      const { firstName, lastName, phone, address, city } = req.body;
      await db.query(
        `UPDATE clients SET
           first_name=COALESCE(:fn, first_name),
           last_name=COALESCE(:ln, last_name),
           phone=COALESCE(:phone, phone),
           address=COALESCE(:addr, address),
           city=COALESCE(:city, city),
           updated_at=NOW()
         WHERE id=:id`,
        { fn: firstName||null, ln: lastName||null, phone: phone||null, addr: address||null, city: city||null, id: req.owner.clientId }
      );
      return R.noContent(res);
    } catch (e) { next(e); }
  }
);

app.put('/portal/me/password',
  portalAuth,
  vBody('currentPassword').notEmpty(),
  vBody('newPassword').isLength({ min: 8 }).matches(/(?=.*[A-Z])(?=.*[0-9])/),
  validate,
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const client = await db.queryOne(
        `SELECT portal_password_hash FROM clients WHERE id=:id`, { id: req.owner.clientId }
      );
      if (!await bcrypt.compare(currentPassword, client.portal_password_hash))
        return R.badRequest(res, 'Contraseña actual incorrecta');

      await db.query(
        `UPDATE clients SET portal_password_hash=:hash, updated_at=NOW() WHERE id=:id`,
        { hash: await bcrypt.hash(newPassword, 12), id: req.owner.clientId }
      );
      return R.ok(res, { message: 'Contraseña actualizada' });
    } catch (e) { next(e); }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// MASCOTAS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/pets', portalAuth, async (req, res, next) => {
  try {
    const pets = await db.query(
      `SELECT p.id, p.name, p.birth_date, p.sex, p.color, p.microchip_number,
              p.photo_url, sp.common_name AS species, br.name AS breed, p.is_active
       FROM patients p
       JOIN patient_owners po ON po.patient_id = p.id AND po.client_id = :cid
       JOIN species sp ON p.species_id = sp.id
       LEFT JOIN breeds br ON p.breed_id = br.id
       WHERE p.is_active = 1
       ORDER BY p.name`,
      { cid: req.owner.clientId }
    );
    return R.ok(res, pets);
  } catch (e) { next(e); }
});

app.get('/portal/pets/:id', portalAuth, async (req, res, next) => {
  try {
    const pet = await db.queryOne(
      `SELECT p.*, sp.common_name AS species, br.name AS breed
       FROM patients p
       JOIN patient_owners po ON po.patient_id=p.id AND po.client_id=:cid
       JOIN species sp ON p.species_id=sp.id
       LEFT JOIN breeds br ON p.breed_id=br.id
       WHERE p.id=:pid`,
      { cid: req.owner.clientId, pid: req.params.id }
    );
    if (!pet) return R.notFound(res, 'Mascota no encontrada');

    // Alergias
    const allergies = await db.query(
      `SELECT allergen, reaction_type, severity FROM patient_allergies WHERE patient_id=:pid AND is_active=1`,
      { pid: pet.id }
    );

    return R.ok(res, { ...pet, allergies });
  } catch (e) { next(e); }
});

app.get('/portal/pets/:id/medical-history', portalAuth, async (req, res, next) => {
  try {
    // Verificar propiedad
    const owned = await db.queryOne(
      `SELECT 1 FROM patient_owners WHERE patient_id=:pid AND client_id=:cid`,
      { pid: req.params.id, cid: req.owner.clientId }
    );
    if (!owned) return R.forbidden(res, 'Sin acceso a esta mascota');

    const records = await db.query(
      `SELECT mr.id, mr.visit_date, mr.reason_for_visit, mr.status,
              mr.weight_kg, mr.temperature, mr.chief_complaint,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM medical_records mr
       JOIN users u ON mr.attending_vet_id = u.id
       WHERE mr.patient_id=:pid AND mr.status='signed'
       ORDER BY mr.visit_date DESC`,
      { pid: req.params.id }
    );
    return R.ok(res, records);
  } catch (e) { next(e); }
});

app.get('/portal/pets/:id/vaccinations', portalAuth, async (req, res, next) => {
  try {
    const owned = await db.queryOne(
      `SELECT 1 FROM patient_owners WHERE patient_id=:pid AND client_id=:cid`,
      { pid: req.params.id, cid: req.owner.clientId }
    );
    if (!owned) return R.forbidden(res, 'Sin acceso a esta mascota');

    const rows = await db.query(
      `SELECT v.id, v.vaccine_name, v.administered_date, v.next_due_date,
              v.lot_number, v.manufacturer,
              CONCAT(u.first_name,' ',u.last_name) AS applied_by
       FROM vaccinations v
       LEFT JOIN users u ON v.administered_by = u.id
       WHERE v.patient_id=:pid
       ORDER BY v.administered_date DESC`,
      { pid: req.params.id }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

app.get('/portal/pets/:id/prescriptions', portalAuth, async (req, res, next) => {
  try {
    const owned = await db.queryOne(
      `SELECT 1 FROM patient_owners WHERE patient_id=:pid AND client_id=:cid`,
      { pid: req.params.id, cid: req.owner.clientId }
    );
    if (!owned) return R.forbidden(res, 'Sin acceso a esta mascota');

    const rows = await db.query(
      `SELECT p.id, p.prescribed_date, p.medication_name, p.dosage, p.frequency,
              p.duration_days, p.instructions, p.refills_allowed,
              CONCAT(u.first_name,' ',u.last_name) AS prescribed_by
       FROM prescriptions p
       JOIN users u ON p.prescribed_by = u.id
       WHERE p.patient_id=:pid
       ORDER BY p.prescribed_date DESC`,
      { pid: req.params.id }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CITAS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/appointments', portalAuth, async (req, res, next) => {
  try {
    const { status, upcoming, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['i.client_id=:cid'];
    const p      = { cid: req.owner.clientId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status)             { conds.push('a.status=:status'); p.status = status; }
    if (upcoming === 'true') conds.push('a.appointment_date >= NOW()');

    const rows = await db.query(
      `SELECT a.id, a.appointment_date, a.duration_minutes, a.status, a.reason,
              a.appointment_type, a.notes,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name,
              b.name AS clinic_name
       FROM appointments a
       JOIN patients p     ON a.patient_id = p.id
       JOIN species sp     ON p.species_id = sp.id
       JOIN users u        ON a.veterinarian_id = u.id
       JOIN branches b     ON a.branch_id = b.id
       JOIN patient_owners i ON i.patient_id = p.id AND i.client_id=:cid
       WHERE ${conds.join(' AND ')}
       ORDER BY a.appointment_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

app.post('/portal/appointments',
  portalAuth,
  vBody('patientId').isInt(),
  vBody('appointmentDate').isISO8601(),
  vBody('reason').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { patientId, appointmentDate, reason, notes, branchId } = req.body;

      // Verificar propiedad
      const owned = await db.queryOne(
        `SELECT 1 FROM patient_owners WHERE patient_id=:pid AND client_id=:cid`,
        { pid: patientId, cid: req.owner.clientId }
      );
      if (!owned) return R.forbidden(res, 'Sin acceso a esta mascota');

      const r = await db.query(
        `INSERT INTO appointments
           (patient_id, client_id, branch_id, appointment_date, reason, notes, status, appointment_type, created_by_portal)
         VALUES (:pid, :cid, :bid, :date, :reason, :notes, 'requested', 'general', 1)`,
        { pid: patientId, cid: req.owner.clientId, bid: branchId||null, date: appointmentDate, reason, notes: notes||null }
      );

      // Notificar por WhatsApp (fire-and-forget)
      const client = await db.queryOne(`SELECT phone, first_name FROM clients WHERE id=:id`, { id: req.owner.clientId });
      const pet    = await db.queryOne(`SELECT name FROM patients WHERE id=:id`, { id: patientId });
      const branch = branchId ? await db.queryOne(`SELECT name FROM branches WHERE id=:id`, { id: branchId }) : null;

      if (client?.phone) {
        sendTemplate('whatsapp', client.phone, 'appointmentConfirm', {
          ownerName:  client.first_name,
          petName:    pet?.name || 'su mascota',
          date:       new Date(appointmentDate).toLocaleDateString('es-AR'),
          time:       new Date(appointmentDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
          clinicName: branch?.name || 'la clínica',
        }).catch(() => {});
      }

      return R.created(res, { id: r.insertId, message: 'Solicitud de cita enviada. Le confirmaremos a la brevedad.' });
    } catch (e) { next(e); }
  }
);

app.patch('/portal/appointments/:id/cancel', portalAuth, async (req, res, next) => {
  try {
    const apt = await db.queryOne(
      `SELECT a.id, a.status FROM appointments a
       JOIN patient_owners po ON po.patient_id=a.patient_id AND po.client_id=:cid
       WHERE a.id=:id`,
      { id: req.params.id, cid: req.owner.clientId }
    );
    if (!apt) return R.notFound(res, 'Cita no encontrada');
    if (!['requested','confirmed'].includes(apt.status)) return R.conflict(res, 'Esta cita no puede cancelarse');

    await db.query(
      `UPDATE appointments SET status='cancelled', cancellation_reason=:reason, updated_at=NOW() WHERE id=:id`,
      { reason: req.body.reason || 'Cancelado por el dueño', id: apt.id }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FACTURAS Y PAGOS
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/invoices', portalAuth, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conds  = ['i.client_id=:cid'];
    const p      = { cid: req.owner.clientId, limit: parseInt(limit), offset: parseInt(offset) };
    if (status) { conds.push('i.status=:status'); p.status = status; }

    const rows = await db.query(
      `SELECT i.id, i.invoice_number, i.status, i.issued_date, i.due_date,
              i.total_amount, i.paid_amount, cur.code AS currency,
              p.name AS patient_name, b.name AS clinic_name
       FROM invoices i
       JOIN currencies cur ON i.currency_id=cur.id
       LEFT JOIN patients p ON i.patient_id=p.id
       JOIN branches b ON i.branch_id=b.id
       WHERE ${conds.join(' AND ')}
       ORDER BY i.issued_date DESC
       LIMIT :limit OFFSET :offset`,
      p
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

app.get('/portal/invoices/:id', portalAuth, async (req, res, next) => {
  try {
    const inv = await db.queryOne(
      `SELECT i.*, cur.code AS currency, b.name AS clinic_name
       FROM invoices i
       JOIN currencies cur ON i.currency_id=cur.id
       JOIN branches b ON i.branch_id=b.id
       WHERE i.id=:id AND i.client_id=:cid`,
      { id: req.params.id, cid: req.owner.clientId }
    );
    if (!inv) return R.notFound(res, 'Factura no encontrada');

    const items = await db.query(
      `SELECT ii.description, ii.quantity, ii.unit_price, ii.discount_pct, ii.tax_pct,
              (ii.quantity * ii.unit_price) AS subtotal
       FROM invoice_items ii WHERE ii.invoice_id=:id`,
      { id: inv.id }
    );
    return R.ok(res, { ...inv, items });
  } catch (e) { next(e); }
});

/**
 * POST /portal/invoices/:id/pay
 * Genera link de pago MercadoPago para el dueño.
 */
app.post('/portal/invoices/:id/pay', portalAuth, async (req, res, next) => {
  try {
    const inv = await db.queryOne(
      `SELECT i.*, cur.code AS currency, CONCAT(c.first_name,' ',c.last_name) AS client_name, c.email
       FROM invoices i
       JOIN currencies cur ON i.currency_id=cur.id
       JOIN clients c ON i.client_id=c.id
       WHERE i.id=:id AND i.client_id=:cid AND i.status IN ('pending','overdue')`,
      { id: req.params.id, cid: req.owner.clientId }
    );
    if (!inv) return R.notFound(res, 'Factura no encontrada o ya pagada');

    const pref = await mp.createPreference({
      invoiceId:     inv.id,
      invoiceNumber: inv.invoice_number,
      amount:        inv.total_amount - inv.paid_amount,
      currency:      inv.currency,
      payerEmail:    inv.email,
      payerName:     inv.client_name,
      description:   `Factura ${inv.invoice_number}`,
      orgId:         req.owner.orgId,
      branchId:      inv.branch_id,
    });

    return R.ok(res, pref);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICACIONES + FCM
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/notifications', portalAuth, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const rows = await db.query(
      `SELECT id, notification_type, title, message, severity, sent_at, read_at, action_url
       FROM notification_logs
       WHERE client_id=:cid
       ORDER BY sent_at DESC
       LIMIT :limit OFFSET :offset`,
      { cid: req.owner.clientId, limit: parseInt(limit), offset: parseInt(offset) }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

app.patch('/portal/notifications/:id/read', portalAuth, async (req, res, next) => {
  try {
    await db.query(
      `UPDATE notification_logs SET read_at=NOW() WHERE id=:id AND client_id=:cid`,
      { id: req.params.id, cid: req.owner.clientId }
    );
    return R.noContent(res);
  } catch (e) { next(e); }
});

app.post('/portal/fcm/register', portalAuth, async (req, res, next) => {
  try {
    const { token, platform = 'web', deviceName } = req.body;
    if (!token) return R.badRequest(res, 'token requerido');

    await db.query(
      `INSERT INTO user_fcm_tokens (user_id, org_id, token, platform, device_name, is_active, last_used_at)
       VALUES (:uid, :oid, :token, :platform, :device, 1, NOW())
       ON DUPLICATE KEY UPDATE user_id=:uid, is_active=1, last_used_at=NOW()`,
      { uid: req.owner.clientId, oid: req.owner.orgId||0, token, platform, device: deviceName||null }
    );

    await fcm.subscribeToTopic([token], `owner_${req.owner.clientId}`).catch(() => {});
    return R.ok(res, { message: 'Token FCM registrado' });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TELEMEDICINA
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/portal/telemedicine', portalAuth, async (req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT ts.id, ts.session_date, ts.status, ts.session_type, ts.chief_complaint,
              ts.meeting_url, ts.duration_minutes, ts.rating,
              p.name AS patient_name, sp.common_name AS species,
              CONCAT(u.first_name,' ',u.last_name) AS vet_name
       FROM telemedicine_sessions ts
       JOIN patients p     ON ts.patient_id=p.id
       JOIN species sp     ON p.species_id=sp.id
       JOIN users u        ON ts.veterinarian_id=u.id
       JOIN patient_owners po ON po.patient_id=p.id AND po.client_id=:cid
       ORDER BY ts.session_date DESC`,
      { cid: req.owner.clientId }
    );
    return R.ok(res, rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH + ERROR HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'portal', port: PORT }));

app.use((err, _req, res, _next) => {
  console.error('[portal]', err.message);
  res.status(500).json({ success: false, error: { message: 'Error interno del servidor' } });
});

app.listen(PORT, () => console.log(`[portal] running on port ${PORT}`));
