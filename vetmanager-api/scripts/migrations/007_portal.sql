-- Migración 007: Portal de dueños de mascotas

-- Columnas de portal en la tabla clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(255) NULL COMMENT 'Hash contraseña del portal de dueños' AFTER email,
  ADD COLUMN IF NOT EXISTS portal_active TINYINT(1) NOT NULL DEFAULT 1 AFTER portal_password_hash;

-- client_id en notification_logs (para notificaciones de dueños)
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS client_id INT UNSIGNED NULL COMMENT 'Si la notif es para un dueño (portal)' AFTER user_id;

-- created_by_portal en appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS created_by_portal TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si fue creada desde el portal' AFTER notes,
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL AFTER created_by_portal;

CREATE INDEX IF NOT EXISTS idx_clients_email_portal ON clients(email, portal_password_hash(10));
CREATE INDEX IF NOT EXISTS idx_notification_logs_client ON notification_logs(client_id);
