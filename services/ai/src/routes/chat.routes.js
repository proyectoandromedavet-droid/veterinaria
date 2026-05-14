'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');
const {
  db,
  R,
  ai,
  CHAT_SYSTEM_PROMPT,
  requirePerm,
  validate,
  getUser,
  log,
} = require('../ai.common');

const router = Router();

router.post('/',
  requirePerm('ai:use'),
  body('message').isString().trim().notEmpty(),
  body('patientId').optional().isInt({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      const { message, patientId } = req.body;
      const user = getUser(req);

      const [ins] = await db.query(
        `INSERT INTO ai_chat_sessions (org_id, user_id, patient_id, model_provider)
         VALUES (:org, :uid, :pid, :prov)`,
        { org: user.orgId, uid: user.userId, pid: patientId || null, prov: ai.PROVIDER }
      );
      const sessionId = ins.insertId;

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
        { role: 'user', content: message },
      ];
      const response = await ai.complete(messages, { maxTokens: 1024, temperature: 0.5 });

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

router.get('/:sessionId',
  requirePerm('ai:use'),
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

router.post('/:sessionId/messages',
  requirePerm('ai:use'),
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

module.exports = router;
