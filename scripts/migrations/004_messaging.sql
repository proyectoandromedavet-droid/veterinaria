-- Migración 004: tabla de log de mensajes SMS/WhatsApp

CREATE TABLE IF NOT EXISTS message_logs (
  id                   BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  branch_id            INT UNSIGNED     NOT NULL,
  user_id              INT UNSIGNED     NULL,
  channel              ENUM('sms','whatsapp','both') NOT NULL,
  to_number            VARCHAR(30)      NOT NULL,
  template_name        VARCHAR(60)      NULL,
  message_preview      VARCHAR(255)     NULL,
  status               ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  twilio_sid           VARCHAR(50)      NULL,
  error_message        VARCHAR(512)     NULL,
  related_entity_type  VARCHAR(50)      NULL,
  related_entity_id    BIGINT UNSIGNED  NULL,
  sent_at              DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_message_logs_branch  (branch_id, sent_at),
  INDEX idx_message_logs_status  (status),
  INDEX idx_message_logs_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Columna sent_at en reminders (si no existe)
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS sent_at DATETIME NULL COMMENT 'Cuándo se envió el recordatorio por mensajería' AFTER status;
