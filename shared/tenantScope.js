'use strict';

const R = require('./response');

function getTenantContext(req) {
  return {
    orgId: req?.user?.orgId || req?.user?.organization_id || req?.headers?.['x-org-id'] || null,
    branchId: req?.user?.branchId || req?.user?.branch_id || req?.headers?.['x-branch-id'] || null,
  };
}

function scopeParams(req, extra = {}) {
  const { orgId, branchId } = getTenantContext(req);
  return { orgId, branchId, ...extra };
}

function buildOrgScope(alias, column = 'organization_id', paramName = 'orgId') {
  return `${alias}.${column} = :${paramName}`;
}

function buildBranchScope(alias, column = 'branch_id', paramName = 'branchId') {
  return `${alias}.${column} = :${paramName}`;
}

function requireTenantContext({ requireBranch = false } = {}) {
  return (req, res, next) => {
    const { orgId, branchId } = getTenantContext(req);
    if (!orgId) return R.error(res, 403, 'Missing organization scope', null, 'TENANT_001');
    if (requireBranch && !branchId) return R.error(res, 403, 'Missing branch scope', null, 'TENANT_002');
    next();
  };
}

function checkRowTenantAccess(row, req, {
  orgField = 'organization_id',
  branchField = 'branch_id',
  allowSuperadmin = true,
  requireBranch = false,
} = {}) {
  if (!row) return { ok: false, reason: 'resource_missing' };
  if (allowSuperadmin && req?.user?.roles?.includes('superadmin')) return { ok: true };

  const { orgId, branchId } = getTenantContext(req);
  const rowOrgId = row?.[orgField] ?? row?.orgId ?? null;
  const rowBranchId = row?.[branchField] ?? row?.branchId ?? null;

  if (rowOrgId !== null && rowOrgId !== undefined && orgId !== null && orgId !== undefined) {
    if (String(rowOrgId) !== String(orgId)) return { ok: false, reason: 'org_mismatch' };
  }

  if (requireBranch && (branchId === null || branchId === undefined)) {
    return { ok: false, reason: 'missing_branch_scope' };
  }

  if (requireBranch && rowBranchId !== null && rowBranchId !== undefined) {
    if (String(rowBranchId) !== String(branchId)) return { ok: false, reason: 'branch_mismatch' };
  }

  return { ok: true };
}

function enforceRowTenantAccess(row, req, res, options = {}) {
  const result = checkRowTenantAccess(row, req, options);
  if (result.ok) return true;
  const code = result.reason === 'branch_mismatch' ? 'TENANT_004'
    : result.reason === 'missing_branch_scope' ? 'TENANT_002'
      : 'TENANT_003';
  R.error(res, 403, 'Cross-tenant access denied', { reason: result.reason }, code);
  return false;
}

module.exports = {
  getTenantContext,
  scopeParams,
  buildOrgScope,
  buildBranchScope,
  requireTenantContext,
  checkRowTenantAccess,
  enforceRowTenantAccess,
};
