-- 022_dlp.sql
-- Data Loss Prevention: alertas de seguridad

CREATE TABLE IF NOT EXISTS security_alerts (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id           INT UNSIGNED NOT NULL,
  alert_type       VARCHAR(40)  NOT NULL COMMENT 'mass_export|cross_tenant_attempt|suspicious_login|bulk_delete',
  user_id          INT UNSIGNED NULL,
  severity         ENUM('low','medium','high','critical') DEFAULT 'medium',
  details          JSON,
  acknowledged     BOOLEAN      DEFAULT FALSE,
  acknowledged_by  INT UNSIGNED NULL,
  acknowledged_at  DATETIME     NULL,
  created_at       DATETIME     DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_org_type (org_id, alert_type),
  INDEX idx_org      (org_id),
  INDEX idx_created  (created_at),
  INDEX idx_ack      (acknowledged)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
