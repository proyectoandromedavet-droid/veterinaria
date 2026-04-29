'use strict';

/**
 * Audit middleware — logs every mutating API call to the audit_logs table.
 * Mirrors apipersonal audit trail pattern.
 *
 * Captures: userId, orgId, action, resource, resourceId, method, path,
 *           statusCode, ipAddress, userAgent, requestBody (sanitised), duration
 */

const db = require('./db');

// Fields that should never be stored in audit logs
const REDACT = new Set([
  'password', 'password_hash', 'new_password', 'current_password',
  'refresh_token', 'access_token', 'token', 'secret', 'pin',
  'card_number', 'cvv', 'totp_secret',
]);

function redactSensitive(obj, depth = 0) {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => redactSensitive(v, depth + 1));

  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = REDACT.has(k.toLowerCase()) ? '[REDACTED]' : redactSensitive(v, depth + 1);
  }
  return out;
}

function extractResourceId(path, params) {
  // Try route param first
  if (params?.id)  return String(params.id);
  if (params?.uuid) return String(params.uuid);

  // Fall back to last numeric/uuid segment in path
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last) || /^[0-9a-f-]{36}$/i.test(last)) return last;

  return null;
}

function methodToAction(method) {
  switch (method) {
    case 'POST':   return 'CREATE';
    case 'PUT':
    case 'PATCH':  return 'UPDATE';
    case 'DELETE': return 'DELETE';
    default:       return 'READ';
  }
}

/**
 * Express middleware factory.
 *
 * @param {object} [options]
 * @param {'all'|'mutations'} [options.mode='mutations']  — 'all' logs GETs too
 * @param {string}            [options.resource]          — override resource name
 */
function auditMiddleware(options = {}) {
  const { mode = 'mutations', resource } = options;

  return function audit(req, res, next) {
    const skip = mode === 'mutations' && req.method === 'GET';
    if (skip) return next();

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;

      // Determine resource from path if not provided
      const segments   = req.path.split('/').filter(Boolean);
      const autoRes    = resource || (segments[0] || 'unknown');
      const resourceId = extractResourceId(req.path, req.params);
      const action     = methodToAction(req.method);

      const user    = req.user || {};
      const userId  = user.userId  || null;
      const orgId   = user.orgId   || null;
      const branchId = user.branchId || null;

      const bodySnap = req.body && typeof req.body === 'object'
        ? JSON.stringify(redactSensitive(req.body)).slice(0, 4096)
        : null;

      const entry = {
        user_id:     userId,
        org_id:      orgId,
        branch_id:   branchId,
        action,
        resource:    autoRes,
        resource_id: resourceId,
        method:      req.method,
        path:        req.originalUrl?.slice(0, 512) || req.path,
        status_code: res.statusCode,
        ip_address:  (req.ip || '').replace('::ffff:', '').slice(0, 45),
        user_agent:  (req.headers['user-agent'] || '').slice(0, 512),
        request_id:  req.requestId || req.headers['x-request-id'] || null,
        request_body: bodySnap,
        duration_ms: duration,
        created_at:  new Date(),
      };

      // Fire-and-forget — don't block the response
      writeAuditLog(entry).catch(() => {});
    });

    next();
  };
}

async function writeAuditLog(entry) {
  try {
    await db.query(
      `INSERT INTO audit_logs
         (user_id, org_id, branch_id, action, resource, resource_id,
          method, path, status_code, ip_address, user_agent,
          request_id, request_body, duration_ms, created_at)
       VALUES
         (:user_id, :org_id, :branch_id, :action, :resource, :resource_id,
          :method, :path, :status_code, :ip_address, :user_agent,
          :request_id, :request_body, :duration_ms, :created_at)`,
      entry,
    );
  } catch (_) {
    // Audit write failures must not crash the application
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Convert an array of audit log rows to CSV string.
 * Columns are ordered for readability.
 */
const EXPORT_COLS = [
  'id','created_at','action','resource','resource_id','method','path',
  'status_code','user_id','org_id','branch_id','ip_address','user_agent',
  'request_id','duration_ms','request_body',
];

function rowsToCsv(rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const header = EXPORT_COLS.join(',');
  const lines  = rows.map(r => EXPORT_COLS.map(c => escape(r[c])).join(','));
  return [header, ...lines].join('\n');
}

/**
 * Query and stream audit logs for an org as CSV or JSON.
 *
 * @param {object}    opts
 * @param {number}    opts.orgId
 * @param {string}    [opts.dateFrom]    — ISO date, default 30 days ago
 * @param {string}    [opts.dateTo]      — ISO date, default now
 * @param {string}    [opts.resource]    — filter by resource type
 * @param {string}    [opts.action]      — CREATE | UPDATE | DELETE | READ
 * @param {number}    [opts.userId]      — filter by user
 * @param {'json'|'csv'} [opts.format='json']
 * @param {number}    [opts.limit=10000] — safety cap
 * @returns {Promise<{ rows: object[], format: string }>}
 */
async function exportAuditLogs(opts) {
  const {
    orgId,
    dateFrom = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    dateTo   = new Date().toISOString().slice(0, 10),
    resource,
    action,
    userId,
    format = 'json',
    limit  = 10000,
  } = opts;

  const conditions = [
    'org_id = :orgId',
    'created_at >= :dateFrom',
    'created_at < DATE_ADD(:dateTo, INTERVAL 1 DAY)',
  ];
  const params = { orgId, dateFrom, dateTo, limit: Math.min(parseInt(limit), 10000) };

  if (resource) { conditions.push('resource = :resource'); params.resource = resource; }
  if (action)   { conditions.push('action = :action');     params.action   = action.toUpperCase(); }
  if (userId)   { conditions.push('user_id = :userId');    params.userId   = userId; }

  const rows = await db.query(
    `SELECT ${EXPORT_COLS.join(', ')}
     FROM audit_logs
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT :limit`,
    params
  );

  return { rows, format: format === 'csv' ? 'csv' : 'json' };
}

module.exports = { auditMiddleware, writeAuditLog, redactSensitive, exportAuditLogs, rowsToCsv };
