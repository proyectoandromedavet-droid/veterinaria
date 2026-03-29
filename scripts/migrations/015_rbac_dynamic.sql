-- Migration 015: Dynamic RBAC tables
-- Allows per-org, per-role permission overrides stored in DB.
-- These are synced to Redis cache (TTL 5 min) for fast lookup.

-- ── permissions catalog ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  resource    VARCHAR(64)     NOT NULL COMMENT 'e.g. patients, invoices',
  action      VARCHAR(32)     NOT NULL COMMENT 'e.g. read, create, update, delete, *',
  description VARCHAR(255)    NOT NULL DEFAULT '',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_perm_resource_action (resource, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── role → permissions (base grants, global) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  role_name   VARCHAR(64)     NOT NULL COMMENT 'matches ROLE_PERMISSIONS keys in rbac.js',
  permission_id INT UNSIGNED  NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_perm (role_name, permission_id),
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── org-level overrides (additive/subtractive per tenant) ─────────────────────
CREATE TABLE IF NOT EXISTS org_role_overrides (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  org_id              INT UNSIGNED    NOT NULL,
  role_name           VARCHAR(64)     NOT NULL,
  added_permissions   JSON            NULL COMMENT 'string[] of resource:action; NULL = empty',
  removed_permissions JSON            NULL COMMENT 'string[] of resource:action; NULL = empty',
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_role (org_id, role_name),
  CONSTRAINT fk_oro_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Seed base permission catalog ──────────────────────────────────────────────
INSERT IGNORE INTO permissions (resource, action, description) VALUES
  ('*',               '*',      'All resources and actions (superadmin only)'),
  ('org',             'read',   'View organization settings'),
  ('org',             'update', 'Edit organization settings'),
  ('branches',        '*',      'All branch operations'),
  ('users',           '*',      'All user operations'),
  ('patients',        'read',   'View patients'),
  ('patients',        'create', 'Create patients'),
  ('patients',        'update', 'Update patients'),
  ('patients',        'delete', 'Delete patients'),
  ('clients',         'read',   'View clients'),
  ('clients',         'create', 'Create clients'),
  ('clients',         'update', 'Update clients'),
  ('clients',         'delete', 'Delete clients'),
  ('appointments',    '*',      'All appointment operations'),
  ('medical_records', '*',      'All medical record operations'),
  ('medical_records', 'read',   'View medical records'),
  ('medical_records', 'create', 'Create medical records'),
  ('lab',             '*',      'All lab operations'),
  ('lab',             'read',   'View lab results'),
  ('lab',             'create', 'Create lab orders'),
  ('imaging',         '*',      'All imaging operations'),
  ('imaging',         'read',   'View imaging'),
  ('imaging',         'create', 'Create imaging orders'),
  ('surgery',         '*',      'All surgery operations'),
  ('hospitalization', '*',      'All hospitalization operations'),
  ('hospitalization', 'read',   'View hospitalizations'),
  ('hospitalization', 'update', 'Update hospitalizations'),
  ('vaccinations',    '*',      'All vaccination operations'),
  ('deworming',       '*',      'All deworming operations'),
  ('invoices',        '*',      'All invoice operations'),
  ('invoices',        'read',   'View invoices'),
  ('invoices',        'create', 'Create invoices'),
  ('payments',        '*',      'All payment operations'),
  ('payments',        'create', 'Record payments'),
  ('inventory',       '*',      'All inventory operations'),
  ('telemedicine',    '*',      'All telemedicine operations'),
  ('telemedicine',    'read',   'View telemedicine sessions'),
  ('telemedicine',    'create', 'Create telemedicine sessions'),
  ('telemedicine',    'update', 'Update telemedicine sessions'),
  ('grooming',        '*',      'All grooming operations'),
  ('grooming',        'read',   'View grooming'),
  ('grooming',        'create', 'Create grooming appointments'),
  ('grooming',        'update', 'Update grooming appointments'),
  ('reports',         '*',      'All report operations'),
  ('reports',         'read',   'View reports'),
  ('audit',           'read',   'View audit logs');
