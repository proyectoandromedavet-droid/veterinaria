-- 026_audit_immutable_and_health.sql
-- Completa auditoria inmutable y columnas modernas de audit_logs

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS org_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS resource VARCHAR(120) NULL AFTER action,
  ADD COLUMN IF NOT EXISTS resource_id VARCHAR(120) NULL AFTER resource,
  ADD COLUMN IF NOT EXISTS method VARCHAR(16) NULL AFTER resource_id,
  ADD COLUMN IF NOT EXISTS path VARCHAR(512) NULL AFTER method,
  ADD COLUMN IF NOT EXISTS status_code SMALLINT NULL AFTER path,
  ADD COLUMN IF NOT EXISTS request_id VARCHAR(64) NULL AFTER user_agent,
  ADD COLUMN IF NOT EXISTS request_body TEXT NULL AFTER request_id,
  ADD COLUMN IF NOT EXISTS duration_ms INT NULL AFTER request_body,
  ADD COLUMN IF NOT EXISTS prev_hash CHAR(64) NULL AFTER duration_ms,
  ADD COLUMN IF NOT EXISTS entry_hash CHAR(64) NULL AFTER prev_hash,
  ADD INDEX IF NOT EXISTS idx_audit_org_created (org_id, created_at),
  ADD INDEX IF NOT EXISTS idx_audit_resource_created (resource, created_at),
  ADD UNIQUE INDEX IF NOT EXISTS uq_audit_entry_hash (entry_hash);

CREATE TABLE IF NOT EXISTS audit_log_immutable (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  audit_log_id  BIGINT UNSIGNED NULL,
  org_id        BIGINT UNSIGNED NULL,
  payload_json  JSON NOT NULL,
  prev_hash     CHAR(64) NULL,
  entry_hash    CHAR(64) NOT NULL,
  export_status ENUM('pending','exported','failed') NOT NULL DEFAULT 'pending',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ali_entry_hash (entry_hash),
  KEY idx_ali_org_created (org_id, created_at),
  KEY idx_ali_status_created (export_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
