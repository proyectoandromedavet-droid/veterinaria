-- ============================================================
-- 002_clinical_schema.sql  —  Schema clínico especializado de VetManager API
-- Crea tablas clínicas avanzadas: vacunación, desparasitación,
-- hospitalización, laboratorio, diagnóstico por imagen, cirugía,
-- patología, anestesia, inventario avanzado y grooming.
-- Compatible con MySQL 5.7+ (mismas reglas que 001_base_schema.sql).
-- ============================================================

-- ─── Vacunación ───────────────────────────────────────────────────────────────

-- Fabricantes de vacunas
CREATE TABLE IF NOT EXISTS vaccine_manufacturers (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(120)  NOT NULL,
  country    VARCHAR(60)   NULL,
  website    VARCHAR(255)  NULL,
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vaccine_mfr_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Fabricantes/laboratorios de vacunas veterinarias';

-- Catálogo de vacunas
CREATE TABLE IF NOT EXISTS vaccines (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  manufacturer_id INT UNSIGNED    NULL,
  name            VARCHAR(150)    NOT NULL,
  trade_name      VARCHAR(150)    NULL     COMMENT 'Nombre comercial',
  disease_covered VARCHAR(255)    NOT NULL COMMENT 'Enfermedades cubiertas (puede ser lista)',
  vaccine_type    ENUM('live_attenuated','inactivated','subunit','toxoid','combination','other')
                  NOT NULL DEFAULT 'inactivated',
  target_species  VARCHAR(255)    NOT NULL DEFAULT 'all' COMMENT 'Especies objetivo (CSV o "all")',
  doses_required  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  booster_interval_months TINYINT UNSIGNED NULL COMMENT 'Intervalo en meses para revacunación',
  storage_temp    VARCHAR(40)     NULL     COMMENT 'Temperatura de conservación',
  manufacturer    VARCHAR(120)    NULL     COMMENT 'Campo legacy (denormalizado)',
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_vaccine_mfr (manufacturer_id),
  CONSTRAINT fk_vaccine_mfr FOREIGN KEY (manufacturer_id) REFERENCES vaccine_manufacturers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de vacunas disponibles';

-- Registro de vacunaciones aplicadas
CREATE TABLE IF NOT EXISTS vaccinations (
  id                 INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id          INT UNSIGNED    NOT NULL,
  patient_id         INT UNSIGNED    NOT NULL,
  vaccine_id         INT UNSIGNED    NOT NULL,
  medical_record_id  INT UNSIGNED    NULL,
  vaccination_date   DATE            NOT NULL,
  batch_number       VARCHAR(60)     NULL     COMMENT 'Número de lote de la vacuna',
  expiry_date        DATE            NULL     COMMENT 'Fecha de vencimiento del lote',
  dose               VARCHAR(30)     NULL     COMMENT 'Dosis administrada (ej: 1 mL)',
  route              ENUM('subcutaneous','intramuscular','intranasal','oral','other') NULL,
  administration_site VARCHAR(60)   NULL     COMMENT 'Sitio de aplicación',
  next_due_date      DATE            NULL,
  notes              TEXT            NULL,
  administered_by    INT UNSIGNED    NOT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_vacc_patient   (patient_id),
  INDEX idx_vacc_branch    (branch_id),
  INDEX idx_vacc_date      (vaccination_date),
  INDEX idx_vacc_next_due  (next_due_date),
  CONSTRAINT fk_vacc_branch  FOREIGN KEY (branch_id)         REFERENCES branches        (id),
  CONSTRAINT fk_vacc_patient FOREIGN KEY (patient_id)        REFERENCES patients        (id),
  CONSTRAINT fk_vacc_vaccine FOREIGN KEY (vaccine_id)        REFERENCES vaccines        (id),
  CONSTRAINT fk_vacc_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE SET NULL,
  CONSTRAINT fk_vacc_user    FOREIGN KEY (administered_by)   REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registro de vacunaciones aplicadas a pacientes';

-- ─── Desparasitación ──────────────────────────────────────────────────────────

-- Productos antiparasitarios
CREATE TABLE IF NOT EXISTS antiparasitic_products (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name             VARCHAR(150)    NOT NULL,
  active_ingredient VARCHAR(200)   NOT NULL,
  parasite_type    ENUM('internal','external','both') NOT NULL DEFAULT 'both',
  target_species   VARCHAR(255)    NOT NULL DEFAULT 'all',
  presentation     VARCHAR(80)     NULL COMMENT 'Ej: comprimido, pipeta, spray',
  dosage_guideline TEXT            NULL,
  interval_months  TINYINT UNSIGNED NULL,
  is_active        TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ap_type (parasite_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de productos antiparasitarios (internos y externos)';

-- Registros de desparasitación
CREATE TABLE IF NOT EXISTS deworming_records (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id           INT UNSIGNED    NOT NULL,
  patient_id          INT UNSIGNED    NOT NULL,
  product_id          INT UNSIGNED    NOT NULL,
  deworming_date      DATE            NOT NULL,
  weight_at_treatment DECIMAL(6,3)    NULL     COMMENT 'Peso en kg al momento del tratamiento',
  dose_administered   VARCHAR(60)     NULL,
  route               ENUM('oral','topical','injectable','other') NULL,
  next_due_date       DATE            NULL,
  notes               TEXT            NULL,
  administered_by     INT UNSIGNED    NOT NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_dew_patient  (patient_id),
  INDEX idx_dew_branch   (branch_id),
  INDEX idx_dew_next_due (next_due_date),
  CONSTRAINT fk_dew_branch   FOREIGN KEY (branch_id)    REFERENCES branches               (id),
  CONSTRAINT fk_dew_patient  FOREIGN KEY (patient_id)   REFERENCES patients               (id),
  CONSTRAINT fk_dew_product  FOREIGN KEY (product_id)   REFERENCES antiparasitic_products (id),
  CONSTRAINT fk_dew_user     FOREIGN KEY (administered_by) REFERENCES users               (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registros de desparasitación de pacientes';

-- ─── Hospitalización ──────────────────────────────────────────────────────────

-- Salas/áreas de hospitalización
CREATE TABLE IF NOT EXISTS wards (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id   INT UNSIGNED    NOT NULL,
  name        VARCHAR(80)     NOT NULL,
  ward_type   ENUM('general','intensive_care','isolation','post_op','exotic','other')
              NOT NULL DEFAULT 'general',
  capacity    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  notes       TEXT            NULL,
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ward_branch (branch_id),
  CONSTRAINT fk_ward_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Salas o áreas de hospitalización veterinaria';

-- Jaulas/box individuales
CREATE TABLE IF NOT EXISTS kennels (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  ward_id       INT UNSIGNED    NOT NULL,
  kennel_number VARCHAR(20)     NOT NULL,
  kennel_type   ENUM('cage','run','pen','incubator','aquarium','other') NOT NULL DEFAULT 'cage',
  size_category ENUM('xs','small','medium','large','xl') NOT NULL DEFAULT 'medium',
  notes         TEXT            NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kennel_ward_num (ward_id, kennel_number),
  INDEX idx_kennel_ward (ward_id),
  CONSTRAINT fk_kennel_ward FOREIGN KEY (ward_id) REFERENCES wards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Jaulas, boxes o espacios individuales de hospitalización';

-- Hospitalizaciones (internaciones)
CREATE TABLE IF NOT EXISTS hospitalizations (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id                INT UNSIGNED    NOT NULL,
  patient_id               INT UNSIGNED    NOT NULL,
  medical_record_id        INT UNSIGNED    NULL,
  responsible_vet_id       INT UNSIGNED    NOT NULL,
  kennel_id                INT UNSIGNED    NULL,
  hospitalization_reason   TEXT            NOT NULL,
  admission_diagnosis      TEXT            NULL,
  hospitalization_status   ENUM('admitted','critical','stable','improving','ready_for_discharge')
                           NOT NULL DEFAULT 'admitted',
  admission_weight         DECIMAL(6,3)    NULL,
  admission_date           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estimated_discharge_date DATE            NULL,
  discharge_date           DATETIME        NULL,
  discharge_diagnosis      TEXT            NULL,
  discharge_instructions   TEXT            NULL,
  follow_up_date           DATE            NULL,
  special_instructions     TEXT            NULL,
  notes                    TEXT            NULL,
  created_by               INT UNSIGNED    NULL,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_hosp_branch     (branch_id),
  INDEX idx_hosp_patient    (patient_id),
  INDEX idx_hosp_kennel     (kennel_id),
  INDEX idx_hosp_discharge  (discharge_date),
  CONSTRAINT fk_hosp_branch  FOREIGN KEY (branch_id)        REFERENCES branches        (id),
  CONSTRAINT fk_hosp_patient FOREIGN KEY (patient_id)       REFERENCES patients        (id),
  CONSTRAINT fk_hosp_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_hosp_vet     FOREIGN KEY (responsible_vet_id) REFERENCES users         (id),
  CONSTRAINT fk_hosp_kennel  FOREIGN KEY (kennel_id)         REFERENCES kennels        (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Internaciones hospitalarias de pacientes';

-- Monitoreo de hospitalización (chequeos de enfermería)
CREATE TABLE IF NOT EXISTS hospitalization_monitoring (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  hospitalization_id   INT UNSIGNED    NOT NULL,
  recorded_at          DATETIME        NOT NULL,
  temperature_celsius  DECIMAL(4,1)    NULL,
  heart_rate           SMALLINT UNSIGNED NULL COMMENT 'lpm',
  respiratory_rate     SMALLINT UNSIGNED NULL COMMENT 'rpm',
  systolic_bp          SMALLINT UNSIGNED NULL COMMENT 'mmHg',
  diastolic_bp         SMALLINT UNSIGNED NULL COMMENT 'mmHg',
  spo2_percent         DECIMAL(5,2)    NULL,
  weight_kg            DECIMAL(6,3)    NULL,
  consciousness_level  VARCHAR(60)     NULL COMMENT 'Alerta, deprimido, estupor, coma',
  pain_score           TINYINT UNSIGNED NULL COMMENT '0-10',
  hydration_status     VARCHAR(60)     NULL,
  appetite             ENUM('normal','reduced','absent','tube_fed') NULL,
  urination            ENUM('normal','increased','decreased','absent','catheterized') NULL,
  defecation           ENUM('normal','diarrhea','constipation','absent') NULL,
  wound_status         TEXT            NULL,
  iv_site_status       TEXT            NULL COMMENT 'Estado del catéter IV',
  notes                TEXT            NULL,
  recorded_by          INT UNSIGNED    NOT NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_hmon_hosp (hospitalization_id, recorded_at),
  CONSTRAINT fk_hmon_hosp FOREIGN KEY (hospitalization_id) REFERENCES hospitalizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_hmon_user FOREIGN KEY (recorded_by)        REFERENCES users             (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registros de monitoreo de enfermería durante hospitalización';

-- Medicamentos administrados durante hospitalización
CREATE TABLE IF NOT EXISTS hospitalization_medications (
  id                 INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  hospitalization_id INT UNSIGNED    NOT NULL,
  medication_id      INT UNSIGNED    NOT NULL,
  dose               VARCHAR(80)     NOT NULL,
  dose_unit          VARCHAR(30)     NULL,
  frequency          VARCHAR(80)     NOT NULL COMMENT 'Ej: cada 8 horas, BID, SID',
  route              ENUM('oral','iv','im','sc','topical','inhalation','ophthalmic',
                          'otic','rectal','other') NULL,
  start_date         DATE            NULL,
  end_date           DATE            NULL,
  instructions       TEXT            NULL,
  is_active          TINYINT(1)      NOT NULL DEFAULT 1,
  prescribed_by      INT UNSIGNED    NOT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_hmed_hosp (hospitalization_id),
  INDEX idx_hmed_med  (medication_id),
  CONSTRAINT fk_hmed_hosp FOREIGN KEY (hospitalization_id) REFERENCES hospitalizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_hmed_med  FOREIGN KEY (medication_id)      REFERENCES medications      (id),
  CONSTRAINT fk_hmed_user FOREIGN KEY (prescribed_by)      REFERENCES users            (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Medicamentos prescritos durante hospitalización';

-- ─── Laboratorio Clínico ──────────────────────────────────────────────────────

-- Categorías de análisis de laboratorio
CREATE TABLE IF NOT EXISTS lab_test_categories (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL COMMENT 'Ej: Hematología, Bioquímica, Urianálisis',
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_cat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Categorías de análisis de laboratorio clínico';

-- Análisis individuales de laboratorio
CREATE TABLE IF NOT EXISTS lab_tests (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  category_id       INT UNSIGNED    NOT NULL,
  name              VARCHAR(120)    NOT NULL,
  code              VARCHAR(30)     NULL     COMMENT 'Código del análisis (LOINC u interno)',
  description       TEXT            NULL,
  sample_type       VARCHAR(80)     NULL     COMMENT 'Ej: sangre, orina, fecal, líquido cefalorraquídeo',
  turnaround_hours  SMALLINT UNSIGNED NULL   COMMENT 'Tiempo estimado de resultado en horas',
  price             DECIMAL(12,2)   NULL,
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_lab_test_cat  (category_id),
  INDEX idx_lab_test_code (code),
  CONSTRAINT fk_lab_test_cat FOREIGN KEY (category_id) REFERENCES lab_test_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Análisis individuales de laboratorio clínico veterinario';

-- Paneles/perfiles de laboratorio (conjunto de análisis)
CREATE TABLE IF NOT EXISTS lab_test_panels (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120)    NOT NULL COMMENT 'Ej: Perfil renal, Hemograma completo',
  description TEXT            NULL,
  price       DECIMAL(12,2)   NULL,
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Paneles o perfiles de laboratorio (agrupación de análisis)';

-- Relación panel ↔ análisis individuales
CREATE TABLE IF NOT EXISTS lab_panel_tests (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  panel_id    INT UNSIGNED  NOT NULL,
  lab_test_id INT UNSIGNED  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_panel_test (panel_id, lab_test_id),
  INDEX idx_lpt_panel (panel_id),
  INDEX idx_lpt_test  (lab_test_id),
  CONSTRAINT fk_lpt_panel FOREIGN KEY (panel_id)    REFERENCES lab_test_panels (id) ON DELETE CASCADE,
  CONSTRAINT fk_lpt_test  FOREIGN KEY (lab_test_id) REFERENCES lab_tests       (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tabla de relación entre paneles y análisis individuales';

-- Rangos de referencia por análisis, especie y sexo
CREATE TABLE IF NOT EXISTS lab_reference_ranges (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  lab_test_id INT UNSIGNED    NOT NULL,
  species_id  INT UNSIGNED    NOT NULL,
  sex         ENUM('male','female','any') NOT NULL DEFAULT 'any',
  age_min_months SMALLINT UNSIGNED NULL COMMENT 'Edad mínima en meses para aplicar este rango',
  age_max_months SMALLINT UNSIGNED NULL COMMENT 'Edad máxima en meses',
  min_value   DECIMAL(12,4)   NULL,
  max_value   DECIMAL(12,4)   NULL,
  unit        VARCHAR(30)     NULL,
  notes       TEXT            NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_lrr_test    (lab_test_id),
  INDEX idx_lrr_species (species_id),
  CONSTRAINT fk_lrr_test    FOREIGN KEY (lab_test_id) REFERENCES lab_tests (id) ON DELETE CASCADE,
  CONSTRAINT fk_lrr_species FOREIGN KEY (species_id)  REFERENCES species   (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Rangos de referencia de laboratorio por análisis, especie y sexo';

-- Órdenes de laboratorio
CREATE TABLE IF NOT EXISTS lab_orders (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id         INT UNSIGNED    NOT NULL,
  patient_id        INT UNSIGNED    NOT NULL,
  medical_record_id INT UNSIGNED    NULL,
  order_number      VARCHAR(20)     NOT NULL COMMENT 'Ej: LAB000001',
  priority          ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
  clinical_notes    TEXT            NULL,
  status            ENUM('pending','in_progress','partial','completed','cancelled')
                    NOT NULL DEFAULT 'pending',
  ordered_by        INT UNSIGNED    NOT NULL,
  ordered_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reported_at       DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lab_order_num (branch_id, order_number),
  INDEX idx_lo_branch    (branch_id),
  INDEX idx_lo_patient   (patient_id),
  INDEX idx_lo_status    (status),
  INDEX idx_lo_ordered   (ordered_at),
  CONSTRAINT fk_lo_branch  FOREIGN KEY (branch_id)        REFERENCES branches        (id),
  CONSTRAINT fk_lo_patient FOREIGN KEY (patient_id)       REFERENCES patients        (id),
  CONSTRAINT fk_lo_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_lo_user    FOREIGN KEY (ordered_by)        REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Órdenes de análisis de laboratorio';

-- Ítems de orden de laboratorio (un análisis por fila)
CREATE TABLE IF NOT EXISTS lab_order_items (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  lab_order_id  INT UNSIGNED    NOT NULL,
  lab_test_id   INT UNSIGNED    NOT NULL,
  status        ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  notes         TEXT            NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_loi_order (lab_order_id),
  INDEX idx_loi_test  (lab_test_id),
  CONSTRAINT fk_loi_order FOREIGN KEY (lab_order_id) REFERENCES lab_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_loi_test  FOREIGN KEY (lab_test_id)  REFERENCES lab_tests  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Análisis individuales dentro de una orden de laboratorio';

-- Resultados de análisis de laboratorio
CREATE TABLE IF NOT EXISTS lab_results (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  lab_order_item_id     INT UNSIGNED    NOT NULL,
  value_numeric         DECIMAL(14,4)   NULL,
  value_text            TEXT            NULL,
  unit                  VARCHAR(30)     NULL,
  reference_range_used  VARCHAR(80)     NULL COMMENT 'Rango de ref aplicado (snapshot)',
  is_critical           TINYINT(1)      NOT NULL DEFAULT 0,
  interpretation        TEXT            NULL,
  reported_by           INT UNSIGNED    NULL,
  reported_at           DATETIME        NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_result_item (lab_order_item_id),
  INDEX idx_lr_critical (is_critical),
  CONSTRAINT fk_lr_item FOREIGN KEY (lab_order_item_id) REFERENCES lab_order_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_user FOREIGN KEY (reported_by)       REFERENCES users           (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Resultados de análisis de laboratorio';

-- ─── Diagnóstico por Imagen ───────────────────────────────────────────────────

-- Tipos de estudios de imagen (Rx, Eco, TAC, RMN...)
CREATE TABLE IF NOT EXISTS imaging_types (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name                     VARCHAR(80)     NOT NULL COMMENT 'Ej: Radiografía, Ecografía, TAC',
  modality_code            VARCHAR(10)     NULL     COMMENT 'DICOM modality code (CR, US, CT, MR...)',
  estimated_duration_min   SMALLINT UNSIGNED NULL,
  requires_sedation        TINYINT(1)      NOT NULL DEFAULT 0,
  requires_contrast        TINYINT(1)      NOT NULL DEFAULT 0,
  base_price               DECIMAL(12,2)   NULL,
  is_active                TINYINT(1)      NOT NULL DEFAULT 1,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_imaging_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tipos de estudios de diagnóstico por imagen';

-- Órdenes de estudios de imagen
CREATE TABLE IF NOT EXISTS imaging_orders (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id           INT UNSIGNED    NOT NULL,
  patient_id          INT UNSIGNED    NOT NULL,
  medical_record_id   INT UNSIGNED    NULL,
  imaging_type_id     INT UNSIGNED    NOT NULL,
  order_number        VARCHAR(20)     NOT NULL COMMENT 'Ej: IMG000001',
  body_region         VARCHAR(80)     NULL     COMMENT 'Región anatómica estudiada',
  clinical_indication TEXT            NULL,
  priority            ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
  patient_preparation TEXT            NULL,
  sedation_required   TINYINT(1)      NOT NULL DEFAULT 0,
  status              ENUM('pending','scheduled','acquired','reported','cancelled')
                      NOT NULL DEFAULT 'pending',
  ordered_by          INT UNSIGNED    NOT NULL,
  ordered_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_img_order_num (branch_id, order_number),
  INDEX idx_io_branch  (branch_id),
  INDEX idx_io_patient (patient_id),
  INDEX idx_io_status  (status),
  CONSTRAINT fk_io_branch  FOREIGN KEY (branch_id)        REFERENCES branches        (id),
  CONSTRAINT fk_io_patient FOREIGN KEY (patient_id)       REFERENCES patients        (id),
  CONSTRAINT fk_io_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_io_type    FOREIGN KEY (imaging_type_id)  REFERENCES imaging_types   (id),
  CONSTRAINT fk_io_user    FOREIGN KEY (ordered_by)       REFERENCES users            (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Órdenes de estudios de diagnóstico por imagen';

-- Estudios realizados (sesiones de adquisición de imágenes)
CREATE TABLE IF NOT EXISTS imaging_studies (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  imaging_order_id INT UNSIGNED    NOT NULL,
  study_datetime   DATETIME        NOT NULL,
  dicom_study_uid  VARCHAR(64)     NULL     COMMENT 'UID del estudio DICOM',
  pacs_url         VARCHAR(500)    NULL     COMMENT 'URL al visor PACS',
  technique        TEXT            NULL     COMMENT 'Técnica radiológica utilizada',
  contrast_used    TINYINT(1)      NOT NULL DEFAULT 0,
  contrast_agent   VARCHAR(80)     NULL,
  performed_by     INT UNSIGNED    NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_is_order (imaging_order_id),
  INDEX idx_is_dicom (dicom_study_uid),
  CONSTRAINT fk_is_order FOREIGN KEY (imaging_order_id) REFERENCES imaging_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_is_user  FOREIGN KEY (performed_by)     REFERENCES users          (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sesiones de adquisición de estudios de imagen';

-- Imágenes individuales de un estudio
CREATE TABLE IF NOT EXISTS imaging_images (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  imaging_study_id INT UNSIGNED    NOT NULL,
  image_url        VARCHAR(500)    NOT NULL,
  image_type       VARCHAR(30)     NULL     COMMENT 'DICOM SOP Class o formato',
  view_position    VARCHAR(40)     NULL     COMMENT 'Proyección (LAT, VD, DV...)',
  series_number    SMALLINT UNSIGNED NULL,
  instance_number  SMALLINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ii_study (imaging_study_id),
  CONSTRAINT fk_ii_study FOREIGN KEY (imaging_study_id) REFERENCES imaging_studies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Imágenes individuales pertenecientes a un estudio de imagen';

-- Informes radiológicos
CREATE TABLE IF NOT EXISTS imaging_reports (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  imaging_order_id INT UNSIGNED    NOT NULL,
  findings         TEXT            NOT NULL,
  conclusion       TEXT            NOT NULL,
  recommendations  TEXT            NULL,
  is_normal        TINYINT(1)      NOT NULL DEFAULT 0,
  reported_by      INT UNSIGNED    NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ir_order (imaging_order_id),
  INDEX idx_ir_reporter (reported_by),
  CONSTRAINT fk_ir_order FOREIGN KEY (imaging_order_id) REFERENCES imaging_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_ir_user  FOREIGN KEY (reported_by)      REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Informes de diagnóstico por imagen redactados por radiólogos';

-- ─── Cirugía ──────────────────────────────────────────────────────────────────

-- Categorías de cirugías
CREATE TABLE IF NOT EXISTS surgery_categories (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL COMMENT 'Ej: Tejidos blandos, Ortopédica, Oftalmológica',
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_surgery_cat_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Categorías de tipos de cirugía veterinaria';

-- Tipos de cirugías
CREATE TABLE IF NOT EXISTS surgery_types (
  id                        INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  category_id               INT UNSIGNED    NOT NULL,
  name                      VARCHAR(120)    NOT NULL,
  description               TEXT            NULL,
  estimated_duration_minutes SMALLINT UNSIGNED NULL,
  complexity                ENUM('minor','moderate','major','complex') NOT NULL DEFAULT 'moderate',
  is_active                 TINYINT(1)      NOT NULL DEFAULT 1,
  created_at                DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_surgery_type_cat (category_id),
  CONSTRAINT fk_st_category FOREIGN KEY (category_id) REFERENCES surgery_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tipos de procedimientos quirúrgicos';

-- Cirugías programadas y realizadas
CREATE TABLE IF NOT EXISTS surgeries (
  id                     INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id              INT UNSIGNED    NOT NULL,
  patient_id             INT UNSIGNED    NOT NULL,
  medical_record_id      INT UNSIGNED    NULL,
  surgery_type_id        INT UNSIGNED    NOT NULL,
  lead_surgeon_id        INT UNSIGNED    NOT NULL,
  assistant_surgeon_id   INT UNSIGNED    NULL,
  anesthesiologist_id    INT UNSIGNED    NULL,
  surgical_nurse_id      INT UNSIGNED    NULL,
  scheduled_date         DATE            NOT NULL,
  start_time             DATETIME        NULL,
  end_time               DATETIME        NULL,
  duration_minutes       SMALLINT UNSIGNED NULL,
  urgency                ENUM('elective','urgent','emergency') NOT NULL DEFAULT 'elective',
  status                 ENUM('scheduled','in_progress','completed','cancelled','postponed')
                         NOT NULL DEFAULT 'scheduled',
  preoperative_diagnosis TEXT            NULL,
  postoperative_diagnosis TEXT           NULL,
  surgical_approach      TEXT            NULL,
  surgical_findings      TEXT            NULL,
  complications          TEXT            NULL,
  notes                  TEXT            NULL,
  created_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_surg_branch   (branch_id),
  INDEX idx_surg_patient  (patient_id),
  INDEX idx_surg_date     (scheduled_date),
  INDEX idx_surg_status   (status),
  CONSTRAINT fk_surg_branch   FOREIGN KEY (branch_id)           REFERENCES branches        (id),
  CONSTRAINT fk_surg_patient  FOREIGN KEY (patient_id)          REFERENCES patients        (id),
  CONSTRAINT fk_surg_mr       FOREIGN KEY (medical_record_id)   REFERENCES medical_records (id) ON DELETE SET NULL,
  CONSTRAINT fk_surg_type     FOREIGN KEY (surgery_type_id)     REFERENCES surgery_types   (id),
  CONSTRAINT fk_surg_lead     FOREIGN KEY (lead_surgeon_id)     REFERENCES users           (id),
  CONSTRAINT fk_surg_asst     FOREIGN KEY (assistant_surgeon_id) REFERENCES users          (id) ON DELETE SET NULL,
  CONSTRAINT fk_surg_anes     FOREIGN KEY (anesthesiologist_id) REFERENCES users           (id) ON DELETE SET NULL,
  CONSTRAINT fk_surg_nurse    FOREIGN KEY (surgical_nurse_id)   REFERENCES users           (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Intervenciones quirúrgicas programadas y realizadas';

-- ─── Anestesia ────────────────────────────────────────────────────────────────

-- Registros de anestesia por cirugía
CREATE TABLE IF NOT EXISTS anesthesia_records (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  surgery_id              INT UNSIGNED    NOT NULL,
  anesthesiologist_id     INT UNSIGNED    NOT NULL,
  anesthesia_type         ENUM('general','local','regional','epidural','sedation','loco_regional')
                          NOT NULL DEFAULT 'general',
  induction_agents        TEXT            NULL,
  maintenance_agents      TEXT            NULL,
  analgesics              TEXT            NULL,
  reversal_agents         TEXT            NULL,
  premedications          TEXT            NULL,
  induction_time          DATETIME        NULL,
  extubation_time         DATETIME        NULL,
  total_anesthesia_minutes SMALLINT UNSIGNED NULL,
  complications           TEXT            NULL,
  -- monitoring_chart: serie temporal de constantes durante la anestesia
  monitoring_chart        JSON            NULL COMMENT 'Array de {time,hr,rr,spo2,etco2,temp,bp,depth,notes}',
  recovery_notes          TEXT            NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_anesthesia_surgery (surgery_id),
  INDEX idx_ar_anesthesiologist (anesthesiologist_id),
  CONSTRAINT fk_ar_surgery FOREIGN KEY (surgery_id)          REFERENCES surgeries (id) ON DELETE CASCADE,
  CONSTRAINT fk_ar_user    FOREIGN KEY (anesthesiologist_id) REFERENCES users     (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registros de anestesia por intervención quirúrgica';

-- ─── Patología ────────────────────────────────────────────────────────────────

-- Tipos de estudios patológicos
CREATE TABLE IF NOT EXISTS pathology_types (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL COMMENT 'Ej: Histopatología, Citología, Inmunohistoquímica',
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_path_type_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tipos de estudios anatomopatológicos';

-- Órdenes de patología
CREATE TABLE IF NOT EXISTS pathology_orders (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id         INT UNSIGNED    NOT NULL,
  patient_id        INT UNSIGNED    NOT NULL,
  medical_record_id INT UNSIGNED    NULL,
  pathology_type_id INT UNSIGNED    NOT NULL,
  order_number      VARCHAR(20)     NOT NULL COMMENT 'Ej: PAT000001',
  clinical_history  TEXT            NULL,
  status            ENUM('pending','processing','reported','cancelled') NOT NULL DEFAULT 'pending',
  ordered_by        INT UNSIGNED    NOT NULL,
  ordered_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reported_at       DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_path_order_num (branch_id, order_number),
  INDEX idx_po_branch  (branch_id),
  INDEX idx_po_patient (patient_id),
  INDEX idx_po_status  (status),
  CONSTRAINT fk_po_branch  FOREIGN KEY (branch_id)        REFERENCES branches        (id),
  CONSTRAINT fk_po_patient FOREIGN KEY (patient_id)       REFERENCES patients        (id),
  CONSTRAINT fk_po_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL,
  CONSTRAINT fk_po_type    FOREIGN KEY (pathology_type_id) REFERENCES pathology_types(id),
  CONSTRAINT fk_po_user    FOREIGN KEY (ordered_by)        REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Órdenes de estudios anatomopatológicos';

-- Muestras de patología
CREATE TABLE IF NOT EXISTS pathology_samples (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  pathology_order_id    INT UNSIGNED    NOT NULL,
  sample_number         TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Número de muestra dentro de la orden',
  sample_type           VARCHAR(80)     NOT NULL COMMENT 'Ej: biopsia, PAAF, hisopado',
  anatomical_location   VARCHAR(120)    NULL,
  collection_date       DATE            NULL,
  fixation_method       VARCHAR(60)     NULL     COMMENT 'Ej: formol 10%, fresco',
  macroscopic_description TEXT          NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ps_order (pathology_order_id),
  CONSTRAINT fk_ps_order FOREIGN KEY (pathology_order_id) REFERENCES pathology_orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Muestras enviadas para estudio anatomopatológico';

-- Resultados de patología
CREATE TABLE IF NOT EXISTS pathology_results (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  pathology_order_id    INT UNSIGNED    NOT NULL,
  pathologist_id        INT UNSIGNED    NOT NULL,
  microscopic_description TEXT          NOT NULL,
  diagnosis             TEXT            NOT NULL,
  behavior              ENUM('benign','malignant','borderline','reactive','other') NULL,
  differential_diagnosis TEXT           NULL,
  prognostic_notes      TEXT            NULL,
  -- Estadificación TNM oncológica (cuando aplica)
  tnm_t                 VARCHAR(10)     NULL     COMMENT 'T (tumor primario)',
  tnm_n                 VARCHAR(10)     NULL     COMMENT 'N (nódulos linfáticos)',
  tnm_m                 VARCHAR(10)     NULL     COMMENT 'M (metástasis)',
  tnm_stage             VARCHAR(20)     NULL,
  -- Técnicas especiales
  ihc_results           TEXT            NULL     COMMENT 'Inmunohistoquímica',
  special_stains        TEXT            NULL,
  recommendations       TEXT            NULL,
  reported_at           DATETIME        NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pr_order (pathology_order_id),
  INDEX idx_pr_pathologist (pathologist_id),
  CONSTRAINT fk_pr_order FOREIGN KEY (pathology_order_id) REFERENCES pathology_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_user  FOREIGN KEY (pathologist_id)     REFERENCES users            (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Resultados de informes anatomopatológicos';

-- ─── Inventario avanzado (complementa 001) ────────────────────────────────────

-- Proveedores/distribuidores
CREATE TABLE IF NOT EXISTS suppliers (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  org_id        INT UNSIGNED    NOT NULL,
  name          VARCHAR(120)    NOT NULL,
  tax_id        VARCHAR(30)     NULL,
  contact_name  VARCHAR(80)     NULL,
  email         VARCHAR(120)    NULL,
  phone         VARCHAR(30)     NULL,
  address       TEXT            NULL,
  payment_terms INT             NOT NULL DEFAULT 30 COMMENT 'Días de plazo de pago',
  notes         TEXT            NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_supplier_org (org_id),
  CONSTRAINT fk_supplier_org FOREIGN KEY (org_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Proveedores y distribuidores de productos veterinarios';

-- Lotes de inventario
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id             INT UNSIGNED    NOT NULL,
  branch_id           INT UNSIGNED    NOT NULL,
  supplier_id         INT UNSIGNED    NULL,
  lot_number          VARCHAR(60)     NOT NULL,
  manufacture_date    DATE            NULL,
  expiry_date         DATE            NULL,
  quantity_received   DECIMAL(10,3)   NOT NULL DEFAULT 0,
  quantity_available  DECIMAL(10,3)   NOT NULL DEFAULT 0,
  unit_cost           DECIMAL(12,4)   NULL,
  purchase_order_id   INT UNSIGNED    NULL,
  notes               TEXT            NULL,
  created_by          INT UNSIGNED    NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_batch_item   (item_id, branch_id),
  INDEX idx_batch_expiry (expiry_date),
  INDEX idx_batch_lot    (lot_number),
  CONSTRAINT fk_batch_item     FOREIGN KEY (item_id)    REFERENCES inventory_items (id),
  CONSTRAINT fk_batch_branch   FOREIGN KEY (branch_id)  REFERENCES branches        (id),
  CONSTRAINT fk_batch_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers      (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Lotes de inventario con trazabilidad de proveedor y vencimiento';

-- Órdenes de compra
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id      INT UNSIGNED    NOT NULL,
  supplier_id    INT UNSIGNED    NOT NULL,
  po_number      VARCHAR(30)     NOT NULL,
  status         ENUM('draft','sent','partial','received','cancelled') NOT NULL DEFAULT 'draft',
  ordered_date   DATE            NULL,
  expected_date  DATE            NULL,
  received_date  DATE            NULL,
  subtotal       DECIMAL(12,2)   NOT NULL DEFAULT 0,
  tax_amount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
  total_amount   DECIMAL(12,2)   NOT NULL DEFAULT 0,
  notes          TEXT            NULL,
  created_by     INT UNSIGNED    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_po_number (branch_id, po_number),
  INDEX idx_po_branch_status (branch_id, status),
  CONSTRAINT fk_po_branch   FOREIGN KEY (branch_id)  REFERENCES branches   (id),
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Órdenes de compra a proveedores';

-- Ítems de orden de compra
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  purchase_order_id INT UNSIGNED    NOT NULL,
  item_id           INT UNSIGNED    NOT NULL,
  quantity_ordered  DECIMAL(10,3)   NOT NULL,
  quantity_received DECIMAL(10,3)   NOT NULL DEFAULT 0,
  unit_cost         DECIMAL(12,4)   NOT NULL,
  lot_number        VARCHAR(60)     NULL,
  expiry_date       DATE            NULL,
  notes             TEXT            NULL,
  PRIMARY KEY (id),
  INDEX idx_poi_po   (purchase_order_id),
  INDEX idx_poi_item (item_id),
  CONSTRAINT fk_poi_po   FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders  (id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_item FOREIGN KEY (item_id)           REFERENCES inventory_items  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ítems incluidos en una orden de compra';

-- ─── Grooming ─────────────────────────────────────────────────────────────────

-- Tipos de servicios de peluquería/estética
CREATE TABLE IF NOT EXISTS grooming_service_types (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name              VARCHAR(80)     NOT NULL COMMENT 'Ej: Baño y secado, Corte, Pelado completo',
  description       TEXT            NULL,
  base_price_small  DECIMAL(10,2)   NULL COMMENT 'Precio base para tallas pequeñas',
  base_price_medium DECIMAL(10,2)   NULL COMMENT 'Precio base para tallas medianas',
  base_price_large  DECIMAL(10,2)   NULL COMMENT 'Precio base para tallas grandes',
  duration_min_small  SMALLINT UNSIGNED NULL,
  duration_min_medium SMALLINT UNSIGNED NULL,
  duration_min_large  SMALLINT UNSIGNED NULL,
  is_active         TINYINT(1)      NOT NULL DEFAULT 1,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tipos de servicios de peluquería y estética canina/felina';

-- Peluqueros registrados
CREATE TABLE IF NOT EXISTS groomers (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id        INT UNSIGNED    NOT NULL,
  user_id          INT UNSIGNED    NOT NULL COMMENT 'Usuario del sistema asociado',
  commission_type  ENUM('fixed','percentage','none') NOT NULL DEFAULT 'percentage',
  commission_value DECIMAL(8,4)    NOT NULL DEFAULT 0,
  specializations  TEXT            NULL     COMMENT 'Ej: razas nórdicas, pelo rizado, exóticos',
  is_active        TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_groomer_user (user_id),
  INDEX idx_groomer_branch (branch_id),
  CONSTRAINT fk_groomer_branch FOREIGN KEY (branch_id) REFERENCES branches (id),
  CONSTRAINT fk_groomer_user  FOREIGN KEY (user_id)    REFERENCES users    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Peluqueros caninos/felinos del sistema';

-- Citas de peluquería
CREATE TABLE IF NOT EXISTS grooming_appointments (
  id                          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id                   INT UNSIGNED    NOT NULL,
  patient_id                  INT UNSIGNED    NOT NULL,
  client_id                   INT UNSIGNED    NOT NULL,
  groomer_id                  INT UNSIGNED    NOT NULL,
  scheduled_at                DATETIME        NOT NULL,
  estimated_duration_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 90,
  status                      ENUM('scheduled','confirmed','in_progress','ready',
                                   'completed','cancelled','no_show')
                              NOT NULL DEFAULT 'scheduled',
  estimated_price             DECIMAL(10,2)   NULL,
  final_price                 DECIMAL(10,2)   NULL,
  pickup_required             TINYINT(1)      NOT NULL DEFAULT 0,
  pickup_address              TEXT            NULL,
  delivery_required           TINYINT(1)      NOT NULL DEFAULT 0,
  delivery_address            TEXT            NULL,
  notes                       TEXT            NULL,
  created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ga_branch   (branch_id, scheduled_at),
  INDEX idx_ga_patient  (patient_id),
  INDEX idx_ga_groomer  (groomer_id),
  INDEX idx_ga_status   (status),
  CONSTRAINT fk_ga_branch  FOREIGN KEY (branch_id)  REFERENCES branches  (id),
  CONSTRAINT fk_ga_patient FOREIGN KEY (patient_id) REFERENCES patients  (id),
  CONSTRAINT fk_ga_client  FOREIGN KEY (client_id)  REFERENCES clients   (id),
  CONSTRAINT fk_ga_groomer FOREIGN KEY (groomer_id) REFERENCES groomers  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Citas de peluquería y estética veterinaria';

-- Servicios incluidos en cada cita de grooming
CREATE TABLE IF NOT EXISTS grooming_appointment_services (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  grooming_appointment_id  INT UNSIGNED    NOT NULL,
  service_type_id          INT UNSIGNED    NOT NULL,
  price_charged            DECIMAL(10,2)   NULL,
  notes                    TEXT            NULL,
  PRIMARY KEY (id),
  INDEX idx_gas_appt    (grooming_appointment_id),
  INDEX idx_gas_service (service_type_id),
  CONSTRAINT fk_gas_appt    FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments  (id) ON DELETE CASCADE,
  CONSTRAINT fk_gas_service FOREIGN KEY (service_type_id)         REFERENCES grooming_service_types (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Servicios de peluquería realizados en una cita';

-- Registro de lo realizado en la sesión de grooming
CREATE TABLE IF NOT EXISTS grooming_records (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  grooming_appointment_id  INT UNSIGNED    NOT NULL,
  services_performed       JSON            NULL     COMMENT 'Array de servicios realizados con detalle',
  products_used            JSON            NULL     COMMENT 'Productos de peluquería utilizados',
  before_photo_url         VARCHAR(500)    NULL,
  after_photo_url          VARCHAR(500)    NULL,
  behavior_observations    TEXT            NULL,
  coat_condition           ENUM('excellent','good','fair','poor','matted') NULL,
  skin_condition           VARCHAR(100)    NULL,
  vet_referral_required    TINYINT(1)      NOT NULL DEFAULT 0,
  vet_referral_reason      TEXT            NULL,
  final_price              DECIMAL(10,2)   NULL,
  notes                    TEXT            NULL,
  recorded_by              INT UNSIGNED    NOT NULL,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_gr_appt (grooming_appointment_id),
  CONSTRAINT fk_gr_appt FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_gr_user FOREIGN KEY (recorded_by)             REFERENCES users                (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registro detallado de la sesión de grooming realizada';

-- Perfil de grooming del paciente
CREATE TABLE IF NOT EXISTS patient_grooming_profile (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  patient_id               INT UNSIGNED    NOT NULL,
  preferred_grooming_style VARCHAR(100)    NULL     COMMENT 'Ej: cachorro, continental, deportivo',
  coat_type                VARCHAR(60)     NULL     COMMENT 'Ej: rizado, liso, doble capa, largo',
  regular_grooming_frequency VARCHAR(40)   NULL     COMMENT 'Ej: mensual, bimestral',
  behavior_with_grooming   ENUM('excellent','good','nervous','aggressive','requires_sedation') NULL,
  muzzle_required          TINYINT(1)      NOT NULL DEFAULT 0,
  sedation_history         JSON            NULL     COMMENT 'Historial de sedaciones previas en grooming',
  preferred_products       TEXT            NULL,
  allergic_to_products     TEXT            NULL,
  known_issues             TEXT            NULL     COMMENT 'Nudos frecuentes, zonas sensibles, etc.',
  notes                    TEXT            NULL,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pgp_patient (patient_id),
  CONSTRAINT fk_pgp_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Perfil de preferencias y características de grooming del paciente';

-- Calificaciones de sesiones de grooming
CREATE TABLE IF NOT EXISTS grooming_ratings (
  id                          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  grooming_appointment_id     INT UNSIGNED    NOT NULL,
  client_id                   INT UNSIGNED    NOT NULL,
  overall_score               TINYINT UNSIGNED NOT NULL COMMENT '1-5',
  quality_score               TINYINT UNSIGNED NULL COMMENT '1-5',
  timeliness_score            TINYINT UNSIGNED NULL COMMENT '1-5',
  groomer_friendliness_score  TINYINT UNSIGNED NULL COMMENT '1-5',
  comment                     TEXT            NULL,
  would_recommend             TINYINT(1)      NOT NULL DEFAULT 0,
  created_at                  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rating_appt (grooming_appointment_id),
  INDEX idx_rating_client (client_id),
  CONSTRAINT fk_rating_appt   FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_rating_client FOREIGN KEY (client_id)               REFERENCES clients              (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Calificaciones de los clientes sobre las sesiones de grooming';

-- Comisiones de peluqueros
CREATE TABLE IF NOT EXISTS groomer_commission_records (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  groomer_id               INT UNSIGNED    NOT NULL,
  grooming_appointment_id  INT UNSIGNED    NOT NULL,
  commission_amount        DECIMAL(10,2)   NOT NULL,
  commission_pct           DECIMAL(5,2)    NULL,
  is_paid                  TINYINT(1)      NOT NULL DEFAULT 0,
  paid_at                  DATETIME        NULL,
  earned_at                DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes                    TEXT            NULL,
  PRIMARY KEY (id),
  INDEX idx_gcr_groomer (groomer_id),
  INDEX idx_gcr_appt    (grooming_appointment_id),
  CONSTRAINT fk_gcr_groomer FOREIGN KEY (groomer_id)              REFERENCES groomers             (id),
  CONSTRAINT fk_gcr_appt   FOREIGN KEY (grooming_appointment_id)  REFERENCES grooming_appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registros de comisiones ganadas por peluqueros';

-- ─── Índices adicionales de rendimiento ──────────────────────────────────────

CREATE INDEX idx_vaccinations_patient    ON vaccinations             (patient_id, vaccination_date);
CREATE INDEX idx_vaccinations_next_due   ON vaccinations             (next_due_date);
CREATE INDEX idx_deworming_next_due      ON deworming_records        (next_due_date);
CREATE INDEX idx_hosp_active             ON hospitalizations         (branch_id, discharge_date);
CREATE INDEX idx_hmon_recorded_at        ON hospitalization_monitoring (hospitalization_id, recorded_at);
CREATE INDEX idx_lab_orders_patient      ON lab_orders               (patient_id, ordered_at);
CREATE INDEX idx_lab_results_critical    ON lab_results              (is_critical, reported_at);
CREATE INDEX idx_imaging_orders_patient  ON imaging_orders           (patient_id, ordered_at);
CREATE INDEX idx_surgeries_patient_date  ON surgeries                (patient_id, scheduled_date);
CREATE INDEX idx_path_orders_patient     ON pathology_orders         (patient_id, ordered_at);
CREATE INDEX idx_grooming_appt_date      ON grooming_appointments    (branch_id, scheduled_at);
CREATE INDEX idx_inv_batch_expiry        ON inventory_batches        (expiry_date, quantity_available);

-- ─── Vistas clínicas ──────────────────────────────────────────────────────────

-- Vista: hospitalizaciones activas (board de enfermería)
CREATE OR REPLACE VIEW v_active_hospitalizations AS
SELECT
  h.id, h.branch_id, h.patient_id, h.admission_date, h.estimated_discharge_date,
  h.hospitalization_reason, h.hospitalization_status,
  h.special_instructions,
  p.name AS patient_name, p.sex, p.chip_number, p.photo_url,
  sp.common_name AS species, b.name AS breed_name,
  CONCAT(u.first_name,' ',u.last_name) AS responsible_vet,
  k.kennel_number, w.name AS ward_name, w.ward_type,
  DATEDIFF(NOW(), h.admission_date) AS days_admitted
FROM hospitalizations h
JOIN patients p   ON h.patient_id        = p.id
JOIN species  sp  ON p.species_id        = sp.id
JOIN users    u   ON h.responsible_vet_id = u.id
LEFT JOIN breeds b   ON p.breed_id       = b.id
LEFT JOIN kennels k  ON h.kennel_id      = k.id
LEFT JOIN wards   w  ON k.ward_id        = w.id
WHERE h.discharge_date IS NULL;

-- Vista: resultados de laboratorio pendientes
CREATE OR REPLACE VIEW v_pending_lab_results AS
SELECT
  lo.id AS order_id, lo.branch_id, lo.order_number, lo.priority, lo.ordered_at,
  p.name AS patient_name, sp.common_name AS species,
  CONCAT(u.first_name,' ',u.last_name) AS ordered_by,
  COUNT(loi.id) AS total_tests,
  SUM(CASE WHEN loi.status = 'completed' THEN 1 ELSE 0 END) AS completed_tests,
  TIMESTAMPDIFF(HOUR, lo.ordered_at, NOW()) AS hours_elapsed
FROM lab_orders lo
JOIN patients p   ON lo.patient_id = p.id
JOIN species  sp  ON p.species_id  = sp.id
JOIN users    u   ON lo.ordered_by = u.id
JOIN lab_order_items loi ON loi.lab_order_id = lo.id
WHERE lo.status IN ('pending','in_progress','partial')
GROUP BY lo.id, lo.branch_id, lo.order_number, lo.priority, lo.ordered_at,
         p.name, sp.common_name, u.first_name, u.last_name;

-- Vista: informes de imagen pendientes
CREATE OR REPLACE VIEW v_pending_imaging_reports AS
SELECT
  io.id AS order_id, io.branch_id, io.order_number, io.priority, io.ordered_at,
  io.body_region, io.clinical_indication,
  it.name AS imaging_type,
  p.name AS patient_name, sp.common_name AS species,
  CONCAT(u.first_name,' ',u.last_name) AS ordered_by,
  COUNT(img.id) AS image_count
FROM imaging_orders io
JOIN patients p      ON io.patient_id     = p.id
JOIN species  sp     ON p.species_id      = sp.id
JOIN users    u      ON io.ordered_by     = u.id
JOIN imaging_types it ON io.imaging_type_id = it.id
LEFT JOIN imaging_studies ims ON ims.imaging_order_id = io.id
LEFT JOIN imaging_images  img ON img.imaging_study_id  = ims.id
LEFT JOIN imaging_reports ir  ON ir.imaging_order_id   = io.id
WHERE io.status = 'acquired' AND ir.id IS NULL
GROUP BY io.id, io.branch_id, io.order_number, io.priority, io.ordered_at,
         io.body_region, io.clinical_indication, it.name,
         p.name, sp.common_name, u.first_name, u.last_name;

-- Vista: alertas de vacunas vencidas o próximas a vencer
CREATE OR REPLACE VIEW v_vaccination_alerts AS
SELECT
  v.id, v.branch_id, v.patient_id, v.next_due_date,
  p.name AS patient_name, sp.common_name AS species,
  vac.name AS vaccine_name, vac.disease_covered,
  CONCAT(cl.first_name,' ',cl.last_name) AS owner_name, cl.phone AS owner_phone,
  DATEDIFF(v.next_due_date, CURDATE()) AS days_until_due
FROM vaccinations v
JOIN patients p     ON v.patient_id = p.id
JOIN species  sp    ON p.species_id = sp.id
JOIN vaccines vac   ON v.vaccine_id = vac.id
JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
JOIN clients  cl    ON po.client_id = cl.id
WHERE v.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND p.is_active = TRUE;

-- Vista: alertas de desparasitación
CREATE OR REPLACE VIEW v_deworming_alerts AS
SELECT
  dr.id, dr.branch_id, dr.patient_id, dr.next_due_date,
  p.name AS patient_name, sp.common_name AS species,
  ap.name AS product_name, ap.parasite_type,
  CONCAT(cl.first_name,' ',cl.last_name) AS owner_name, cl.phone AS owner_phone,
  DATEDIFF(dr.next_due_date, CURDATE()) AS days_until_due
FROM deworming_records dr
JOIN patients p          ON dr.patient_id  = p.id
JOIN species  sp         ON p.species_id   = sp.id
JOIN antiparasitic_products ap ON dr.product_id = ap.id
JOIN patient_owners po   ON po.patient_id = p.id AND po.ownership_type = 'primary'
JOIN clients  cl         ON po.client_id  = cl.id
WHERE dr.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND p.is_active = TRUE;

-- Vista: grooming del día
CREATE OR REPLACE VIEW v_grooming_today AS
SELECT
  ga.id, ga.branch_id, ga.scheduled_at, ga.estimated_duration_minutes,
  ga.status, ga.estimated_price, ga.final_price,
  ga.pickup_required, ga.pickup_address, ga.delivery_required,
  p.name AS patient_name, sp.common_name AS species, p.photo_url,
  b.name AS breed_name, p.sex,
  CONCAT(cl.first_name,' ',cl.last_name) AS client_name, cl.phone AS client_phone,
  CONCAT(u.first_name,' ',u.last_name) AS groomer_name
FROM grooming_appointments ga
JOIN patients p  ON ga.patient_id = p.id
JOIN species  sp ON p.species_id  = sp.id
JOIN clients  cl ON ga.client_id  = cl.id
JOIN groomers g  ON ga.groomer_id = g.id
JOIN users    u  ON g.user_id     = u.id
LEFT JOIN breeds b ON p.breed_id  = b.id
WHERE DATE(ga.scheduled_at) = CURDATE()
  AND ga.status NOT IN ('cancelled','no_show');

-- Vista: rendimiento de peluqueros
CREATE OR REPLACE VIEW v_groomer_performance AS
SELECT
  g.id AS groomer_id, g.branch_id,
  CONCAT(u.first_name,' ',u.last_name) AS groomer_name,
  COUNT(ga.id) AS total_appointments,
  SUM(CASE WHEN ga.status = 'completed' THEN 1 ELSE 0 END) AS completed_appointments,
  COALESCE(SUM(ga.final_price), 0) AS total_revenue,
  COALESCE(AVG(gr.overall_score), 0) AS avg_rating,
  COUNT(gr.id) AS rating_count,
  COALESCE(SUM(gcr.commission_amount), 0) AS total_commissions
FROM groomers g
JOIN users u ON g.user_id = u.id
LEFT JOIN grooming_appointments ga ON ga.groomer_id = g.id
LEFT JOIN grooming_ratings gr      ON gr.grooming_appointment_id = ga.id
LEFT JOIN groomer_commission_records gcr ON gcr.groomer_id = g.id
GROUP BY g.id, g.branch_id, u.first_name, u.last_name;

-- ============================================================
-- END OF MIGRATION 002
-- ============================================================
