-- 019_plugins.sql
-- Sistema de plugins por organización

CREATE TABLE IF NOT EXISTS org_plugins (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id     INT UNSIGNED NOT NULL,
  plugin_id  VARCHAR(60)  NOT NULL,
  config     JSON,
  is_active  BOOLEAN      DEFAULT TRUE,
  enabled_by INT UNSIGNED NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_plugin (org_id, plugin_id),
  INDEX      idx_org       (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
