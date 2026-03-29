-- ============================================================
-- 014_ai.sql  —  IA: diagnóstico, imágenes, chatbot, riesgo
-- ============================================================

-- Sugerencias de diagnóstico diferencial
CREATE TABLE IF NOT EXISTS ai_diagnosis_suggestions (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id      INT           NOT NULL,
  org_id          INT           NOT NULL,
  symptoms_json   JSON          NOT NULL,
  anamnesis       TEXT          NULL,
  diagnoses_json  JSON          NOT NULL,              -- array de { name, probability, reasoning, recommended_tests }
  urgency         ENUM('routine','urgent','emergency') NOT NULL DEFAULT 'routine',
  model_provider  VARCHAR(30)   NOT NULL DEFAULT 'openai',
  requested_by    INT           NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aids_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_aids_org     FOREIGN KEY (org_id)     REFERENCES organizations(id),
  CONSTRAINT fk_aids_user    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_aids_patient (patient_id, created_at),
  INDEX idx_aids_org     (org_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Análisis de imágenes médicas
CREATE TABLE IF NOT EXISTS ai_image_analyses (
  id                   BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id           INT          NOT NULL,
  org_id               INT          NOT NULL,
  lab_result_id        INT          NULL,              -- FK a lab_results si aplica
  image_type           ENUM('xray','ultrasound','blood_smear','cytology','histology','fundoscopy','ecg','other') NOT NULL,
  region               VARCHAR(100) NULL,
  severity             ENUM('normal','mild','moderate','severe','critical','unknown') NOT NULL DEFAULT 'unknown',
  findings_json        JSON         NOT NULL,          -- array de strings
  assessment           TEXT         NOT NULL,
  recommendations_json JSON         NOT NULL,          -- array de strings
  model_provider       VARCHAR(30)  NOT NULL DEFAULT 'openai',
  requested_by         INT          NULL,
  created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aiia_patient FOREIGN KEY (patient_id)    REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_aiia_org     FOREIGN KEY (org_id)        REFERENCES organizations(id),
  CONSTRAINT fk_aiia_user    FOREIGN KEY (requested_by)  REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_aiia_patient (patient_id, created_at),
  INDEX idx_aiia_severity (severity, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sesiones del chatbot clínico
CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id             BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id         INT           NOT NULL,
  user_id        INT           NOT NULL,
  patient_id     INT           NULL,
  model_provider VARCHAR(30)   NOT NULL DEFAULT 'openai',
  message_count  INT           NOT NULL DEFAULT 0,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_aics_org     FOREIGN KEY (org_id)     REFERENCES organizations(id),
  CONSTRAINT fk_aics_user    FOREIGN KEY (user_id)    REFERENCES users(id),
  CONSTRAINT fk_aics_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
  INDEX idx_aics_user    (user_id, updated_at),
  INDEX idx_aics_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mensajes del chatbot
CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id  BIGINT       NOT NULL,
  role        ENUM('user','assistant','system') NOT NULL,
  content     TEXT         NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aicm_session FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
  INDEX idx_aicm_session (session_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Evaluaciones de riesgo
CREATE TABLE IF NOT EXISTS ai_risk_assessments (
  id                      BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  patient_id              INT          NOT NULL,
  org_id                  INT          NOT NULL,
  overall_level           ENUM('low','medium','high') NOT NULL DEFAULT 'low',
  risks_json              JSON         NOT NULL,   -- array de { condition, score, level, factors }
  recommendations_json    JSON         NOT NULL,   -- array de strings
  history_snapshot_json   JSON         NULL,       -- snapshot de datos usados en el cálculo
  computed_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aira_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_aira_org     FOREIGN KEY (org_id)     REFERENCES organizations(id),
  INDEX idx_aira_patient (patient_id, computed_at),
  INDEX idx_aira_level   (overall_level, computed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
