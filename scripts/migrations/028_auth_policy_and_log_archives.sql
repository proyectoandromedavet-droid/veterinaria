CREATE TABLE IF NOT EXISTS organization_auth_policies (
  organization_id             INT UNSIGNED NOT NULL,
  two_factor_optional_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_enforced         TINYINT(1) NOT NULL DEFAULT 0,
  updated_by                  INT UNSIGNED NULL,
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id),
  CONSTRAINT fk_org_auth_policy_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_auth_policy_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS audit_log_immutable_archive (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at     DATETIME NOT NULL,
  org_id         INT UNSIGNED NULL,
  audit_log_id   BIGINT UNSIGNED NULL,
  payload_json   JSON NOT NULL,
  prev_hash      VARCHAR(64) NULL,
  entry_hash     VARCHAR(64) NOT NULL,
  export_status  VARCHAR(32) NOT NULL DEFAULT 'archived',
  PRIMARY KEY (id, created_at),
  KEY idx_alia_org_created (org_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  PARTITION p202603 VALUES LESS THAN (202604),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);

CREATE TABLE IF NOT EXISTS notification_logs_archive (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at      DATETIME NOT NULL,
  branch_id       INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NULL,
  client_id       INT UNSIGNED NULL,
  channel         VARCHAR(32) NOT NULL,
  title           VARCHAR(200) NULL,
  body            TEXT NULL,
  status          VARCHAR(32) NOT NULL,
  error_message   TEXT NULL,
  external_id     VARCHAR(100) NULL,
  deleted_at      DATETIME NULL,
  PRIMARY KEY (id, created_at),
  KEY idx_nla_branch_created (branch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
PARTITION BY RANGE (YEAR(created_at) * 100 + MONTH(created_at)) (
  PARTITION p202601 VALUES LESS THAN (202602),
  PARTITION p202602 VALUES LESS THAN (202603),
  PARTITION p202603 VALUES LESS THAN (202604),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);
