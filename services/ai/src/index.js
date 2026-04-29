'use strict';

/**
 * services/ai/src/index.js
 * Servicio de IA veterinaria (puerto 4061).
 *
 * Endpoints:
 *   POST /ai/diagnosis                     — diagnóstico diferencial asistido
 *   POST /ai/images/analyze                — análisis de imágenes médicas
 *   POST /ai/chat                          — nueva sesión de chatbot clínico
 *   GET  /ai/chat/:sessionId               — historial de sesión
 *   POST /ai/chat/:sessionId/messages      — continuar conversación
 *   GET  /ai/patients/:patientId/risk      — evaluación de riesgo
 *   GET  /ai/patients/:patientId/risk/history — historial de evaluaciones
 */

const express    = require('express');
const { body, param, validationResult } = require('express-validator');
const db         = require('../../../shared/db');
const R          = require('../../../shared/response');
const ai         = require('../../../shared/ai');
const { computeRiskScores, summarizeRisks } = require('../../../shared/riskEngine');
const { requireInternalSig } = require('../../../shared/internalAuth');
const { hasPermission } = require('../../../shared/rbac');
const { getTableColumns } = require('../../../shared/schemaEngine');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validate(req, res, next) {
  const e = validationResult(req);
  if (!e.isEmpty()) return R.badRequest(res, 'Validation failed', e.array());
  next();
}

function requirePerm(perm) {
  return (req, res, next) => {
    const user  = req.user || getUser(req);
    const roles = user.roles || [];
    if (!user.userId) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    if (hasPermission(roles, perm)) return next();
    return res.status(403).json({ success: false, error: { message: 'Forbidden', required: perm } });
  };
}

function getUser(req) {
  return {
    userId  : req.headers['x-user-id'],
    orgId   : req.headers['x-org-id'],
    branchId: req.headers['x-branch-id'],
    email   : req.headers['x-user-email'],
    roles   : (req.headers['x-user-roles'] || '').split(',').map(r => r.trim()).filter(Boolean),
  };
}

let _schemaCache = new Map();
async function hasColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (_schemaCache.has(key)) return _schemaCache.get(key);
  const rows = await getTableColumns(tableName);
  const columns = new Set(rows.map(r => r.COLUMN_NAME));
  const value = columns.has(columnName);
  _schemaCache.set(key, value);
  return value;
}

async function buildPatientSelect({ requireWeight = false } = {}) {
  const orgColumn = await hasColumn('patients', 'organization_id');
  const weightExpr = await hasColumn('patients', 'weight_kg') ? 'p.weight_kg AS weight' : 'NULL AS weight';
  const bodyConditionExpr = await hasColumn('patients', 'body_condition_score')
    ? 'p.body_condition_score'
    : 'NULL';

  return {
    orgFilter: orgColumn ? 'AND p.organization_id = :org' : '',
    select: `p.id, p.name, p.birthdate, p.sex, ${weightExpr}, p.chip_number,
             ${bodyConditionExpr} AS body_condition_score,
             sp.common_name AS species, br.name AS breed`,
    weightExpr,
  };
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildDiagnosisPrompt(patient, symptoms, anamnesis, recentHistory) {
  const ageText = patient.birthdate
    ? `${Math.floor((Date.now() - new Date(patient.birthdate)) / (365.25 * 86_400_000))} años`
    : 'desconocida';

  return [
    {
      role   : 'system',
      content: 'Sos un asistente de diagnóstico veterinario. Respondé ÚNICAMENTE con JSON válido, sin texto adicional.',
    },
    {
      role   : 'user',
      content: `PACIENTE:
- Especie: ${patient.species || 'desconocida'}
- Raza: ${patient.breed || 'desconocida'}
- Edad: ${ageText}
- Sexo: ${patient.sex || 'desconocido'}
- Peso: ${patient.weight ? patient.weight + ' kg' : 'desconocido'}

MOTIVO DE CONSULTA: ${symptoms.join(', ')}
ANAMNESIS: ${anamnesis || 'No disponible'}
HISTORIA RECIENTE: ${recentHistory || 'Sin registros previos'}

Generá diagnósticos diferenciales en este JSON exacto:
{
  "diagnoses": [
    {
      "name": "nombre del diagnóstico",
      "probability": 0.0,
      "reasoning": "justificación breve",
      "recommended_tests": ["test1"]
    }
  ],
  "urgency": "routine|urgent|emergency",
  "disclaimer": "Este análisis es asistido por IA y no reemplaza el criterio clínico profesional."
}

Máximo 5 diagnósticos ordenados por probabilidad descendente. Terminología veterinaria en español.`,
    },
  ];
}

function buildImagePrompt(imageType, patient, region, clinicalContext) {
  const ageText = patient.birthdate
    ? `${Math.floor((Date.now() - new Date(patient.birthdate)) / (365.25 * 86_400_000))} años`
    : 'desconocida';

  return `Sos un especialista en diagnóstico por imágenes veterinarias. Analizá esta imagen de tipo: ${imageType}.

CONTEXTO CLÍNICO:
- Especie: ${patient.species || 'desconocida'}
- Raza: ${patient.breed || 'desconocida'}
- Edad: ${ageText}
- Región anatómica: ${region || 'no especificada'}
- Motivo del estudio: ${clinicalContext || 'no especificado'}

Respondé ÚNICAMENTE con este JSON:
{
  "findings": ["hallazgo 1", "hallazgo 2"],
  "assessment": "interpretación general",
  "severity": "normal|mild|moderate|severe|critical",
  "recommendations": ["recomendación 1"],
  "limitations": "limitaciones del análisis automático"
}`;
}

const CHAT_SYSTEM_PROMPT = `Sos VetBot, asistente clínico veterinario para profesionales de la salud animal.
Respondés preguntas sobre protocolos clínicos, farmacología veterinaria, diagnósticos diferenciales e interpretación de estudios.
Usás terminología técnica veterinaria en español (Argentina).
Siempre aclarás cuando una decisión clínica requiere evaluación presencial.
No reemplazás el criterio del veterinario tratante.`;

// ─── Express app ──────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));   // 10 MB para imágenes en base64

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai' }));

  app.use((req, _res, next) => {
    req.user = getUser(req);
    next();
  });
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    return requireInternalSig(req, res, next);
  });

  const auth = requirePerm('ai:use');

  // ── POST /ai/diagnosis ─────────────────────────────────────────────────────
  app.post('/ai/diagnosis',
    auth,
    body('patientId').isInt({ min: 1 }),
    body('symptoms').isArray({ min: 1 }),
    body('symptoms.*').isString().trim().notEmpty(),
    body('anamnesis').optional().isString(),
    validate,
    async (req, res, next) => {
      try {
        const { patientId, symptoms, anamnesis, contextLines = 3 } = req.body;
        const user = getUser(req);
        const { select, orgFilter } = await buildPatientSelect();

        // Obtener datos del paciente
        const patient = await db.queryOne(
          `SELECT ${select}
           FROM patients p
           LEFT JOIN species sp ON p.species_id = sp.id
           LEFT JOIN breeds  br ON p.breed_id   = br.id
           WHERE p.id = :pid ${orgFilter}`,
          { pid: patientId, org: user.orgId }
        );
        if (!patient) return R.notFound(res, 'Paciente no encontrado');

        // Historial reciente (últimos N registros médicos)
        const records = await db.query(
          `SELECT mr.created_at, mr.chief_complaint, mr.notes,
                  GROUP_CONCAT(DISTINCT d.diagnosis_name ORDER BY d.is_primary DESC SEPARATOR ', ') AS diagnoses
           FROM medical_records mr
           JOIN patients p ON p.id = mr.patient_id
           LEFT JOIN diagnoses d ON d.medical_record_id = mr.id
           WHERE mr.patient_id = :pid AND p.organization_id = :org
           GROUP BY mr.id, mr.created_at, mr.chief_complaint, mr.notes
           ORDER BY mr.created_at DESC LIMIT :n`,
          { pid: patientId, org: user.orgId, n: contextLines }
        );
        const recentHistory = records.length
          ? records.map(r => {
              const when = r.created_at?.toISOString?.().slice(0, 10) ?? '';
              const diagnoses = r.diagnoses || 'N/A';
              const notes = r.notes || 'N/A';
              return `[${when}] Motivo: ${r.chief_complaint || 'N/A'} | Dx: ${diagnoses} | Notas: ${notes}`;
            }).join('\n')
          : null;

        // Llamar al modelo de IA
        const messages = buildDiagnosisPrompt(patient, symptoms, anamnesis, recentHistory);
        const raw      = await ai.complete(messages, { json: true, maxTokens: 1500, temperature: 0.2 });

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { parsed = { diagnoses: [], urgency: 'routine', disclaimer: raw, parseError: true }; }

        // Guardar sugerencia en DB
        const [ins] = await db.query(
          `INSERT INTO ai_diagnosis_suggestions
             (patient_id, org_id, symptoms_json, anamnesis, diagnoses_json, urgency, model_provider, requested_by)
           VALUES (:pid, :org, :symp, :anamnesis, :dx, :urgency, :prov, :uid)`,
          {
            pid      : patientId,
            org      : user.orgId,
            symp     : JSON.stringify(symptoms),
            anamnesis: anamnesis || null,
            dx       : JSON.stringify(parsed.diagnoses || []),
            urgency  : parsed.urgency || 'routine',
            prov     : ai.PROVIDER,
            uid      : user.userId,
          }
        ).catch(() => [{ insertId: null }]);

        return R.ok(res, { id: ins.insertId, patient: { id: patient.id, name: patient.name }, ...parsed });
      } catch (e) { next(e); }
    }
  );

  // ── POST /ai/images/analyze ────────────────────────────────────────────────
  app.post('/ai/images/analyze',
    auth,
    body('patientId').isInt({ min: 1 }),
    body('imageType').isIn(['xray','ultrasound','blood_smear','cytology','histology','fundoscopy','ecg','other']),
    body('imageUrl').optional().isURL(),
    body('imageBase64').optional().isString(),
    body('region').optional().isString(),
    body('clinicalContext').optional().isString(),
    validate,
    async (req, res, next) => {
      try {
        const { patientId, imageType, imageUrl, imageBase64, region, clinicalContext, labResultId } = req.body;
        const user = getUser(req);

        if (!imageUrl && !imageBase64) return R.badRequest(res, 'Se requiere imageUrl o imageBase64');

        const patient = await db.queryOne(
          `SELECT p.id, p.name, p.birthdate, p.sex, p.weight_kg AS weight,
                  sp.common_name AS species, br.name AS breed
           FROM patients p
           LEFT JOIN species sp ON p.species_id = sp.id
           LEFT JOIN breeds  br ON p.breed_id   = br.id
           WHERE p.id = :pid AND p.organization_id = :org`,
          { pid: patientId, org: user.orgId }
        );
        if (!patient) return R.notFound(res, 'Paciente no encontrado');

        const prompt      = buildImagePrompt(imageType, patient, region, clinicalContext);
        const imageSource = imageUrl || imageBase64;
        const rawAnalysis = await ai.analyzeImage(imageSource, prompt);

        let parsed;
        try { parsed = JSON.parse(rawAnalysis); }
        catch { parsed = { findings: [], assessment: rawAnalysis, severity: 'unknown', recommendations: [], parseError: true }; }

        // Guardar análisis
        const [ins] = await db.query(
          `INSERT INTO ai_image_analyses
             (patient_id, org_id, lab_result_id, image_type, region, severity,
              findings_json, assessment, recommendations_json, model_provider, requested_by)
           VALUES (:pid, :org, :labId, :type, :region, :sev, :findings, :assess, :recs, :prov, :uid)`,
          {
            pid     : patientId,
            org     : user.orgId,
            labId   : labResultId || null,
            type    : imageType,
            region  : region || null,
            sev     : parsed.severity || 'unknown',
            findings: JSON.stringify(parsed.findings || []),
            assess  : parsed.assessment || '',
            recs    : JSON.stringify(parsed.recommendations || []),
            prov    : ai.PROVIDER,
            uid     : user.userId,
          }
        ).catch(() => [{ insertId: null }]);

        return R.ok(res, { id: ins.insertId, patient: { id: patient.id, name: patient.name }, ...parsed });
      } catch (e) { next(e); }
    }
  );

  // ── POST /ai/chat  (nueva sesión) ──────────────────────────────────────────
  app.post('/ai/chat',
    auth,
    body('message').isString().trim().notEmpty(),
    body('patientId').optional().isInt({ min: 1 }),
    validate,
    async (req, res, next) => {
      try {
        const { message, patientId } = req.body;
        const user = getUser(req);

        // Crear sesión
        const [ins] = await db.query(
          `INSERT INTO ai_chat_sessions (org_id, user_id, patient_id, model_provider)
           VALUES (:org, :uid, :pid, :prov)`,
          { org: user.orgId, uid: user.userId, pid: patientId || null, prov: ai.PROVIDER }
        );
        const sessionId = ins.insertId;

        // Contexto del paciente si se proporcionó
        let patientContext = '';
        if (patientId) {
        const p = await db.queryOne(
            `SELECT p.name, p.birthdate, sp.common_name AS species, br.name AS breed, p.sex, p.weight_kg AS weight
             FROM patients p
             LEFT JOIN species sp ON p.species_id = sp.id
             LEFT JOIN breeds  br ON p.breed_id   = br.id
             WHERE p.id = :pid AND p.organization_id = :org`, { pid: patientId, org: user.orgId }
          );
          if (p) {
            const age = p.birthdate ? Math.floor((Date.now() - new Date(p.birthdate)) / (365.25 * 86_400_000)) : null;
            patientContext = `\n\nPACIENTE EN CONTEXTO: ${p.name} | ${p.species || ''} ${p.breed || ''} | ${age ? age + ' años' : ''} | Sexo: ${p.sex || 'N/A'} | Peso: ${p.weight ? p.weight + 'kg' : 'N/A'}`;
          }
        }

        const messages = [
          { role: 'system', content: CHAT_SYSTEM_PROMPT + patientContext },
          { role: 'user',   content: message },
        ];
        const response = await ai.complete(messages, { maxTokens: 1024, temperature: 0.5 });

        // Guardar mensajes
        await db.query(
          `INSERT INTO ai_chat_messages (session_id, role, content) VALUES
           (:sid, 'user', :userMsg), (:sid, 'assistant', :aiMsg)`,
          { sid: sessionId, userMsg: message, aiMsg: response }
        );
        await db.query(
          `UPDATE ai_chat_sessions SET updated_at=NOW(), message_count=message_count+2 WHERE id=:sid`,
          { sid: sessionId }
        );

        return R.created(res, { sessionId, response });
      } catch (e) { next(e); }
    }
  );

  // ── GET /ai/chat/:sessionId ────────────────────────────────────────────────
  app.get('/ai/chat/:sessionId',
    auth,
    param('sessionId').isInt({ min: 1 }),
    validate,
    async (req, res, next) => {
      try {
        const user = getUser(req);
        const session = await db.queryOne(
          `SELECT s.*, p.name AS patient_name FROM ai_chat_sessions s
           LEFT JOIN patients p ON s.patient_id = p.id
           WHERE s.id = :sid AND s.org_id = :org`,
          { sid: req.params.sessionId, org: user.orgId }
        );
        if (!session) return R.notFound(res, 'Sesión no encontrada');

        const messages = await db.query(
          `SELECT id, role, content, created_at FROM ai_chat_messages
           WHERE session_id = :sid ORDER BY id ASC`,
          { sid: session.id }
        );
        return R.ok(res, { session, messages });
      } catch (e) { next(e); }
    }
  );

  // ── POST /ai/chat/:sessionId/messages ─────────────────────────────────────
  app.post('/ai/chat/:sessionId/messages',
    auth,
    param('sessionId').isInt({ min: 1 }),
    body('message').isString().trim().notEmpty(),
    validate,
    async (req, res, next) => {
      try {
        const user = getUser(req);
        const session = await db.queryOne(
          `SELECT * FROM ai_chat_sessions WHERE id = :sid AND org_id = :org`,
          { sid: req.params.sessionId, org: user.orgId }
        );
        if (!session) return R.notFound(res, 'Sesión no encontrada');

        // Cargar historial (últimos 20 mensajes para no exceder contexto)
        const history = await db.query(
          `SELECT role, content FROM ai_chat_messages
           WHERE session_id = :sid ORDER BY id DESC LIMIT 20`,
          { sid: session.id }
        );
        history.reverse();

        const messages = [
          { role: 'system', content: CHAT_SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: req.body.message },
        ];
        const response = await ai.complete(messages, { maxTokens: 1024, temperature: 0.5 });

        await db.query(
          `INSERT INTO ai_chat_messages (session_id, role, content) VALUES
           (:sid, 'user', :userMsg), (:sid, 'assistant', :aiMsg)`,
          { sid: session.id, userMsg: req.body.message, aiMsg: response }
        );
        await db.query(
          `UPDATE ai_chat_sessions SET updated_at=NOW(), message_count=message_count+2 WHERE id=:sid`,
          { sid: session.id }
        );

        return R.ok(res, { response });
      } catch (e) { next(e); }
    }
  );

  // ── GET /ai/patients/:patientId/risk ───────────────────────────────────────
  app.get('/ai/patients/:patientId/risk',
    auth,
    param('patientId').isInt({ min: 1 }),
    validate,
    async (req, res, next) => {
      try {
        const user = getUser(req);
        const { patientId } = req.params;

        // Datos del paciente
        const patient = await db.queryOne(
          `SELECT p.id, p.name, p.birthdate, p.sex, p.weight_kg AS weight,
                  sp.common_name AS species, br.name AS breed
           FROM patients p
           LEFT JOIN species sp ON p.species_id = sp.id
           LEFT JOIN breeds  br ON p.breed_id   = br.id
           WHERE p.id = :pid AND p.organization_id = :org`,
          { pid: patientId, org: user.orgId }
        );
        if (!patient) return R.notFound(res, 'Paciente no encontrado');

        // Vacunas vencidas
        const today = new Date().toISOString().slice(0, 10);
        const [{ overdueCount }] = await db.query(
          `SELECT COUNT(*) AS overdueCount FROM vaccinations
           WHERE patient_id = :pid AND next_due_date < :today AND is_active = TRUE`,
          { pid: patientId, today }
        ).catch(() => [{ overdueCount: 0 }]);

        // Último control
        const lastRecord = await db.queryOne(
          `SELECT MAX(created_at) AS lastCheckup FROM medical_records WHERE patient_id = :pid`,
          { pid: patientId }
        );

        // Condiciones crónicas (diagnósticos recurrentes o marcados como crónicos)
        const chronicRows = await db.query(
          `SELECT DISTINCT d.diagnosis_name AS diagnosis
           FROM medical_records mr
           JOIN patients p ON p.id = mr.patient_id
           JOIN diagnoses d ON d.medical_record_id = mr.id
           WHERE mr.patient_id = :pid AND p.organization_id = :org
           ORDER BY mr.created_at DESC LIMIT 20`,
          { pid: patientId, org: user.orgId }
        ).catch(() => []);
        const chronicConditions = chronicRows.map(r => r.diagnosis).filter(Boolean);

        // Calcular riesgo
        const history = {
          overdueVaccinations: parseInt(overdueCount) || 0,
          lastCheckup        : lastRecord?.lastCheckup || null,
          chronicConditions,
        };
        const riskResult = computeRiskScores(patient, history);
        const summary    = summarizeRisks(riskResult);

        // Guardar evaluación
        await db.query(
          `INSERT INTO ai_risk_assessments
             (patient_id, org_id, overall_level, risks_json, recommendations_json, history_snapshot_json)
           VALUES (:pid, :org, :level, :risks, :recs, :snap)`,
          {
            pid  : patientId,
            org  : user.orgId,
            level: riskResult.overallLevel,
            risks: JSON.stringify(riskResult.risks),
            recs : JSON.stringify(summary.recommendations),
            snap : JSON.stringify({ overdueVaccinations: history.overdueVaccinations, lastCheckup: history.lastCheckup }),
          }
        ).catch(() => {});

        return R.ok(res, {
          patient  : { id: patient.id, name: patient.name, species: patient.species, breed: patient.breed },
          ...riskResult,
          ...summary,
        });
      } catch (e) { next(e); }
    }
  );

  // ── GET /ai/patients/:patientId/risk/history ───────────────────────────────
  app.get('/ai/patients/:patientId/risk/history',
    auth,
    param('patientId').isInt({ min: 1 }),
    validate,
    async (req, res, next) => {
      try {
        const user = getUser(req);
        const rows = await db.query(
          `SELECT id, overall_level, risks_json, recommendations_json, computed_at
           FROM ai_risk_assessments
           WHERE patient_id = :pid AND org_id = :org
           ORDER BY computed_at DESC LIMIT 20`,
          { pid: req.params.patientId, org: user.orgId }
        );
        return R.ok(res, rows);
      } catch (e) { next(e); }
    }
  );

  // Error handler
  app.use((err, _req, res, _next) => {
    console.error('[AI service]', err);
    if (err.code === 'AI_API_ERROR') {
      return res.status(502).json({ success: false, error: { message: 'Error al consultar el modelo de IA', details: err.message } });
    }
    res.status(500).json({ success: false, error: { message: err.message } });
  });

  return app;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const PORT = process.env.PORT || 4061;
  const app  = buildApp();
  app.listen(PORT, () => console.log(`[AI service] Puerto ${PORT} — proveedor: ${ai.PROVIDER}`));
}

module.exports = { buildApp };
