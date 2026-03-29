-- Migration 016: Tenants table for multi-tenant subdomain resolution
-- Each row maps a subdomain slug to an organization.

CREATE TABLE IF NOT EXISTS tenants (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  org_id      INT UNSIGNED    NOT NULL,
  subdomain   VARCHAR(63)     NOT NULL COMMENT 'slug, e.g. clinic-peludo',
  plan        ENUM('free','basic','pro','enterprise') NOT NULL DEFAULT 'free',
  status      ENUM('active','suspended','cancelled')  NOT NULL DEFAULT 'active',
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_subdomain (subdomain),
  UNIQUE KEY uq_tenant_org      (org_id),
  CONSTRAINT fk_tenant_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Índices (DROP IF EXISTS para ser idempotente con 001_base_schema)
DROP INDEX IF EXISTS idx_tenants_status ON tenants;
CREATE INDEX idx_tenants_status ON tenants (status);
