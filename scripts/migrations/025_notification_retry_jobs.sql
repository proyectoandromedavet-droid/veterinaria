-- 025_notification_retry_jobs.sql
-- Cola persistente de reintentos para emails, SMS, WhatsApp y push

CREATE TABLE IF NOT EXISTS notification_retry_jobs (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  channel           ENUM('email','sms','whatsapp','template','push_topic','push_tokens') NOT NULL,
  payload_json      JSON NOT NULL,
  status            ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
  attempt_count     INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts      INT UNSIGNED NOT NULL DEFAULT 5,
  next_attempt_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_attempt_at   DATETIME NULL,
  last_error        VARCHAR(512) NULL,
  created_by        BIGINT UNSIGNED NULL,
  org_id            BIGINT UNSIGNED NULL,
  branch_id         BIGINT UNSIGNED NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_nrj_status_due (status, next_attempt_at),
  INDEX idx_nrj_org (org_id, created_at),
  INDEX idx_nrj_branch (branch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
