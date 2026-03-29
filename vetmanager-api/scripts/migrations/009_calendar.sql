-- ============================================================
-- 009_calendar.sql  —  Google Calendar integration
-- ============================================================

-- Tokens OAuth2 por usuario para Google Calendar
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  user_id       INT           NOT NULL PRIMARY KEY,
  access_token  TEXT          NOT NULL,
  refresh_token TEXT          NULL,
  expiry_date   BIGINT        NULL,         -- ms epoch
  scope         VARCHAR(500)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gct_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columna para guardar el ID del evento en Google Calendar
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'ID del evento en Google Calendar del veterinario asignado';

-- Índice para búsqueda por google_event_id (webhooks de Google)
CREATE INDEX IF NOT EXISTS idx_appointments_google_event
  ON appointments (google_event_id);
