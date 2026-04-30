ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE patient_owners
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE client_emergency_contacts
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patients_deleted_at ON patients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_patient_owners_deleted_at ON patient_owners(deleted_at);
CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at ON appointments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments(deleted_at);

CREATE TABLE IF NOT EXISTS message_logs_archive (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at       DATETIME NOT NULL,
  branch_id        BIGINT UNSIGNED NULL,
  client_id        BIGINT UNSIGNED NULL,
  user_id          BIGINT UNSIGNED NULL,
  channel          VARCHAR(32) NOT NULL,
  recipient        VARCHAR(255) NULL,
  template_name    VARCHAR(120) NULL,
  status           VARCHAR(32) NOT NULL,
  external_id      VARCHAR(191) NULL,
  error_message    TEXT NULL,
  payload_json     JSON NULL,
  PRIMARY KEY (id, created_at),
  KEY idx_message_logs_archive_created (created_at)
)
PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_hist VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);

CREATE TABLE IF NOT EXISTS security_alerts_archive (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at       DATETIME NOT NULL,
  organization_id  BIGINT UNSIGNED NULL,
  user_id          BIGINT UNSIGNED NULL,
  alert_type       VARCHAR(120) NOT NULL,
  severity         VARCHAR(32) NOT NULL,
  status           VARCHAR(32) NOT NULL,
  title            VARCHAR(255) NULL,
  description      TEXT NULL,
  metadata_json    JSON NULL,
  PRIMARY KEY (id, created_at),
  KEY idx_security_alerts_archive_created (created_at)
)
PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_hist VALUES LESS THAN (TO_DAYS('2027-01-01')),
  PARTITION p_future VALUES LESS THAN MAXVALUE
);
