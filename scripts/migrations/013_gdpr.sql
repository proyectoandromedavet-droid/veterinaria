-- ============================================================
-- 013_gdpr.sql  —  GDPR / Ley 25.326 + Firma Digital
-- ============================================================

-- Consentimientos de clientes
CREATE TABLE IF NOT EXISTS gdpr_consents (
  id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id       INT           NOT NULL,
  consent_type    ENUM('marketing','analytics','third_party','telemedicine',
                       'photo','data_sharing','terms','privacy') NOT NULL,
  granted         TINYINT(1)    NOT NULL DEFAULT 0,
  source          ENUM('portal','staff','paper','sms','email') NOT NULL DEFAULT 'portal',
  ip_address      VARCHAR(45)   NULL,
  user_agent      VARCHAR(500)  NULL,
  policy_version  VARCHAR(20)   NOT NULL DEFAULT '1.0',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_gc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE KEY uq_consent_client_type (client_id, consent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solicitudes ARCO (Acceso, Rectificación, Cancelación, Oposición)
CREATE TABLE IF NOT EXISTS gdpr_data_requests (
  id           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id    INT           NOT NULL,
  request_type ENUM('access','erasure','portability','rectification','restriction','objection') NOT NULL,
  status       ENUM('pending','in_progress','completed','rejected') NOT NULL DEFAULT 'pending',
  notes        TEXT          NULL,
  handled_by   INT           NULL,
  due_date     DATE          NOT NULL,
  resolved_at  TIMESTAMP     NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gdr_client FOREIGN KEY (client_id)  REFERENCES clients(id),
  CONSTRAINT fk_gdr_user   FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail de acceso a datos personales
CREATE TABLE IF NOT EXISTS gdpr_audit_trail (
  id           BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  client_id    INT           NULL,
  user_id      INT           NULL,
  action       VARCHAR(100)  NOT NULL,    -- 'access.export','erasure.completed','consent.granted', etc.
  performed_by INT           NULL,
  ip_address   VARCHAR(45)   NULL,
  details      JSON          NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gat_client FOREIGN KEY (client_id)    REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_gat_user   FOREIGN KEY (performed_by) REFERENCES users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Brechas de seguridad (Art. 33 GDPR — notificar en 72 hs)
CREATE TABLE IF NOT EXISTS data_breaches (
  id                         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id                     INT           NOT NULL,
  branch_id                  INT           NULL,
  severity                   ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  affected_records           INT           NOT NULL DEFAULT 0,
  description                TEXT          NOT NULL,
  discovered_by              INT           NOT NULL,
  containment_measures       TEXT          NULL,
  authority_notified_at      TIMESTAMP     NULL,
  notify_authority_deadline  TIMESTAMP     NOT NULL,
  clients_notified_at        TIMESTAMP     NULL,
  status                     ENUM('open','contained','resolved','reported') NOT NULL DEFAULT 'open',
  created_at                 TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_db_org    FOREIGN KEY (org_id)   REFERENCES organizations(id),
  CONSTRAINT fk_db_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
  CONSTRAINT fk_db_user   FOREIGN KEY (discovered_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Firmas digitales de documentos
CREATE TABLE IF NOT EXISTS document_signatures (
  id            INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_type ENUM('prescription','invoice','consent','discharge','lab_report','telemedicine') NOT NULL,
  document_id   INT           NOT NULL,
  version       VARCHAR(10)   NOT NULL DEFAULT '1',
  algorithm     VARCHAR(20)   NOT NULL DEFAULT 'RSA-PSS',
  key_id        VARCHAR(32)   NOT NULL,             -- fingerprint de la clave pública
  signer_user_id INT          NULL,
  signer_email  VARCHAR(255)  NULL,
  payload_hash  VARCHAR(64)   NOT NULL,             -- SHA-256 del documento
  signature     TEXT          NOT NULL,             -- firma RSA-PSS en base64
  timestamp_iso VARCHAR(30)   NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ds_user FOREIGN KEY (signer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ds_doc (document_type, document_id),
  INDEX idx_ds_signer (signer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Columnas nuevas en clientes para GDPR
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS anonymized_at   TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS anonymized_by   INT       NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gdpr_notes      TEXT      NULL;

-- Índices
CREATE INDEX idx_gc_client     ON gdpr_consents    (client_id, consent_type);
CREATE INDEX idx_gdr_status    ON gdpr_data_requests (status, due_date);
CREATE INDEX idx_gat_client    ON gdpr_audit_trail (client_id, action);
CREATE INDEX idx_db_deadline   ON data_breaches    (notify_authority_deadline, status);
