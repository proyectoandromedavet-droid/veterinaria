-- ============================================================
-- 011_webrtc.sql  —  WebRTC rooms, recordings, participants
-- ============================================================

-- Salas de video creadas en el proveedor externo
CREATE TABLE IF NOT EXISTS webrtc_rooms (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id       INT           NOT NULL UNIQUE,
  room_name        VARCHAR(120)  NOT NULL UNIQUE,
  provider         ENUM('daily','twilio','whereby','builtin') NOT NULL DEFAULT 'daily',
  provider_room_id VARCHAR(255)  NULL,
  room_url         TEXT          NULL,          -- URL para guests
  host_url         TEXT          NULL,          -- URL para el host (Whereby)
  status           ENUM('created','active','ended','expired') NOT NULL DEFAULT 'created',
  expires_at       TIMESTAMP     NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wr_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Participantes activos / históricos de una sala
CREATE TABLE IF NOT EXISTS webrtc_participants (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id      INT           NOT NULL,
  identity     VARCHAR(120)  NOT NULL,          -- email o userId
  role         ENUM('host','guest')             NOT NULL DEFAULT 'guest',
  joined_at    TIMESTAMP     NULL,
  left_at      TIMESTAMP     NULL,
  duration_sec INT           NULL,
  CONSTRAINT fk_wp_room FOREIGN KEY (room_id) REFERENCES webrtc_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Grabaciones de sesiones
CREATE TABLE IF NOT EXISTS webrtc_recordings (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id          INT           NOT NULL,
  session_id       INT           NOT NULL,
  provider_rec_id  VARCHAR(255)  NOT NULL,
  status           ENUM('recording','processing','completed','failed','deleted') NOT NULL DEFAULT 'recording',
  duration_sec     INT           NULL,
  file_size_bytes  BIGINT        NULL,
  storage_url      TEXT          NULL,          -- URL de descarga del proveedor
  minio_path       VARCHAR(500)  NULL,          -- si se descargó y guardó en MinIO
  started_at       TIMESTAMP     NULL,
  ended_at         TIMESTAMP     NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wrec_room    FOREIGN KEY (room_id)    REFERENCES webrtc_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_wrec_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sala de espera (virtual — participantes que esperan ser admitidos)
CREATE TABLE IF NOT EXISTS webrtc_waiting_room (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id      INT           NOT NULL,
  identity     VARCHAR(120)  NOT NULL,
  display_name VARCHAR(120)  NULL,
  status       ENUM('waiting','admitted','rejected') NOT NULL DEFAULT 'waiting',
  joined_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acted_at     TIMESTAMP     NULL,
  CONSTRAINT fk_wwr_room FOREIGN KEY (room_id) REFERENCES webrtc_rooms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices
CREATE INDEX IF NOT EXISTS idx_wr_status        ON webrtc_rooms        (status);
CREATE INDEX IF NOT EXISTS idx_wrec_session     ON webrtc_recordings   (session_id);
CREATE INDEX IF NOT EXISTS idx_wwr_room_status  ON webrtc_waiting_room (room_id, status);
