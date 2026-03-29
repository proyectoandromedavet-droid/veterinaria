-- ============================================================
-- 001_base_schema.sql  —  Schema base completo de VetManager API
-- Crea TODAS las tablas core del sistema veterinario.
-- Compatible con MySQL 5.7+ (sin IF NOT EXISTS en CREATE INDEX,
-- sin DEFAULT (expresión), sin JSON DEFAULT con funciones).
-- ============================================================

-- ─── Países ──────────────────────────────────────────────────────────────────
-- Catálogo de países (ISO 3166-1 alpha-2)
CREATE TABLE IF NOT EXISTS countries (
  id           SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         CHAR(2)           NOT NULL COMMENT 'ISO 3166-1 alpha-2 (AR, US, ES...)',
  name         VARCHAR(100)      NOT NULL,
  phone_prefix VARCHAR(10)       NULL,
  is_active    TINYINT(1)        NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_country_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de países ISO 3166-1';

-- ─── Monedas ─────────────────────────────────────────────────────────────────
-- Catálogo de monedas (ISO 4217)
CREATE TABLE IF NOT EXISTS currencies (
  id             SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           CHAR(3)           NOT NULL COMMENT 'ISO 4217 (ARS, USD, EUR...)',
  name           VARCHAR(60)       NOT NULL,
  symbol         VARCHAR(8)        NOT NULL,
  decimal_places TINYINT UNSIGNED  NOT NULL DEFAULT 2,
  is_active      TINYINT(1)        NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_currency_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de monedas ISO 4217';

-- ─── Organizaciones ──────────────────────────────────────────────────────────
-- Organizaciones (clínicas veterinarias) que usan el sistema
CREATE TABLE IF NOT EXISTS organizations (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name                VARCHAR(150)    NOT NULL,
  -- Columnas AFIP agregadas en migración 008
  afip_cuit           VARCHAR(20)     NULL     COMMENT 'CUIT de la organización para AFIP',
  afip_punto_venta    SMALLINT        NOT NULL DEFAULT 1,
  afip_production     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '0=homologación, 1=producción',
  afip_cert           TEXT            NULL     COMMENT 'Certificado .pem',
  afip_key            TEXT            NULL     COMMENT 'Clave privada .key',
  email               VARCHAR(150)    NULL,
  phone               VARCHAR(30)     NULL,
  address             TEXT            NULL,
  country_code        CHAR(2)         NULL,
  logo_url            VARCHAR(500)    NULL,
  website             VARCHAR(255)    NULL,
  timezone            VARCHAR(50)     NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  default_currency_id SMALLINT UNSIGNED NULL,
  subscription_plan   ENUM('free','basic','pro','enterprise') NOT NULL DEFAULT 'free',
  subscription_status ENUM('active','suspended','cancelled','trial') NOT NULL DEFAULT 'trial',
  is_active           TINYINT(1)      NOT NULL DEFAULT 1,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Organizaciones (clínicas veterinarias)';

-- ─── Sucursales ───────────────────────────────────────────────────────────────
-- Sucursales físicas de cada organización
CREATE TABLE IF NOT EXISTS branches (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  organization_id INT UNSIGNED    NOT NULL,
  name            VARCHAR(150)    NOT NULL,
  address         TEXT            NULL,
  city            VARCHAR(80)     NULL,
  state           VARCHAR(80)     NULL,
  country_code    CHAR(2)         NULL,
  postal_code     VARCHAR(20)     NULL,
  phone           VARCHAR(30)     NULL,
  email           VARCHAR(150)    NULL,
  timezone        VARCHAR(50)     NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_branch_org (organization_id),
  CONSTRAINT fk_branch_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sucursales físicas de cada organización';

-- ─── Usuarios ─────────────────────────────────────────────────────────────────
-- Usuarios del sistema (veterinarios, recepcionistas, administradores, etc.)
CREATE TABLE IF NOT EXISTS users (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id               INT UNSIGNED    NOT NULL,
  first_name              VARCHAR(80)     NOT NULL,
  last_name               VARCHAR(80)     NOT NULL,
  email                   VARCHAR(150)    NOT NULL,
  phone                   VARCHAR(30)     NULL,
  password_hash           VARCHAR(255)    NOT NULL,
  license_number          VARCHAR(60)     NULL     COMMENT 'Número de matrícula profesional',
  job_title               VARCHAR(80)     NULL,
  photo_url               VARCHAR(500)    NULL,
  two_factor_enabled      TINYINT(1)      NOT NULL DEFAULT 0,
  two_factor_secret       VARCHAR(100)    NULL     COMMENT 'Secreto TOTP (encriptado)',
  failed_login_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until            DATETIME        NULL,
  is_active               TINYINT(1)      NOT NULL DEFAULT 1,
  last_login_at           DATETIME        NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_email (email),
  INDEX idx_user_branch (branch_id),
  CONSTRAINT fk_user_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Usuarios del sistema (staff veterinario)';

-- ─── Roles y permisos ─────────────────────────────────────────────────────────
-- Roles del sistema (RBAC básico)
CREATE TABLE IF NOT EXISTS roles (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name         VARCHAR(60)   NOT NULL COMMENT 'Ej: admin, vet, receptionist, groomer',
  display_name VARCHAR(100)  NOT NULL,
  description  TEXT          NULL,
  is_system    TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 = no se puede eliminar',
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Roles del sistema para RBAC';

-- Asignación de roles a usuarios
CREATE TABLE IF NOT EXISTS user_roles (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED  NOT NULL,
  role_id    INT UNSIGNED  NOT NULL,
  assigned_by INT UNSIGNED NULL,
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_role (user_id, role_id),
  INDEX idx_user_roles_user (user_id),
  INDEX idx_user_roles_role (role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Asignación de roles a usuarios';

-- ─── Sesiones y autenticación ─────────────────────────────────────────────────
-- Sesiones de usuario activas (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED    NOT NULL,
  session_token    VARCHAR(255)    NOT NULL COMMENT 'Hash del refresh token',
  jti              VARCHAR(36)     NOT NULL COMMENT 'JWT ID del access token asociado',
  ip_address       VARCHAR(45)     NULL,
  user_agent       TEXT            NULL,
  device_type      ENUM('desktop','mobile','tablet','unknown') NOT NULL DEFAULT 'unknown',
  is_revoked       TINYINT(1)      NOT NULL DEFAULT 0,
  revoked_at       DATETIME        NULL,
  last_activity_at DATETIME        NULL,
  expires_at       DATETIME        NOT NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_token (session_token(191)),
  INDEX idx_session_user (user_id, is_revoked),
  INDEX idx_session_jti (jti),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sesiones activas (refresh tokens rotados)';

-- Historial de intentos de login
CREATE TABLE IF NOT EXISTS login_history (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED    NULL,
  ip_address     VARCHAR(45)     NULL,
  user_agent     TEXT            NULL,
  success        TINYINT(1)      NOT NULL DEFAULT 0,
  failure_reason VARCHAR(100)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_login_history_user (user_id, created_at),
  INDEX idx_login_history_ip   (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historial de intentos de inicio de sesión';

-- Tokens de restablecimiento de contraseña
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED  NOT NULL,
  token_hash VARCHAR(255)  NOT NULL,
  expires_at DATETIME      NOT NULL,
  used_at    DATETIME      NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prt_user (user_id),
  INDEX idx_prt_hash (token_hash(64)),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tokens para restablecimiento de contraseña';

-- Códigos de recuperación 2FA
CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED  NOT NULL,
  code_hash  VARCHAR(255)  NOT NULL,
  used_at    DATETIME      NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_2fa_recovery_user (user_id),
  CONSTRAINT fk_2fa_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Códigos de recuperación de autenticación en dos pasos';

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED    NOT NULL,
  branch_id    INT UNSIGNED    NOT NULL,
  name         VARCHAR(60)     NOT NULL,
  key_hash     VARCHAR(255)    NOT NULL,
  key_prefix   VARCHAR(16)     NOT NULL COMMENT 'Primeros 8 chars para identificación',
  scopes       JSON            NULL     COMMENT 'Array de scopes permitidos',
  last_used_at DATETIME        NULL,
  expires_at   DATETIME        NULL,
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_key_hash (key_hash(191)),
  INDEX idx_api_keys_user (user_id, is_active),
  CONSTRAINT fk_apikey_user   FOREIGN KEY (user_id)   REFERENCES users (id)     ON DELETE CASCADE,
  CONSTRAINT fk_apikey_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='API Keys para acceso programático';

-- ─── Especies y razas ─────────────────────────────────────────────────────────
-- Categorías de especies (mamíferos, aves, reptiles, etc.)
CREATE TABLE IF NOT EXISTS species_categories (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_species_category_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Categorías taxonómicas de especies';

-- Especies atendidas
CREATE TABLE IF NOT EXISTS species (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  category_id      INT UNSIGNED    NOT NULL,
  common_name      VARCHAR(80)     NOT NULL,
  scientific_name  VARCHAR(120)    NULL,
  avg_lifespan_years TINYINT UNSIGNED NULL,
  gestation_days   SMALLINT UNSIGNED NULL,
  is_active        TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_species_category (category_id),
  CONSTRAINT fk_species_category FOREIGN KEY (category_id) REFERENCES species_categories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Especies animales atendidas';

-- Razas por especie
CREATE TABLE IF NOT EXISTS breeds (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  species_id INT UNSIGNED  NOT NULL,
  name       VARCHAR(100)  NOT NULL,
  origin     VARCHAR(80)   NULL,
  size_category ENUM('toy','small','medium','large','giant','unknown') NULL,
  avg_weight_kg DECIMAL(6,2) NULL,
  coat_type  VARCHAR(60)   NULL,
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_breed_species (species_id),
  CONSTRAINT fk_breed_species FOREIGN KEY (species_id) REFERENCES species (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Razas por especie';

-- Colores de pelaje/plumaje
CREATE TABLE IF NOT EXISTS coat_colors (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(60)   NOT NULL,
  species_id INT UNSIGNED  NULL     COMMENT 'NULL = aplica a todas las especies',
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_coat_color_species (species_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Colores de pelaje o plumaje para catalogar pacientes';

-- ─── Clientes (dueños) ────────────────────────────────────────────────────────
-- Clientes (propietarios de mascotas)
CREATE TABLE IF NOT EXISTS clients (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id           INT UNSIGNED    NOT NULL,
  first_name          VARCHAR(80)     NOT NULL,
  last_name           VARCHAR(80)     NOT NULL,
  email               VARCHAR(150)    NULL,
  -- portal_password_hash y portal_active agregados en migración 007
  portal_password_hash VARCHAR(255)   NULL     COMMENT 'Hash contraseña del portal de dueños',
  portal_active       TINYINT(1)      NOT NULL DEFAULT 1,
  phone               VARCHAR(30)     NULL,
  document_type       ENUM('dni','passport','rut','cuit','other') NOT NULL DEFAULT 'dni',
  document_number     VARCHAR(30)     NULL,
  dni                 VARCHAR(20)     NULL     COMMENT 'Alias de document_number para compatibilidad',
  address             TEXT            NULL,
  city                VARCHAR(80)     NULL,
  state_id            INT UNSIGNED    NULL,
  country_code        CHAR(2)         NULL,
  postal_code         VARCHAR(20)     NULL,
  tax_id              VARCHAR(30)     NULL     COMMENT 'CUIT/RUC/NIF según país',
  -- fiscal_condition agregado en migración 008
  fiscal_condition    ENUM('RI','MO','CF','EX') NOT NULL DEFAULT 'CF'
                      COMMENT 'Condición fiscal AFIP: RI=Resp.Inscripto MO=Monotributo CF=Cons.Final EX=Exento',
  currency_id         SMALLINT UNSIGNED NULL,
  outstanding_balance DECIMAL(12,2)   NOT NULL DEFAULT 0 COMMENT 'Balance pendiente de pago',
  notes               TEXT            NULL,
  -- Campos GDPR agregados en migración 013
  anonymized_at       DATETIME        NULL,
  anonymized_by       INT UNSIGNED    NULL,
  gdpr_notes          TEXT            NULL,
  is_active           TINYINT(1)      NOT NULL DEFAULT 1,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_client_branch   (branch_id, is_active),
  INDEX idx_client_email    (email),
  INDEX idx_client_document (document_number),
  CONSTRAINT fk_client_branch   FOREIGN KEY (branch_id)   REFERENCES branches   (id),
  CONSTRAINT fk_client_currency FOREIGN KEY (currency_id) REFERENCES currencies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Clientes (propietarios de mascotas)';

-- Contactos de emergencia de clientes
CREATE TABLE IF NOT EXISTS client_emergency_contacts (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  client_id  INT UNSIGNED  NOT NULL,
  name       VARCHAR(120)  NOT NULL,
  relationship VARCHAR(60) NULL,
  phone      VARCHAR(30)   NOT NULL,
  email      VARCHAR(150)  NULL,
  is_primary TINYINT(1)    NOT NULL DEFAULT 0,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_cec_client (client_id),
  CONSTRAINT fk_cec_client FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contactos de emergencia de clientes';

-- ─── Pacientes ────────────────────────────────────────────────────────────────
-- Pacientes (animales)
CREATE TABLE IF NOT EXISTS patients (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  organization_id      INT UNSIGNED    NOT NULL COMMENT 'Org propietaria del registro',
  species_id           INT UNSIGNED    NOT NULL,
  breed_id             INT UNSIGNED    NULL,
  coat_color_id        INT UNSIGNED    NULL,
  name                 VARCHAR(100)    NOT NULL,
  sex                  ENUM('male','female','unknown') NOT NULL DEFAULT 'unknown',
  birthdate            DATE            NULL,
  chip_number          VARCHAR(50)     NULL     COMMENT 'Número de microchip',
  tattoo_number        VARCHAR(50)     NULL,
  passport_number      VARCHAR(50)     NULL,
  weight_kg            DECIMAL(6,3)    NULL,
  body_condition_score TINYINT UNSIGNED NULL    COMMENT 'BCS 1-9',
  is_sterilized        TINYINT(1)      NOT NULL DEFAULT 0,
  is_deceased          TINYINT(1)      NOT NULL DEFAULT 0,
  deceased_at          DATE            NULL,
  photo_url            VARCHAR(500)    NULL,
  notes                TEXT            NULL,
  is_active            TINYINT(1)      NOT NULL DEFAULT 1,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chip_number (chip_number),
  INDEX idx_patient_org     (organization_id),
  INDEX idx_patient_species (species_id),
  INDEX idx_patient_breed   (breed_id),
  CONSTRAINT fk_patient_org        FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_patient_species    FOREIGN KEY (species_id)      REFERENCES species       (id),
  CONSTRAINT fk_patient_breed      FOREIGN KEY (breed_id)        REFERENCES breeds        (id) ON DELETE SET NULL,
  CONSTRAINT fk_patient_coat_color FOREIGN KEY (coat_color_id)   REFERENCES coat_colors   (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Pacientes animales';

-- Propietarios de pacientes (puede haber co-propietarios y guardianes temporales)
CREATE TABLE IF NOT EXISTS patient_owners (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  patient_id     INT UNSIGNED    NOT NULL,
  client_id      INT UNSIGNED    NOT NULL,
  ownership_type ENUM('primary','secondary','temporary_guardian','foster') NOT NULL DEFAULT 'primary',
  start_date     DATE            NULL,
  end_date       DATE            NULL,
  notes          TEXT            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_owner_primary (patient_id, ownership_type),
  INDEX idx_po_patient (patient_id),
  INDEX idx_po_client  (client_id),
  CONSTRAINT fk_po_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
  CONSTRAINT fk_po_client  FOREIGN KEY (client_id)  REFERENCES clients  (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Propietarios y custodios de pacientes';

-- Alergias conocidas de pacientes
CREATE TABLE IF NOT EXISTS patient_allergies (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  patient_id           INT UNSIGNED    NOT NULL,
  allergen             VARCHAR(120)    NOT NULL,
  severity             ENUM('mild','moderate','severe') NOT NULL DEFAULT 'mild',
  reaction_description TEXT            NULL,
  notes                TEXT            NULL,
  diagnosed_at         DATE            NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_allergy_patient (patient_id),
  CONSTRAINT fk_allergy_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Alergias conocidas de pacientes';

-- Condiciones crónicas de pacientes
CREATE TABLE IF NOT EXISTS patient_chronic_conditions (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  patient_id       INT UNSIGNED    NOT NULL,
  condition_name   VARCHAR(150)    NOT NULL,
  diagnosis_code   VARCHAR(20)     NULL     COMMENT 'Código ICD o VeNom',
  diagnosed_at     DATE            NULL,
  managed_with     TEXT            NULL     COMMENT 'Medicamentos/tratamientos actuales',
  notes            TEXT            NULL,
  is_active        TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pcc_patient (patient_id),
  CONSTRAINT fk_pcc_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Condiciones crónicas y enfermedades preexistentes de pacientes';

-- ─── Citas ────────────────────────────────────────────────────────────────────
-- Tipos de citas
CREATE TABLE IF NOT EXISTS appointment_types (
  id                       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id                INT UNSIGNED    NULL     COMMENT 'NULL = disponible en toda la org',
  name                     VARCHAR(80)     NOT NULL,
  default_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  color_hex                CHAR(7)         NULL     COMMENT 'Color para calendario (#FF5733)',
  requires_prep            TINYINT(1)      NOT NULL DEFAULT 0,
  is_active                TINYINT(1)      NOT NULL DEFAULT 1,
  created_at               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_appt_type_branch (branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tipos de citas veterinarias';

-- Citas agendadas
CREATE TABLE IF NOT EXISTS appointments (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id            INT UNSIGNED    NOT NULL,
  patient_id           INT UNSIGNED    NOT NULL,
  vet_id               INT UNSIGNED    NOT NULL,
  appointment_type_id  INT UNSIGNED    NULL,
  scheduled_date       DATETIME        NOT NULL,
  duration_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  status               ENUM('scheduled','confirmed','in_progress','completed','cancelled','no_show')
                       NOT NULL DEFAULT 'scheduled',
  is_emergency         TINYINT(1)      NOT NULL DEFAULT 0,
  reason               VARCHAR(255)    NULL,
  notes                TEXT            NULL,
  -- Columnas portal agregadas en migración 007
  created_by_portal    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '1 si fue creada desde el portal',
  cancellation_reason  VARCHAR(255)    NULL,
  -- google_event_id agregado en migración 009
  google_event_id      VARCHAR(255)    NULL COMMENT 'ID del evento en Google Calendar del veterinario asignado',
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_appt_branch_date  (branch_id, scheduled_date),
  INDEX idx_appt_patient      (patient_id),
  INDEX idx_appt_vet          (vet_id),
  INDEX idx_appt_status       (status),
  CONSTRAINT fk_appt_branch  FOREIGN KEY (branch_id)           REFERENCES branches         (id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id)          REFERENCES patients         (id),
  CONSTRAINT fk_appt_vet     FOREIGN KEY (vet_id)              REFERENCES users            (id),
  CONSTRAINT fk_appt_type    FOREIGN KEY (appointment_type_id) REFERENCES appointment_types(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Citas veterinarias agendadas';

-- Triage de emergencias
CREATE TABLE IF NOT EXISTS emergency_triage (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  appointment_id      INT UNSIGNED    NOT NULL,
  priority            ENUM('immediate','urgent','less_urgent','non_urgent') NOT NULL DEFAULT 'non_urgent',
  chief_complaint     TEXT            NOT NULL,
  heart_rate          SMALLINT UNSIGNED NULL COMMENT 'lpm',
  respiratory_rate    SMALLINT UNSIGNED NULL COMMENT 'rpm',
  temperature_celsius DECIMAL(4,1)    NULL,
  systolic_bp         SMALLINT UNSIGNED NULL COMMENT 'mmHg',
  mucous_membranes    VARCHAR(60)     NULL,
  consciousness_level VARCHAR(60)     NULL,
  pain_score          TINYINT UNSIGNED NULL COMMENT '0-10',
  notes               TEXT            NULL,
  triaged_by          INT UNSIGNED    NOT NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_triage_appt  (appointment_id),
  INDEX idx_triage_priority (priority),
  CONSTRAINT fk_triage_appt FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT fk_triage_user FOREIGN KEY (triaged_by)     REFERENCES users         (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Triage inicial de emergencias veterinarias';

-- ─── Historia Clínica ─────────────────────────────────────────────────────────
-- Historial clínico (una HC por visita)
CREATE TABLE IF NOT EXISTS medical_records (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  appointment_id       INT UNSIGNED    NOT NULL,
  patient_id           INT UNSIGNED    NOT NULL,
  vet_id               INT UNSIGNED    NOT NULL,
  chief_complaint      TEXT            NOT NULL,
  weight_kg            DECIMAL(6,3)    NULL     COMMENT 'Peso al momento de la consulta',
  body_condition_score TINYINT UNSIGNED NULL    COMMENT 'BCS 1-9',
  temperature_celsius  DECIMAL(4,1)    NULL,
  status               ENUM('open','signed','amended') NOT NULL DEFAULT 'open',
  opened_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signed_at            DATETIME        NULL,
  signed_by            INT UNSIGNED    NULL,
  notes                TEXT            NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mr_appointment (appointment_id),
  INDEX idx_mr_patient (patient_id),
  INDEX idx_mr_vet     (vet_id),
  INDEX idx_mr_status  (status),
  CONSTRAINT fk_mr_appointment FOREIGN KEY (appointment_id) REFERENCES appointments    (id),
  CONSTRAINT fk_mr_patient     FOREIGN KEY (patient_id)     REFERENCES patients        (id),
  CONSTRAINT fk_mr_vet         FOREIGN KEY (vet_id)         REFERENCES users           (id),
  CONSTRAINT fk_mr_signed_by   FOREIGN KEY (signed_by)      REFERENCES users           (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Historias clínicas (una por visita)';

-- Anamnesis (reseña clínica del dueño)
CREATE TABLE IF NOT EXISTS anamnesis (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id       INT UNSIGNED    NOT NULL,
  current_illness_history TEXT            NOT NULL,
  illness_duration        VARCHAR(80)     NULL     COMMENT 'Ej: 3 días, 2 semanas',
  illness_onset           VARCHAR(80)     NULL     COMMENT 'Ej: brusco, progresivo',
  -- Signos clínicos reportados por el dueño
  appetite                ENUM('normal','increased','decreased','absent') NULL,
  thirst                  ENUM('normal','increased','decreased','absent') NULL,
  urination               ENUM('normal','increased','decreased','absent') NULL,
  defecation              ENUM('normal','increased','decreased','absent','diarrhea','constipation') NULL,
  vomiting                TINYINT(1)      NOT NULL DEFAULT 0,
  coughing                TINYINT(1)      NOT NULL DEFAULT 0,
  sneezing                TINYINT(1)      NOT NULL DEFAULT 0,
  pruritus                TINYINT(1)      NOT NULL DEFAULT 0,
  locomotion_issues       TINYINT(1)      NOT NULL DEFAULT 0,
  other_signs             TEXT            NULL,
  -- Antecedentes
  vaccination_history     TEXT            NULL,
  deworming_history       TEXT            NULL,
  previous_illnesses      TEXT            NULL,
  previous_surgeries      TEXT            NULL,
  current_medications     TEXT            NULL,
  -- Alimentación y ambiente
  feeding_type            ENUM('commercial','homemade','mixed','raw') NULL,
  feeding_brand           VARCHAR(120)    NULL,
  environment             ENUM('indoor','outdoor','both') NULL,
  contact_with_animals    TINYINT(1)      NOT NULL DEFAULT 0,
  recent_travel           TEXT            NULL,
  owner_observations      TEXT            NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_anamnesis_mr (medical_record_id),
  CONSTRAINT fk_anamnesis_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Anamnesis (historia contada por el propietario)';

-- Examen físico
CREATE TABLE IF NOT EXISTS physical_examinations (
  id                    INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id     INT UNSIGNED    NOT NULL,
  -- Signos vitales
  temperature_celsius   DECIMAL(4,1)    NULL,
  heart_rate            SMALLINT UNSIGNED NULL COMMENT 'lpm',
  respiratory_rate      SMALLINT UNSIGNED NULL COMMENT 'rpm',
  systolic_bp           SMALLINT UNSIGNED NULL COMMENT 'mmHg',
  diastolic_bp          SMALLINT UNSIGNED NULL COMMENT 'mmHg',
  spo2_percent          DECIMAL(5,2)    NULL COMMENT 'Saturación O2',
  weight_kg             DECIMAL(6,3)    NULL,
  body_condition_score  TINYINT UNSIGNED NULL COMMENT 'BCS 1-9',
  -- Examen por sistemas
  mucous_membranes      VARCHAR(80)     NULL COMMENT 'Color, humedad, TRC',
  hydration_status      VARCHAR(60)     NULL COMMENT 'Normal, deshidratado 5%, etc.',
  lymph_nodes           TEXT            NULL,
  skin_coat             TEXT            NULL,
  eyes                  TEXT            NULL,
  ears                  TEXT            NULL,
  nose_throat           TEXT            NULL,
  oral_cavity           TEXT            NULL,
  cardiovascular        TEXT            NULL,
  respiratory           TEXT            NULL,
  abdomen               TEXT            NULL,
  musculoskeletal       TEXT            NULL,
  neurological          TEXT            NULL,
  urogenital            TEXT            NULL,
  pain_assessment       TEXT            NULL,
  general_observations  TEXT            NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_physexam_mr (medical_record_id),
  CONSTRAINT fk_physexam_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Examen físico del paciente por consulta';

-- Diagnósticos
CREATE TABLE IF NOT EXISTS diagnoses (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id INT UNSIGNED    NOT NULL,
  diagnosis_name    VARCHAR(200)    NOT NULL,
  diagnosis_type    ENUM('definitive','presumptive','differential','rule_out') NOT NULL DEFAULT 'presumptive',
  diagnosis_code    VARCHAR(30)     NULL     COMMENT 'Código ICD-10-CM, VeNom o SNOMED-CT',
  is_primary        TINYINT(1)      NOT NULL DEFAULT 0,
  prognosis         ENUM('excellent','good','fair','guarded','poor','grave') NULL,
  notes             TEXT            NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_diagnosis_mr (medical_record_id),
  CONSTRAINT fk_diagnosis_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Diagnósticos por consulta (definitivos, presuntivos, diferenciales)';

-- Tratamientos indicados en consulta
CREATE TABLE IF NOT EXISTS treatments (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id INT UNSIGNED    NOT NULL,
  medication_id     INT UNSIGNED    NULL,
  treatment_type    ENUM('medication','procedure','surgery_ref','specialist_ref','diagnostic',
                         'nursing','physical_therapy','other') NOT NULL DEFAULT 'medication',
  description       TEXT            NULL,
  dose              VARCHAR(80)     NULL,
  dose_unit         VARCHAR(30)     NULL,
  frequency         VARCHAR(80)     NULL,
  route             ENUM('oral','iv','im','sc','topical','inhalation','ophthalmic',
                         'otic','rectal','other') NULL,
  duration_days     SMALLINT UNSIGNED NULL,
  start_date        DATE            NULL,
  notes             TEXT            NULL,
  prescribed_by     INT UNSIGNED    NOT NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_treatment_mr  (medical_record_id),
  INDEX idx_treatment_med (medication_id),
  CONSTRAINT fk_treatment_mr   FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_treatment_user FOREIGN KEY (prescribed_by)     REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tratamientos indicados en consulta';

-- Prescripciones (recetas formales)
CREATE TABLE IF NOT EXISTS prescriptions (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id INT UNSIGNED    NOT NULL,
  prescribed_by     INT UNSIGNED    NOT NULL,
  status            ENUM('active','dispensed','expired','cancelled') NOT NULL DEFAULT 'active',
  notes             TEXT            NULL,
  refills_allowed   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  refills_used      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  valid_until       DATE            NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_prescription_mr   (medical_record_id),
  INDEX idx_prescription_user (prescribed_by),
  CONSTRAINT fk_presc_mr   FOREIGN KEY (medical_record_id) REFERENCES medical_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_presc_user FOREIGN KEY (prescribed_by)     REFERENCES users           (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Recetas médicas formales';

-- Ítems de prescripción
CREATE TABLE IF NOT EXISTS prescription_items (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  prescription_id INT UNSIGNED    NOT NULL,
  medication_id   INT UNSIGNED    NULL     COMMENT 'FK a medications, puede ser NULL si es fórmula magistral',
  medication_name VARCHAR(200)    NOT NULL,
  dose            VARCHAR(80)     NOT NULL,
  dose_unit       VARCHAR(30)     NULL,
  frequency       VARCHAR(80)     NOT NULL,
  route           VARCHAR(40)     NULL,
  duration_days   SMALLINT UNSIGNED NULL,
  quantity        DECIMAL(8,2)    NULL,
  instructions    TEXT            NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_presc_item_presc (prescription_id),
  CONSTRAINT fk_presc_item FOREIGN KEY (prescription_id) REFERENCES prescriptions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ítems individuales de una receta médica';

-- Seguimientos post-consulta
CREATE TABLE IF NOT EXISTS follow_ups (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  medical_record_id INT UNSIGNED    NOT NULL,
  patient_id        INT UNSIGNED    NOT NULL,
  scheduled_date    DATETIME        NULL,
  reason            VARCHAR(255)    NULL,
  notes             TEXT            NULL,
  status            ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  completed_at      DATETIME        NULL,
  completed_by      INT UNSIGNED    NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_followup_mr      (medical_record_id),
  INDEX idx_followup_patient (patient_id),
  INDEX idx_followup_date    (scheduled_date, status),
  CONSTRAINT fk_followup_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records (id),
  CONSTRAINT fk_followup_patient FOREIGN KEY (patient_id)        REFERENCES patients        (id),
  CONSTRAINT fk_followup_user    FOREIGN KEY (completed_by)      REFERENCES users           (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Seguimientos y controles post-consulta programados';

-- ─── Medicamentos ─────────────────────────────────────────────────────────────
-- Catálogo de medicamentos
CREATE TABLE IF NOT EXISTS medications (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  name             VARCHAR(200)    NOT NULL,
  generic_name     VARCHAR(200)    NULL,
  drug_class       VARCHAR(80)     NULL     COMMENT 'Grupo farmacológico',
  concentration    VARCHAR(60)     NULL     COMMENT 'Ej: 500mg/tab, 50mg/mL',
  unit             VARCHAR(30)     NULL     COMMENT 'Unidad de presentación',
  presentation     VARCHAR(80)     NULL     COMMENT 'Ej: comprimido, inyectable, solución oral',
  controlled       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT 'Psicotrópico/estupefaciente',
  requires_rx      TINYINT(1)      NOT NULL DEFAULT 1,
  species_notes    TEXT            NULL     COMMENT 'Notas de uso en distintas especies',
  contraindications TEXT           NULL,
  is_active        TINYINT(1)      NOT NULL DEFAULT 1,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_medication_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de medicamentos y productos farmacéuticos';

-- ─── Servicios y facturación ──────────────────────────────────────────────────
-- Categorías de servicios
CREATE TABLE IF NOT EXISTS service_categories (
  id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name       VARCHAR(80)   NOT NULL,
  color_hex  CHAR(7)       NULL,
  sort_order TINYINT UNSIGNED NOT NULL DEFAULT 0,
  is_active  TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Categorías de servicios veterinarios';

-- Catálogo de servicios
CREATE TABLE IF NOT EXISTS services_catalog (
  id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id            INT UNSIGNED    NULL     COMMENT 'NULL = disponible en toda la org',
  category_id          INT UNSIGNED    NULL,
  name                 VARCHAR(150)    NOT NULL,
  description          TEXT            NULL,
  default_duration_min SMALLINT UNSIGNED NULL,
  base_price           DECIMAL(12,2)   NOT NULL DEFAULT 0,
  cost_price           DECIMAL(12,2)   NULL     COMMENT 'Costo interno',
  tax_pct              DECIMAL(5,2)    NOT NULL DEFAULT 0 COMMENT 'IVA/impuesto en %',
  sku                  VARCHAR(60)     NULL,
  is_active            TINYINT(1)      NOT NULL DEFAULT 1,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_svc_branch   (branch_id),
  INDEX idx_svc_category (category_id),
  CONSTRAINT fk_svc_branch   FOREIGN KEY (branch_id)   REFERENCES branches           (id) ON DELETE SET NULL,
  CONSTRAINT fk_svc_category FOREIGN KEY (category_id) REFERENCES service_categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Catálogo de servicios ofrecidos por la clínica';

-- Listas de precios
CREATE TABLE IF NOT EXISTS price_lists (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id   INT UNSIGNED    NOT NULL,
  currency_id SMALLINT UNSIGNED NOT NULL,
  name        VARCHAR(100)    NOT NULL,
  description TEXT            NULL,
  valid_from  DATE            NULL,
  valid_until DATE            NULL,
  is_default  TINYINT(1)      NOT NULL DEFAULT 0,
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_price_list_branch (branch_id, is_active),
  CONSTRAINT fk_pl_branch   FOREIGN KEY (branch_id)   REFERENCES branches    (id),
  CONSTRAINT fk_pl_currency FOREIGN KEY (currency_id) REFERENCES currencies  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Listas de precios por sucursal y moneda';

-- Ítems de lista de precios
CREATE TABLE IF NOT EXISTS price_list_items (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  price_list_id INT UNSIGNED    NOT NULL,
  service_id    INT UNSIGNED    NOT NULL,
  price         DECIMAL(12,2)   NOT NULL,
  discount_pct  DECIMAL(5,2)    NOT NULL DEFAULT 0,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pli (price_list_id, service_id),
  INDEX idx_pli_service (service_id),
  CONSTRAINT fk_pli_list    FOREIGN KEY (price_list_id) REFERENCES price_lists       (id) ON DELETE CASCADE,
  CONSTRAINT fk_pli_service FOREIGN KEY (service_id)    REFERENCES services_catalog  (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Precios de servicios dentro de una lista de precios';

-- Facturas
CREATE TABLE IF NOT EXISTS invoices (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id        INT UNSIGNED    NOT NULL,
  client_id        INT UNSIGNED    NOT NULL,
  patient_id       INT UNSIGNED    NULL,
  appointment_id   INT UNSIGNED    NULL,
  currency_id      SMALLINT UNSIGNED NOT NULL,
  invoice_number   VARCHAR(30)     NOT NULL,
  status           ENUM('draft','pending','paid','partial','cancelled','refunded','overdue')
                   NOT NULL DEFAULT 'draft',
  issued_date      DATE            NOT NULL,
  due_date         DATE            NULL,
  subtotal         DECIMAL(12,2)   NOT NULL DEFAULT 0,
  tax_amount       DECIMAL(12,2)   NOT NULL DEFAULT 0,
  discount_amount  DECIMAL(12,2)   NOT NULL DEFAULT 0,
  total_amount     DECIMAL(12,2)   NOT NULL DEFAULT 0,
  paid_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
  -- Campos MercadoPago (migración 003)
  mp_preference_id VARCHAR(120)    NULL     COMMENT 'ID de preferencia MercadoPago',
  -- Campos AFIP (migración 008)
  afip_tipo            TINYINT UNSIGNED NULL COMMENT 'Tipo comprobante AFIP (1=FA, 6=FB, 11=FC)',
  afip_punto_venta     SMALLINT UNSIGNED NULL COMMENT 'Punto de venta AFIP',
  afip_nro_comprobante INT UNSIGNED      NULL COMMENT 'Nro de comprobante AFIP',
  afip_cae             VARCHAR(20)       NULL COMMENT 'CAE otorgado por AFIP',
  afip_cae_vto         DATE              NULL COMMENT 'Fecha vencimiento CAE',
  notes            TEXT            NULL,
  created_by       INT UNSIGNED    NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_number (branch_id, invoice_number),
  INDEX idx_invoice_branch  (branch_id, status),
  INDEX idx_invoice_client  (client_id),
  INDEX idx_invoice_date    (issued_date),
  INDEX idx_invoice_afip_cae (afip_cae),
  CONSTRAINT fk_invoice_branch   FOREIGN KEY (branch_id)     REFERENCES branches    (id),
  CONSTRAINT fk_invoice_client   FOREIGN KEY (client_id)     REFERENCES clients     (id),
  CONSTRAINT fk_invoice_patient  FOREIGN KEY (patient_id)    REFERENCES patients    (id) ON DELETE SET NULL,
  CONSTRAINT fk_invoice_currency FOREIGN KEY (currency_id)   REFERENCES currencies  (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Facturas emitidas a clientes';

-- Ítems de facturas
CREATE TABLE IF NOT EXISTS invoice_items (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  invoice_id   INT UNSIGNED    NOT NULL,
  service_id   INT UNSIGNED    NULL,
  description  VARCHAR(255)    NOT NULL,
  quantity     DECIMAL(10,3)   NOT NULL DEFAULT 1,
  unit_price   DECIMAL(12,2)   NOT NULL,
  discount_pct DECIMAL(5,2)    NOT NULL DEFAULT 0,
  tax_pct      DECIMAL(5,2)    NOT NULL DEFAULT 0,
  subtotal     DECIMAL(12,2)   NOT NULL DEFAULT 0 COMMENT 'qty * unit_price * (1 - disc/100)',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inv_item_invoice (invoice_id),
  INDEX idx_inv_item_service (service_id),
  CONSTRAINT fk_inv_item_invoice  FOREIGN KEY (invoice_id) REFERENCES invoices         (id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_item_service  FOREIGN KEY (service_id) REFERENCES services_catalog (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ítems de línea de una factura';

-- Pagos registrados
CREATE TABLE IF NOT EXISTS payments (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  invoice_id     INT UNSIGNED    NOT NULL,
  amount         DECIMAL(12,2)   NOT NULL,
  payment_method ENUM('cash','credit_card','debit_card','bank_transfer','check',
                      'mercadopago','crypto','other') NOT NULL,
  reference      VARCHAR(100)    NULL     COMMENT 'Nro de transacción / referencia externa',
  -- mp_payment_id y payment_status agregados en migración 003
  mp_payment_id  VARCHAR(60)     NULL     COMMENT 'ID de pago en MercadoPago',
  payment_status ENUM('pending','completed','failed','refunded','cancelled')
                 NOT NULL DEFAULT 'completed',
  notes          TEXT            NULL,
  paid_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INT UNSIGNED    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payment_invoice     (invoice_id),
  INDEX idx_payment_mp_id       (mp_payment_id),
  CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Pagos registrados por factura';

-- ─── Inventario ───────────────────────────────────────────────────────────────
-- Ítems de inventario (productos, medicamentos, insumos)
CREATE TABLE IF NOT EXISTS inventory_items (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id      INT UNSIGNED    NOT NULL,
  name           VARCHAR(200)    NOT NULL,
  sku            VARCHAR(60)     NULL,
  item_type      ENUM('medication','supply','equipment','food','accessory','vaccine','other')
                 NOT NULL DEFAULT 'supply',
  unit           VARCHAR(30)     NULL     COMMENT 'Unidad de medida (ml, mg, unidad, caja)',
  unit_cost      DECIMAL(12,4)   NULL,
  sale_price     DECIMAL(12,2)   NULL,
  tax_pct        DECIMAL(5,2)    NOT NULL DEFAULT 0,
  -- stock_quantity y minimum_stock en inventory_items se mantienen para compatibilidad branch route
  stock_quantity DECIMAL(10,3)   NOT NULL DEFAULT 0 COMMENT 'Stock actual (usa inventory_stock en nuevo modelo)',
  minimum_stock  DECIMAL(10,3)   NOT NULL DEFAULT 0,
  expiry_date    DATE            NULL     COMMENT 'Fecha de vencimiento del lote principal',
  barcode        VARCHAR(60)     NULL,
  supplier_id    INT UNSIGNED    NULL     COMMENT 'Proveedor principal (migración 005)',
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inv_item_branch (branch_id),
  INDEX idx_inv_item_sku    (sku),
  CONSTRAINT fk_inv_item_branch FOREIGN KEY (branch_id) REFERENCES branches (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Ítems del inventario (productos, medicamentos, insumos)';

-- Stock por sucursal (modelo normalizado)
CREATE TABLE IF NOT EXISTS inventory_stock (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  item_id             INT UNSIGNED    NOT NULL,
  branch_id           INT UNSIGNED    NOT NULL,
  quantity_available  DECIMAL(10,3)   NOT NULL DEFAULT 0,
  minimum_stock       DECIMAL(10,3)   NOT NULL DEFAULT 0,
  reorder_point       DECIMAL(10,3)   NOT NULL DEFAULT 0,
  maximum_stock       DECIMAL(10,3)   NULL,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_item_branch (item_id, branch_id),
  INDEX idx_stock_branch (branch_id),
  CONSTRAINT fk_stock_item   FOREIGN KEY (item_id)   REFERENCES inventory_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_branch FOREIGN KEY (branch_id) REFERENCES branches        (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Stock por ítem y sucursal';

-- Movimientos de inventario (entradas/salidas/ajustes)
CREATE TABLE IF NOT EXISTS inventory_movements (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id        INT UNSIGNED    NOT NULL,
  branch_id      INT UNSIGNED    NOT NULL,
  movement_type  ENUM('purchase','sale','adjustment','transfer','expired','loss','return')
                 NOT NULL,
  quantity       DECIMAL(10,3)   NOT NULL COMMENT 'Positivo=entrada, negativo=salida',
  unit_cost      DECIMAL(12,4)   NULL,
  reference      VARCHAR(100)    NULL,
  notes          TEXT            NULL,
  batch_id       BIGINT UNSIGNED NULL     COMMENT 'Lote usado (migración 005)',
  created_by     INT UNSIGNED    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_inv_mov_item   (item_id, created_at),
  INDEX idx_inv_mov_branch (branch_id, created_at),
  CONSTRAINT fk_inv_mov_item   FOREIGN KEY (item_id)   REFERENCES inventory_items (id),
  CONSTRAINT fk_inv_mov_branch FOREIGN KEY (branch_id) REFERENCES branches        (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Movimientos de inventario (entradas, salidas, ajustes)';

-- Alertas de stock (bajo stock, vencimiento próximo)
CREATE TABLE IF NOT EXISTS stock_alerts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id     INT UNSIGNED    NOT NULL,
  item_id       INT UNSIGNED    NOT NULL,
  alert_type    ENUM('low_stock','out_of_stock','expiring_soon','expired') NOT NULL,
  current_stock DECIMAL(10,3)   NULL,
  threshold     DECIMAL(10,3)   NULL,
  expiry_date   DATE            NULL,
  notified      TINYINT(1)      NOT NULL DEFAULT 0,
  resolved      TINYINT(1)      NOT NULL DEFAULT 0,
  resolved_at   DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_alert_branch (branch_id, resolved),
  INDEX idx_alert_item   (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Alertas de stock bajo, agotado o próximo a vencer';

-- Transferencias de stock entre sucursales (definida también en 012)
CREATE TABLE IF NOT EXISTS stock_transfers (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  item_id          INT UNSIGNED    NOT NULL,
  from_branch_id   INT UNSIGNED    NOT NULL,
  to_branch_id     INT UNSIGNED    NOT NULL,
  quantity         DECIMAL(10,3)   NOT NULL,
  batch_id         INT UNSIGNED    NULL,
  requested_by     INT UNSIGNED    NOT NULL,
  approved_by      INT UNSIGNED    NULL,
  status           ENUM('pending','approved','in_transit','completed','rejected','cancelled')
                   NOT NULL DEFAULT 'pending',
  reason           TEXT            NULL,
  reference_number VARCHAR(50)     NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_st_from  (from_branch_id),
  INDEX idx_st_to    (to_branch_id),
  INDEX idx_st_item  (item_id),
  CONSTRAINT fk_st_item   FOREIGN KEY (item_id)        REFERENCES inventory_items (id),
  CONSTRAINT fk_st_from   FOREIGN KEY (from_branch_id) REFERENCES branches        (id),
  CONSTRAINT fk_st_to     FOREIGN KEY (to_branch_id)   REFERENCES branches        (id),
  CONSTRAINT fk_st_req    FOREIGN KEY (requested_by)   REFERENCES users           (id),
  CONSTRAINT fk_st_appr   FOREIGN KEY (approved_by)    REFERENCES users           (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Transferencias de stock entre sucursales';

-- ─── Auditoría ────────────────────────────────────────────────────────────────
-- Log de auditoría general del sistema
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED    NULL,
  branch_id   INT UNSIGNED    NULL,
  entity_type VARCHAR(60)     NOT NULL COMMENT 'Nombre de la tabla/entidad afectada',
  entity_id   BIGINT UNSIGNED NULL,
  action      VARCHAR(30)     NOT NULL COMMENT 'INSERT, UPDATE, DELETE, LOGIN, etc.',
  old_values  JSON            NULL,
  new_values  JSON            NULL,
  ip_address  VARCHAR(45)     NULL,
  user_agent  TEXT            NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user   (user_id, created_at),
  INDEX idx_audit_branch (branch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Log de auditoría de acciones del sistema';

-- ─── Recordatorios y notificaciones ──────────────────────────────────────────
-- Recordatorios automáticos (citas, vacunas, antiparasitarios)
CREATE TABLE IF NOT EXISTS reminders (
  id                 INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id          INT UNSIGNED    NOT NULL,
  patient_id         INT UNSIGNED    NULL,
  client_id          INT UNSIGNED    NULL,
  reminder_type      ENUM('appointment','vaccination','deworming','follow_up','payment',
                          'document_expiry','other') NOT NULL,
  related_entity_id  INT UNSIGNED    NULL,
  scheduled_send_at  DATETIME        NOT NULL,
  status             ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  sent_at            DATETIME        NULL COMMENT 'Cuándo se envió el recordatorio por mensajería',
  channel            ENUM('email','sms','whatsapp','push','in_app') NOT NULL DEFAULT 'email',
  message            TEXT            NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reminder_branch  (branch_id, status),
  INDEX idx_reminder_patient (patient_id),
  INDEX idx_reminder_sched   (scheduled_send_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Recordatorios automáticos para clientes';

-- Log de notificaciones enviadas
CREATE TABLE IF NOT EXISTS notification_logs (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  branch_id           INT UNSIGNED    NOT NULL,
  user_id             INT UNSIGNED    NULL,
  client_id           INT UNSIGNED    NULL COMMENT 'Si la notif es para un dueño (portal)',
  channel             ENUM('email','sms','whatsapp','push','in_app') NOT NULL,
  title               VARCHAR(200)    NULL,
  body                TEXT            NULL,
  status              ENUM('sent','delivered','failed','read') NOT NULL DEFAULT 'sent',
  error_message       TEXT            NULL,
  external_id         VARCHAR(100)    NULL COMMENT 'ID en servicio externo (SendGrid, Twilio...)',
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_notif_branch (branch_id, created_at),
  INDEX idx_notif_user   (user_id),
  INDEX idx_notif_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Log de todas las notificaciones enviadas';

-- ─── Transferencias de pacientes entre sucursales ─────────────────────────────
-- (definida también en 012_multibranch.sql)
CREATE TABLE IF NOT EXISTS patient_transfers (
  id               INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  patient_id       INT UNSIGNED    NOT NULL,
  from_branch_id   INT UNSIGNED    NOT NULL,
  to_branch_id     INT UNSIGNED    NOT NULL,
  client_id        INT UNSIGNED    NULL     COMMENT 'Cliente en destino',
  requested_by     INT UNSIGNED    NOT NULL,
  approved_by      INT UNSIGNED    NULL,
  transfer_type    ENUM('visit','ownership') NOT NULL DEFAULT 'visit',
  status           ENUM('pending','approved','completed','rejected','cancelled')
                   NOT NULL DEFAULT 'pending',
  reason           TEXT            NULL,
  notes            TEXT            NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pt_patient  (patient_id),
  INDEX idx_pt_branches (from_branch_id, to_branch_id),
  CONSTRAINT fk_pt_patient FOREIGN KEY (patient_id)     REFERENCES patients  (id),
  CONSTRAINT fk_pt_from    FOREIGN KEY (from_branch_id) REFERENCES branches  (id),
  CONSTRAINT fk_pt_to      FOREIGN KEY (to_branch_id)   REFERENCES branches  (id),
  CONSTRAINT fk_pt_req     FOREIGN KEY (requested_by)   REFERENCES users     (id),
  CONSTRAINT fk_pt_appr    FOREIGN KEY (approved_by)    REFERENCES users     (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Transferencias de pacientes entre sucursales de la misma org';

-- ─── Acceso cross-branch y configuración de integración ───────────────────────
-- Acceso temporal de usuarios a otra sucursal de la misma org
CREATE TABLE IF NOT EXISTS cross_branch_access (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED    NOT NULL,
  branch_id   INT UNSIGNED    NOT NULL,
  granted_by  INT UNSIGNED    NOT NULL,
  valid_from  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valid_until DATETIME        NULL     COMMENT 'NULL = indefinido',
  reason      VARCHAR(255)    NULL,
  is_active   TINYINT(1)      NOT NULL DEFAULT 1,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cba_user_branch (user_id, branch_id),
  INDEX idx_cba_user (user_id, is_active),
  CONSTRAINT fk_cba_user    FOREIGN KEY (user_id)    REFERENCES users    (id) ON DELETE CASCADE,
  CONSTRAINT fk_cba_branch  FOREIGN KEY (branch_id)  REFERENCES branches (id) ON DELETE CASCADE,
  CONSTRAINT fk_cba_granted FOREIGN KEY (granted_by) REFERENCES users    (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Acceso temporal de staff a sucursales distintas a la propia';

-- Configuración de integración entre sucursales
CREATE TABLE IF NOT EXISTS branch_integration_settings (
  branch_id               INT UNSIGNED    NOT NULL,
  share_patient_history   TINYINT(1)      NOT NULL DEFAULT 1,
  share_inventory_view    TINYINT(1)      NOT NULL DEFAULT 1,
  allow_stock_transfers   TINYINT(1)      NOT NULL DEFAULT 1,
  allow_patient_transfers TINYINT(1)      NOT NULL DEFAULT 1,
  require_transfer_approval TINYINT(1)    NOT NULL DEFAULT 0,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id),
  CONSTRAINT fk_bis_branch FOREIGN KEY (branch_id) REFERENCES branches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Configuración de integración y permisos entre sucursales';

-- ─── Tenants (multi-tenant SaaS) ──────────────────────────────────────────────
-- Mapeo de subdominio a organización
CREATE TABLE IF NOT EXISTS tenants (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  org_id     INT UNSIGNED    NOT NULL,
  subdomain  VARCHAR(63)     NOT NULL COMMENT 'Slug, ej: clinic-peludo',
  plan       ENUM('free','basic','pro','enterprise') NOT NULL DEFAULT 'free',
  status     ENUM('active','suspended','cancelled')  NOT NULL DEFAULT 'active',
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_subdomain (subdomain),
  UNIQUE KEY uq_tenant_org       (org_id),
  INDEX idx_tenants_status (status),
  CONSTRAINT fk_tenant_org FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Tabla de tenants para resolución de subdominios SaaS';

-- ─── Índices adicionales de rendimiento ──────────────────────────────────────
-- Índices nombrados para columnas de búsqueda frecuente

CREATE INDEX idx_patients_name        ON patients         (name);
CREATE INDEX idx_patients_chip        ON patients         (chip_number);
CREATE INDEX idx_appointments_date    ON appointments     (scheduled_date);
CREATE INDEX idx_inv_mov_type         ON inventory_movements (movement_type, created_at);
CREATE INDEX idx_sessions_expires     ON sessions         (expires_at, is_revoked);
CREATE INDEX idx_invoices_status_date ON invoices         (status, issued_date);

-- ─── Vistas útiles ────────────────────────────────────────────────────────────

-- Vista: citas del día para agenda
CREATE OR REPLACE VIEW v_today_appointments AS
SELECT
  a.id, a.branch_id, a.scheduled_date, a.duration_minutes, a.status, a.is_emergency,
  a.reason, a.notes,
  p.id AS patient_id, p.name AS patient_name, p.photo_url,
  sp.common_name AS species,
  CONCAT(cl.first_name,' ',cl.last_name) AS owner_name, cl.phone AS owner_phone,
  CONCAT(u.first_name,' ',u.last_name) AS vet_name,
  at2.name AS appointment_type,
  mr.id AS medical_record_id
FROM appointments a
JOIN patients p       ON a.patient_id = p.id
JOIN species sp        ON p.species_id  = sp.id
JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
JOIN clients cl        ON po.client_id  = cl.id
JOIN users   u         ON a.vet_id      = u.id
LEFT JOIN appointment_types at2 ON a.appointment_type_id = at2.id
LEFT JOIN medical_records mr    ON mr.appointment_id     = a.id
WHERE DATE(a.scheduled_date) = CURDATE()
  AND a.status NOT IN ('cancelled','no_show');

-- Vista: envejecimiento de facturas por cliente
CREATE OR REPLACE VIEW v_invoice_aging AS
SELECT
  i.branch_id,
  i.client_id,
  CONCAT(cl.first_name,' ',cl.last_name) AS client_name,
  cl.email,
  COUNT(i.id) AS invoice_count,
  SUM(i.total_amount - i.paid_amount) AS total_outstanding,
  SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) <= 0  THEN i.total_amount - i.paid_amount ELSE 0 END) AS current_due,
  SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 1 AND 30 THEN i.total_amount - i.paid_amount ELSE 0 END) AS overdue_1_30,
  SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60 THEN i.total_amount - i.paid_amount ELSE 0 END) AS overdue_31_60,
  SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) > 60 THEN i.total_amount - i.paid_amount ELSE 0 END) AS overdue_60_plus
FROM invoices i
JOIN clients cl ON i.client_id = cl.id
WHERE i.status IN ('pending','partial','overdue')
GROUP BY i.branch_id, i.client_id, cl.first_name, cl.last_name, cl.email;

-- ============================================================
-- END OF MIGRATION 001
-- ============================================================
