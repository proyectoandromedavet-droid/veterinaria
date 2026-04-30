CREATE TABLE IF NOT EXISTS organization_sso_configs (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id   INT UNSIGNED NOT NULL,
  provider          ENUM('google','microsoft') NOT NULL,
  client_id         VARCHAR(255) NOT NULL,
  client_secret     VARCHAR(255) NOT NULL,
  issuer            VARCHAR(255) NOT NULL,
  scopes            JSON NULL,
  allowed_domains   JSON NULL,
  default_role      VARCHAR(60) NOT NULL DEFAULT 'read_only',
  default_branch_id INT UNSIGNED NULL,
  auto_provision    TINYINT(1) NOT NULL DEFAULT 1,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_sso_provider (organization_id, provider),
  CONSTRAINT fk_org_sso_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_sso_branch FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_registry_snapshots (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_name VARCHAR(80) NOT NULL,
  service_url  VARCHAR(255) NOT NULL,
  status       VARCHAR(40) NOT NULL DEFAULT 'up',
  metadata_json JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_service_registry_name (service_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
