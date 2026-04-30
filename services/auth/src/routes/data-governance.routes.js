'use strict';
/**
 * Data Governance API — gestión de políticas de retención por org.
 *
 * GET  /admin/data-governance/policies           → listar políticas del org
 * POST /admin/data-governance/policies           → crear/actualizar política
 * GET  /admin/data-governance/classification     → ver clasificación de datos
 * POST /admin/data-governance/enforce            → ejecutar enforcement manual
 * GET  /admin/data-governance/report             → reporte de cumplimiento
 */

const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const db     = require('../../../../shared/db');
const logger = require('../../../../shared/logger');

const router = Router();

const VALID_DATA_TYPES = [
  'clients', 'medical_records', 'audit_logs', 'appointments',
  'lab_results', 'invoices', 'patients', 'staff',
];

const DEFAULT_RETENTION = {
  clients:         { days: 3650,  action: 'anonymize' }, // 10 años
  medical_records: { days: 3650,  action: 'archive'   }, // 10 años (legal)
  audit_logs:      { days: 365,   action: 'delete'    }, // 1 año
  appointments:    { days: 1825,  action: 'archive'   }, // 5 años
  lab_results:     { days: 3650,  action: 'archive'   }, // 10 años
  invoices:        { days: 3650,  action: 'archive'   }, // 10 años (fiscal)
  patients:        { days: 3650,  action: 'anonymize' },
  staff:           { days: 1825,  action: 'anonymize' },
};

function adminOnly(req, res, next) {
  const roles = (req.headers['x-user-roles'] || '').split(',').map(r => r.trim());
  if (roles.includes('superadmin') || roles.includes('org_admin')) return next();
  return res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'RBAC_001' } });
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, error: { message: 'Validation failed', details: errors.array() } });
  next();
}

async function getTableColumns(tableName) {
  const rows = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName`,
    { tableName },
  );
  return new Set(rows.map((row) => row.COLUMN_NAME));
}

function deletedSet(columns) {
  return columns.has('deleted_at') ? ', deleted_at = NOW()' : '';
}

function activePredicate(columns, alias = '') {
  const prefix = alias ? `${alias}.` : '';
  if (columns.has('is_active')) return `${prefix}is_active = 1`;
  if (columns.has('active')) return `${prefix}active = 1`;
  return '1 = 1';
}

router.use(adminOnly);

// GET /admin/data-governance/policies
router.get('/policies', async (req, res, next) => {
  try {
    const orgId = req.headers['x-org-id'];
    const saved = await db.query(
      'SELECT * FROM data_retention_policies WHERE org_id = :orgId',
      { orgId },
    );

    // Merge con defaults para tipos no configurados
    const byType = Object.fromEntries(saved.map(r => [r.data_type, r]));
    const policies = VALID_DATA_TYPES.map(type => ({
      data_type:      type,
      retention_days: byType[type]?.retention_days ?? DEFAULT_RETENTION[type]?.days ?? 365,
      action:         byType[type]?.action         ?? DEFAULT_RETENTION[type]?.action ?? 'anonymize',
      is_active:      byType[type]?.is_active       ?? true,
      is_custom:      !!byType[type],
      id:             byType[type]?.id,
    }));

    res.json({ success: true, data: policies });
  } catch (err) { next(err); }
});

// POST /admin/data-governance/policies
router.post('/policies',
  body('data_type').isIn(VALID_DATA_TYPES),
  body('retention_days').isInt({ min: 30, max: 36500 }),
  body('action').isIn(['anonymize', 'delete', 'archive']),
  validate,
  async (req, res, next) => {
    try {
      const orgId    = req.headers['x-org-id'];
      const userId   = req.headers['x-user-id'];
      const { data_type, retention_days, action } = req.body;

      await db.query(
        `INSERT INTO data_retention_policies (org_id, data_type, retention_days, action, created_by)
         VALUES (:orgId, :data_type, :retention_days, :action, :userId)
         ON DUPLICATE KEY UPDATE retention_days = :retention_days, action = :action, updated_at = NOW()`,
        { orgId, data_type, retention_days, action, userId },
      );

      logger.info('[data-governance] Policy updated', { orgId, data_type, retention_days, action });
      res.json({ success: true, message: `Retention policy for '${data_type}' updated` });
    } catch (err) { next(err); }
  },
);

// GET /admin/data-governance/classification
router.get('/classification', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT table_name, field_name, classification, notes FROM data_classification_registry ORDER BY table_name, classification',
      {},
    );

    // Agrupar por tabla
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.table_name]) grouped[row.table_name] = [];
      grouped[row.table_name].push({
        field:          row.field_name,
        classification: row.classification,
        notes:          row.notes,
      });
    }

    res.json({ success: true, data: grouped });
  } catch (err) { next(err); }
});

// POST /admin/data-governance/enforce — enforcement manual por org
router.post('/enforce', async (req, res, next) => {
  try {
    const orgId    = req.headers['x-org-id'];
    const { data_type } = req.body; // opcional: tipo específico o todos

    const saved = await db.query(
      'SELECT * FROM data_retention_policies WHERE org_id = :orgId AND is_active = TRUE',
      { orgId },
    );

    const policies = saved.length > 0 ? saved : VALID_DATA_TYPES.map(type => ({
      data_type: type,
      retention_days: DEFAULT_RETENTION[type]?.days || 365,
      action: DEFAULT_RETENTION[type]?.action || 'anonymize',
    }));

    const toProcess = data_type
      ? policies.filter(p => p.data_type === data_type)
      : policies;

    const results = [];

    for (const policy of toProcess) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retention_days);
        const cutoff = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');

        let affected = 0;

        if (policy.action === 'delete' && policy.data_type === 'audit_logs') {
          const result = await db.query(
            'DELETE FROM audit_logs WHERE org_id = :orgId AND created_at < :cutoff LIMIT 1000',
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        } else if (policy.action === 'anonymize' && policy.data_type === 'clients') {
          const clientCols = await getTableColumns('clients');
          const result = await db.query(
            `UPDATE clients SET
               ${clientCols.has('first_name') ? "first_name = CONCAT('ANON-', id)," : ''}
               ${clientCols.has('last_name') ? "last_name = 'REDACTED'," : ''}
               email = CONCAT('anon-', id, '@redacted.local'),
               phone = NULL,
               ${clientCols.has('document_number') ? 'document_number = NULL,' : ''}
               ${clientCols.has('tax_id') ? 'tax_id = NULL,' : ''}
               address = NULL,
               ${clientCols.has('notes') ? 'notes = NULL,' : ''}
               ${clientCols.has('is_anonymized') ? 'is_anonymized = 1,' : ''}
               updated_at = NOW()
             WHERE org_id = :orgId AND updated_at < :cutoff
               AND ${activePredicate(clientCols)}
               ${clientCols.has('is_anonymized') ? 'AND is_anonymized = 0' : ''}
             LIMIT 100`,
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        } else if (policy.action === 'archive' && policy.data_type === 'appointments') {
          const cols = await getTableColumns('appointments');
          const result = await db.query(
            `UPDATE appointments
             SET ${cols.has('status') ? "status = 'archived'," : ''}
                 updated_at = NOW()
                 ${deletedSet(cols)}
             WHERE organization_id = :orgId
               AND updated_at < :cutoff
               AND ${activePredicate(cols)}
             LIMIT 500`,
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        } else if (policy.action === 'anonymize' && policy.data_type === 'patients') {
          const cols = await getTableColumns('patients');
          const result = await db.query(
            `UPDATE patients
             SET name = CONCAT('Paciente ', id),
                 ${cols.has('chip_number') ? 'chip_number = NULL,' : ''}
                 ${cols.has('microchip_number') ? 'microchip_number = NULL,' : ''}
                 ${cols.has('tattoo_number') ? 'tattoo_number = NULL,' : ''}
                 ${cols.has('tattoo_code') ? 'tattoo_code = NULL,' : ''}
                 ${cols.has('passport_number') ? 'passport_number = NULL,' : ''}
                 ${cols.has('photo_url') ? 'photo_url = NULL,' : ''}
                 ${cols.has('notes') ? 'notes = NULL,' : ''}
                 updated_at = NOW()
             WHERE organization_id = :orgId
               AND updated_at < :cutoff
               AND ${activePredicate(cols)}
             LIMIT 200`,
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        } else if (policy.action === 'anonymize' && policy.data_type === 'staff') {
          const cols = await getTableColumns('users');
          const result = await db.query(
            `UPDATE users
             SET first_name = CONCAT('STAFF-', id),
                 last_name = 'REDACTED',
                 email = CONCAT('staff-', id, '@redacted.local'),
                 ${cols.has('phone') ? 'phone = NULL,' : ''}
                 updated_at = NOW()
                 ${deletedSet(cols)}
             WHERE organization_id = :orgId
               AND updated_at < :cutoff
               AND ${activePredicate(cols)}
             LIMIT 200`,
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        } else if (policy.action === 'archive' && policy.data_type === 'invoices') {
          const cols = await getTableColumns('invoices');
          const result = await db.query(
            `UPDATE invoices
             SET ${cols.has('status') ? "status = 'archived'," : ''}
                 updated_at = NOW()
                 ${deletedSet(cols)}
             WHERE org_id = :orgId
               AND updated_at < :cutoff
               AND ${activePredicate(cols)}
             LIMIT 500`,
            { orgId, cutoff },
          );
          affected = result.affectedRows || 0;
        }
        // Para otros tipos: solo loguear (no borrar datos médicos sin confirmación explícita)

        results.push({ data_type: policy.data_type, action: policy.action, affected, cutoff });
        logger.info('[data-governance] Enforcement run', { orgId, data_type: policy.data_type, affected });
      } catch (err) {
        results.push({ data_type: policy.data_type, error: err.message });
      }
    }

    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// GET /admin/data-governance/report
router.get('/report', async (req, res, next) => {
  try {
    const orgId = req.headers['x-org-id'];

    const [policies, classification] = await Promise.all([
      db.query('SELECT * FROM data_retention_policies WHERE org_id = :orgId', { orgId }),
      db.query('SELECT classification, COUNT(*) as count FROM data_classification_registry GROUP BY classification', {}),
    ]);

    const coverageTypes = VALID_DATA_TYPES.length;
    const configuredTypes = policies.filter(p => p.is_active).length;

    res.json({
      success: true,
      data: {
        coverage:      { configured: configuredTypes, total: coverageTypes, pct: Math.round(configuredTypes / coverageTypes * 100) },
        policies:      policies,
        classification: Object.fromEntries(classification.map(r => [r.classification, r.count])),
        defaults:      DEFAULT_RETENTION,
        generatedAt:   new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
