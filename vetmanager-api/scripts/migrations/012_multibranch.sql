-- ============================================================
-- 012_multibranch.sql  —  Multi-sucursal avanzado
-- ============================================================

-- Transferencias de pacientes entre sucursales
CREATE TABLE IF NOT EXISTS patient_transfers (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id       INT           NOT NULL,
  from_branch_id   INT           NOT NULL,
  to_branch_id     INT           NOT NULL,
  client_id        INT           NULL,           -- cliente en destino
  requested_by     INT           NOT NULL,
  approved_by      INT           NULL,
  transfer_type    ENUM('visit','ownership')     NOT NULL DEFAULT 'visit',
  status           ENUM('pending','approved','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  reason           TEXT          NULL,
  notes            TEXT          NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pt_patient  FOREIGN KEY (patient_id)     REFERENCES patients(id),
  CONSTRAINT fk_pt_from     FOREIGN KEY (from_branch_id) REFERENCES branches(id),
  CONSTRAINT fk_pt_to       FOREIGN KEY (to_branch_id)   REFERENCES branches(id),
  CONSTRAINT fk_pt_req      FOREIGN KEY (requested_by)   REFERENCES users(id),
  CONSTRAINT fk_pt_appr     FOREIGN KEY (approved_by)    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transferencias de stock entre sucursales
CREATE TABLE IF NOT EXISTS stock_transfers (
  id               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id          INT           NOT NULL,
  from_branch_id   INT           NOT NULL,
  to_branch_id     INT           NOT NULL,
  quantity         DECIMAL(10,3) NOT NULL,
  batch_id         INT           NULL,
  requested_by     INT           NOT NULL,
  approved_by      INT           NULL,
  status           ENUM('pending','approved','in_transit','completed','rejected','cancelled') NOT NULL DEFAULT 'pending',
  reason           TEXT          NULL,
  reference_number VARCHAR(50)   NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_st_from    FOREIGN KEY (from_branch_id) REFERENCES branches(id),
  CONSTRAINT fk_st_to      FOREIGN KEY (to_branch_id)   REFERENCES branches(id),
  CONSTRAINT fk_st_req     FOREIGN KEY (requested_by)   REFERENCES users(id),
  CONSTRAINT fk_st_appr    FOREIGN KEY (approved_by)    REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acceso temporal de veterinario a otra sucursal del mismo org
CREATE TABLE IF NOT EXISTS cross_branch_access (
  id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         INT           NOT NULL,
  branch_id       INT           NOT NULL,
  granted_by      INT           NOT NULL,
  valid_from      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until     TIMESTAMP     NULL,             -- NULL = indefinido
  reason          VARCHAR(255)  NULL,
  is_active       TINYINT(1)    NOT NULL DEFAULT 1,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cba_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_cba_branch  FOREIGN KEY (branch_id)  REFERENCES branches(id) ON DELETE CASCADE,
  CONSTRAINT fk_cba_granted FOREIGN KEY (granted_by) REFERENCES users(id),
  UNIQUE KEY uq_cba_user_branch (user_id, branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para configuración de integración entre sucursales
CREATE TABLE IF NOT EXISTS branch_integration_settings (
  branch_id             INT           NOT NULL PRIMARY KEY,
  share_patient_history TINYINT(1)    NOT NULL DEFAULT 1,
  share_inventory_view  TINYINT(1)    NOT NULL DEFAULT 1,
  allow_stock_transfers TINYINT(1)    NOT NULL DEFAULT 1,
  allow_patient_transfers TINYINT(1)  NOT NULL DEFAULT 1,
  require_transfer_approval TINYINT(1) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bis_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices (DROP IF EXISTS para ser idempotente con 001_base_schema)
DROP INDEX IF EXISTS idx_pt_patient  ON patient_transfers;
DROP INDEX IF EXISTS idx_pt_branches ON patient_transfers;
DROP INDEX IF EXISTS idx_st_branches ON stock_transfers;
DROP INDEX IF EXISTS idx_cba_user    ON cross_branch_access;

CREATE INDEX idx_pt_patient    ON patient_transfers   (patient_id, created_at);
CREATE INDEX idx_pt_branches   ON patient_transfers   (from_branch_id, to_branch_id);
CREATE INDEX idx_st_branches   ON stock_transfers     (from_branch_id, to_branch_id);
CREATE INDEX idx_cba_user      ON cross_branch_access (user_id, is_active);
