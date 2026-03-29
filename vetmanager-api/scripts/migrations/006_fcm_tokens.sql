-- Migración 006: tokens FCM para push notifications

CREATE TABLE IF NOT EXISTS user_fcm_tokens (
  id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED     NOT NULL,
  org_id      INT UNSIGNED     NOT NULL,
  branch_id   INT UNSIGNED     NULL,
  token       VARCHAR(512)     NOT NULL,
  platform    ENUM('web','android','ios') NOT NULL DEFAULT 'web',
  device_name VARCHAR(120)     NULL  COMMENT 'ej: Chrome en Windows, iPhone de Juan',
  is_active   TINYINT(1)       NOT NULL DEFAULT 1,
  last_used_at DATETIME        NULL,
  created_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_fcm_token (token),
  INDEX idx_fcm_user   (user_id, is_active),
  INDEX idx_fcm_branch (branch_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
