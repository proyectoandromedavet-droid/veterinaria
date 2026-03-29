-- ============================================================
-- 010_reports.sql  —  Reportes programados
-- ============================================================

-- Definiciones de reportes programados
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id            INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  org_id        INT           NOT NULL,
  branch_id     INT           NULL,               -- NULL = todas las sucursales
  name          VARCHAR(120)  NOT NULL,
  report_type   VARCHAR(60)   NOT NULL,           -- 'revenue','appointments','diagnoses', etc.
  frequency     ENUM('daily','weekly','monthly','quarterly') NOT NULL DEFAULT 'monthly',
  day_of_week   TINYINT       NULL,               -- 0=Dom … 6=Sáb (solo para weekly)
  day_of_month  TINYINT       NULL,               -- 1-28 (solo para monthly/quarterly)
  format        ENUM('pdf','excel','csv')         NOT NULL DEFAULT 'pdf',
  recipients    JSON          NOT NULL,           -- ["email1@x.com","email2@x.com"]
  params        JSON          NULL,               -- {"groupBy":"month","limit":20}
  is_active     TINYINT(1)    NOT NULL DEFAULT 1,
  last_run_at   TIMESTAMP     NULL,
  next_run_at   TIMESTAMP     NULL,
  created_by    INT           NOT NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sr_org    FOREIGN KEY (org_id)    REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_branch FOREIGN KEY (branch_id) REFERENCES branches(id)      ON DELETE SET NULL,
  CONSTRAINT fk_sr_user   FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial de ejecuciones
CREATE TABLE IF NOT EXISTS report_runs (
  id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  scheduled_report_id INT           NULL,                     -- NULL si fue manual
  org_id              INT           NOT NULL,
  branch_id           INT           NULL,
  report_type         VARCHAR(60)   NOT NULL,
  format              ENUM('pdf','excel','csv') NOT NULL,
  status              ENUM('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  params              JSON          NULL,
  file_size_bytes     INT           NULL,
  storage_path        VARCHAR(500)  NULL,                     -- path en MinIO / S3
  error_message       TEXT          NULL,
  triggered_by        INT           NULL,                     -- user_id (NULL = automático)
  started_at          TIMESTAMP     NULL,
  finished_at         TIMESTAMP     NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rr_sr   FOREIGN KEY (scheduled_report_id) REFERENCES scheduled_reports(id) ON DELETE SET NULL,
  CONSTRAINT fk_rr_user FOREIGN KEY (triggered_by)        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_sr_org_active     ON scheduled_reports (org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sr_next_run       ON scheduled_reports (next_run_at, is_active);
CREATE INDEX IF NOT EXISTS idx_rr_type_created   ON report_runs (report_type, created_at);
CREATE INDEX IF NOT EXISTS idx_rr_scheduled      ON report_runs (scheduled_report_id, created_at);
