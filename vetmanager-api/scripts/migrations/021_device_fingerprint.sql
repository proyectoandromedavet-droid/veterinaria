-- 021_device_fingerprint.sql
-- Device fingerprint tracking para detección de cambio de dispositivo

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS device_fingerprint VARCHAR(64)  NULL,
  ADD COLUMN IF NOT EXISTS device_trusted     BOOLEAN      DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS security_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED     NOT NULL,
  org_id      INT UNSIGNED     NULL,
  event_type  VARCHAR(40)      NOT NULL COMMENT 'device_change|suspicious_login|mass_export|cross_tenant',
  details     JSON,
  ip_address  VARCHAR(45),
  created_at  DATETIME         DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user    (user_id),
  INDEX idx_org     (org_id),
  INDEX idx_type    (event_type),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
