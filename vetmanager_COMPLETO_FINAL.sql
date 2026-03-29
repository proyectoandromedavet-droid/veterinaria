-- ============================================================
-- VETMANAGER SAAS v2.0 - MySQL 8.0+
-- ARCHIVO 1/5: INFRAESTRUCTURA SAAS + AUTENTICACIÓN + SEGURIDAD
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ============================================================
-- BLOQUE 1: GEOGRAFÍA
-- ============================================================

CREATE TABLE countries (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name         VARCHAR(100)    NOT NULL,
    iso2         CHAR(2)         NOT NULL,
    iso3         CHAR(3)         NOT NULL,
    phone_prefix VARCHAR(10),
    currency_code CHAR(3),
    active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_iso2 (iso2),
    UNIQUE KEY uq_iso3 (iso3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE states (
    id         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    country_id INT UNSIGNED  NOT NULL,
    name       VARCHAR(100)  NOT NULL,
    code       VARCHAR(10),
    PRIMARY KEY (id),
    KEY fk_states_country (country_id),
    CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cities (
    id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    state_id INT UNSIGNED  NOT NULL,
    name     VARCHAR(100)  NOT NULL,
    zip_code VARCHAR(20),
    PRIMARY KEY (id),
    KEY fk_cities_state (state_id),
    CONSTRAINT fk_cities_state FOREIGN KEY (state_id) REFERENCES states(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE currencies (
    id     SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code   CHAR(3)           NOT NULL,
    name   VARCHAR(60)       NOT NULL,
    symbol VARCHAR(5)        NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_currency_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 2: PLANES SAAS Y FEATURES
-- ============================================================

CREATE TABLE subscription_plans (
    id                   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code                 VARCHAR(30)       NOT NULL,
    name                 VARCHAR(100)      NOT NULL,
    description          TEXT,
    price_monthly_usd    DECIMAL(10,2)     NOT NULL DEFAULT 0,
    price_yearly_usd     DECIMAL(10,2)     NOT NULL DEFAULT 0,
    max_branches         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    max_users            SMALLINT UNSIGNED NOT NULL DEFAULT 5,
    max_patients         INT UNSIGNED      NOT NULL DEFAULT 500,
    storage_gb           SMALLINT UNSIGNED NOT NULL DEFAULT 5,
    -- Feature flags
    has_laboratory       TINYINT(1) NOT NULL DEFAULT 0,
    has_imaging          TINYINT(1) NOT NULL DEFAULT 0,
    has_pathology        TINYINT(1) NOT NULL DEFAULT 0,
    has_surgery          TINYINT(1) NOT NULL DEFAULT 0,
    has_hospitalization  TINYINT(1) NOT NULL DEFAULT 0,
    has_telemedicine     TINYINT(1) NOT NULL DEFAULT 0,
    has_grooming         TINYINT(1) NOT NULL DEFAULT 0,
    has_pharmacy         TINYINT(1) NOT NULL DEFAULT 0,
    has_billing          TINYINT(1) NOT NULL DEFAULT 0,
    has_api_access       TINYINT(1) NOT NULL DEFAULT 0,
    has_custom_reports   TINYINT(1) NOT NULL DEFAULT 0,
    has_whatsapp_bot     TINYINT(1) NOT NULL DEFAULT 0,
    has_multi_currency   TINYINT(1) NOT NULL DEFAULT 0,
    has_sso              TINYINT(1) NOT NULL DEFAULT 0,
    is_active            TINYINT(1) NOT NULL DEFAULT 1,
    created_at           TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_plan_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 3: ORGANIZACIONES (TENANTS)
-- ============================================================

CREATE TABLE organizations (
    id                   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    uuid                 CHAR(36)        NOT NULL DEFAULT (UUID()),
    plan_id              SMALLINT UNSIGNED NOT NULL,
    country_id           INT UNSIGNED    NOT NULL,
    name                 VARCHAR(200)    NOT NULL,
    legal_name           VARCHAR(200),
    tax_id               VARCHAR(60),         -- RUC/RFC/CUIT/NIT/RUT
    tax_id_type          VARCHAR(20),         -- tipo de identificación fiscal
    logo_url             VARCHAR(500),
    website              VARCHAR(200),
    email                VARCHAR(200),
    phone                VARCHAR(50),
    address              TEXT,
    -- Estado de suscripción
    subscription_status  ENUM('trial','active','past_due','suspended','cancelled') NOT NULL DEFAULT 'trial',
    trial_ends_at        DATETIME,
    subscription_starts_at DATE,
    subscription_ends_at   DATE,
    -- Configuración regional
    default_currency     CHAR(3)         NOT NULL DEFAULT 'USD',
    default_language     CHAR(5)         NOT NULL DEFAULT 'es_LA',
    default_timezone     VARCHAR(60)     NOT NULL DEFAULT 'America/Buenos_Aires',
    date_format          VARCHAR(20)     NOT NULL DEFAULT 'DD/MM/YYYY',
    -- Datos de contacto administrativo
    admin_contact_name   VARCHAR(200),
    admin_contact_email  VARCHAR(200),
    admin_contact_phone  VARCHAR(50),
    -- Seguridad
    force_2fa            TINYINT(1)      NOT NULL DEFAULT 0,
    session_timeout_min  SMALLINT UNSIGNED NOT NULL DEFAULT 480,
    allowed_ip_ranges    JSON,                -- array de CIDRs permitidos
    password_min_length  TINYINT UNSIGNED NOT NULL DEFAULT 8,
    password_require_upper TINYINT(1)    NOT NULL DEFAULT 1,
    password_require_special TINYINT(1) NOT NULL DEFAULT 1,
    password_expiry_days SMALLINT UNSIGNED NOT NULL DEFAULT 90,
    max_login_attempts   TINYINT UNSIGNED NOT NULL DEFAULT 5,
    -- Estado
    active               TINYINT(1)      NOT NULL DEFAULT 1,
    deleted_at           DATETIME,
    created_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_org_uuid (uuid),
    KEY fk_org_plan (plan_id),
    KEY fk_org_country (country_id),
    CONSTRAINT fk_org_plan    FOREIGN KEY (plan_id)    REFERENCES subscription_plans(id),
    CONSTRAINT fk_org_country FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE branches (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    uuid            CHAR(36)      NOT NULL DEFAULT (UUID()),
    name            VARCHAR(200)  NOT NULL,
    branch_code     VARCHAR(20),
    city_id         INT UNSIGNED,
    address         TEXT          NOT NULL,
    latitude        DECIMAL(10,8),
    longitude       DECIMAL(11,8),
    phone           VARCHAR(50),
    whatsapp        VARCHAR(50),
    email           VARCHAR(200),
    -- Horarios: {"monday":{"open":"08:00","close":"20:00","active":true}, ...}
    working_hours   JSON,
    -- Servicios habilitados en esta sede
    services_enabled JSON,
    timezone        VARCHAR(60)   NOT NULL DEFAULT 'America/Buenos_Aires',
    is_main_branch  TINYINT(1)    NOT NULL DEFAULT 0,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_branch_uuid (uuid),
    KEY fk_branch_org (organization_id),
    KEY fk_branch_city (city_id),
    CONSTRAINT fk_branch_org  FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_branch_city FOREIGN KEY (city_id) REFERENCES cities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 4: ROLES Y PERMISOS (RBAC)
-- ============================================================

CREATE TABLE roles (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name         VARCHAR(60)   NOT NULL,
    display_name VARCHAR(100)  NOT NULL,
    description  TEXT,
    -- 1=sistema 2=organización 3=sucursal 4=clínico 5=operativo
    level        TINYINT UNSIGNED NOT NULL DEFAULT 5,
    is_system    TINYINT(1)    NOT NULL DEFAULT 0,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_role_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE permissions (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    module      VARCHAR(60)   NOT NULL,
    action      VARCHAR(50)   NOT NULL,
    resource    VARCHAR(100)  NOT NULL,
    description VARCHAR(200),
    PRIMARY KEY (id),
    UNIQUE KEY uq_perm (module, action, resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE role_permissions (
    role_id       INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
    CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 5: USUARIOS
-- ============================================================

CREATE TABLE users (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,              -- NULL = superadmin de plataforma
    uuid             CHAR(36)      NOT NULL DEFAULT (UUID()),
    username         VARCHAR(100)  NOT NULL,
    email            VARCHAR(200)  NOT NULL,
    password_hash    VARCHAR(255)  NOT NULL,
    password_changed_at DATETIME,
    first_name       VARCHAR(100)  NOT NULL,
    last_name        VARCHAR(100)  NOT NULL,
    phone            VARCHAR(50),
    national_id      VARCHAR(50),
    date_of_birth    DATE,
    gender           ENUM('M','F','other'),
    profile_photo_url VARCHAR(500),
    -- Datos profesionales
    license_number   VARCHAR(100),
    license_issuer   VARCHAR(200),
    license_expiry   DATE,
    specializations  JSON,
    -- 2FA
    two_factor_enabled TINYINT(1)  NOT NULL DEFAULT 0,
    two_factor_secret  VARCHAR(100),
    two_factor_method  ENUM('totp','sms','email') DEFAULT 'totp',
    -- Seguridad
    last_login_at       DATETIME,
    last_login_ip       VARCHAR(45),
    failed_attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
    locked_until        DATETIME,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    -- Estado
    active           TINYINT(1)    NOT NULL DEFAULT 1,
    deleted_at       DATETIME,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_email (email),
    UNIQUE KEY uq_user_uuid  (uuid),
    KEY fk_user_org (organization_id),
    CONSTRAINT fk_user_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED  NOT NULL,
    role_id         INT UNSIGNED  NOT NULL,
    organization_id INT UNSIGNED,
    branch_id       INT UNSIGNED,              -- NULL = todas las sucursales
    assigned_by     INT UNSIGNED,
    assigned_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_role_branch (user_id, role_id, branch_id),
    KEY fk_ur_user   (user_id),
    KEY fk_ur_role   (role_id),
    KEY fk_ur_org    (organization_id),
    KEY fk_ur_branch (branch_id),
    CONSTRAINT fk_ur_user   FOREIGN KEY (user_id)   REFERENCES users(id),
    CONSTRAINT fk_ur_role   FOREIGN KEY (role_id)   REFERENCES roles(id),
    CONSTRAINT fk_ur_org    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_ur_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 6: SESIONES Y SEGURIDAD
-- ============================================================

-- Sesiones activas (JWT / tokens de acceso)
CREATE TABLE user_sessions (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED     NOT NULL,
    organization_id INT UNSIGNED,
    session_token   VARCHAR(512)     NOT NULL,  -- hash del JWT
    refresh_token   VARCHAR(512),
    device_type     ENUM('web','mobile_ios','mobile_android','desktop','api'),
    device_name     VARCHAR(200),
    ip_address      VARCHAR(45)      NOT NULL,
    user_agent      VARCHAR(500),
    country_code    CHAR(2),
    city            VARCHAR(100),
    -- Expiración
    expires_at      DATETIME         NOT NULL,
    last_activity   DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Revocación
    revoked         TINYINT(1)       NOT NULL DEFAULT 0,
    revoked_at      DATETIME,
    revoked_reason  ENUM('logout','forced','password_changed','admin','expired'),
    created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_session_token (session_token(255)),
    KEY fk_sess_user (user_id),
    KEY idx_sess_expires (expires_at, revoked),
    CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historial completo de logins (éxitos y fallos)
CREATE TABLE login_history (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED,               -- NULL si usuario no existe
    organization_id INT UNSIGNED,
    email_attempted VARCHAR(200)     NOT NULL,
    ip_address      VARCHAR(45)      NOT NULL,
    user_agent      VARCHAR(500),
    country_code    CHAR(2),
    city            VARCHAR(100),
    success         TINYINT(1)       NOT NULL DEFAULT 0,
    failure_reason  ENUM('wrong_password','user_not_found','account_locked',
                         'account_inactive','2fa_failed','ip_blocked','expired'),
    session_id      BIGINT UNSIGNED,
    attempted_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_lh_user    (user_id),
    KEY idx_lh_ip     (ip_address),
    KEY idx_lh_email  (email_attempted),
    KEY idx_lh_date   (attempted_at),
    CONSTRAINT fk_lh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de recuperación de contraseña
CREATE TABLE password_reset_tokens (
    id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED  NOT NULL,
    token_hash  VARCHAR(255)  NOT NULL,
    expires_at  DATETIME      NOT NULL,
    used        TINYINT(1)    NOT NULL DEFAULT 0,
    used_at     DATETIME,
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_prt_token (token_hash),
    KEY fk_prt_user (user_id),
    CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API Keys para integraciones externas
CREATE TABLE api_keys (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    user_id         INT UNSIGNED,              -- quién la creó
    uuid            CHAR(36)      NOT NULL DEFAULT (UUID()),
    name            VARCHAR(100)  NOT NULL,
    key_prefix      VARCHAR(10)   NOT NULL,    -- primeros 8 chars visibles
    key_hash        VARCHAR(255)  NOT NULL,    -- hash completo
    scopes          JSON          NOT NULL,    -- ["read:patients","write:appointments",...]
    allowed_ips     JSON,                      -- CIDRs permitidos, NULL = todos
    expires_at      DATETIME,
    last_used_at    DATETIME,
    last_used_ip    VARCHAR(45),
    total_requests  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    revoked_at      DATETIME,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_apikey_hash   (key_hash),
    UNIQUE KEY uq_apikey_prefix (organization_id, key_prefix),
    KEY fk_ak_org  (organization_id),
    KEY fk_ak_user (user_id),
    CONSTRAINT fk_ak_org  FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_ak_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IP Whitelist / Blacklist por organización
CREATE TABLE ip_rules (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    cidr            VARCHAR(50)   NOT NULL,    -- ej: "190.2.100.0/24"
    rule_type       ENUM('allow','deny')       NOT NULL DEFAULT 'allow',
    description     VARCHAR(200),
    created_by      INT UNSIGNED,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_iprule_org (organization_id),
    CONSTRAINT fk_iprule_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 7: AUDITORÍA (tabla central)
-- ============================================================

CREATE TABLE audit_logs (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED,
    branch_id       INT UNSIGNED,
    user_id         INT UNSIGNED,
    session_id      BIGINT UNSIGNED,
    action          ENUM('CREATE','READ','UPDATE','DELETE',
                         'LOGIN','LOGOUT','EXPORT','PRINT',
                         'SIGN','APPROVE','REVOKE','RESTORE') NOT NULL,
    module          VARCHAR(60)      NOT NULL,
    entity          VARCHAR(100),               -- nombre de la tabla
    entity_id       BIGINT UNSIGNED,            -- ID del registro afectado
    entity_uuid     CHAR(36),
    old_values      JSON,
    new_values      JSON,
    diff            JSON,                        -- sólo los campos que cambiaron
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    request_id      CHAR(36),                    -- correlación con logs del servidor
    risk_level      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'low',
    notes           TEXT,
    created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_org    (organization_id),
    KEY idx_audit_user   (user_id),
    KEY idx_audit_entity (entity, entity_id),
    KEY idx_audit_action (action),
    KEY idx_audit_date   (created_at),
    KEY idx_audit_risk   (risk_level, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p2026 VALUES LESS THAN (2027),
    PARTITION p2027 VALUES LESS THAN (2028),
    PARTITION pmax  VALUES LESS THAN MAXVALUE
  );

-- Alertas de seguridad en tiempo real
CREATE TABLE security_alerts (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED,
    user_id         INT UNSIGNED,
    alert_type      ENUM('brute_force','impossible_travel','suspicious_ip',
                         'mass_export','after_hours_access','privilege_escalation',
                         'api_abuse','data_breach_attempt') NOT NULL,
    severity        ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
    description     TEXT             NOT NULL,
    metadata        JSON,
    ip_address      VARCHAR(45),
    acknowledged    TINYINT(1)       NOT NULL DEFAULT 0,
    acknowledged_by INT UNSIGNED,
    acknowledged_at DATETIME,
    created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_sa_org      (organization_id),
    KEY idx_sa_type     (alert_type),
    KEY idx_sa_severity (severity, acknowledged),
    KEY idx_sa_date     (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BLOQUE 8: MÉTRICAS DE USO SAAS
-- ============================================================

CREATE TABLE organization_usage (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    metric_month    DATE          NOT NULL,     -- primer día del mes
    total_patients  INT UNSIGNED  NOT NULL DEFAULT 0,
    total_users     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    total_branches  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    consultations_count INT UNSIGNED NOT NULL DEFAULT 0,
    lab_orders_count    INT UNSIGNED NOT NULL DEFAULT 0,
    imaging_count       INT UNSIGNED NOT NULL DEFAULT 0,
    surgeries_count     INT UNSIGNED NOT NULL DEFAULT 0,
    api_calls_count     BIGINT UNSIGNED NOT NULL DEFAULT 0,
    storage_used_mb     BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usage_org_month (organization_id, metric_month),
    CONSTRAINT fk_usage_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: PLANES SAAS
-- ============================================================

INSERT INTO subscription_plans
(code, name, description, price_monthly_usd, price_yearly_usd,
 max_branches, max_users, max_patients, storage_gb,
 has_laboratory, has_imaging, has_pathology, has_surgery,
 has_hospitalization, has_telemedicine, has_grooming,
 has_pharmacy, has_billing, has_api_access, has_custom_reports,
 has_whatsapp_bot, has_multi_currency, has_sso)
VALUES
('starter',    'Starter',    'Clínica pequeña, hasta 1 sede',
  49, 470,  1,  5,   500,  5,  0,0,0,0,0,0,1,0,1,0,0,0,0,0),
('growth',     'Growth',     'Clínica en crecimiento, múltiples vets',
  149, 1430, 3, 15, 3000, 20,  1,1,0,1,1,0,1,1,1,0,0,1,0,0),
('professional','Professional','Clínica completa con especialidades',
  299, 2870, 5, 30, 10000,50,  1,1,1,1,1,1,1,1,1,1,1,1,1,0),
('enterprise', 'Enterprise', 'Red de clínicas / multinacional',
    0,    0, 9999,9999,9999999,500, 1,1,1,1,1,1,1,1,1,1,1,1,1,1);

-- SEED: ROLES
INSERT INTO roles (name, display_name, description, level, is_system) VALUES
('system_admin',     'Administrador de Plataforma',   'Control total del SaaS — equipo interno',          1, 1),
('org_admin',        'Administrador de Organización', 'Gestión completa del tenant',                      2, 1),
('branch_manager',   'Gerente de Sucursal',           'Gestión operativa de una sucursal',                3, 0),
('veterinarian',     'Médico Veterinario',            'Atención clínica completa, firma HC',              4, 1),
('vet_specialist',   'Veterinario Especialista',      'Cirugía / Derma / Cardio / Oncología',             4, 0),
('vet_resident',     'Veterinario Residente',         'Clínica con supervisión',                          4, 0),
('vet_technician',   'Técnico Veterinario',           'Asistencia clínica, muestras, curas',              4, 0),
('radiologist',      'Radiólogo Veterinario',         'Informes de diagnóstico por imagen',               4, 0),
('pathologist',      'Patólogo Veterinario',          'Informes anatomopatológicos',                      4, 0),
('anesthesiologist', 'Anestesiólogo Veterinario',     'Protocolos y monitoreo anestésico',                4, 0),
('lab_technician',   'Técnico de Laboratorio',        'Procesamiento de muestras y carga de resultados',  4, 0),
('receptionist',     'Recepcionista',                 'Agenda, alta de clientes, caja básica',            5, 0),
('pharmacist',       'Farmacéutico',                  'Farmacia e inventario',                            5, 0),
('accountant',       'Facturación / Contabilidad',    'Facturas, cobros y reportes financieros',          5, 0),
('groomer',          'Peluquero / Groomer',           'Servicios de peluquería y estética',               5, 0),
('readonly',         'Solo Lectura',                  'Consulta sin modificaciones',                      5, 0);

-- SEED: PAÍSES LATAM
INSERT INTO countries (name, iso2, iso3, phone_prefix, currency_code) VALUES
('Argentina',           'AR','ARG','+54',  'ARS'),
('Bolivia',             'BO','BOL','+591', 'BOB'),
('Brasil',              'BR','BRA','+55',  'BRL'),
('Chile',               'CL','CHL','+56',  'CLP'),
('Colombia',            'CO','COL','+57',  'COP'),
('Costa Rica',          'CR','CRI','+506', 'CRC'),
('Cuba',                'CU','CUB','+53',  'CUP'),
('Ecuador',             'EC','ECU','+593', 'USD'),
('El Salvador',         'SV','SLV','+503', 'USD'),
('Guatemala',           'GT','GTM','+502', 'GTQ'),
('Honduras',            'HN','HND','+504', 'HNL'),
('México',              'MX','MEX','+52',  'MXN'),
('Nicaragua',           'NI','NIC','+505', 'NIO'),
('Panamá',              'PA','PAN','+507', 'PAB'),
('Paraguay',            'PY','PRY','+595', 'PYG'),
('Perú',                'PE','PER','+51',  'PEN'),
('República Dominicana','DO','DOM','+1809','DOP'),
('Uruguay',             'UY','URY','+598', 'UYU'),
('Venezuela',           'VE','VEN','+58',  'VES'),
('España',              'ES','ESP','+34',  'EUR'),
('Estados Unidos',      'US','USA','+1',   'USD');

-- SEED: MONEDAS
INSERT INTO currencies (code, name, symbol) VALUES
('ARS','Peso Argentino',       '$' ),('BOB','Boliviano',           'Bs.'),
('BRL','Real Brasileño',       'R$'),('CLP','Peso Chileno',        '$'  ),
('COP','Peso Colombiano',      '$' ),('CRC','Colón Costarricense', '₡'  ),
('DOP','Peso Dominicano',      'RD$'),('GTQ','Quetzal',            'Q'  ),
('HNL','Lempira',              'L' ),('MXN','Peso Mexicano',       '$'  ),
('NIO','Córdoba',              'C$'),('PAB','Balboa',              'B/.'),
('PEN','Sol Peruano',          'S/.'),('PYG','Guaraní',            '₲'  ),
('UYU','Peso Uruguayo',        '$U'),('VES','Bolívar Soberano',    'Bs.S'),
('USD','Dólar Estadounidense', '$' ),('EUR','Euro',                '€'  );

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 2/5: ESPECIES, PROPIETARIOS, PACIENTES, RELACIONES
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- ESPECIES Y RAZAS
-- ============================================================

CREATE TABLE species_categories (
    id           TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(50)      NOT NULL,
    display_name VARCHAR(100)     NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE species (
    id                 SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id        TINYINT UNSIGNED  NOT NULL,
    common_name        VARCHAR(100)      NOT NULL,
    scientific_name    VARCHAR(150),
    avg_lifespan_years TINYINT UNSIGNED,
    gestation_days     SMALLINT UNSIGNED,
    avg_weight_kg_min  DECIMAL(8,2),
    avg_weight_kg_max  DECIMAL(8,2),
    -- Valores clínicos normales de referencia
    temp_min_c         DECIMAL(4,1),
    temp_max_c         DECIMAL(4,1),
    hr_min             SMALLINT,
    hr_max             SMALLINT,
    rr_min             SMALLINT,
    rr_max             SMALLINT,
    active             TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_sp_cat (category_id),
    CONSTRAINT fk_sp_cat FOREIGN KEY (category_id) REFERENCES species_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE breeds (
    id                 SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    species_id         SMALLINT UNSIGNED NOT NULL,
    name               VARCHAR(100)      NOT NULL,
    origin_country     VARCHAR(100),
    size_category      ENUM('toy','small','medium','large','giant'),
    avg_weight_kg_min  DECIMAL(6,2),
    avg_weight_kg_max  DECIMAL(6,2),
    avg_lifespan_years TINYINT UNSIGNED,
    common_conditions  TEXT,
    active             TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_breed_sp (species_id),
    CONSTRAINT fk_breed_sp FOREIGN KEY (species_id) REFERENCES species(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coat_colors (
    id         SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name       VARCHAR(60)       NOT NULL,
    species_id SMALLINT UNSIGNED,
    PRIMARY KEY (id),
    KEY fk_color_sp (species_id),
    CONSTRAINT fk_color_sp FOREIGN KEY (species_id) REFERENCES species(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PROPIETARIOS / CLIENTES (OWNERS)
-- El propietario es la persona responsable legal del animal.
-- Un propietario puede tener N mascotas.
-- Una mascota puede tener múltiples propietarios (copropiedad,
-- cambio de dueño, tutor temporal).
-- ============================================================

CREATE TABLE clients (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED  NOT NULL,
    uuid             CHAR(36)      NOT NULL DEFAULT (UUID()),
    client_code      VARCHAR(20),                -- código interno generado
    -- Datos personales
    first_name       VARCHAR(100)  NOT NULL,
    last_name        VARCHAR(100)  NOT NULL,
    national_id_type ENUM('DNI','CC','CURP','RUT','CI','CE','Passport','NIT','Other'),
    national_id      VARCHAR(60),
    date_of_birth    DATE,
    gender           ENUM('M','F','other','prefer_not'),
    -- Contacto
    email            VARCHAR(200),
    phone_primary    VARCHAR(50)   NOT NULL,
    phone_secondary  VARCHAR(50),
    whatsapp         VARCHAR(50),
    -- Dirección
    country_id       INT UNSIGNED,
    state_id         INT UNSIGNED,
    city_id          INT UNSIGNED,
    address_line1    VARCHAR(300),
    address_line2    VARCHAR(300),
    zip_code         VARCHAR(20),
    -- Preferencias
    preferred_language       CHAR(5)   NOT NULL DEFAULT 'es_LA',
    communication_preference ENUM('email','sms','whatsapp','call') DEFAULT 'whatsapp',
    receive_reminders        TINYINT(1) NOT NULL DEFAULT 1,
    receive_promotions       TINYINT(1) NOT NULL DEFAULT 0,
    -- Facturación
    tax_id           VARCHAR(60),
    tax_name         VARCHAR(200),
    -- Referencia / origen
    referred_by_client_id INT UNSIGNED,
    referral_source  ENUM('walk_in','referral','social_media','google','web','other'),
    -- Clasificación
    is_vip           TINYINT(1)    NOT NULL DEFAULT 0,
    credit_limit     DECIMAL(12,2) NOT NULL DEFAULT 0,
    outstanding_balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    -- Estado
    notes            TEXT,
    active           TINYINT(1)    NOT NULL DEFAULT 1,
    deleted_at       DATETIME,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_client_uuid (uuid),
    KEY fk_client_org  (organization_id),
    KEY fk_client_cntry (country_id),
    KEY fk_client_state (state_id),
    KEY fk_client_city  (city_id),
    KEY fk_client_ref   (referred_by_client_id),
    KEY idx_client_nat_id (national_id),
    KEY idx_client_email  (email),
    KEY idx_client_phone  (phone_primary),
    CONSTRAINT fk_client_org   FOREIGN KEY (organization_id)      REFERENCES organizations(id),
    CONSTRAINT fk_client_cntry FOREIGN KEY (country_id)           REFERENCES countries(id),
    CONSTRAINT fk_client_state FOREIGN KEY (state_id)             REFERENCES states(id),
    CONSTRAINT fk_client_city  FOREIGN KEY (city_id)              REFERENCES cities(id),
    CONSTRAINT fk_client_ref   FOREIGN KEY (referred_by_client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE client_emergency_contacts (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    client_id    INT UNSIGNED  NOT NULL,
    name         VARCHAR(200)  NOT NULL,
    relationship VARCHAR(60),
    phone        VARCHAR(50)   NOT NULL,
    email        VARCHAR(200),
    is_primary   TINYINT(1)    NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY fk_cec_client (client_id),
    CONSTRAINT fk_cec_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PACIENTES / ANIMALES
-- patient = el animal atendido. Se vincula a propietarios
-- a través de patient_owners (N:M con metadata de propiedad).
-- ============================================================

CREATE TABLE patients (
    id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id     INT UNSIGNED  NOT NULL,
    uuid                CHAR(36)      NOT NULL DEFAULT (UUID()),
    patient_code        VARCHAR(30),             -- código interno / chip visible
    name                VARCHAR(100)  NOT NULL,
    species_id          SMALLINT UNSIGNED NOT NULL,
    breed_id            SMALLINT UNSIGNED,
    mixed_breed         TINYINT(1)    NOT NULL DEFAULT 0,
    secondary_breed_id  SMALLINT UNSIGNED,       -- para mestizos con raza identificada
    color_id            SMALLINT UNSIGNED,
    color_description   VARCHAR(200),
    gender              ENUM('M','F','unknown')  NOT NULL,
    neutered            TINYINT(1)    NOT NULL DEFAULT 0,
    neutered_date       DATE,
    date_of_birth       DATE,
    approx_age_years    TINYINT UNSIGNED,        -- si no se conoce el DOB exacto
    approx_age_months   TINYINT UNSIGNED,
    weight_kg           DECIMAL(8,3),
    -- Identificación
    microchip_number    VARCHAR(60),
    microchip_date      DATE,
    tattoo_code         VARCHAR(50),
    passport_number     VARCHAR(60),
    -- Físico
    coat_length         ENUM('short','medium','long','hairless','rex','wire'),
    distinguishing_marks TEXT,
    photo_url           VARCHAR(500),
    -- Seguro
    has_insurance            TINYINT(1)    NOT NULL DEFAULT 0,
    insurance_company        VARCHAR(200),
    insurance_policy_number  VARCHAR(100),
    insurance_expiry         DATE,
    -- Estado
    is_deceased         TINYINT(1)    NOT NULL DEFAULT 0,
    deceased_date       DATE,
    deceased_cause      VARCHAR(500),
    notes               TEXT,
    active              TINYINT(1)    NOT NULL DEFAULT 1,
    deleted_at          DATETIME,
    created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_patient_uuid (uuid),
    KEY fk_pat_org   (organization_id),
    KEY fk_pat_sp    (species_id),
    KEY fk_pat_breed (breed_id),
    KEY fk_pat_breed2 (secondary_breed_id),
    KEY fk_pat_color (color_id),
    KEY idx_pat_microchip (microchip_number),
    KEY idx_pat_name      (name),
    CONSTRAINT fk_pat_org    FOREIGN KEY (organization_id)   REFERENCES organizations(id),
    CONSTRAINT fk_pat_sp     FOREIGN KEY (species_id)        REFERENCES species(id),
    CONSTRAINT fk_pat_breed  FOREIGN KEY (breed_id)          REFERENCES breeds(id),
    CONSTRAINT fk_pat_breed2 FOREIGN KEY (secondary_breed_id) REFERENCES breeds(id),
    CONSTRAINT fk_pat_color  FOREIGN KEY (color_id)          REFERENCES coat_colors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RELACIÓN PACIENTE ↔ PROPIETARIO
-- Tabla central que vincula mascotas con dueños.
-- Soporta: propiedad primaria, secundaria, tutores temporales,
-- cambio de dueño histórico.
-- ============================================================

CREATE TABLE patient_owners (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    patient_id     INT UNSIGNED  NOT NULL,
    client_id      INT UNSIGNED  NOT NULL,
    ownership_type ENUM('primary','secondary','temporary_guardian','foster') NOT NULL DEFAULT 'primary',
    -- Temporalidad
    start_date     DATE          NOT NULL,
    end_date       DATE,                         -- NULL = propietario actual
    -- Documentación
    ownership_document_url VARCHAR(500),         -- contrato, constancia, etc.
    transfer_reason TEXT,
    -- Control
    active         TINYINT(1)    NOT NULL DEFAULT 1,
    registered_by  INT UNSIGNED,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- Sólo puede haber un propietario primario activo por paciente
    UNIQUE KEY uq_primary_owner (patient_id, ownership_type, active),
    KEY fk_po_patient (patient_id),
    KEY fk_po_client  (client_id),
    KEY fk_po_regby   (registered_by),
    CONSTRAINT fk_po_patient FOREIGN KEY (patient_id)    REFERENCES patients(id),
    CONSTRAINT fk_po_client  FOREIGN KEY (client_id)     REFERENCES clients(id),
    CONSTRAINT fk_po_regby   FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Alergias confirmadas del paciente
CREATE TABLE patient_allergies (
    id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    patient_id           INT UNSIGNED  NOT NULL,
    allergen_type        ENUM('medication','food','environmental','vaccine','other') NOT NULL,
    allergen_name        VARCHAR(200)  NOT NULL,
    reaction_description TEXT,
    severity             ENUM('mild','moderate','severe','anaphylactic') NOT NULL,
    confirmed_date       DATE,
    confirmed_by         INT UNSIGNED,
    active               TINYINT(1)   NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_allergy_pat  (patient_id),
    KEY fk_allergy_user (confirmed_by),
    CONSTRAINT fk_allergy_pat  FOREIGN KEY (patient_id)   REFERENCES patients(id),
    CONSTRAINT fk_allergy_user FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Condiciones crónicas del paciente
CREATE TABLE patient_chronic_conditions (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    patient_id     INT UNSIGNED  NOT NULL,
    condition_name VARCHAR(200)  NOT NULL,
    icd_code       VARCHAR(20),
    diagnosis_date DATE,
    diagnosed_by   INT UNSIGNED,
    current_status ENUM('active','controlled','in_remission','resolved') DEFAULT 'active',
    notes          TEXT,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_chron_pat  (patient_id),
    KEY fk_chron_user (diagnosed_by),
    CONSTRAINT fk_chron_pat  FOREIGN KEY (patient_id)   REFERENCES patients(id),
    CONSTRAINT fk_chron_user FOREIGN KEY (diagnosed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: CATEGORÍAS Y ESPECIES
-- ============================================================

INSERT INTO species_categories (name, display_name) VALUES
('small_animal','Pequeños Animales'),
('large_animal','Grandes Animales'),
('exotic',      'Exóticos y No Convencionales'),
('farm',        'Animales de Granja'),
('aquatic',     'Acuáticos'),
('wild',        'Fauna Silvestre');

INSERT INTO species (category_id, common_name, scientific_name,
  avg_lifespan_years, gestation_days, temp_min_c, temp_max_c, hr_min, hr_max, rr_min, rr_max) VALUES
(1,'Perro',       'Canis lupus familiaris',    13, 63,  37.5,39.2, 60, 140,15,30),
(1,'Gato',        'Felis catus',               15, 65,  38.0,39.2,120, 200,20,40),
(2,'Caballo',     'Equus caballus',            25,340,  37.5,38.5, 28,  44, 8,16),
(2,'Bovino',      'Bos taurus',               20,283,  38.0,39.5, 40,  80,12,28),
(2,'Ovino',       'Ovis aries',               12,147,  38.5,40.0, 60,  90,16,30),
(2,'Caprino',     'Capra aegagrus hircus',    12,150,  38.5,39.5, 70,  90,15,30),
(2,'Porcino',     'Sus scrofa domesticus',    15,114,  38.5,39.5, 60,  80,10,24),
(3,'Conejo',      'Oryctolagus cuniculus',     8, 31,  38.5,40.0,130, 325,30,60),
(3,'Cobaya/Cuy',  'Cavia porcellus',           5, 68,  37.2,39.5,230, 380,40,150),
(3,'Hámster',     'Mesocricetus auratus',       2, 16,  37.0,38.5,250, 500,35,135),
(3,'Loro/Psitácida','Psittaciformes spp.',     20,NULL, 40.0,42.0,130, 350,25,45),
(3,'Tortuga',     'Testudines spp.',           50,NULL, NULL,NULL,NULL,NULL,NULL,NULL),
(3,'Serpiente',   'Serpentes spp.',            15,NULL, NULL,NULL,NULL,NULL,NULL,NULL),
(3,'Iguana',      'Iguana iguana',             15,NULL, NULL,NULL,NULL,NULL,NULL,NULL),
(3,'Chinchilla',  'Chinchilla lanigera',       10,111,  36.0,38.0,100, 150,40,80),
(3,'Hurón',       'Mustela putorius furo',      7, 42,  37.8,40.0,180, 250,33,36),
(4,'Llama',       'Lama glama',               20,350,  37.5,38.9, 60,  90,10,30),
(4,'Alpaca',      'Vicugna pacos',            20,345,  37.5,38.9, 60,  90,10,30),
(4,'Burro',       'Equus africanus asinus',   30,365,  37.0,38.5, 36,  68,12,28);

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 3/5: AGENDA, EMERGENCIAS, HISTORIA CLÍNICA COMPLETA
-- Incluye: Anamnesis, Examen Físico, Diagnósticos,
--          Tratamientos, Prescripciones
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- AGENDA / TURNOS
-- ============================================================

CREATE TABLE appointment_types (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(100)      NOT NULL,
    code             VARCHAR(20)       NOT NULL,
    category         ENUM('consultation','vaccination','surgery','grooming',
                          'laboratory','imaging','emergency','follow_up',
                          'telemedicine','other'),
    default_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    color_hex        CHAR(7),
    requires_fasting TINYINT(1)        NOT NULL DEFAULT 0,
    pre_instructions TEXT,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_appt_type_org (organization_id),
    CONSTRAINT fk_appt_type_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vet_schedules (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED  NOT NULL,
    branch_id       INT UNSIGNED  NOT NULL,
    day_of_week     TINYINT UNSIGNED NOT NULL COMMENT '0=Dom 6=Sáb',
    start_time      TIME          NOT NULL,
    end_time        TIME          NOT NULL,
    slot_minutes    SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    max_slots       TINYINT UNSIGNED,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    effective_from  DATE,
    effective_until DATE,
    PRIMARY KEY (id),
    KEY fk_vs_user   (user_id),
    KEY fk_vs_branch (branch_id),
    CONSTRAINT fk_vs_user   FOREIGN KEY (user_id)   REFERENCES users(id),
    CONSTRAINT fk_vs_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schedule_exceptions (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id        INT UNSIGNED  NOT NULL,
    branch_id      INT UNSIGNED  NOT NULL,
    exception_date DATE          NOT NULL,
    type           ENUM('unavailable','vacation','conference','modified') NOT NULL,
    alt_start_time TIME,
    alt_end_time   TIME,
    reason         VARCHAR(200),
    PRIMARY KEY (id),
    KEY fk_se_user   (user_id),
    KEY fk_se_branch (branch_id),
    CONSTRAINT fk_se_user   FOREIGN KEY (user_id)   REFERENCES users(id),
    CONSTRAINT fk_se_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE appointments (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid             CHAR(36)      NOT NULL DEFAULT (UUID()),
    organization_id  INT UNSIGNED  NOT NULL,
    branch_id        INT UNSIGNED  NOT NULL,
    patient_id       INT UNSIGNED  NOT NULL,
    client_id        INT UNSIGNED  NOT NULL,
    veterinarian_id  INT UNSIGNED,
    appointment_type_id SMALLINT UNSIGNED NOT NULL,
    scheduled_date   DATE          NOT NULL,
    scheduled_time   TIME          NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    status           ENUM('pending','confirmed','arrived','in_progress',
                          'completed','cancelled','no_show','rescheduled') NOT NULL DEFAULT 'pending',
    priority         ENUM('normal','urgent','emergency') NOT NULL DEFAULT 'normal',
    chief_complaint  TEXT,
    notes_for_vet    TEXT,
    booked_by        INT UNSIGNED,
    booking_channel  ENUM('in_person','phone','web','app','whatsapp'),
    confirmed_at     DATETIME,
    arrived_at       DATETIME,
    completed_at     DATETIME,
    cancellation_reason TEXT,
    rescheduled_from_id INT UNSIGNED,
    reminder_sent_at DATETIME,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_appt_uuid (uuid),
    KEY fk_appt_org    (organization_id),
    KEY fk_appt_branch (branch_id),
    KEY fk_appt_pat    (patient_id),
    KEY fk_appt_client (client_id),
    KEY fk_appt_vet    (veterinarian_id),
    KEY fk_appt_type   (appointment_type_id),
    KEY fk_appt_booked (booked_by),
    KEY fk_appt_resched (rescheduled_from_id),
    KEY idx_appt_date   (scheduled_date, branch_id),
    KEY idx_appt_status (status),
    CONSTRAINT fk_appt_org     FOREIGN KEY (organization_id)    REFERENCES organizations(id),
    CONSTRAINT fk_appt_branch  FOREIGN KEY (branch_id)          REFERENCES branches(id),
    CONSTRAINT fk_appt_pat     FOREIGN KEY (patient_id)         REFERENCES patients(id),
    CONSTRAINT fk_appt_client  FOREIGN KEY (client_id)          REFERENCES clients(id),
    CONSTRAINT fk_appt_vet     FOREIGN KEY (veterinarian_id)    REFERENCES users(id),
    CONSTRAINT fk_appt_type    FOREIGN KEY (appointment_type_id) REFERENCES appointment_types(id),
    CONSTRAINT fk_appt_booked  FOREIGN KEY (booked_by)          REFERENCES users(id),
    CONSTRAINT fk_appt_resched FOREIGN KEY (rescheduled_from_id) REFERENCES appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TRIAGE DE EMERGENCIAS
-- ============================================================

CREATE TABLE emergency_triage (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid             CHAR(36)      NOT NULL DEFAULT (UUID()),
    branch_id        INT UNSIGNED  NOT NULL,
    patient_id       INT UNSIGNED,
    client_id        INT UNSIGNED,
    unknown_patient_desc TEXT,
    arrival_datetime DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    arrival_mode     ENUM('walk_in','ambulance','owner_vehicle','transferred'),
    triage_priority  ENUM('immediate','urgent','less_urgent','non_urgent') NOT NULL,
    -- Constantes al ingreso
    temperature_c    DECIMAL(4,1),
    heart_rate       INT UNSIGNED,
    respiratory_rate INT UNSIGNED,
    bp_systolic      SMALLINT UNSIGNED,
    bp_diastolic     SMALLINT UNSIGNED,
    pulse_quality    ENUM('strong','weak','thready','absent'),
    mucous_color     ENUM('pink','pale','white','blue','yellow','brick_red','brown'),
    crt_seconds      DECIMAL(3,1),
    consciousness    ENUM('alert','depressed','stuporous','comatose'),
    pain_score       TINYINT UNSIGNED,
    reason_for_emergency TEXT NOT NULL,
    assigned_vet_id  INT UNSIGNED,
    triaged_by       INT UNSIGNED  NOT NULL,
    triage_notes     TEXT,
    status           ENUM('waiting','being_treated','admitted',
                          'transferred','discharged','deceased') NOT NULL DEFAULT 'waiting',
    outcome          ENUM('discharged','hospitalized','transferred','died','euthanized'),
    outcome_datetime DATETIME,
    outcome_notes    TEXT,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_triage_uuid (uuid),
    KEY fk_triage_branch  (branch_id),
    KEY fk_triage_patient (patient_id),
    KEY fk_triage_client  (client_id),
    KEY fk_triage_vet     (assigned_vet_id),
    KEY fk_triage_by      (triaged_by),
    KEY idx_triage_status (status),
    CONSTRAINT fk_triage_branch  FOREIGN KEY (branch_id)       REFERENCES branches(id),
    CONSTRAINT fk_triage_patient FOREIGN KEY (patient_id)      REFERENCES patients(id),
    CONSTRAINT fk_triage_client  FOREIGN KEY (client_id)       REFERENCES clients(id),
    CONSTRAINT fk_triage_vet     FOREIGN KEY (assigned_vet_id) REFERENCES users(id),
    CONSTRAINT fk_triage_by      FOREIGN KEY (triaged_by)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- HISTORIA CLÍNICA (registro base — firmable)
-- ============================================================

CREATE TABLE medical_records (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid             CHAR(36)      NOT NULL DEFAULT (UUID()),
    organization_id  INT UNSIGNED  NOT NULL,
    branch_id        INT UNSIGNED  NOT NULL,
    patient_id       INT UNSIGNED  NOT NULL,
    client_id        INT UNSIGNED  NOT NULL,
    veterinarian_id  INT UNSIGNED  NOT NULL,
    appointment_id   INT UNSIGNED,
    emergency_id     INT UNSIGNED,
    record_date      DATE          NOT NULL,
    record_time      TIME          NOT NULL,
    record_type      ENUM('routine','emergency','follow_up','vaccination',
                          'surgery','hospitalization','telemedicine') NOT NULL,
    weight_kg        DECIMAL(8,3),
    bcs              TINYINT UNSIGNED COMMENT 'Body Condition Score 1-9',
    status           ENUM('open','in_progress','completed','signed','amended') NOT NULL DEFAULT 'open',
    signed_at        DATETIME,
    signed_by        INT UNSIGNED,
    amended_at       DATETIME,
    amended_by       INT UNSIGNED,
    amendment_reason TEXT,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_mr_uuid (uuid),
    KEY fk_mr_org   (organization_id),
    KEY fk_mr_branch (branch_id),
    KEY fk_mr_pat   (patient_id),
    KEY fk_mr_client (client_id),
    KEY fk_mr_vet   (veterinarian_id),
    KEY fk_mr_appt  (appointment_id),
    KEY fk_mr_emerg (emergency_id),
    KEY fk_mr_sign  (signed_by),
    KEY fk_mr_amend (amended_by),
    KEY idx_mr_date  (record_date),
    KEY idx_mr_status (status),
    CONSTRAINT fk_mr_org    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_mr_branch FOREIGN KEY (branch_id)       REFERENCES branches(id),
    CONSTRAINT fk_mr_pat    FOREIGN KEY (patient_id)      REFERENCES patients(id),
    CONSTRAINT fk_mr_client FOREIGN KEY (client_id)       REFERENCES clients(id),
    CONSTRAINT fk_mr_vet    FOREIGN KEY (veterinarian_id) REFERENCES users(id),
    CONSTRAINT fk_mr_appt   FOREIGN KEY (appointment_id)  REFERENCES appointments(id),
    CONSTRAINT fk_mr_emerg  FOREIGN KEY (emergency_id)    REFERENCES emergency_triage(id),
    CONSTRAINT fk_mr_sign   FOREIGN KEY (signed_by)       REFERENCES users(id),
    CONSTRAINT fk_mr_amend  FOREIGN KEY (amended_by)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ANAMNESIS (1:1 con medical_records)
-- ============================================================

CREATE TABLE anamnesis (
    id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    medical_record_id    INT UNSIGNED  NOT NULL,
    chief_complaint      TEXT          NOT NULL,
    symptom_onset        ENUM('sudden','gradual'),
    symptom_duration     VARCHAR(100),
    symptom_progression  ENUM('improving','stable','worsening'),
    symptom_description  TEXT,
    systems_affected     JSON,
    -- Historia previa
    previous_illnesses        TEXT,
    previous_surgeries        TEXT,
    previous_hospitalizations TEXT,
    -- Profilaxis
    vaccination_status   ENUM('up_to_date','incomplete','unknown','unvaccinated') DEFAULT 'unknown',
    last_vaccination_date DATE,
    deworming_status     ENUM('up_to_date','incomplete','unknown','not_done')     DEFAULT 'unknown',
    last_deworming_date  DATE,
    last_deworming_product VARCHAR(200),
    -- Medicaciones actuales
    current_medications  TEXT,
    -- Nutrición
    diet_type       ENUM('commercial_dry','commercial_wet','raw','homemade','mixed','other'),
    diet_brand      VARCHAR(200),
    diet_frequency  VARCHAR(100),
    diet_amount     VARCHAR(100),
    water_intake    ENUM('normal','increased','decreased','unknown'),
    -- Ambiente
    housing_type                ENUM('indoor','outdoor','mixed'),
    access_to_other_animals     TINYINT(1),
    other_animals_description   TEXT,
    travel_history              TEXT,
    exposure_to_toxins          TEXT,
    -- Reproducción
    reproductive_status   ENUM('intact','neutered','pregnant','lactating','in_heat','post_partum'),
    last_heat_date        DATE,
    number_of_pregnancies TINYINT UNSIGNED,
    last_litter_date      DATE,
    litter_size           TINYINT UNSIGNED,
    -- Comportamiento
    behavioral_changes TEXT,
    activity_level     ENUM('normal','increased','decreased','lethargic'),
    owner_concerns     TEXT,
    created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_anamnesis_mr (medical_record_id),
    CONSTRAINT fk_anam_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EXAMEN FÍSICO (1:1 con medical_records)
-- ============================================================

CREATE TABLE physical_examinations (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    medical_record_id INT UNSIGNED  NOT NULL,
    -- Constantes vitales
    temperature_c        DECIMAL(4,1),
    temp_route           ENUM('rectal','axillary','ear','oral'),
    heart_rate           SMALLINT UNSIGNED,
    respiratory_rate     SMALLINT UNSIGNED,
    bp_systolic          SMALLINT UNSIGNED,
    bp_diastolic         SMALLINT UNSIGNED,
    pulse_quality        ENUM('strong','weak','thready','irregular'),
    spo2_percent         DECIMAL(4,1),
    -- Condición
    general_condition    ENUM('excellent','good','fair','poor','critical'),
    bcs                  TINYINT UNSIGNED  COMMENT '1-9',
    mcs                  TINYINT UNSIGNED  COMMENT 'Muscle Condition Score 1-4',
    -- Hidratación
    hydration_status     ENUM('normal','mild_dehydration','moderate_dehydration','severe_dehydration'),
    hydration_percent    TINYINT UNSIGNED,
    -- Mucosas
    mucous_color         ENUM('pink','pale','white','blue','yellow','brick_red','brown','mottled'),
    mucous_texture       ENUM('moist','tacky','dry'),
    crt_seconds          DECIMAL(3,1),
    -- Linfonódulos
    lymph_nodes          ENUM('normal','enlarged','painful','not_palpable'),
    lymph_nodes_notes    TEXT,
    -- Tegumento
    skin_condition       TEXT,
    coat_condition       TEXT,
    ectoparasites        TINYINT(1) DEFAULT 0,
    ectoparasites_notes  TEXT,
    -- Cabeza y cuello
    eyes   TEXT, ears  TEXT, nose TEXT, mouth_teeth TEXT,
    tongue TEXT, throat TEXT, neck TEXT,
    -- Tórax
    thorax_shape         TEXT,
    lung_sounds          ENUM('normal','crackles','wheezing','diminished','absent'),
    lung_sounds_notes    TEXT,
    heart_sounds         ENUM('normal','murmur','arrhythmia','muffled'),
    murmur_grade         TINYINT UNSIGNED COMMENT 'Grado I-VI',
    heart_sounds_notes   TEXT,
    -- Abdomen
    abdomen_shape        ENUM('normal','distended','tucked_up','pendulous'),
    abdominal_palpation  ENUM('soft','tense','painful','guarded'),
    abdominal_mass       TINYINT(1) DEFAULT 0,
    abdominal_notes      TEXT,
    -- Musculoesquelético
    gait                 ENUM('normal','lame','ataxic','paretic','unable_to_stand'),
    gait_notes           TEXT,
    musculoskeletal_notes TEXT,
    -- Neurológico
    mentation            ENUM('alert','obtunded','stuporous','comatose'),
    cranial_nerves       TEXT,
    spinal_reflexes      TEXT,
    neuro_notes          TEXT,
    -- Urogenital
    urogenital_notes     TEXT,
    -- Tacto rectal
    rectal_exam          TEXT,
    -- Dolor (escala Colorado / VAS)
    pain_score           TINYINT UNSIGNED COMMENT '0-10',
    pain_location        TEXT,
    pain_notes           TEXT,
    -- Resumen
    abnormalities_found  TEXT,
    assessment_notes     TEXT,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pe_mr (medical_record_id),
    CONSTRAINT fk_pe_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DIAGNÓSTICOS
-- ============================================================

CREATE TABLE diagnoses (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    medical_record_id INT UNSIGNED  NOT NULL,
    diagnosis_type    ENUM('presumptive','definitive','differential','rule_out') NOT NULL,
    diagnosis_order   TINYINT UNSIGNED NOT NULL DEFAULT 1,
    code              VARCHAR(20),
    description       TEXT          NOT NULL,
    body_system       ENUM('integument','musculoskeletal','cardiovascular','respiratory',
                           'digestive','urinary','reproductive','neurological',
                           'endocrine','immune','ophthalmic','otologic','oral','other'),
    severity          ENUM('mild','moderate','severe','life_threatening'),
    prognosis         ENUM('excellent','good','fair','guarded','poor','grave'),
    notes             TEXT,
    created_by        INT UNSIGNED  NOT NULL,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_diag_mr   (medical_record_id),
    KEY fk_diag_user (created_by),
    CONSTRAINT fk_diag_mr   FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
    CONSTRAINT fk_diag_user FOREIGN KEY (created_by)        REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEDICAMENTOS Y PRESCRIPCIONES
-- ============================================================

CREATE TABLE medication_categories (
    id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE medications (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(200)  NOT NULL,
    generic_name     VARCHAR(200),
    brand_name       VARCHAR(200),
    category_id      SMALLINT UNSIGNED,
    drug_class       VARCHAR(100),
    formulation      ENUM('tablet','capsule','liquid','injectable','topical',
                          'ointment','cream','spray','powder','patch','drops','other'),
    concentration    VARCHAR(100),
    unit             VARCHAR(50),
    is_controlled    TINYINT(1)    NOT NULL DEFAULT 0,
    controlled_schedule VARCHAR(20),
    approved_species JSON,
    contraindications TEXT,
    warnings         TEXT,
    active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_med_org  (organization_id),
    KEY fk_med_cat  (category_id),
    KEY idx_med_name (name),
    CONSTRAINT fk_med_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_med_cat FOREIGN KEY (category_id)     REFERENCES medication_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE treatments (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    medical_record_id INT UNSIGNED  NOT NULL,
    treatment_type    ENUM('medication','procedure','therapy','surgery',
                          'hospitalization','dietary','behavioral','other') NOT NULL,
    description       TEXT          NOT NULL,
    instructions      TEXT,
    performed_by      INT UNSIGNED,
    performed_at      DATETIME,
    notes             TEXT,
    PRIMARY KEY (id),
    KEY fk_treat_mr   (medical_record_id),
    KEY fk_treat_user (performed_by),
    CONSTRAINT fk_treat_mr   FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_treat_user FOREIGN KEY (performed_by)      REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prescriptions (
    id                 INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36)      NOT NULL DEFAULT (UUID()),
    medical_record_id  INT UNSIGNED  NOT NULL,
    patient_id         INT UNSIGNED  NOT NULL,
    prescribing_vet_id INT UNSIGNED  NOT NULL,
    prescription_date  DATE          NOT NULL,
    valid_until        DATE,
    status             ENUM('active','completed','cancelled','expired') NOT NULL DEFAULT 'active',
    pharmacy_notes     TEXT,
    dispensed_at       DATETIME,
    dispensed_by       INT UNSIGNED,
    created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rx_uuid (uuid),
    KEY fk_rx_mr    (medical_record_id),
    KEY fk_rx_pat   (patient_id),
    KEY fk_rx_vet   (prescribing_vet_id),
    KEY fk_rx_disp  (dispensed_by),
    CONSTRAINT fk_rx_mr   FOREIGN KEY (medical_record_id)  REFERENCES medical_records(id),
    CONSTRAINT fk_rx_pat  FOREIGN KEY (patient_id)         REFERENCES patients(id),
    CONSTRAINT fk_rx_vet  FOREIGN KEY (prescribing_vet_id) REFERENCES users(id),
    CONSTRAINT fk_rx_disp FOREIGN KEY (dispensed_by)       REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prescription_items (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    prescription_id   INT UNSIGNED  NOT NULL,
    medication_id     INT UNSIGNED  NOT NULL,
    dose              VARCHAR(100)  NOT NULL,
    calculated_dose   VARCHAR(100),
    route             ENUM('oral','IV','IM','SC','topical','ophthalmic',
                          'otic','rectal','intranasal','other'),
    frequency         VARCHAR(100)  NOT NULL,
    frequency_hours   TINYINT UNSIGNED,
    duration_days     SMALLINT UNSIGNED,
    qty_dispensed     DECIMAL(10,2),
    qty_unit          VARCHAR(50),
    start_date        DATE,
    end_date          DATE,
    instructions      TEXT,
    refills_allowed   TINYINT UNSIGNED NOT NULL DEFAULT 0,
    refills_used      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY fk_rxi_rx  (prescription_id),
    KEY fk_rxi_med (medication_id),
    CONSTRAINT fk_rxi_rx  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE,
    CONSTRAINT fk_rxi_med FOREIGN KEY (medication_id)   REFERENCES medications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seguimientos post-consulta
CREATE TABLE follow_ups (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    medical_record_id INT UNSIGNED  NOT NULL,
    patient_id        INT UNSIGNED  NOT NULL,
    created_by        INT UNSIGNED  NOT NULL,
    follow_up_type    ENUM('recheck','lab_results','medication_review',
                          'surgery_followup','general') NOT NULL,
    scheduled_date    DATE          NOT NULL,
    notes             TEXT,
    status            ENUM('pending','completed','cancelled','no_show') NOT NULL DEFAULT 'pending',
    completed_at      DATETIME,
    linked_appointment_id INT UNSIGNED,
    PRIMARY KEY (id),
    KEY fk_fu_mr    (medical_record_id),
    KEY fk_fu_pat   (patient_id),
    KEY fk_fu_user  (created_by),
    KEY fk_fu_appt  (linked_appointment_id),
    KEY idx_fu_date (scheduled_date, status),
    CONSTRAINT fk_fu_mr   FOREIGN KEY (medical_record_id)     REFERENCES medical_records(id),
    CONSTRAINT fk_fu_pat  FOREIGN KEY (patient_id)            REFERENCES patients(id),
    CONSTRAINT fk_fu_user FOREIGN KEY (created_by)            REFERENCES users(id),
    CONSTRAINT fk_fu_appt FOREIGN KEY (linked_appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: TIPOS DE TURNO Y CATEGORÍAS DE MEDICAMENTOS
-- ============================================================

INSERT INTO appointment_types (name, code, category, default_duration_minutes, color_hex, requires_fasting) VALUES
('Consulta General',         'CONS_GEN',  'consultation', 30,'#4CAF50',0),
('Urgencia',                 'CONS_URG',  'consultation', 20,'#FF5722',0),
('Control / Revisión',       'FOLLOW_UP', 'follow_up',    20,'#8BC34A',0),
('Vacunación',               'VACC',      'vaccination',  15,'#2196F3',0),
('Desparasitación',          'DEWORM',    'vaccination',  10,'#03A9F4',0),
('Cirugía Programada',       'SURG_ELEC', 'surgery',      90,'#9C27B0',1),
('Cirugía de Urgencia',      'SURG_URG',  'surgery',      60,'#E91E63',0),
('Toma de Muestra / Lab',    'LAB',       'laboratory',   20,'#FF9800',0),
('Diagnóstico por Imagen',   'IMAGING',   'imaging',      30,'#795548',0),
('Peluquería / Grooming',    'GROOM',     'grooming',     60,'#607D8B',0),
('Teleconsulta',             'TELE',      'telemedicine', 20,'#00BCD4',0),
('Internación - Ingreso',    'HOSP_IN',   'other',        30,'#FF5252',0);

INSERT INTO medication_categories (name, description) VALUES
('Antibióticos',              'Agentes antibacterianos sistémicos y tópicos'),
('Antiparasitarios Internos', 'Antihelmínticos, anticoccidiales'),
('Antiparasitarios Externos', 'Antipulgas, antigarrapatas, acaricidas'),
('AINEs',                     'Antiinflamatorios no esteroideos'),
('Corticosteroides',          'Glucocorticoides sistémicos y tópicos'),
('Analgésicos / Opioides',    'Control del dolor agudo y crónico'),
('Anestésicos',               'Inducción y mantenimiento anestésico'),
('Cardiovasculares',          'Antiarrítmicos, diuréticos, inotrópicos'),
('Gastrointestinales',        'Antieméticos, procinéticos, protectores gástricos'),
('Dermatológicos',            'Champúes, cremas, sprays terapéuticos'),
('Oftalmológicos',            'Colirios, ungüentos oculares'),
('Hormonales / Endócrinos',   'Insulina, tiroxina, anticonceptivos'),
('Oncológicos',               'Quimioterápicos veterinarios'),
('Inmunomoduladores',         'Inmunosupresores e inmunoestimulantes'),
('Suplementos / Nutracéuticos','Vitaminas, minerales, omegas, probióticos'),
('Fluidos y Electrolitos',    'Soluciones parenterales y orales'),
('Otros',                     'Sin categoría específica');

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 4/5: LABORATORIO, IMÁGENES, PATOLOGÍA,
--              CIRUGÍA, INTERNACIÓN, VACUNACIÓN, DESPARASITACIÓN
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- LABORATORIO CLÍNICO
-- ============================================================

CREATE TABLE lab_test_categories (
    id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_tests (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    category_id      SMALLINT UNSIGNED,
    code             VARCHAR(30)       NOT NULL,
    name             VARCHAR(200)      NOT NULL,
    method           VARCHAR(100),
    sample_type      ENUM('blood_whole','blood_serum','blood_plasma','urine',
                          'feces','swab','tissue','fluid','csf','bone_marrow','other'),
    sample_volume_ml DECIMAL(5,2),
    sample_container VARCHAR(100),
    fasting_required TINYINT(1)        NOT NULL DEFAULT 0,
    turnaround_hours SMALLINT UNSIGNED,
    external_lab     TINYINT(1)        NOT NULL DEFAULT 0,
    external_lab_name VARCHAR(200),
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_lt_org (organization_id),
    KEY fk_lt_cat (category_id),
    CONSTRAINT fk_lt_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_lt_cat FOREIGN KEY (category_id)     REFERENCES lab_test_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_test_panels (
    id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED,
    name            VARCHAR(200)      NOT NULL,
    description     TEXT,
    active          TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    CONSTRAINT fk_ltp_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_panel_tests (
    panel_id SMALLINT UNSIGNED NOT NULL,
    test_id  SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (panel_id, test_id),
    CONSTRAINT fk_lpt_panel FOREIGN KEY (panel_id) REFERENCES lab_test_panels(id),
    CONSTRAINT fk_lpt_test  FOREIGN KEY (test_id)  REFERENCES lab_tests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_reference_ranges (
    id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    test_id             SMALLINT UNSIGNED NOT NULL,
    species_id          SMALLINT UNSIGNED NOT NULL,
    gender              ENUM('M','F','all') NOT NULL DEFAULT 'all',
    age_min_months      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    age_max_months      SMALLINT UNSIGNED NOT NULL DEFAULT 9999,
    physiological_state ENUM('normal','pregnant','lactating','geriatric','pediatric','all') DEFAULT 'all',
    normal_min          DECIMAL(12,4),
    normal_max          DECIMAL(12,4),
    critical_low        DECIMAL(12,4),
    critical_high       DECIMAL(12,4),
    unit                VARCHAR(50),
    PRIMARY KEY (id),
    KEY fk_lrr_test    (test_id),
    KEY fk_lrr_species (species_id),
    CONSTRAINT fk_lrr_test    FOREIGN KEY (test_id)    REFERENCES lab_tests(id),
    CONSTRAINT fk_lrr_species FOREIGN KEY (species_id) REFERENCES species(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_orders (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)      NOT NULL DEFAULT (UUID()),
    medical_record_id INT UNSIGNED  NOT NULL,
    branch_id         INT UNSIGNED  NOT NULL,
    patient_id        INT UNSIGNED  NOT NULL,
    ordering_vet_id   INT UNSIGNED  NOT NULL,
    order_datetime    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    priority          ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
    status            ENUM('ordered','sample_collected','processing',
                           'partial_results','completed','cancelled') NOT NULL DEFAULT 'ordered',
    clinical_notes    TEXT,
    sample_collected_at  DATETIME,
    sample_collected_by  INT UNSIGNED,
    external_lab_order_id VARCHAR(100),
    external_lab_sent_at  DATETIME,
    results_received_at   DATETIME,
    reviewed_by       INT UNSIGNED,
    reviewed_at       DATETIME,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_lo_uuid (uuid),
    KEY fk_lo_mr      (medical_record_id),
    KEY fk_lo_branch  (branch_id),
    KEY fk_lo_patient (patient_id),
    KEY fk_lo_vet     (ordering_vet_id),
    KEY fk_lo_collby  (sample_collected_by),
    KEY fk_lo_rev     (reviewed_by),
    KEY idx_lo_date   (order_datetime),
    KEY idx_lo_status (status),
    CONSTRAINT fk_lo_mr      FOREIGN KEY (medical_record_id)    REFERENCES medical_records(id),
    CONSTRAINT fk_lo_branch  FOREIGN KEY (branch_id)            REFERENCES branches(id),
    CONSTRAINT fk_lo_patient FOREIGN KEY (patient_id)           REFERENCES patients(id),
    CONSTRAINT fk_lo_vet     FOREIGN KEY (ordering_vet_id)      REFERENCES users(id),
    CONSTRAINT fk_lo_collby  FOREIGN KEY (sample_collected_by)  REFERENCES users(id),
    CONSTRAINT fk_lo_rev     FOREIGN KEY (reviewed_by)          REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_order_items (
    id           INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    lab_order_id INT UNSIGNED      NOT NULL,
    test_id      SMALLINT UNSIGNED,
    panel_id     SMALLINT UNSIGNED,
    status       ENUM('pending','processing','completed','cancelled') NOT NULL DEFAULT 'pending',
    notes        TEXT,
    PRIMARY KEY (id),
    KEY fk_loi_order (lab_order_id),
    KEY fk_loi_test  (test_id),
    KEY fk_loi_panel (panel_id),
    CONSTRAINT fk_loi_order FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_loi_test  FOREIGN KEY (test_id)      REFERENCES lab_tests(id),
    CONSTRAINT fk_loi_panel FOREIGN KEY (panel_id)     REFERENCES lab_test_panels(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lab_results (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    lab_order_item_id INT UNSIGNED      NOT NULL,
    test_id           SMALLINT UNSIGNED NOT NULL,
    result_value      VARCHAR(500),
    result_numeric    DECIMAL(14,6),
    unit              VARCHAR(50),
    reference_range   VARCHAR(100),
    interpretation    ENUM('normal','low','high','critical_low','critical_high',
                           'abnormal','inconclusive','pending'),
    result_qualitative ENUM('positive','negative','trace','equivocal','not_detected'),
    morphology_notes  TEXT,
    validated_by      INT UNSIGNED,
    validated_at      DATETIME,
    comments          TEXT,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_lr_item (lab_order_item_id),
    KEY fk_lr_test (test_id),
    KEY fk_lr_val  (validated_by),
    CONSTRAINT fk_lr_item FOREIGN KEY (lab_order_item_id) REFERENCES lab_order_items(id),
    CONSTRAINT fk_lr_test FOREIGN KEY (test_id)           REFERENCES lab_tests(id),
    CONSTRAINT fk_lr_val  FOREIGN KEY (validated_by)      REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- IMÁGENES DIAGNÓSTICAS (Rx, Eco, TAC, RMN, etc.)
-- Las imágenes se almacenan en servidor externo (PACS/cloud)
-- Solo guardamos la URL/referencia.
-- ============================================================

CREATE TABLE imaging_types (
    id          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)     NOT NULL,
    code        VARCHAR(20)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE KEY uq_imgtype_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imaging_orders (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)          NOT NULL DEFAULT (UUID()),
    medical_record_id INT UNSIGNED      NOT NULL,
    branch_id         INT UNSIGNED      NOT NULL,
    patient_id        INT UNSIGNED      NOT NULL,
    ordering_vet_id   INT UNSIGNED      NOT NULL,
    imaging_type_id   TINYINT UNSIGNED  NOT NULL,
    order_datetime    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    body_region       VARCHAR(200)      NOT NULL,
    views_requested   JSON,
    clinical_indication TEXT            NOT NULL,
    priority          ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
    sedation_required TINYINT(1)        NOT NULL DEFAULT 0,
    sedation_notes    TEXT,
    status            ENUM('ordered','in_progress','images_taken',
                           'reported','completed','cancelled') NOT NULL DEFAULT 'ordered',
    performed_by      INT UNSIGNED,
    performed_at      DATETIME,
    reported_by       INT UNSIGNED,
    reported_at       DATETIME,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_io_uuid (uuid),
    KEY fk_io_mr      (medical_record_id),
    KEY fk_io_branch  (branch_id),
    KEY fk_io_patient (patient_id),
    KEY fk_io_vet     (ordering_vet_id),
    KEY fk_io_type    (imaging_type_id),
    KEY fk_io_perfby  (performed_by),
    KEY fk_io_repby   (reported_by),
    CONSTRAINT fk_io_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_io_branch  FOREIGN KEY (branch_id)         REFERENCES branches(id),
    CONSTRAINT fk_io_patient FOREIGN KEY (patient_id)        REFERENCES patients(id),
    CONSTRAINT fk_io_vet     FOREIGN KEY (ordering_vet_id)   REFERENCES users(id),
    CONSTRAINT fk_io_type    FOREIGN KEY (imaging_type_id)   REFERENCES imaging_types(id),
    CONSTRAINT fk_io_perfby  FOREIGN KEY (performed_by)      REFERENCES users(id),
    CONSTRAINT fk_io_repby   FOREIGN KEY (reported_by)       REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imaging_studies (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    imaging_order_id INT UNSIGNED NOT NULL,
    study_datetime   DATETIME     NOT NULL,
    equipment_used   VARCHAR(200),
    kv               DECIMAL(5,1),
    mas              DECIMAL(6,2),
    exposure_ms      DECIMAL(6,2),
    storage_type     ENUM('PACS','cloud','local_server','external_service'),
    storage_path     VARCHAR(1000) COMMENT 'URL o ruta al servidor de imágenes externo',
    dicom_study_uid  VARCHAR(200),
    accession_number VARCHAR(100),
    image_count      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    positioning_notes TEXT,
    quality          ENUM('excellent','good','acceptable','poor','non_diagnostic'),
    quality_notes    TEXT,
    technical_notes  TEXT,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_is_order (imaging_order_id),
    CONSTRAINT fk_is_order FOREIGN KEY (imaging_order_id) REFERENCES imaging_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imaging_images (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    study_id         INT UNSIGNED NOT NULL,
    image_number     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    view_position    VARCHAR(100),
    image_type       ENUM('dicom','jpeg','png','tiff','pdf','video'),
    storage_url      VARCHAR(1000) NOT NULL COMMENT 'URL al almacenamiento externo',
    thumbnail_url    VARCHAR(1000),
    file_size_bytes  INT UNSIGNED,
    acquisition_at   DATETIME,
    notes            TEXT,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_img_study (study_id),
    CONSTRAINT fk_img_study FOREIGN KEY (study_id) REFERENCES imaging_studies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE imaging_reports (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    imaging_order_id INT UNSIGNED NOT NULL,
    report_datetime  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reported_by      INT UNSIGNED NOT NULL,
    technique        TEXT,
    findings         TEXT         NOT NULL,
    impression       TEXT         NOT NULL,
    recommendations  TEXT,
    measurements     JSON,
    comparison_study_id INT UNSIGNED,
    comparison_notes TEXT,
    status           ENUM('preliminary','final','amended') NOT NULL DEFAULT 'preliminary',
    amended_at       DATETIME,
    amended_by       INT UNSIGNED,
    amendment_reason TEXT,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ir_order (imaging_order_id),
    KEY fk_ir_order  (imaging_order_id),
    KEY fk_ir_repby  (reported_by),
    KEY fk_ir_comp   (comparison_study_id),
    KEY fk_ir_amend  (amended_by),
    CONSTRAINT fk_ir_order FOREIGN KEY (imaging_order_id)   REFERENCES imaging_orders(id),
    CONSTRAINT fk_ir_repby FOREIGN KEY (reported_by)        REFERENCES users(id),
    CONSTRAINT fk_ir_comp  FOREIGN KEY (comparison_study_id) REFERENCES imaging_studies(id),
    CONSTRAINT fk_ir_amend FOREIGN KEY (amended_by)         REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PATOLOGÍA
-- ============================================================

CREATE TABLE pathology_types (
    id   TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100)     NOT NULL,
    code VARCHAR(20)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pt_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pathology_orders (
    id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)         NOT NULL DEFAULT (UUID()),
    medical_record_id INT UNSIGNED     NOT NULL,
    branch_id         INT UNSIGNED     NOT NULL,
    patient_id        INT UNSIGNED     NOT NULL,
    ordering_vet_id   INT UNSIGNED     NOT NULL,
    pathology_type_id TINYINT UNSIGNED NOT NULL,
    order_datetime    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    clinical_history  TEXT             NOT NULL,
    clinical_suspicion TEXT,
    priority          ENUM('routine','urgent','stat') NOT NULL DEFAULT 'routine',
    status            ENUM('ordered','sample_received','processing',
                           'completed','cancelled') NOT NULL DEFAULT 'ordered',
    external_lab_name     VARCHAR(200),
    external_lab_order_id VARCHAR(100),
    pathologist_id    INT UNSIGNED,
    reported_at       DATETIME,
    created_at        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_patho_uuid (uuid),
    KEY fk_po_mr      (medical_record_id),
    KEY fk_po_branch  (branch_id),
    KEY fk_po_patient (patient_id),
    KEY fk_po_vet     (ordering_vet_id),
    KEY fk_po_type    (pathology_type_id),
    KEY fk_po_path    (pathologist_id),
    CONSTRAINT fk_po_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_po_branch  FOREIGN KEY (branch_id)         REFERENCES branches(id),
    CONSTRAINT fk_po_patient FOREIGN KEY (patient_id)        REFERENCES patients(id),
    CONSTRAINT fk_po_vet     FOREIGN KEY (ordering_vet_id)   REFERENCES users(id),
    CONSTRAINT fk_po_type    FOREIGN KEY (pathology_type_id) REFERENCES pathology_types(id),
    CONSTRAINT fk_po_path    FOREIGN KEY (pathologist_id)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pathology_samples (
    id                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    pathology_order_id INT UNSIGNED     NOT NULL,
    sample_number      TINYINT UNSIGNED NOT NULL DEFAULT 1,
    tissue_type        VARCHAR(200)     NOT NULL,
    anatomical_location VARCHAR(200),
    collection_method  ENUM('biopsy','FNA','excision','impression_smear','swab','necropsy','other'),
    collection_datetime DATETIME,
    collected_by       INT UNSIGNED,
    fixative           ENUM('formalin_10','formalin_neutral','frozen','fresh','alcohol','other'),
    gross_description  TEXT,
    sample_dimensions  VARCHAR(100),
    storage_location   VARCHAR(200),
    block_ids          VARCHAR(200),
    slide_ids          VARCHAR(200),
    image_urls         JSON COMMENT 'URLs a imágenes externas de la muestra',
    notes              TEXT,
    PRIMARY KEY (id),
    KEY fk_ps_order  (pathology_order_id),
    KEY fk_ps_collby (collected_by),
    CONSTRAINT fk_ps_order  FOREIGN KEY (pathology_order_id) REFERENCES pathology_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_ps_collby FOREIGN KEY (collected_by)       REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pathology_results (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    pathology_order_id INT UNSIGNED NOT NULL,
    gross_findings     TEXT,
    microscopic_findings TEXT       NOT NULL,
    pathological_diagnosis TEXT     NOT NULL,
    diagnosis_code     VARCHAR(50),
    tumor_classification VARCHAR(200),
    tumor_grade        TINYINT UNSIGNED,
    tumor_stage        VARCHAR(50),
    margins_status     ENUM('clear','involved','close','not_assessed'),
    prognosis_notes    TEXT,
    ihc_results        TEXT,
    special_stains     TEXT,
    recommendations    TEXT,
    status             ENUM('preliminary','final','amended') NOT NULL DEFAULT 'preliminary',
    amended_at         DATETIME,
    amended_by         INT UNSIGNED,
    amendment_reason   TEXT,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pr_order (pathology_order_id),
    KEY fk_pres_order (pathology_order_id),
    KEY fk_pres_amend (amended_by),
    CONSTRAINT fk_pres_order FOREIGN KEY (pathology_order_id) REFERENCES pathology_orders(id),
    CONSTRAINT fk_pres_amend FOREIGN KEY (amended_by)         REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CIRUGÍA Y ANESTESIA
-- ============================================================

CREATE TABLE surgery_categories (
    id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE surgery_types (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    category_id      SMALLINT UNSIGNED,
    name             VARCHAR(200)      NOT NULL,
    code             VARCHAR(30),
    description      TEXT,
    avg_duration_min SMALLINT UNSIGNED,
    anesthesia_req   TINYINT(1)        NOT NULL DEFAULT 1,
    applicable_species JSON,
    pre_op_req       TEXT,
    post_op_care     TEXT,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_st_org (organization_id),
    KEY fk_st_cat (category_id),
    CONSTRAINT fk_st_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_st_cat FOREIGN KEY (category_id)     REFERENCES surgery_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE surgeries (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)          NOT NULL DEFAULT (UUID()),
    medical_record_id INT UNSIGNED      NOT NULL,
    branch_id         INT UNSIGNED      NOT NULL,
    patient_id        INT UNSIGNED      NOT NULL,
    surgery_type_id   SMALLINT UNSIGNED NOT NULL,
    scheduled_at      DATETIME,
    status            ENUM('scheduled','prep','in_progress','completed',
                           'cancelled','aborted') NOT NULL DEFAULT 'scheduled',
    prep_start        DATETIME,
    surgery_start     DATETIME,
    surgery_end       DATETIME,
    duration_minutes  SMALLINT UNSIGNED,
    lead_surgeon_id          INT UNSIGNED NOT NULL,
    assistant_surgeon_id     INT UNSIGNED,
    anesthesiologist_id      INT UNSIGNED,
    surgical_technician_id   INT UNSIGNED,
    circulating_nurse_id     INT UNSIGNED,
    urgency           ENUM('elective','urgent','emergency') NOT NULL DEFAULT 'elective',
    approach          ENUM('open','laparoscopic','endoscopic','arthroscopic','other'),
    body_region       VARCHAR(200),
    pre_op_notes      TEXT,
    fasting_hours     TINYINT UNSIGNED,
    pre_op_meds       TEXT,
    intraop_notes     TEXT,
    complications     TEXT,
    blood_loss_ml     SMALLINT UNSIGNED,
    fluids_ml         SMALLINT UNSIGNED,
    post_op_notes     TEXT,
    post_op_instructions TEXT,
    recovery_notes    TEXT,
    outcome           ENUM('successful','complications','death_on_table','aborted'),
    outcome_notes     TEXT,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_surg_uuid (uuid),
    KEY fk_surg_mr    (medical_record_id),
    KEY fk_surg_br    (branch_id),
    KEY fk_surg_pat   (patient_id),
    KEY fk_surg_type  (surgery_type_id),
    KEY fk_surg_lead  (lead_surgeon_id),
    KEY fk_surg_asst  (assistant_surgeon_id),
    KEY fk_surg_anest (anesthesiologist_id),
    KEY fk_surg_tech  (surgical_technician_id),
    KEY fk_surg_nurse (circulating_nurse_id),
    CONSTRAINT fk_surg_mr    FOREIGN KEY (medical_record_id)      REFERENCES medical_records(id),
    CONSTRAINT fk_surg_br    FOREIGN KEY (branch_id)              REFERENCES branches(id),
    CONSTRAINT fk_surg_pat   FOREIGN KEY (patient_id)             REFERENCES patients(id),
    CONSTRAINT fk_surg_type  FOREIGN KEY (surgery_type_id)        REFERENCES surgery_types(id),
    CONSTRAINT fk_surg_lead  FOREIGN KEY (lead_surgeon_id)        REFERENCES users(id),
    CONSTRAINT fk_surg_asst  FOREIGN KEY (assistant_surgeon_id)   REFERENCES users(id),
    CONSTRAINT fk_surg_anest FOREIGN KEY (anesthesiologist_id)    REFERENCES users(id),
    CONSTRAINT fk_surg_tech  FOREIGN KEY (surgical_technician_id) REFERENCES users(id),
    CONSTRAINT fk_surg_nurse FOREIGN KEY (circulating_nurse_id)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE anesthesia_records (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    surgery_id          INT UNSIGNED NOT NULL,
    anesthesiologist_id INT UNSIGNED NOT NULL,
    protocol_name       VARCHAR(200),
    premed_drugs        JSON,   -- [{drug,dose,route,time}]
    induction_agent     VARCHAR(200),
    induction_dose      VARCHAR(100),
    induction_route     ENUM('IV','IM','inhalation'),
    induction_time      DATETIME,
    maintenance_agent   VARCHAR(200),
    maintenance_conc    VARCHAR(50),
    maintenance_method  ENUM('inhalation','TIVA','CRI'),
    monitoring_chart    JSON,   -- serie temporal [{time,hr,rr,spo2,etco2,bp,temp}]
    intubated           TINYINT(1) NOT NULL DEFAULT 0,
    tube_size           VARCHAR(20),
    fluid_type          VARCHAR(100),
    fluid_rate_ml_hr    DECIMAL(6,2),
    total_fluids_ml     DECIMAL(8,2),
    extubation_time     DATETIME,
    recovery_start      DATETIME,
    recovery_quality    ENUM('smooth','rough','prolonged','complications'),
    recovery_notes      TEXT,
    complications       TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ar_surg (surgery_id),
    KEY fk_ar_surg  (surgery_id),
    KEY fk_ar_anest (anesthesiologist_id),
    CONSTRAINT fk_ar_surg  FOREIGN KEY (surgery_id)          REFERENCES surgeries(id),
    CONSTRAINT fk_ar_anest FOREIGN KEY (anesthesiologist_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INTERNACIÓN / HOSPITALIZACIÓN
-- ============================================================

CREATE TABLE wards (
    id        SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    branch_id INT UNSIGNED      NOT NULL,
    name      VARCHAR(100)      NOT NULL,
    ward_type ENUM('general','icu','isolation','post_surgery',
                   'exotics','large_animal','neonatal'),
    capacity  TINYINT UNSIGNED,
    active    TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_ward_branch (branch_id),
    CONSTRAINT fk_ward_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE kennels (
    id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ward_id         SMALLINT UNSIGNED NOT NULL,
    kennel_code     VARCHAR(20)       NOT NULL,
    kennel_type     ENUM('cage','kennel','pen','stall','incubator','tank'),
    size_category   ENUM('small','medium','large','extra_large'),
    special_features JSON,
    active          TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_kennel_ward (ward_id),
    CONSTRAINT fk_kennel_ward FOREIGN KEY (ward_id) REFERENCES wards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hospitalizations (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)          NOT NULL DEFAULT (UUID()),
    medical_record_id INT UNSIGNED      NOT NULL,
    branch_id         INT UNSIGNED      NOT NULL,
    patient_id        INT UNSIGNED      NOT NULL,
    client_id         INT UNSIGNED      NOT NULL,
    admitting_vet_id  INT UNSIGNED      NOT NULL,
    attending_vet_id  INT UNSIGNED,
    ward_id           SMALLINT UNSIGNED,
    kennel_id         SMALLINT UNSIGNED,
    admission_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    admission_reason  TEXT              NOT NULL,
    admission_diagnosis TEXT,
    urgency           ENUM('elective','urgent','emergency') NOT NULL DEFAULT 'urgent',
    isolation_required TINYINT(1)       NOT NULL DEFAULT 0,
    isolation_reason  VARCHAR(200),
    discharge_at      DATETIME,
    discharge_vet_id  INT UNSIGNED,
    discharge_condition ENUM('recovered','improved','unchanged',
                             'deteriorated','deceased','euthanized'),
    discharge_instructions TEXT,
    follow_up_date    DATE,
    status            ENUM('active','discharged','transferred','deceased') NOT NULL DEFAULT 'active',
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_hosp_uuid (uuid),
    KEY fk_hosp_mr      (medical_record_id),
    KEY fk_hosp_branch  (branch_id),
    KEY fk_hosp_patient (patient_id),
    KEY fk_hosp_client  (client_id),
    KEY fk_hosp_admvet  (admitting_vet_id),
    KEY fk_hosp_attvet  (attending_vet_id),
    KEY fk_hosp_ward    (ward_id),
    KEY fk_hosp_kennel  (kennel_id),
    KEY fk_hosp_discvet (discharge_vet_id),
    KEY idx_hosp_status (status),
    CONSTRAINT fk_hosp_mr      FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_hosp_branch  FOREIGN KEY (branch_id)         REFERENCES branches(id),
    CONSTRAINT fk_hosp_patient FOREIGN KEY (patient_id)        REFERENCES patients(id),
    CONSTRAINT fk_hosp_client  FOREIGN KEY (client_id)         REFERENCES clients(id),
    CONSTRAINT fk_hosp_admvet  FOREIGN KEY (admitting_vet_id)  REFERENCES users(id),
    CONSTRAINT fk_hosp_attvet  FOREIGN KEY (attending_vet_id)  REFERENCES users(id),
    CONSTRAINT fk_hosp_ward    FOREIGN KEY (ward_id)           REFERENCES wards(id),
    CONSTRAINT fk_hosp_kennel  FOREIGN KEY (kennel_id)         REFERENCES kennels(id),
    CONSTRAINT fk_hosp_discvet FOREIGN KEY (discharge_vet_id)  REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hospitalization_monitoring (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospitalization_id INT UNSIGNED NOT NULL,
    recorded_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_by        INT UNSIGNED NOT NULL,
    temperature_c      DECIMAL(4,1), heart_rate SMALLINT, respiratory_rate SMALLINT,
    bp_systolic        SMALLINT, bp_diastolic SMALLINT, spo2_percent DECIMAL(4,1),
    consciousness      ENUM('alert','depressed','stuporous','comatose'),
    pain_score         TINYINT UNSIGNED,
    food_offered       VARCHAR(100), food_consumed ENUM('all','3_4','1_2','1_4','none'),
    water_intake_ml    SMALLINT UNSIGNED,
    urine_output       ENUM('normal','increased','decreased','absent'),
    bowel_movement     TINYINT(1), vomiting TINYINT(1),
    iv_fluid_type      VARCHAR(100), iv_rate_ml_hr DECIMAL(6,2), iv_volume_ml DECIMAL(8,2),
    notes              TEXT,
    PRIMARY KEY (id),
    KEY fk_hmon_hosp (hospitalization_id),
    KEY fk_hmon_user (recorded_by),
    KEY idx_hmon_time (recorded_at),
    CONSTRAINT fk_hmon_hosp FOREIGN KEY (hospitalization_id) REFERENCES hospitalizations(id),
    CONSTRAINT fk_hmon_user FOREIGN KEY (recorded_by)        REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hospitalization_medications (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospitalization_id INT UNSIGNED NOT NULL,
    medication_id      INT UNSIGNED NOT NULL,
    prescribed_by      INT UNSIGNED NOT NULL,
    dose               VARCHAR(100) NOT NULL,
    route              ENUM('oral','IV','IM','SC','topical','other'),
    frequency          VARCHAR(100),
    start_at           DATETIME, end_at DATETIME,
    active             TINYINT(1)   NOT NULL DEFAULT 1,
    notes              TEXT,
    PRIMARY KEY (id),
    KEY fk_hmed_hosp (hospitalization_id),
    KEY fk_hmed_med  (medication_id),
    KEY fk_hmed_vet  (prescribed_by),
    CONSTRAINT fk_hmed_hosp FOREIGN KEY (hospitalization_id) REFERENCES hospitalizations(id),
    CONSTRAINT fk_hmed_med  FOREIGN KEY (medication_id)      REFERENCES medications(id),
    CONSTRAINT fk_hmed_vet  FOREIGN KEY (prescribed_by)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hospitalization_med_administrations (
    id                            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    hospitalization_medication_id INT UNSIGNED NOT NULL,
    administered_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    administered_by               INT UNSIGNED NOT NULL,
    dose_given                    VARCHAR(100),
    notes                         TEXT,
    PRIMARY KEY (id),
    KEY fk_hadm_hmed (hospitalization_medication_id),
    KEY fk_hadm_user (administered_by),
    CONSTRAINT fk_hadm_hmed FOREIGN KEY (hospitalization_medication_id) REFERENCES hospitalization_medications(id),
    CONSTRAINT fk_hadm_user FOREIGN KEY (administered_by)               REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- VACUNACIÓN
-- ============================================================

CREATE TABLE vaccine_manufacturers (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name             VARCHAR(200)      NOT NULL,
    country_of_origin VARCHAR(100),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vaccines (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(200)      NOT NULL,
    commercial_name  VARCHAR(200),
    manufacturer_id  SMALLINT UNSIGNED,
    vaccine_type     ENUM('core','non_core','optional'),
    disease_prevention JSON,
    applicable_species JSON,
    formulation      ENUM('live_attenuated','inactivated','recombinant','toxoid','subunit','mRNA'),
    route            ENUM('SC','IM','intranasal','oral','topical'),
    initial_dose_age_weeks TINYINT UNSIGNED,
    series_doses     TINYINT UNSIGNED  NOT NULL DEFAULT 1,
    series_interval_weeks  TINYINT UNSIGNED,
    booster_interval_months TINYINT UNSIGNED,
    storage_temp_min_c TINYINT, storage_temp_max_c TINYINT,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_vac_org  (organization_id),
    KEY fk_vac_mfr  (manufacturer_id),
    CONSTRAINT fk_vac_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_vac_mfr FOREIGN KEY (manufacturer_id) REFERENCES vaccine_manufacturers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vaccinations (
    id                   INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid                 CHAR(36)          NOT NULL DEFAULT (UUID()),
    medical_record_id    INT UNSIGNED,
    patient_id           INT UNSIGNED      NOT NULL,
    branch_id            INT UNSIGNED      NOT NULL,
    vaccine_id           SMALLINT UNSIGNED NOT NULL,
    administering_vet_id INT UNSIGNED      NOT NULL,
    vaccination_date     DATE              NOT NULL,
    dose_number          TINYINT UNSIGNED  NOT NULL DEFAULT 1,
    dose_ml              DECIMAL(4,2),
    route                ENUM('SC','IM','intranasal','oral','topical'),
    injection_site       VARCHAR(100),
    lot_number           VARCHAR(100)      NOT NULL,
    expiry_date          DATE              NOT NULL,
    manufacturer_id      SMALLINT UNSIGNED,
    next_dose_due        DATE,
    next_dose_type       ENUM('series','booster'),
    adverse_reaction     TINYINT(1)        NOT NULL DEFAULT 0,
    reaction_description TEXT,
    reaction_severity    ENUM('mild','moderate','severe','anaphylactic'),
    certificate_number   VARCHAR(100),
    status               ENUM('administered','reported','historical') NOT NULL DEFAULT 'administered',
    notes                TEXT,
    created_at           TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_vacc_uuid (uuid),
    KEY fk_vacc_mr    (medical_record_id),
    KEY fk_vacc_pat   (patient_id),
    KEY fk_vacc_br    (branch_id),
    KEY fk_vacc_vac   (vaccine_id),
    KEY fk_vacc_vet   (administering_vet_id),
    KEY fk_vacc_mfr   (manufacturer_id),
    KEY idx_vacc_date (vaccination_date),
    KEY idx_vacc_next (next_dose_due),
    CONSTRAINT fk_vacc_mr  FOREIGN KEY (medical_record_id)    REFERENCES medical_records(id),
    CONSTRAINT fk_vacc_pat FOREIGN KEY (patient_id)           REFERENCES patients(id),
    CONSTRAINT fk_vacc_br  FOREIGN KEY (branch_id)            REFERENCES branches(id),
    CONSTRAINT fk_vacc_vac FOREIGN KEY (vaccine_id)           REFERENCES vaccines(id),
    CONSTRAINT fk_vacc_vet FOREIGN KEY (administering_vet_id) REFERENCES users(id),
    CONSTRAINT fk_vacc_mfr FOREIGN KEY (manufacturer_id)      REFERENCES vaccine_manufacturers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DESPARASITACIÓN
-- ============================================================

CREATE TABLE antiparasitic_products (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(200)      NOT NULL,
    active_ingredient VARCHAR(300),
    product_type     ENUM('internal','external','both'),
    target_parasites JSON,
    formulation      ENUM('tablet','liquid','injectable','spot_on','collar','spray','shampoo','other'),
    applicable_species JSON,
    recommended_interval_weeks TINYINT UNSIGNED,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_ap_org (organization_id),
    CONSTRAINT fk_ap_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deworming_records (
    id                  INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    medical_record_id   INT UNSIGNED,
    patient_id          INT UNSIGNED      NOT NULL,
    branch_id           INT UNSIGNED      NOT NULL,
    product_id          SMALLINT UNSIGNED NOT NULL,
    administered_by     INT UNSIGNED      NOT NULL,
    administration_date DATE              NOT NULL,
    dose                VARCHAR(100),
    weight_kg           DECIMAL(8,3),
    route               ENUM('oral','topical','injectable','other'),
    lot_number          VARCHAR(100),
    next_due_date       DATE,
    notes               TEXT,
    created_at          TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_dew_mr    (medical_record_id),
    KEY fk_dew_pat   (patient_id),
    KEY fk_dew_br    (branch_id),
    KEY fk_dew_prod  (product_id),
    KEY fk_dew_user  (administered_by),
    KEY idx_dew_next (next_due_date),
    CONSTRAINT fk_dew_mr   FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_dew_pat  FOREIGN KEY (patient_id)        REFERENCES patients(id),
    CONSTRAINT fk_dew_br   FOREIGN KEY (branch_id)         REFERENCES branches(id),
    CONSTRAINT fk_dew_prod FOREIGN KEY (product_id)        REFERENCES antiparasitic_products(id),
    CONSTRAINT fk_dew_user FOREIGN KEY (administered_by)   REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED: catálogos de servicios diagnósticos
-- ============================================================

INSERT INTO imaging_types (name, code) VALUES
('Radiografía',            'XRAY'),('Ecografía / Ultrasonido','US'),
('Tomografía Computarizada','CT'),('Resonancia Magnética',   'MRI'),
('Endoscopía',             'ENDO'),('Ecocardiografía',        'ECHO'),
('Fluoroscopía',           'FLUORO'),('Ecografía Doppler',   'DOPPLER'),
('Densitometría Ósea',     'DEXA');

INSERT INTO pathology_types (name, code) VALUES
('Histopatología',         'HISTO'),('Citología',              'CYTO'),
('Necropsia',              'NECRO'),('Bacteriología / Cultivo','BACT'),
('Micología',              'MYCO'), ('Parasitología',          'PARA'),
('Virología',              'VIRO'), ('Inmunohistoquímica',     'IHC'),
('Biología Molecular / PCR','PCR');

INSERT INTO surgery_categories (name, description) VALUES
('Tejidos Blandos',           'Órganos, piel y tejidos blandos'),
('Ortopedia y Traumatología', 'Huesos, articulaciones, ligamentos'),
('Neurología Quirúrgica',     'Columna y sistema nervioso'),
('Oftalmología',              'Cirugías oculares y de párpados'),
('Odontología',               'Extracciones, endodoncias, fracturas mandibulares'),
('Oncología Quirúrgica',      'Resección de tumores y masas'),
('Reproducción',              'OVH, orquiectomía, cesárea, piometra'),
('Cardio-torácica',           'Cirugías cardíacas y torácicas'),
('Urgencias / Emergencias',   'Cirugías de urgencia no programadas');

INSERT INTO lab_test_categories (name, description) VALUES
('Hematología',              'Hemograma completo, diferencial, plaquetas'),
('Bioquímica Sérica',        'Perfil bioquímico, enzimas, electrolitos, proteínas'),
('Urianálisis',              'Análisis de orina con sedimento'),
('Coprología',               'Análisis de heces, flotación, directo'),
('Microbiología',            'Cultivos aerobios/anaerobios, antibiogramas'),
('Serología / Inmunología',  'Pruebas Ac/Ag, ELISA, inmunocromatografía'),
('Endocrinología',           'Hormonas tiroideas, insulina, cortisol, progesterona'),
('Coagulación',              'TP, TTPa, fibrinógeno, dímero D'),
('Citología de Fluidos',     'LCR, líquido pleural, peritoneal, sinovial'),
('Toxicología',              'Análisis de venenos y tóxicos'),
('Biología Molecular',       'PCR, secuenciación, RFLP'),
('Parasitología',            'Heartworm, leishmania, ehrlichia, etc.');

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 5/5: FARMACIA, FACTURACIÓN, RECORDATORIOS,
--              NOTIFICACIONES, ÍNDICES FINALES
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- FARMACIA E INVENTARIO
-- ============================================================

CREATE TABLE inventory_items (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    item_type       ENUM('medication','vaccine','supply','equipment','other') NOT NULL,
    medication_id   INT UNSIGNED,
    vaccine_id      SMALLINT UNSIGNED,
    product_name    VARCHAR(200)  NOT NULL,
    sku             VARCHAR(100),
    barcode         VARCHAR(100),
    unit_of_measure VARCHAR(50),
    reorder_point   DECIMAL(10,2) NOT NULL DEFAULT 0,
    active          TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_inv_org (organization_id),
    KEY fk_inv_med (medication_id),
    KEY fk_inv_vac (vaccine_id),
    CONSTRAINT fk_inv_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_inv_med FOREIGN KEY (medication_id)   REFERENCES medications(id),
    CONSTRAINT fk_inv_vac FOREIGN KEY (vaccine_id)      REFERENCES vaccines(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_stock (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    item_id      INT UNSIGNED  NOT NULL,
    branch_id    INT UNSIGNED  NOT NULL,
    lot_number   VARCHAR(100),
    expiry_date  DATE,
    quantity     DECIMAL(12,3) NOT NULL DEFAULT 0,
    unit_cost    DECIMAL(12,4),
    updated_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_stk_item   (item_id),
    KEY fk_stk_branch (branch_id),
    KEY idx_stk_expiry (expiry_date),
    CONSTRAINT fk_stk_item   FOREIGN KEY (item_id)   REFERENCES inventory_items(id),
    CONSTRAINT fk_stk_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inventory_movements (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    item_id        INT UNSIGNED  NOT NULL,
    branch_id      INT UNSIGNED  NOT NULL,
    movement_type  ENUM('purchase','sale','adjustment','transfer_in',
                        'transfer_out','expired','loss','return') NOT NULL,
    quantity       DECIMAL(12,3) NOT NULL,
    unit_cost      DECIMAL(12,4),
    reference_type VARCHAR(50),
    reference_id   INT UNSIGNED,
    performed_by   INT UNSIGNED  NOT NULL,
    notes          TEXT,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_imov_item   (item_id),
    KEY fk_imov_branch (branch_id),
    KEY fk_imov_user   (performed_by),
    KEY idx_imov_date  (created_at),
    CONSTRAINT fk_imov_item   FOREIGN KEY (item_id)      REFERENCES inventory_items(id),
    CONSTRAINT fk_imov_branch FOREIGN KEY (branch_id)    REFERENCES branches(id),
    CONSTRAINT fk_imov_user   FOREIGN KEY (performed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CATÁLOGO DE SERVICIOS Y PRECIOS
-- ============================================================

CREATE TABLE service_categories (
    id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(100)      NOT NULL,
    description TEXT,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE services_catalog (
    id              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED,
    category_id     SMALLINT UNSIGNED,
    code            VARCHAR(30)       NOT NULL,
    name            VARCHAR(200)      NOT NULL,
    description     TEXT,
    service_type    ENUM('consultation','laboratory','imaging','pathology',
                         'surgery','hospitalization','vaccination','grooming',
                         'procedure','medication','telemedicine','other'),
    default_price   DECIMAL(12,2),
    price_currency  CHAR(3)           NOT NULL DEFAULT 'USD',
    duration_minutes SMALLINT UNSIGNED,
    taxable         TINYINT(1)        NOT NULL DEFAULT 1,
    active          TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_svc_org (organization_id),
    KEY fk_svc_cat (category_id),
    CONSTRAINT fk_svc_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_svc_cat FOREIGN KEY (category_id)     REFERENCES service_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE price_lists (
    id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED      NOT NULL,
    name            VARCHAR(100)      NOT NULL,
    currency        CHAR(3)           NOT NULL DEFAULT 'USD',
    effective_from  DATE,
    effective_until DATE,
    active          TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_pl_org (organization_id),
    CONSTRAINT fk_pl_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE price_list_items (
    id            INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    price_list_id SMALLINT UNSIGNED NOT NULL,
    service_id    INT UNSIGNED      NOT NULL,
    price         DECIMAL(12,2)     NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pli (price_list_id, service_id),
    CONSTRAINT fk_pli_list FOREIGN KEY (price_list_id) REFERENCES price_lists(id),
    CONSTRAINT fk_pli_svc  FOREIGN KEY (service_id)    REFERENCES services_catalog(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FACTURACIÓN Y PAGOS
-- ============================================================

CREATE TABLE invoices (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)      NOT NULL DEFAULT (UUID()),
    organization_id   INT UNSIGNED  NOT NULL,
    branch_id         INT UNSIGNED  NOT NULL,
    invoice_number    VARCHAR(60)   NOT NULL,
    client_id         INT UNSIGNED  NOT NULL,
    patient_id        INT UNSIGNED,
    medical_record_id INT UNSIGNED,
    invoice_date      DATE          NOT NULL,
    due_date          DATE,
    subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    total             DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency          CHAR(3)       NOT NULL DEFAULT 'USD',
    status            ENUM('draft','issued','partially_paid','paid',
                           'overdue','cancelled','refunded') NOT NULL DEFAULT 'draft',
    payment_status    ENUM('unpaid','partial','paid','refunded')    NOT NULL DEFAULT 'unpaid',
    notes             TEXT,
    created_by        INT UNSIGNED  NOT NULL,
    created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_inv_uuid   (uuid),
    UNIQUE KEY uq_inv_number (organization_id, invoice_number),
    KEY fk_inv_org    (organization_id),
    KEY fk_inv_branch (branch_id),
    KEY fk_inv_client (client_id),
    KEY fk_inv_pat    (patient_id),
    KEY fk_inv_mr     (medical_record_id),
    KEY fk_inv_user   (created_by),
    KEY idx_inv_date   (invoice_date),
    KEY idx_inv_status (status),
    CONSTRAINT fk_inv_org    FOREIGN KEY (organization_id)  REFERENCES organizations(id),
    CONSTRAINT fk_inv_branch FOREIGN KEY (branch_id)        REFERENCES branches(id),
    CONSTRAINT fk_inv_client FOREIGN KEY (client_id)        REFERENCES clients(id),
    CONSTRAINT fk_inv_pat    FOREIGN KEY (patient_id)       REFERENCES patients(id),
    CONSTRAINT fk_inv_mr     FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_inv_user   FOREIGN KEY (created_by)       REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE invoice_items (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    invoice_id       INT UNSIGNED  NOT NULL,
    service_id       INT UNSIGNED,
    description      VARCHAR(500)  NOT NULL,
    quantity         DECIMAL(10,3) NOT NULL DEFAULT 1,
    unit_price       DECIMAL(12,2) NOT NULL,
    discount_pct     DECIMAL(5,2)  NOT NULL DEFAULT 0,
    discount_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_pct          DECIMAL(5,2)  NOT NULL DEFAULT 0,
    tax_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_total       DECIMAL(12,2) NOT NULL,
    PRIMARY KEY (id),
    KEY fk_invitem_inv (invoice_id),
    KEY fk_invitem_svc (service_id),
    CONSTRAINT fk_invitem_inv FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_invitem_svc FOREIGN KEY (service_id) REFERENCES services_catalog(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    invoice_id      INT UNSIGNED  NOT NULL,
    payment_date    DATE          NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    currency        CHAR(3)       NOT NULL DEFAULT 'USD',
    payment_method  ENUM('cash','credit_card','debit_card','bank_transfer',
                         'check','online','crypto','other'),
    reference_number VARCHAR(100),
    received_by     INT UNSIGNED  NOT NULL,
    notes           TEXT,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_pay_inv  (invoice_id),
    KEY fk_pay_user (received_by),
    CONSTRAINT fk_pay_inv  FOREIGN KEY (invoice_id)  REFERENCES invoices(id),
    CONSTRAINT fk_pay_user FOREIGN KEY (received_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RECORDATORIOS Y NOTIFICACIONES
-- ============================================================

CREATE TABLE reminders (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED  NOT NULL,
    patient_id      INT UNSIGNED  NOT NULL,
    client_id       INT UNSIGNED  NOT NULL,
    reminder_type   ENUM('vaccination','deworming','follow_up','medication',
                         'appointment','annual_checkup','other') NOT NULL,
    due_date        DATE          NOT NULL,
    message         TEXT,
    channel         ENUM('email','sms','whatsapp','push','in_app') NOT NULL DEFAULT 'whatsapp',
    status          ENUM('pending','sent','acknowledged','completed','cancelled') NOT NULL DEFAULT 'pending',
    sent_at         DATETIME,
    linked_vaccination_id INT UNSIGNED,
    linked_appointment_id INT UNSIGNED,
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_rem_org   (organization_id),
    KEY fk_rem_pat   (patient_id),
    KEY fk_rem_client (client_id),
    KEY fk_rem_vacc  (linked_vaccination_id),
    KEY fk_rem_appt  (linked_appointment_id),
    KEY idx_rem_due  (due_date, status),
    CONSTRAINT fk_rem_org   FOREIGN KEY (organization_id)      REFERENCES organizations(id),
    CONSTRAINT fk_rem_pat   FOREIGN KEY (patient_id)           REFERENCES patients(id),
    CONSTRAINT fk_rem_client FOREIGN KEY (client_id)           REFERENCES clients(id),
    CONSTRAINT fk_rem_vacc  FOREIGN KEY (linked_vaccination_id) REFERENCES vaccinations(id),
    CONSTRAINT fk_rem_appt  FOREIGN KEY (linked_appointment_id) REFERENCES appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Log de todas las notificaciones enviadas (email/SMS/WhatsApp)
CREATE TABLE notification_logs (
    id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    organization_id INT UNSIGNED     NOT NULL,
    reminder_id     INT UNSIGNED,
    recipient_type  ENUM('client','user','admin') NOT NULL,
    recipient_id    INT UNSIGNED     NOT NULL,
    channel         ENUM('email','sms','whatsapp','push','in_app') NOT NULL,
    recipient_address VARCHAR(200)   NOT NULL,
    subject         VARCHAR(300),
    body            TEXT,
    status          ENUM('queued','sent','delivered','failed','bounced') NOT NULL DEFAULT 'queued',
    provider        VARCHAR(100),
    provider_message_id VARCHAR(200),
    sent_at         DATETIME,
    delivered_at    DATETIME,
    failure_reason  TEXT,
    created_at      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_nl_org    (organization_id),
    KEY fk_nl_rem    (reminder_id),
    KEY idx_nl_status (status),
    KEY idx_nl_date   (created_at),
    CONSTRAINT fk_nl_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_nl_rem FOREIGN KEY (reminder_id)     REFERENCES reminders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ÍNDICES FINALES DE RENDIMIENTO
-- ============================================================

-- Laboratorio
CREATE INDEX idx_lo_patient ON lab_orders(patient_id);
CREATE INDEX idx_lo_date    ON lab_orders(order_datetime);

-- Imágenes
CREATE INDEX idx_io_patient ON imaging_orders(patient_id);
CREATE INDEX idx_io_date    ON imaging_orders(order_datetime);

-- Vacunación
CREATE INDEX idx_vacc_pat    ON vaccinations(patient_id);
CREATE INDEX idx_vacc_date   ON vaccinations(vaccination_date);

-- Internación
CREATE INDEX idx_hosp_pat    ON hospitalizations(patient_id);
CREATE INDEX idx_hosp_status ON hospitalizations(status);

-- Cirugías
CREATE INDEX idx_surg_pat  ON surgeries(patient_id);
CREATE INDEX idx_surg_date ON surgeries(scheduled_at);

-- Pacientes
CREATE INDEX idx_pat_org      ON patients(organization_id);
CREATE INDEX idx_pat_species  ON patients(species_id);
CREATE INDEX idx_pat_chip     ON patients(microchip_number);

-- Propietarios
CREATE INDEX idx_cli_org    ON clients(organization_id);
CREATE INDEX idx_cli_nat_id ON clients(national_id);
CREATE INDEX idx_cli_email  ON clients(email);
CREATE INDEX idx_cli_phone  ON clients(phone_primary);

-- Turnos
CREATE INDEX idx_appt_date_br  ON appointments(scheduled_date, branch_id);
CREATE INDEX idx_appt_pat      ON appointments(patient_id);
CREATE INDEX idx_appt_vet_date ON appointments(veterinarian_id, scheduled_date);

-- Historia Clínica
CREATE INDEX idx_mr_pat    ON medical_records(patient_id);
CREATE INDEX idx_mr_date   ON medical_records(record_date);
CREATE INDEX idx_mr_branch ON medical_records(branch_id);
CREATE INDEX idx_mr_vet    ON medical_records(veterinarian_id);

-- Facturas
CREATE INDEX idx_inv_client ON invoices(client_id);
CREATE INDEX idx_inv_date   ON invoices(invoice_date);
CREATE INDEX idx_inv_status ON invoices(status);

-- Recordatorios
CREATE INDEX idx_rem_due    ON reminders(due_date, status);
CREATE INDEX idx_rem_client ON reminders(client_id);

-- ============================================================
-- SEED: CATEGORÍAS DE SERVICIOS
-- ============================================================

INSERT INTO service_categories (name, description) VALUES
('Consultas y Revisiones',    'Consultas generales, controles, urgencias'),
('Laboratorio',               'Análisis clínicos y microbiología'),
('Diagnóstico por Imagen',    'Radiología, ecografía, TC, RMN'),
('Patología',                 'Histopatología, citología, necropsias'),
('Cirugía',                   'Procedimientos quirúrgicos'),
('Internación',               'Hospitalización por día / fracción'),
('Vacunación y Profilaxis',   'Vacunas, antiparasitarios, certificados'),
('Peluquería / Grooming',     'Baño, corte, pelado terapéutico'),
('Procedimientos Clínicos',   'Curaciones, vendajes, suturas, endoscopia'),
('Medicamentos',              'Venta y dispensación de medicamentos'),
('Odontología Veterinaria',   'Limpieza, extracciones, ortodoncia'),
('Telemedicina',              'Teleconsulta y seguimiento virtual');

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 6/8: VISTAS SQL (VIEWS)
-- ============================================================

SET NAMES utf8mb4;

-- ============================================================
-- v_patient_card
-- Ficha completa del paciente con propietario primario actual,
-- última visita y próximas vacunas vencidas.
-- ============================================================
CREATE OR REPLACE VIEW v_patient_card AS
SELECT
    p.id                     AS patient_id,
    p.uuid                   AS patient_uuid,
    p.organization_id,
    p.patient_code,
    p.name                   AS patient_name,
    sp.common_name           AS species,
    b.name                   AS breed,
    CASE p.gender WHEN 'M' THEN 'Macho' WHEN 'F' THEN 'Hembra' ELSE 'N/E' END AS gender,
    p.neutered,
    p.date_of_birth,
    TIMESTAMPDIFF(YEAR,  p.date_of_birth, CURDATE()) AS age_years,
    TIMESTAMPDIFF(MONTH, p.date_of_birth, CURDATE()) % 12 AS age_months,
    p.weight_kg,
    p.microchip_number,
    p.is_deceased,
    -- Propietario primario activo
    c.id                     AS owner_id,
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary          AS owner_phone,
    c.whatsapp               AS owner_whatsapp,
    c.email                  AS owner_email,
    -- Última visita
    (SELECT MAX(mr.record_date)
     FROM medical_records mr
     WHERE mr.patient_id = p.id) AS last_visit_date,
    -- Próxima vacuna vencida (más cercana)
    (SELECT MIN(v.next_dose_due)
     FROM vaccinations v
     WHERE v.patient_id = p.id
       AND v.next_dose_due >= CURDATE()
       AND v.status = 'administered') AS next_vaccine_due,
    -- Alergias activas
    (SELECT GROUP_CONCAT(a.allergen_name ORDER BY a.allergen_name SEPARATOR ', ')
     FROM patient_allergies a
     WHERE a.patient_id = p.id AND a.active = 1) AS active_allergies,
    p.notes,
    p.active
FROM patients p
JOIN species sp                ON sp.id = p.species_id
LEFT JOIN breeds b             ON b.id  = p.breed_id
LEFT JOIN patient_owners po    ON po.patient_id    = p.id
                               AND po.ownership_type = 'primary'
                               AND po.active = 1
                               AND po.end_date IS NULL
LEFT JOIN clients c            ON c.id = po.client_id
WHERE p.deleted_at IS NULL;

-- ============================================================
-- v_today_appointments
-- Turnos de hoy en todas las sucursales con datos del paciente
-- y propietario, ordenados por hora.
-- ============================================================
CREATE OR REPLACE VIEW v_today_appointments AS
SELECT
    a.id                  AS appointment_id,
    a.uuid,
    a.branch_id,
    br.name               AS branch_name,
    a.scheduled_time,
    a.duration_minutes,
    a.status,
    a.priority,
    at2.name              AS appointment_type,
    at2.color_hex,
    -- Paciente
    p.id                  AS patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    p.microchip_number,
    -- Propietario
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary       AS owner_phone,
    c.whatsapp,
    -- Veterinario
    CONCAT(u.first_name,' ',u.last_name) AS vet_name,
    u.license_number,
    a.chief_complaint,
    a.notes_for_vet
FROM appointments a
JOIN branches br              ON br.id  = a.branch_id
JOIN appointment_types at2    ON at2.id = a.appointment_type_id
JOIN patients p               ON p.id   = a.patient_id
JOIN species sp               ON sp.id  = p.species_id
JOIN clients c                ON c.id   = a.client_id
LEFT JOIN users u             ON u.id   = a.veterinarian_id
WHERE a.scheduled_date = CURDATE()
  AND a.status NOT IN ('cancelled','no_show')
ORDER BY a.scheduled_time ASC;

-- ============================================================
-- v_active_hospitalizations
-- Internaciones activas con días de internación y última
-- medición de constantes.
-- ============================================================
CREATE OR REPLACE VIEW v_active_hospitalizations AS
SELECT
    h.id                  AS hospitalization_id,
    h.uuid,
    h.branch_id,
    br.name               AS branch_name,
    w.name                AS ward_name,
    k.kennel_code,
    -- Paciente
    p.id                  AS patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    p.microchip_number,
    p.weight_kg,
    -- Propietario
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary       AS owner_phone,
    c.whatsapp,
    -- Veterinario a cargo
    CONCAT(u.first_name,' ',u.last_name) AS attending_vet,
    -- Internación
    h.admission_at,
    TIMESTAMPDIFF(HOUR, h.admission_at, NOW())          AS hours_hospitalized,
    FLOOR(TIMESTAMPDIFF(HOUR, h.admission_at, NOW())/24) AS days_hospitalized,
    h.admission_reason,
    h.admission_diagnosis,
    h.urgency,
    h.isolation_required,
    -- Última medición de constantes
    (SELECT hm.temperature_c FROM hospitalization_monitoring hm
     WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_temp,
    (SELECT hm.heart_rate       FROM hospitalization_monitoring hm
     WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_hr,
    (SELECT hm.pain_score       FROM hospitalization_monitoring hm
     WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_pain,
    (SELECT hm.recorded_at      FROM hospitalization_monitoring hm
     WHERE hm.hospitalization_id = h.id ORDER BY hm.recorded_at DESC LIMIT 1) AS last_monitoring_at
FROM hospitalizations h
JOIN branches br              ON br.id = h.branch_id
LEFT JOIN wards  w            ON w.id  = h.ward_id
LEFT JOIN kennels k           ON k.id  = h.kennel_id
JOIN patients p               ON p.id  = h.patient_id
JOIN species sp               ON sp.id = p.species_id
JOIN clients c                ON c.id  = h.client_id
LEFT JOIN users u             ON u.id  = h.attending_vet_id
WHERE h.status = 'active';

-- ============================================================
-- v_vaccination_alerts
-- Vacunas vencidas o por vencer en los próximos 30 días.
-- ============================================================
CREATE OR REPLACE VIEW v_vaccination_alerts AS
SELECT
    v.id                  AS vaccination_id,
    v.patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    p.organization_id,
    vc.name               AS vaccine_name,
    v.vaccination_date    AS last_dose_date,
    v.next_dose_due,
    v.next_dose_type,
    DATEDIFF(v.next_dose_due, CURDATE()) AS days_until_due,
    CASE
        WHEN v.next_dose_due < CURDATE()              THEN 'VENCIDA'
        WHEN v.next_dose_due <= DATE_ADD(CURDATE(), INTERVAL 7  DAY) THEN 'VENCE_7_DIAS'
        WHEN v.next_dose_due <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'VENCE_30_DIAS'
    END AS alert_level,
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary,
    c.whatsapp,
    c.email
FROM vaccinations v
JOIN patients p  ON p.id  = v.patient_id
JOIN species sp  ON sp.id = p.species_id
JOIN vaccines vc ON vc.id = v.vaccine_id
LEFT JOIN patient_owners po ON po.patient_id = p.id
                           AND po.ownership_type = 'primary'
                           AND po.active = 1 AND po.end_date IS NULL
LEFT JOIN clients c         ON c.id = po.client_id
WHERE v.next_dose_due IS NOT NULL
  AND v.next_dose_due <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND v.status = 'administered'
  AND p.active = 1
  AND p.is_deceased = 0
ORDER BY v.next_dose_due ASC;

-- ============================================================
-- v_deworming_alerts
-- Desparasitaciones vencidas o por vencer en 30 días.
-- ============================================================
CREATE OR REPLACE VIEW v_deworming_alerts AS
SELECT
    d.id                  AS deworming_id,
    d.patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    p.organization_id,
    ap.name               AS product_name,
    d.administration_date AS last_treatment_date,
    d.next_due_date,
    DATEDIFF(d.next_due_date, CURDATE()) AS days_until_due,
    CASE
        WHEN d.next_due_date < CURDATE()              THEN 'VENCIDA'
        WHEN d.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 7  DAY) THEN 'VENCE_7_DIAS'
        WHEN d.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'VENCE_30_DIAS'
    END AS alert_level,
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary, c.whatsapp
FROM deworming_records d
JOIN patients p            ON p.id  = d.patient_id
JOIN species sp            ON sp.id = p.species_id
JOIN antiparasitic_products ap ON ap.id = d.product_id
LEFT JOIN patient_owners po ON po.patient_id = p.id
                           AND po.ownership_type = 'primary'
                           AND po.active = 1 AND po.end_date IS NULL
LEFT JOIN clients c         ON c.id = po.client_id
WHERE d.next_due_date IS NOT NULL
  AND d.next_due_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND p.active = 1 AND p.is_deceased = 0
ORDER BY d.next_due_date ASC;

-- ============================================================
-- v_pending_lab_results
-- Órdenes de laboratorio con resultados pendientes.
-- ============================================================
CREATE OR REPLACE VIEW v_pending_lab_results AS
SELECT
    lo.id                 AS order_id,
    lo.uuid               AS order_uuid,
    lo.branch_id,
    br.name               AS branch_name,
    lo.priority,
    lo.status,
    lo.order_datetime,
    TIMESTAMPDIFF(HOUR, lo.order_datetime, NOW()) AS hours_since_order,
    p.id                  AS patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    CONCAT(u.first_name,' ',u.last_name) AS ordering_vet,
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary, c.whatsapp,
    -- Pruebas pendientes
    (SELECT COUNT(*) FROM lab_order_items loi
     WHERE loi.lab_order_id = lo.id AND loi.status = 'pending') AS pending_tests,
    (SELECT COUNT(*) FROM lab_order_items loi
     WHERE loi.lab_order_id = lo.id AND loi.status = 'completed') AS completed_tests
FROM lab_orders lo
JOIN branches br   ON br.id = lo.branch_id
JOIN patients p    ON p.id  = lo.patient_id
JOIN species sp    ON sp.id = p.species_id
JOIN users u       ON u.id  = lo.ordering_vet_id
LEFT JOIN patient_owners po ON po.patient_id = p.id
                           AND po.ownership_type = 'primary'
                           AND po.active = 1 AND po.end_date IS NULL
LEFT JOIN clients c ON c.id = po.client_id
WHERE lo.status IN ('ordered','sample_collected','processing','partial_results')
ORDER BY lo.priority DESC, lo.order_datetime ASC;

-- ============================================================
-- v_pending_imaging_reports
-- Estudios de imagen tomados pero sin informe aún.
-- ============================================================
CREATE OR REPLACE VIEW v_pending_imaging_reports AS
SELECT
    io.id                 AS order_id,
    io.uuid,
    io.branch_id,
    br.name               AS branch_name,
    it.name               AS imaging_type,
    io.body_region,
    io.priority,
    io.order_datetime,
    io.performed_at,
    TIMESTAMPDIFF(HOUR, io.performed_at, NOW()) AS hours_since_performed,
    p.id                  AS patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    CONCAT(uv.first_name,' ',uv.last_name) AS ordering_vet,
    CONCAT(up.first_name,' ',up.last_name) AS performed_by,
    CONCAT(c.first_name,' ',c.last_name)   AS owner_name,
    c.phone_primary
FROM imaging_orders io
JOIN branches br       ON br.id  = io.branch_id
JOIN imaging_types it  ON it.id  = io.imaging_type_id
JOIN patients p        ON p.id   = io.patient_id
JOIN species sp        ON sp.id  = p.species_id
JOIN users uv          ON uv.id  = io.ordering_vet_id
LEFT JOIN users up     ON up.id  = io.performed_by
LEFT JOIN patient_owners po ON po.patient_id = p.id
                           AND po.ownership_type = 'primary'
                           AND po.active = 1 AND po.end_date IS NULL
LEFT JOIN clients c    ON c.id = po.client_id
WHERE io.status = 'images_taken'
  AND NOT EXISTS (
      SELECT 1 FROM imaging_reports ir WHERE ir.imaging_order_id = io.id
  )
ORDER BY io.priority DESC, io.performed_at ASC;

-- ============================================================
-- v_emergency_board
-- Tablero de emergencias activas ordenado por prioridad.
-- ============================================================
CREATE OR REPLACE VIEW v_emergency_board AS
SELECT
    et.id                 AS triage_id,
    et.uuid,
    et.branch_id,
    br.name               AS branch_name,
    et.triage_priority,
    CASE et.triage_priority
        WHEN 'immediate'    THEN 1
        WHEN 'urgent'       THEN 2
        WHEN 'less_urgent'  THEN 3
        WHEN 'non_urgent'   THEN 4
    END AS priority_order,
    et.arrival_datetime,
    TIMESTAMPDIFF(MINUTE, et.arrival_datetime, NOW()) AS wait_minutes,
    et.status,
    -- Paciente
    COALESCE(p.name, et.unknown_patient_desc) AS patient_name,
    sp.common_name        AS species,
    -- Constantes
    et.temperature_c, et.heart_rate, et.respiratory_rate,
    et.mucous_color, et.consciousness, et.pain_score,
    et.reason_for_emergency,
    -- Propietario
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary,
    -- Veterinario asignado
    CONCAT(u.first_name,' ',u.last_name) AS assigned_vet,
    et.triage_notes
FROM emergency_triage et
JOIN branches br       ON br.id = et.branch_id
LEFT JOIN patients p   ON p.id  = et.patient_id
LEFT JOIN species sp   ON sp.id = p.species_id
LEFT JOIN clients c    ON c.id  = et.client_id
LEFT JOIN users u      ON u.id  = et.assigned_vet_id
WHERE et.status IN ('waiting','being_treated')
ORDER BY priority_order ASC, et.arrival_datetime ASC;

-- ============================================================
-- v_patient_medical_summary
-- Resumen clínico del paciente: última HC, diagnósticos,
-- alergias, condiciones crónicas y medicación activa.
-- ============================================================
CREATE OR REPLACE VIEW v_patient_medical_summary AS
SELECT
    p.id                  AS patient_id,
    p.name                AS patient_name,
    sp.common_name        AS species,
    -- Propietario primario
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary, c.whatsapp,
    -- Última HC
    mr.id                 AS last_record_id,
    mr.record_date        AS last_visit_date,
    mr.record_type        AS last_visit_type,
    CONCAT(uv.first_name,' ',uv.last_name) AS last_vet,
    -- Diagnósticos de la última HC
    (SELECT GROUP_CONCAT(d.description ORDER BY d.diagnosis_order SEPARATOR ' | ')
     FROM diagnoses d WHERE d.medical_record_id = mr.id
       AND d.diagnosis_type = 'definitive') AS last_diagnoses,
    -- Alergias activas
    (SELECT GROUP_CONCAT(a.allergen_name SEPARATOR ', ')
     FROM patient_allergies a
     WHERE a.patient_id = p.id AND a.active = 1) AS allergies,
    -- Condiciones crónicas activas
    (SELECT GROUP_CONCAT(cc.condition_name SEPARATOR ', ')
     FROM patient_chronic_conditions cc
     WHERE cc.patient_id = p.id
       AND cc.current_status IN ('active','controlled')) AS chronic_conditions,
    -- Prescripciones activas
    (SELECT COUNT(*) FROM prescriptions rx
     WHERE rx.patient_id = p.id AND rx.status = 'active'
       AND (rx.valid_until IS NULL OR rx.valid_until >= CURDATE())) AS active_prescriptions,
    -- Próxima vacuna
    (SELECT MIN(v.next_dose_due) FROM vaccinations v
     WHERE v.patient_id = p.id
       AND v.next_dose_due >= CURDATE()) AS next_vaccine_due,
    p.weight_kg
FROM patients p
JOIN species sp ON sp.id = p.species_id
LEFT JOIN patient_owners po ON po.patient_id = p.id
                           AND po.ownership_type = 'primary'
                           AND po.active = 1 AND po.end_date IS NULL
LEFT JOIN clients c         ON c.id = po.client_id
LEFT JOIN medical_records mr ON mr.id = (
    SELECT id FROM medical_records
    WHERE patient_id = p.id
    ORDER BY record_date DESC, record_time DESC
    LIMIT 1
)
LEFT JOIN users uv          ON uv.id = mr.veterinarian_id
WHERE p.active = 1 AND p.deleted_at IS NULL;

-- ============================================================
-- v_branch_daily_kpis
-- KPIs operativos diarios por sucursal.
-- ============================================================
CREATE OR REPLACE VIEW v_branch_daily_kpis AS
SELECT
    br.id                             AS branch_id,
    br.name                           AS branch_name,
    br.organization_id,
    CURDATE()                         AS kpi_date,
    -- Turnos
    COUNT(DISTINCT CASE WHEN a.scheduled_date = CURDATE() THEN a.id END)                AS total_appointments_today,
    COUNT(DISTINCT CASE WHEN a.scheduled_date = CURDATE() AND a.status = 'completed'   THEN a.id END) AS completed_today,
    COUNT(DISTINCT CASE WHEN a.scheduled_date = CURDATE() AND a.status = 'no_show'     THEN a.id END) AS no_shows_today,
    COUNT(DISTINCT CASE WHEN a.scheduled_date = CURDATE() AND a.status = 'cancelled'   THEN a.id END) AS cancelled_today,
    -- Emergencias
    COUNT(DISTINCT CASE WHEN et.arrival_datetime >= CURDATE()
                         AND et.arrival_datetime < CURDATE() + INTERVAL 1 DAY THEN et.id END) AS emergencies_today,
    -- Internados activos
    COUNT(DISTINCT CASE WHEN h.status = 'active' THEN h.id END) AS active_hospitalizations,
    -- Facturación del día
    COALESCE(SUM(CASE WHEN DATE(inv.invoice_date) = CURDATE()
                       AND inv.status != 'cancelled' THEN inv.total END), 0) AS revenue_today
FROM branches br
LEFT JOIN appointments a   ON a.branch_id = br.id
LEFT JOIN emergency_triage et ON et.branch_id = br.id
LEFT JOIN hospitalizations h  ON h.branch_id  = br.id
LEFT JOIN invoices inv         ON inv.branch_id = br.id
WHERE br.active = 1
GROUP BY br.id, br.name, br.organization_id;

-- ============================================================
-- v_active_sessions
-- Sesiones de usuario activas (no revocadas y no expiradas).
-- ============================================================
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
    s.id                  AS session_id,
    s.user_id,
    CONCAT(u.first_name,' ',u.last_name) AS user_name,
    u.email,
    s.organization_id,
    o.name                AS organization_name,
    s.device_type,
    s.device_name,
    s.ip_address,
    s.country_code,
    s.city,
    s.created_at          AS login_at,
    s.last_activity,
    s.expires_at,
    TIMESTAMPDIFF(MINUTE, s.last_activity, NOW()) AS idle_minutes
FROM user_sessions s
JOIN users u         ON u.id = s.user_id
LEFT JOIN organizations o ON o.id = s.organization_id
WHERE s.revoked = 0
  AND s.expires_at > NOW()
ORDER BY s.last_activity DESC;

-- ============================================================
-- v_login_failures_last_24h
-- Intentos fallidos de login en las últimas 24 horas.
-- Útil para detectar ataques de fuerza bruta.
-- ============================================================
CREATE OR REPLACE VIEW v_login_failures_last_24h AS
SELECT
    lh.ip_address,
    lh.email_attempted,
    COUNT(*)              AS failed_attempts,
    MIN(lh.attempted_at)  AS first_attempt,
    MAX(lh.attempted_at)  AS last_attempt,
    lh.country_code,
    lh.city,
    GROUP_CONCAT(DISTINCT lh.failure_reason ORDER BY lh.failure_reason) AS reasons
FROM login_history lh
WHERE lh.success = 0
  AND lh.attempted_at >= NOW() - INTERVAL 24 HOUR
GROUP BY lh.ip_address, lh.email_attempted, lh.country_code, lh.city
HAVING failed_attempts >= 3
ORDER BY failed_attempts DESC;

-- ============================================================
-- v_invoice_aging
-- Facturas vencidas agrupadas por cliente (aging report).
-- ============================================================
CREATE OR REPLACE VIEW v_invoice_aging AS
SELECT
    inv.organization_id,
    c.id                  AS client_id,
    CONCAT(c.first_name,' ',c.last_name) AS client_name,
    c.phone_primary, c.email,
    COUNT(inv.id)         AS overdue_invoices,
    SUM(inv.total)        AS total_owed,
    SUM(CASE WHEN DATEDIFF(CURDATE(), inv.due_date) BETWEEN 1  AND 30  THEN inv.total ELSE 0 END) AS due_1_30,
    SUM(CASE WHEN DATEDIFF(CURDATE(), inv.due_date) BETWEEN 31 AND 60  THEN inv.total ELSE 0 END) AS due_31_60,
    SUM(CASE WHEN DATEDIFF(CURDATE(), inv.due_date) BETWEEN 61 AND 90  THEN inv.total ELSE 0 END) AS due_61_90,
    SUM(CASE WHEN DATEDIFF(CURDATE(), inv.due_date) > 90               THEN inv.total ELSE 0 END) AS due_over_90,
    MIN(inv.due_date)     AS oldest_due_date
FROM invoices inv
JOIN clients c ON c.id = inv.client_id
WHERE inv.status IN ('issued','overdue')
  AND inv.payment_status IN ('unpaid','partial')
  AND inv.due_date < CURDATE()
GROUP BY inv.organization_id, c.id, c.first_name, c.last_name, c.phone_primary, c.email
ORDER BY total_owed DESC;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 7/8: STORED PROCEDURES Y FUNCIONES
-- ============================================================

SET NAMES utf8mb4;
DELIMITER $$

-- ============================================================
-- fn_get_patient_age_text
-- Devuelve la edad del paciente como texto legible.
-- ============================================================
CREATE FUNCTION fn_get_patient_age_text(p_dob DATE)
RETURNS VARCHAR(50)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_years  INT;
    DECLARE v_months INT;
    IF p_dob IS NULL THEN RETURN 'Edad desconocida'; END IF;
    SET v_years  = TIMESTAMPDIFF(YEAR,  p_dob, CURDATE());
    SET v_months = TIMESTAMPDIFF(MONTH, p_dob, CURDATE()) % 12;
    IF v_years >= 1 THEN
        RETURN CONCAT(v_years, IF(v_years=1,' año',' años'),
                      IF(v_months > 0, CONCAT(' y ', v_months, IF(v_months=1,' mes',' meses')),''));
    ELSE
        SET v_months = TIMESTAMPDIFF(MONTH, p_dob, CURDATE());
        RETURN CONCAT(v_months, IF(v_months=1,' mes',' meses'));
    END IF;
END$$

-- ============================================================
-- fn_is_patient_owner
-- Verifica si un cliente es propietario activo de un paciente.
-- ============================================================
CREATE FUNCTION fn_is_patient_owner(p_patient_id INT, p_client_id INT)
RETURNS TINYINT(1)
READS SQL DATA
DETERMINISTIC
BEGIN
    DECLARE v_count INT;
    SELECT COUNT(*) INTO v_count
    FROM patient_owners
    WHERE patient_id = p_patient_id
      AND client_id  = p_client_id
      AND active = 1
      AND (end_date IS NULL OR end_date >= CURDATE());
    RETURN IF(v_count > 0, 1, 0);
END$$

-- ============================================================
-- sp_login_attempt
-- Registra un intento de login, actualiza contador de fallos
-- y bloquea la cuenta si supera el máximo configurado.
-- Retorna: 0=ok, 1=user_not_found, 2=wrong_password,
--          3=locked, 4=inactive, 5=org_suspended
-- ============================================================
CREATE PROCEDURE sp_login_attempt(
    IN  p_email        VARCHAR(200),
    IN  p_ip_address   VARCHAR(45),
    IN  p_user_agent   VARCHAR(500),
    IN  p_success      TINYINT(1),
    IN  p_failure_reason ENUM('wrong_password','user_not_found','account_locked',
                              'account_inactive','2fa_failed','ip_blocked','expired'),
    OUT p_user_id      INT,
    OUT p_session_note VARCHAR(200)
)
BEGIN
    DECLARE v_user_id      INT;
    DECLARE v_attempts     INT;
    DECLARE v_max_attempts INT;
    DECLARE v_org_id       INT;
    DECLARE v_locked_until DATETIME;
    DECLARE v_active       TINYINT(1);

    -- Buscar usuario
    SELECT id, failed_attempts, organization_id, locked_until, active
      INTO v_user_id, v_attempts, v_org_id, v_locked_until, v_active
    FROM users WHERE email = p_email LIMIT 1;

    SET p_user_id = v_user_id;

    -- Obtener máx intentos de la organización (default 5)
    SELECT COALESCE(max_login_attempts, 5) INTO v_max_attempts
    FROM organizations WHERE id = v_org_id;

    -- Registrar en historial
    INSERT INTO login_history
        (user_id, organization_id, email_attempted, ip_address,
         user_agent, success, failure_reason, attempted_at)
    VALUES
        (v_user_id, v_org_id, p_email, p_ip_address,
         p_user_agent, p_success, p_failure_reason, NOW());

    IF p_success = 1 THEN
        -- Login exitoso: resetear contador y actualizar last_login
        UPDATE users
           SET failed_attempts = 0,
               locked_until    = NULL,
               last_login_at   = NOW(),
               last_login_ip   = p_ip_address
        WHERE id = v_user_id;
        SET p_session_note = 'OK';
    ELSE
        -- Login fallido: incrementar contador
        IF v_user_id IS NOT NULL THEN
            SET v_attempts = v_attempts + 1;
            IF v_attempts >= v_max_attempts THEN
                UPDATE users
                   SET failed_attempts = v_attempts,
                       locked_until    = DATE_ADD(NOW(), INTERVAL 30 MINUTE)
                WHERE id = v_user_id;
                -- Crear alerta de seguridad
                INSERT INTO security_alerts
                    (organization_id, user_id, alert_type, severity, description, ip_address)
                VALUES
                    (v_org_id, v_user_id, 'brute_force', 'critical',
                     CONCAT('Cuenta bloqueada tras ', v_attempts, ' intentos fallidos desde IP ', p_ip_address),
                     p_ip_address);
                SET p_session_note = 'ACCOUNT_LOCKED';
            ELSE
                UPDATE users SET failed_attempts = v_attempts WHERE id = v_user_id;
                SET p_session_note = CONCAT('FAILED_', v_attempts, '_OF_', v_max_attempts);
            END IF;
        END IF;
    END IF;
END$$

-- ============================================================
-- sp_revoke_user_sessions
-- Revoca todas las sesiones activas de un usuario.
-- Usado en: cambio de contraseña, bloqueo de cuenta,
-- logout de todos los dispositivos.
-- ============================================================
CREATE PROCEDURE sp_revoke_user_sessions(
    IN p_user_id     INT,
    IN p_reason      ENUM('logout','forced','password_changed','admin','expired'),
    IN p_except_session_id BIGINT  -- NULL = revocar todas
)
BEGIN
    UPDATE user_sessions
       SET revoked      = 1,
           revoked_at   = NOW(),
           revoked_reason = p_reason
    WHERE user_id = p_user_id
      AND revoked  = 0
      AND (p_except_session_id IS NULL OR id != p_except_session_id);
END$$

-- ============================================================
-- sp_transfer_patient_ownership
-- Transfiere la propiedad principal de un paciente de un
-- cliente a otro. Cierra la propiedad anterior y abre la nueva.
-- ============================================================
CREATE PROCEDURE sp_transfer_patient_ownership(
    IN  p_patient_id    INT,
    IN  p_new_client_id INT,
    IN  p_registered_by INT,
    IN  p_reason        TEXT,
    OUT p_result        TINYINT(1),
    OUT p_message       VARCHAR(200)
)
BEGIN
    DECLARE v_old_owner_id INT;
    DECLARE v_today        DATE;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_result = 0;
        SET p_message = 'Error al transferir propiedad. Rollback ejecutado.';
    END;

    SET v_today = CURDATE();

    -- Verificar que el nuevo cliente existe
    IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_new_client_id AND active = 1) THEN
        SET p_result  = 0;
        SET p_message = 'Cliente destino no existe o está inactivo.';
        LEAVE sp_transfer_patient_ownership;
    END IF;

    -- Verificar que el paciente existe
    IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND active = 1) THEN
        SET p_result  = 0;
        SET p_message = 'Paciente no existe o está inactivo.';
        LEAVE sp_transfer_patient_ownership;
    END IF;

    START TRANSACTION;

    -- Cerrar propiedad primaria actual
    UPDATE patient_owners
       SET end_date  = v_today,
           active    = 0,
           updated_at = NOW()
    WHERE patient_id     = p_patient_id
      AND ownership_type = 'primary'
      AND active         = 1
      AND end_date IS NULL;

    -- Crear nueva propiedad primaria
    INSERT INTO patient_owners
        (patient_id, client_id, ownership_type, start_date,
         transfer_reason, active, registered_by)
    VALUES
        (p_patient_id, p_new_client_id, 'primary', v_today,
         p_reason, 1, p_registered_by);

    COMMIT;

    SET p_result  = 1;
    SET p_message = 'Transferencia de propiedad exitosa.';
END$$

-- ============================================================
-- sp_open_medical_record
-- Abre una nueva historia clínica validando que no exista
-- una abierta para el mismo paciente/turno.
-- ============================================================
CREATE PROCEDURE sp_open_medical_record(
    IN  p_organization_id  INT,
    IN  p_branch_id        INT,
    IN  p_patient_id       INT,
    IN  p_client_id        INT,
    IN  p_vet_id           INT,
    IN  p_appointment_id   INT,
    IN  p_emergency_id     INT,
    IN  p_record_type      VARCHAR(30),
    IN  p_weight_kg        DECIMAL(8,3),
    OUT p_record_id        INT,
    OUT p_result           TINYINT(1),
    OUT p_message          VARCHAR(200)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;

    -- Verificar si ya existe HC abierta para este turno
    IF p_appointment_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_exists
        FROM medical_records
        WHERE appointment_id = p_appointment_id
          AND status NOT IN ('completed','signed','amended');
        IF v_exists > 0 THEN
            SET p_result  = 0;
            SET p_record_id = NULL;
            SET p_message = 'Ya existe una HC abierta para este turno.';
            LEAVE sp_open_medical_record;
        END IF;
    END IF;

    INSERT INTO medical_records
        (organization_id, branch_id, patient_id, client_id,
         veterinarian_id, appointment_id, emergency_id,
         record_date, record_time, record_type, weight_kg, status)
    VALUES
        (p_organization_id, p_branch_id, p_patient_id, p_client_id,
         p_vet_id, p_appointment_id, p_emergency_id,
         CURDATE(), CURTIME(), p_record_type, p_weight_kg, 'open');

    SET p_record_id = LAST_INSERT_ID();
    SET p_result    = 1;
    SET p_message   = 'Historia clínica abierta.';

    -- Actualizar estado del turno si corresponde
    IF p_appointment_id IS NOT NULL THEN
        UPDATE appointments
           SET status = 'in_progress', arrived_at = COALESCE(arrived_at, NOW())
        WHERE id = p_appointment_id AND status IN ('confirmed','arrived','pending');
    END IF;
END$$

-- ============================================================
-- sp_sign_medical_record
-- Firma la historia clínica. Valida que tenga anamnesis y
-- al menos un diagnóstico. Solo el veterinario asignado
-- o un supervisor puede firmar.
-- ============================================================
CREATE PROCEDURE sp_sign_medical_record(
    IN  p_record_id INT,
    IN  p_vet_id    INT,
    OUT p_result    TINYINT(1),
    OUT p_message   VARCHAR(200)
)
BEGIN
    DECLARE v_vet_assigned    INT;
    DECLARE v_status          VARCHAR(20);
    DECLARE v_has_anamnesis   INT DEFAULT 0;
    DECLARE v_has_diagnosis   INT DEFAULT 0;

    SELECT veterinarian_id, status INTO v_vet_assigned, v_status
    FROM medical_records WHERE id = p_record_id;

    -- Validar estado
    IF v_status IN ('signed','amended') THEN
        SET p_result = 0; SET p_message = 'HC ya se encuentra firmada.'; LEAVE sp_sign_medical_record;
    END IF;
    IF v_status = 'open' THEN
        SET p_result = 0; SET p_message = 'HC en estado abierto sin datos ingresados.'; LEAVE sp_sign_medical_record;
    END IF;

    -- Verificar que quien firma es el vet asignado (o tiene nivel >= supervisor)
    IF v_vet_assigned != p_vet_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = p_vet_id AND r.level <= 3 AND ur.active = 1
        ) THEN
            SET p_result = 0; SET p_message = 'Solo el veterinario asignado o un supervisor puede firmar.';
            LEAVE sp_sign_medical_record;
        END IF;
    END IF;

    -- Validar anamnesis
    SELECT COUNT(*) INTO v_has_anamnesis FROM anamnesis WHERE medical_record_id = p_record_id;
    IF v_has_anamnesis = 0 THEN
        SET p_result = 0; SET p_message = 'La HC debe tener anamnesis antes de firmar.'; LEAVE sp_sign_medical_record;
    END IF;

    -- Validar diagnóstico
    SELECT COUNT(*) INTO v_has_diagnosis FROM diagnoses WHERE medical_record_id = p_record_id;
    IF v_has_diagnosis = 0 THEN
        SET p_result = 0; SET p_message = 'La HC debe tener al menos un diagnóstico antes de firmar.'; LEAVE sp_sign_medical_record;
    END IF;

    -- Firmar
    UPDATE medical_records
       SET status    = 'signed',
           signed_at = NOW(),
           signed_by = p_vet_id
    WHERE id = p_record_id;

    -- Completar turno asociado
    UPDATE appointments a
    JOIN medical_records mr ON mr.appointment_id = a.id
       SET a.status       = 'completed',
           a.completed_at = NOW()
    WHERE mr.id = p_record_id AND a.status = 'in_progress';

    SET p_result = 1; SET p_message = 'Historia clínica firmada correctamente.';
END$$

-- ============================================================
-- sp_admit_hospitalization
-- Admite un paciente a internación, asignando sala y jaula.
-- Valida disponibilidad de la jaula.
-- ============================================================
CREATE PROCEDURE sp_admit_hospitalization(
    IN  p_medical_record_id INT,
    IN  p_branch_id         INT,
    IN  p_patient_id        INT,
    IN  p_client_id         INT,
    IN  p_admitting_vet_id  INT,
    IN  p_ward_id           SMALLINT,
    IN  p_kennel_id         SMALLINT,
    IN  p_reason            TEXT,
    IN  p_urgency           VARCHAR(20),
    IN  p_isolation         TINYINT(1),
    OUT p_hospitalization_id INT,
    OUT p_result            TINYINT(1),
    OUT p_message           VARCHAR(200)
)
BEGIN
    DECLARE v_kennel_occupied INT DEFAULT 0;

    -- Verificar jaula disponible
    IF p_kennel_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_kennel_occupied
        FROM hospitalizations
        WHERE kennel_id = p_kennel_id AND status = 'active';

        IF v_kennel_occupied > 0 THEN
            SET p_result = 0;
            SET p_hospitalization_id = NULL;
            SET p_message = 'La jaula/box seleccionado está ocupado.';
            LEAVE sp_admit_hospitalization;
        END IF;
    END IF;

    INSERT INTO hospitalizations
        (medical_record_id, branch_id, patient_id, client_id,
         admitting_vet_id, attending_vet_id, ward_id, kennel_id,
         admission_at, admission_reason, urgency, isolation_required, status)
    VALUES
        (p_medical_record_id, p_branch_id, p_patient_id, p_client_id,
         p_admitting_vet_id, p_admitting_vet_id, p_ward_id, p_kennel_id,
         NOW(), p_reason, p_urgency, p_isolation, 'active');

    SET p_hospitalization_id = LAST_INSERT_ID();
    SET p_result  = 1;
    SET p_message = CONCAT('Paciente admitido. ID internación: ', p_hospitalization_id);
END$$

-- ============================================================
-- sp_discharge_patient
-- Da de alta a un paciente internado.
-- ============================================================
CREATE PROCEDURE sp_discharge_patient(
    IN  p_hospitalization_id INT,
    IN  p_discharge_vet_id   INT,
    IN  p_condition          VARCHAR(30),
    IN  p_instructions       TEXT,
    IN  p_follow_up_date     DATE,
    OUT p_result             TINYINT(1),
    OUT p_message            VARCHAR(200)
)
BEGIN
    DECLARE v_status VARCHAR(20);
    DECLARE v_patient_id INT;

    SELECT status, patient_id INTO v_status, v_patient_id
    FROM hospitalizations WHERE id = p_hospitalization_id;

    IF v_status != 'active' THEN
        SET p_result  = 0;
        SET p_message = 'La internación no está activa.';
        LEAVE sp_discharge_patient;
    END IF;

    UPDATE hospitalizations
       SET status                = 'discharged',
           discharge_at          = NOW(),
           discharge_vet_id      = p_discharge_vet_id,
           discharge_condition   = p_condition,
           discharge_instructions = p_instructions,
           follow_up_date        = p_follow_up_date
    WHERE id = p_hospitalization_id;

    -- Desactivar medicamentos activos
    UPDATE hospitalization_medications
       SET active   = 0,
           end_at   = NOW()
    WHERE hospitalization_id = p_hospitalization_id AND active = 1;

    SET p_result  = 1;
    SET p_message = 'Alta médica registrada correctamente.';
END$$

-- ============================================================
-- sp_generate_invoice
-- Genera una factura con número correlativo por organización.
-- ============================================================
CREATE PROCEDURE sp_generate_invoice(
    IN  p_organization_id INT,
    IN  p_branch_id       INT,
    IN  p_client_id       INT,
    IN  p_patient_id      INT,
    IN  p_medical_rec_id  INT,
    IN  p_currency        CHAR(3),
    IN  p_created_by      INT,
    OUT p_invoice_id      INT,
    OUT p_invoice_number  VARCHAR(60),
    OUT p_result          TINYINT(1)
)
BEGIN
    DECLARE v_last_num INT;
    DECLARE v_prefix   VARCHAR(10);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; SET p_result = 0; END;

    SET v_prefix = CONCAT('FAC-', YEAR(CURDATE()), '-');

    -- Correlativo de la organización en el año
    SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)), 0) + 1
      INTO v_last_num
    FROM invoices
    WHERE organization_id = p_organization_id
      AND invoice_number LIKE CONCAT(v_prefix, '%');

    SET p_invoice_number = CONCAT(v_prefix, LPAD(v_last_num, 6, '0'));

    START TRANSACTION;

    INSERT INTO invoices
        (organization_id, branch_id, invoice_number, client_id,
         patient_id, medical_record_id, invoice_date,
         currency, status, payment_status, created_by)
    VALUES
        (p_organization_id, p_branch_id, p_invoice_number, p_client_id,
         p_patient_id, p_medical_rec_id, CURDATE(),
         p_currency, 'draft', 'unpaid', p_created_by);

    SET p_invoice_id = LAST_INSERT_ID();

    COMMIT;
    SET p_result = 1;
END$$

-- ============================================================
-- sp_record_payment
-- Registra un pago y actualiza el estado de la factura.
-- ============================================================
CREATE PROCEDURE sp_record_payment(
    IN  p_invoice_id     INT,
    IN  p_amount         DECIMAL(12,2),
    IN  p_method         VARCHAR(30),
    IN  p_reference      VARCHAR(100),
    IN  p_received_by    INT,
    OUT p_result         TINYINT(1),
    OUT p_message        VARCHAR(200)
)
BEGIN
    DECLARE v_total        DECIMAL(12,2);
    DECLARE v_paid_so_far  DECIMAL(12,2);
    DECLARE v_status       VARCHAR(30);
    DECLARE v_new_status   VARCHAR(30);

    SELECT total, status INTO v_total, v_status
    FROM invoices WHERE id = p_invoice_id;

    IF v_status IN ('cancelled','refunded') THEN
        SET p_result = 0; SET p_message = 'No se puede cobrar una factura cancelada o reembolsada.';
        LEAVE sp_record_payment;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid_so_far
    FROM payments WHERE invoice_id = p_invoice_id;

    IF (v_paid_so_far + p_amount) > v_total THEN
        SET p_result = 0;
        SET p_message = CONCAT('Monto excede el total. Pendiente: ', FORMAT(v_total - v_paid_so_far, 2));
        LEAVE sp_record_payment;
    END IF;

    INSERT INTO payments
        (invoice_id, payment_date, amount, payment_method, reference_number, received_by)
    VALUES
        (p_invoice_id, CURDATE(), p_amount, p_method, p_reference, p_received_by);

    -- Actualizar estado
    IF (v_paid_so_far + p_amount) >= v_total THEN
        SET v_new_status = 'paid';
        UPDATE invoices SET status = 'paid', payment_status = 'paid' WHERE id = p_invoice_id;
    ELSE
        SET v_new_status = 'partially_paid';
        UPDATE invoices SET status = 'partially_paid', payment_status = 'partial' WHERE id = p_invoice_id;
    END IF;

    SET p_result  = 1;
    SET p_message = CONCAT('Pago registrado. Estado: ', v_new_status);
END$$

-- ============================================================
-- sp_get_patient_timeline
-- Devuelve la línea de tiempo clínica de un paciente
-- (consultas, vacunas, cirugías, internaciones) ordenada.
-- ============================================================
CREATE PROCEDURE sp_get_patient_timeline(IN p_patient_id INT)
BEGIN
    -- Historia Clínica
    SELECT 'consulta' AS event_type,
           mr.record_date AS event_date, mr.record_time AS event_time,
           mr.record_type AS subtype,
           CONCAT(u.first_name,' ',u.last_name) AS performed_by,
           COALESCE(
               (SELECT GROUP_CONCAT(d.description SEPARATOR ' / ')
                FROM diagnoses d WHERE d.medical_record_id = mr.id LIMIT 1),
               mr.status
           ) AS description,
           mr.id AS reference_id, br.name AS branch
    FROM medical_records mr
    JOIN users u ON u.id = mr.veterinarian_id
    JOIN branches br ON br.id = mr.branch_id
    WHERE mr.patient_id = p_patient_id

    UNION ALL

    -- Vacunaciones
    SELECT 'vacunacion', v.vaccination_date, NULL,
           vc.vaccine_type, CONCAT(u.first_name,' ',u.last_name),
           CONCAT(vc.name, ' Lote:', v.lot_number,
                  IF(v.adverse_reaction,' ⚠ Reacción adversa','')),
           v.id, br.name
    FROM vaccinations v
    JOIN vaccines vc ON vc.id = v.vaccine_id
    JOIN users u    ON u.id   = v.administering_vet_id
    JOIN branches br ON br.id = v.branch_id
    WHERE v.patient_id = p_patient_id

    UNION ALL

    -- Cirugías
    SELECT 'cirugia', DATE(s.surgery_start), TIME(s.surgery_start),
           s.urgency, CONCAT(u.first_name,' ',u.last_name),
           CONCAT(st.name, ' — ', COALESCE(s.outcome,'En proceso')),
           s.id, br.name
    FROM surgeries s
    JOIN surgery_types st ON st.id = s.surgery_type_id
    JOIN users u          ON u.id  = s.lead_surgeon_id
    JOIN branches br      ON br.id = s.branch_id
    WHERE s.patient_id = p_patient_id AND s.surgery_start IS NOT NULL

    UNION ALL

    -- Internaciones
    SELECT 'internacion', DATE(h.admission_at), TIME(h.admission_at),
           h.urgency, CONCAT(u.first_name,' ',u.last_name),
           CONCAT('Ingreso: ', h.admission_reason,
                  IF(h.discharge_at IS NOT NULL,
                     CONCAT(' | Alta: ', h.discharge_condition), ' | Activo')),
           h.id, br.name
    FROM hospitalizations h
    JOIN users u     ON u.id   = h.admitting_vet_id
    JOIN branches br ON br.id  = h.branch_id
    WHERE h.patient_id = p_patient_id

    ORDER BY event_date DESC, event_time DESC;
END$$

-- ============================================================
-- sp_generate_reminders
-- Genera recordatorios automáticos para vacunas y
-- desparasitaciones próximas a vencer (ejecutar via cron).
-- ============================================================
CREATE PROCEDURE sp_generate_reminders(IN p_days_ahead INT)
BEGIN
    DECLARE v_cutoff DATE;
    SET v_cutoff = DATE_ADD(CURDATE(), INTERVAL p_days_ahead DAY);

    -- Recordatorios de vacunación
    INSERT INTO reminders
        (organization_id, patient_id, client_id, reminder_type,
         due_date, message, channel, status)
    SELECT DISTINCT
        p.organization_id,
        v.patient_id,
        po.client_id,
        'vaccination',
        v.next_dose_due,
        CONCAT('Recordatorio: ', vc.name, ' de ',
               p.name, ' vence el ', DATE_FORMAT(v.next_dose_due,'%d/%m/%Y')),
        COALESCE(c.communication_preference, 'whatsapp'),
        'pending'
    FROM vaccinations v
    JOIN patients p     ON p.id  = v.patient_id
    JOIN vaccines vc    ON vc.id = v.vaccine_id
    JOIN patient_owners po ON po.patient_id = p.id
                          AND po.ownership_type = 'primary'
                          AND po.active = 1 AND po.end_date IS NULL
    JOIN clients c      ON c.id = po.client_id
    WHERE v.next_dose_due BETWEEN CURDATE() AND v_cutoff
      AND v.status = 'administered'
      AND p.active = 1 AND p.is_deceased = 0
      AND NOT EXISTS (
          SELECT 1 FROM reminders r
          WHERE r.patient_id      = v.patient_id
            AND r.reminder_type   = 'vaccination'
            AND r.due_date        = v.next_dose_due
            AND r.status NOT IN ('cancelled')
      );

    -- Recordatorios de desparasitación
    INSERT INTO reminders
        (organization_id, patient_id, client_id, reminder_type,
         due_date, message, channel, status)
    SELECT DISTINCT
        p.organization_id,
        d.patient_id,
        po.client_id,
        'deworming',
        d.next_due_date,
        CONCAT('Recordatorio: desparasitación de ',
               p.name, ' vence el ', DATE_FORMAT(d.next_due_date,'%d/%m/%Y')),
        COALESCE(c.communication_preference, 'whatsapp'),
        'pending'
    FROM deworming_records d
    JOIN patients p     ON p.id  = d.patient_id
    JOIN patient_owners po ON po.patient_id = p.id
                          AND po.ownership_type = 'primary'
                          AND po.active = 1 AND po.end_date IS NULL
    JOIN clients c      ON c.id = po.client_id
    WHERE d.next_due_date BETWEEN CURDATE() AND v_cutoff
      AND p.active = 1 AND p.is_deceased = 0
      AND NOT EXISTS (
          SELECT 1 FROM reminders r
          WHERE r.patient_id    = d.patient_id
            AND r.reminder_type = 'deworming'
            AND r.due_date      = d.next_due_date
            AND r.status NOT IN ('cancelled')
      );
END$$

-- ============================================================
-- sp_branch_stats
-- Estadísticas de una sucursal para un rango de fechas.
-- ============================================================
CREATE PROCEDURE sp_branch_stats(
    IN p_branch_id   INT,
    IN p_date_from   DATE,
    IN p_date_to     DATE
)
BEGIN
    SELECT
        COUNT(DISTINCT a.id)  AS total_appointments,
        SUM(a.status = 'completed') AS completed,
        SUM(a.status = 'no_show')   AS no_shows,
        SUM(a.status = 'cancelled') AS cancelled,
        ROUND(SUM(a.status = 'completed') / NULLIF(COUNT(DISTINCT a.id),0) * 100, 1) AS completion_pct,
        -- Emergencias
        (SELECT COUNT(*) FROM emergency_triage et
         WHERE et.branch_id = p_branch_id
           AND DATE(et.arrival_datetime) BETWEEN p_date_from AND p_date_to) AS emergencies,
        -- Laboratorio
        (SELECT COUNT(*) FROM lab_orders lo
         WHERE lo.branch_id = p_branch_id
           AND DATE(lo.order_datetime) BETWEEN p_date_from AND p_date_to) AS lab_orders,
        -- Cirugías
        (SELECT COUNT(*) FROM surgeries s
         WHERE s.branch_id = p_branch_id
           AND DATE(s.scheduled_at) BETWEEN p_date_from AND p_date_to
           AND s.status = 'completed') AS surgeries,
        -- Facturación
        (SELECT COALESCE(SUM(inv.total),0) FROM invoices inv
         WHERE inv.branch_id = p_branch_id
           AND inv.invoice_date BETWEEN p_date_from AND p_date_to
           AND inv.status != 'cancelled') AS total_revenue,
        (SELECT COALESCE(SUM(pay.amount),0) FROM payments pay
         JOIN invoices inv2 ON inv2.id = pay.invoice_id
         WHERE inv2.branch_id = p_branch_id
           AND pay.payment_date BETWEEN p_date_from AND p_date_to) AS total_collected,
        -- Nuevos pacientes
        (SELECT COUNT(*) FROM medical_records mr
         WHERE mr.branch_id = p_branch_id
           AND mr.record_date BETWEEN p_date_from AND p_date_to) AS medical_records_created,
        -- Nuevos clientes
        (SELECT COUNT(*) FROM clients c
         WHERE c.organization_id = (SELECT organization_id FROM branches WHERE id = p_branch_id)
           AND DATE(c.created_at) BETWEEN p_date_from AND p_date_to) AS new_clients
    FROM appointments a
    WHERE a.branch_id    = p_branch_id
      AND a.scheduled_date BETWEEN p_date_from AND p_date_to;
END$$

DELIMITER ;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 8/8: DATOS DE DEMO / PRUEBA
-- Organización: "VetGroup Latinoamérica"
-- 2 países, 3 sucursales, múltiples roles, pacientes, HC
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- ESTADOS (Argentina y Colombia para demo)
-- ============================================================
INSERT INTO states (country_id, name, code) VALUES
-- Argentina (id=1)
(1, 'Buenos Aires',      'BA'),
(1, 'Córdoba',           'CB'),
(1, 'Santa Fe',          'SF'),
(1, 'Mendoza',           'MZ'),
-- Colombia (id=5)
(5, 'Cundinamarca',      'CUN'),
(5, 'Antioquia',         'ANT'),
(5, 'Valle del Cauca',   'VAC');

INSERT INTO cities (state_id, name) VALUES
(1, 'Buenos Aires'),   -- id=1
(1, 'La Plata'),       -- id=2
(2, 'Córdoba'),        -- id=3
(3, 'Rosario'),        -- id=4
(5, 'Bogotá'),         -- id=5
(6, 'Medellín'),       -- id=6
(7, 'Cali');           -- id=7

-- ============================================================
-- ORGANIZACIÓN
-- ============================================================
INSERT INTO organizations
    (plan_id, country_id, name, legal_name, tax_id, tax_id_type,
     email, phone, address,
     subscription_status, subscription_starts_at, subscription_ends_at,
     default_currency, default_language, default_timezone,
     force_2fa, session_timeout_min, max_login_attempts)
VALUES
    (4, 1, 'VetGroup Latinoamérica', 'VetGroup SA', '30-12345678-9', 'CUIT',
     'admin@vetgroup.lat', '+54-11-4000-0000', 'Av. Corrientes 1234, Buenos Aires',
     'active', '2025-01-01', '2026-12-31',
     'USD', 'es_LA', 'America/Argentina/Buenos_Aires',
     0, 480, 5);
-- organization_id = 1

-- ============================================================
-- SUCURSALES
-- ============================================================
INSERT INTO branches
    (organization_id, name, branch_code, city_id, address,
     phone, whatsapp, email, timezone, is_main_branch, active,
     working_hours)
VALUES
    (1, 'Sede Central Buenos Aires', 'BA-001', 1,
     'Av. Santa Fe 2500, CABA',
     '+54-11-4800-1000', '+54-9-11-4800-1000', 'bsas@vetgroup.lat',
     'America/Argentina/Buenos_Aires', 1, 1,
     '{"monday":{"open":"08:00","close":"20:00","active":true},"tuesday":{"open":"08:00","close":"20:00","active":true},"wednesday":{"open":"08:00","close":"20:00","active":true},"thursday":{"open":"08:00","close":"20:00","active":true},"friday":{"open":"08:00","close":"20:00","active":true},"saturday":{"open":"09:00","close":"14:00","active":true},"sunday":{"active":false}}'),

    (1, 'Sede Córdoba', 'CBA-001', 3,
     'Av. Colón 450, Córdoba',
     '+54-351-450-0000', '+54-9-351-450-0000', 'cordoba@vetgroup.lat',
     'America/Argentina/Cordoba', 0, 1,
     '{"monday":{"open":"09:00","close":"19:00","active":true},"tuesday":{"open":"09:00","close":"19:00","active":true},"wednesday":{"open":"09:00","close":"19:00","active":true},"thursday":{"open":"09:00","close":"19:00","active":true},"friday":{"open":"09:00","close":"19:00","active":true},"saturday":{"open":"09:00","close":"13:00","active":true},"sunday":{"active":false}}'),

    (1, 'Sede Bogotá', 'BOG-001', 5,
     'Calle 100 # 15-40, Bogotá',
     '+57-1-600-0000', '+57-300-600-0000', 'bogota@vetgroup.lat',
     'America/Bogota', 0, 1,
     '{"monday":{"open":"08:00","close":"18:00","active":true},"tuesday":{"open":"08:00","close":"18:00","active":true},"wednesday":{"open":"08:00","close":"18:00","active":true},"thursday":{"open":"08:00","close":"18:00","active":true},"friday":{"open":"08:00","close":"18:00","active":true},"saturday":{"open":"09:00","close":"13:00","active":true},"sunday":{"active":false}}');
-- branch_ids: 1=CABA, 2=Córdoba, 3=Bogotá

-- ============================================================
-- USUARIOS (contraseña demo = hash de "Demo1234!")
-- ============================================================
INSERT INTO users
    (organization_id, username, email, password_hash,
     first_name, last_name, phone, national_id, gender,
     license_number, license_issuer, specializations, active)
VALUES
-- Administrador
(1,'admin.vetgroup',  'admin@vetgroup.lat',
 '$2b$12$xyzDemoHashAdmin000000000000000000000000000000000000000',
 'Carlos','Rodríguez','+54-11-1000-0001','20-11111111-1','M',
 NULL, NULL, NULL, 1),

-- Veterinario CABA - generalista
(1,'dra.gonzalez',    'laura.gonzalez@vetgroup.lat',
 '$2b$12$xyzDemoHashVet01000000000000000000000000000000000000000',
 'Laura','González','+54-11-2000-0001','27-22222222-2','F',
 'MP-12345','SENASA Argentina','["medicina_general","cirugia_blanda"]', 1),

-- Veterinario CABA - cirujano
(1,'dr.martinez',     'pablo.martinez@vetgroup.lat',
 '$2b$12$xyzDemoHashVet02000000000000000000000000000000000000000',
 'Pablo','Martínez','+54-11-2000-0002','20-33333333-3','M',
 'MP-67890','SENASA Argentina','["cirugia","ortopedia","anestesia"]', 1),

-- Veterinario Córdoba
(1,'dra.lopez',       'ana.lopez@vetgroup.lat',
 '$2b$12$xyzDemoHashVet03000000000000000000000000000000000000000',
 'Ana','López','+54-351-3000-001','27-44444444-4','F',
 'MP-11111','COLEGIO VET CBA','["medicina_general","dermatologia"]', 1),

-- Técnico veterinario CABA
(1,'tecnico.perez',   'martin.perez@vetgroup.lat',
 '$2b$12$xyzDemoHashTec01000000000000000000000000000000000000000',
 'Martín','Pérez','+54-11-4000-0001','20-55555555-5','M',
 NULL, NULL, NULL, 1),

-- Recepcionista CABA
(1,'recep.garcia',    'sofia.garcia@vetgroup.lat',
 '$2b$12$xyzDemoHashRec01000000000000000000000000000000000000000',
 'Sofía','García','+54-11-4000-0002','27-66666666-6','F',
 NULL, NULL, NULL, 1),

-- Veterinario Bogotá
(1,'dr.ramirez',      'jorge.ramirez@vetgroup.lat',
 '$2b$12$xyzDemoHashVet04000000000000000000000000000000000000000',
 'Jorge','Ramírez','+57-300-7000-001','79777777','M',
 'MV-99001','ICA Colombia','["medicina_general","exoticos"]', 1);
-- user_ids: 1=admin, 2=dra.gonzalez, 3=dr.martinez, 4=dra.lopez, 5=tecnico, 6=recep, 7=dr.ramirez

-- ============================================================
-- ASIGNACIÓN DE ROLES
-- ============================================================
INSERT INTO user_roles (user_id, role_id, organization_id, branch_id, assigned_by) VALUES
(1, 2, 1, NULL, 1),   -- admin = org_admin en toda la org
(2, 4, 1, 1,    1),   -- dra.gonzalez = veterinarian en CABA
(3, 5, 1, 1,    1),   -- dr.martinez  = vet_specialist en CABA
(4, 4, 1, 2,    1),   -- dra.lopez    = veterinarian en Córdoba
(5, 7, 1, 1,    1),   -- tecnico      = vet_technician en CABA
(6,12, 1, 1,    1),   -- recep        = receptionist en CABA
(7, 4, 1, 3,    1);   -- dr.ramirez   = veterinarian en Bogotá

-- ============================================================
-- CLIENTES / PROPIETARIOS
-- ============================================================
INSERT INTO clients
    (organization_id, client_code, first_name, last_name,
     national_id_type, national_id, date_of_birth, gender,
     email, phone_primary, whatsapp,
     country_id, city_id, address_line1,
     communication_preference, receive_reminders, is_vip)
VALUES
(1,'CLI-000001','María','Sánchez','DNI','28.500.001','1985-03-15','F',
 'maria.sanchez@email.com','+54-11-5001-0001','+54-9-11-5001-0001',
 1,1,'Av. Rivadavia 3000 Piso 2, CABA','whatsapp',1,0),

(1,'CLI-000002','Roberto','Fernández','DNI','22.600.002','1978-07-22','M',
 'roberto.fd@email.com','+54-11-5002-0002','+54-9-11-5002-0002',
 1,1,'Corrientes 4500 6B, CABA','email',1,0),

(1,'CLI-000003','Valentina','Torres','DNI','35.700.003','1993-11-30','F',
 'valen.torres@email.com','+54-11-5003-0003','+54-9-11-5003-0003',
 1,1,'Thames 1200, Palermo, CABA','whatsapp',1,1),

(1,'CLI-000004','Diego','Morales','DNI','30.800.004','1980-05-18','M',
 'diego.morales@email.com','+54-351-6004-004','+54-9-351-6004-004',
 1,3,'San Juan 250, Córdoba','sms',1,0),

(1,'CLI-000005','Gabriela','Ríos','CC','52900005','1990-08-25','F',
 'gaby.rios@email.com','+57-310-5005-005','+57-310-5005-005',
 5,5,'Calle 72 # 10-25, Bogotá','whatsapp',1,0),

(1,'CLI-000006','Andrés','Castillo','DNI','26.100.006','1975-02-10','M',
 'andres.castillo@email.com','+54-11-5006-0006','+54-9-11-5006-0006',
 1,1,'Scalabrini Ortiz 1800, Villa Crespo, CABA','call',0,0);
-- client_ids: 1=María, 2=Roberto, 3=Valentina, 4=Diego, 5=Gabriela, 6=Andrés

-- ============================================================
-- PACIENTES / ANIMALES
-- ============================================================
-- species: 1=Perro, 2=Gato, 8=Conejo, 12=Tortuga, 3=Caballo
INSERT INTO patients
    (organization_id, patient_code, name, species_id, breed_id,
     color_description, gender, neutered, date_of_birth, weight_kg,
     microchip_number, photo_url, active)
VALUES
(1,'PAC-000001','Max',      1, NULL,'Negro con manchas blancas','M',1,'2018-04-10',28.5,'985112345001111',NULL,1),
(1,'PAC-000002','Luna',     2, NULL,'Gris atigrada',            'F',1,'2020-09-05', 4.2,'985112345002222',NULL,1),
(1,'PAC-000003','Toby',     1, NULL,'Dorado','M',0,'2021-01-20',  8.1,'985112345003333',NULL,1),
(1,'PAC-000004','Mia',      2, NULL,'Blanca','F',1,'2019-06-14',  3.8,'985112345004444',NULL,1),
(1,'PAC-000005','Rocky',    1, NULL,'Marrón oscuro','M',0,'2017-11-30',35.0,'985112345005555',NULL,1),
(1,'PAC-000006','Kira',     1, NULL,'Tostada','F',1,'2022-03-08',  6.5,'985112345006666',NULL,1),
(1,'PAC-000007','Buba',     8, NULL,'Blanco','M',0,'2023-02-14',   1.8, NULL,NULL,1),
(1,'PAC-000008','Simba',    2, NULL,'Naranja','M',1,'2016-07-19',  5.1,'985112345008888',NULL,1),
(1,'PAC-000009','Nina',     1, NULL,'Beige y blanca','F',1,'2020-05-25',22.0,'985112345009999',NULL,1),
(1,'PAC-000010','Thor',     1, NULL,'Negro','M',0,'2023-08-01',    12.3,'985112345010000',NULL,1);
-- patient_ids: 1=Max(perro), 2=Luna(gato), 3=Toby(perro), 4=Mia(gato),
--              5=Rocky(perro), 6=Kira(perro), 7=Buba(conejo),
--              8=Simba(gato), 9=Nina(perro), 10=Thor(perro)

-- ============================================================
-- RELACIONES PROPIETARIO ↔ MASCOTA
-- ============================================================
INSERT INTO patient_owners
    (patient_id, client_id, ownership_type, start_date, active, registered_by)
VALUES
(1,  1, 'primary',   '2018-04-15', 1, 6),  -- Max       → María Sánchez
(2,  1, 'primary',   '2020-09-10', 1, 6),  -- Luna       → María Sánchez (2 mascotas)
(3,  2, 'primary',   '2021-01-25', 1, 6),  -- Toby       → Roberto Fernández
(4,  3, 'primary',   '2019-06-20', 1, 6),  -- Mia        → Valentina Torres
(5,  3, 'primary',   '2017-12-05', 1, 6),  -- Rocky      → Valentina Torres
(6,  4, 'primary',   '2022-03-15', 1, 6),  -- Kira       → Diego Morales (Córdoba)
(7,  4, 'primary',   '2023-02-20', 1, 6),  -- Buba       → Diego Morales
(8,  5, 'primary',   '2016-07-25', 1, 6),  -- Simba      → Gabriela Ríos (Bogotá)
(9,  6, 'primary',   '2020-06-01', 1, 6),  -- Nina       → Andrés Castillo
(10, 2, 'primary',   '2023-08-10', 1, 6),  -- Thor       → Roberto Fernández (2 mascotas)
-- Copropietario: Rocky también tiene dueño secundario
(5,  6, 'secondary', '2020-01-01', 1, 6);  -- Rocky → también Andrés Castillo

-- ============================================================
-- ALERGIAS Y CONDICIONES CRÓNICAS
-- ============================================================
INSERT INTO patient_allergies
    (patient_id, allergen_type, allergen_name, reaction_description, severity, confirmed_date, confirmed_by, active)
VALUES
(1,'medication','Amoxicilina','Urticaria generalizada tras 2da dosis','moderate','2020-03-10',2,1),
(5,'food','Pollo','Dermatitis crónica, prurito','mild','2019-05-15',2,1),
(8,'vaccine','Vacuna triple felina','Vómitos y letargia 24h post-vacuna','mild','2021-02-20',7,1);

INSERT INTO patient_chronic_conditions
    (patient_id, condition_name, icd_code, diagnosis_date, diagnosed_by, current_status)
VALUES
(1,'Displasia de cadera bilateral',  NULL, '2021-06-15', 2, 'controlled'),
(5,'Hipotiroidismo',                 NULL, '2019-08-20', 2, 'controlled'),
(8,'Enfermedad renal crónica grado II', NULL,'2022-11-10',7, 'active'),
(2,'Asma bronquial felina',          NULL, '2021-04-05', 2, 'controlled');

-- ============================================================
-- TURNOS (algunos de hoy, algunos pasados)
-- ============================================================
INSERT INTO appointments
    (organization_id, branch_id, patient_id, client_id,
     veterinarian_id, appointment_type_id, scheduled_date, scheduled_time,
     duration_minutes, status, priority, chief_complaint, booked_by, booking_channel)
VALUES
-- Turno completado (ayer)
(1,1,1,1, 2,1, DATE_SUB(CURDATE(),INTERVAL 1 DAY),'10:00',30,'completed','normal',
 'Control anual + vacunación anual',6,'in_person'),

-- Turno de hoy - pendiente
(1,1,3,2, 2,1, CURDATE(),'09:00',30,'confirmed','normal',
 'Vómitos desde hace 2 días',6,'whatsapp'),

-- Turno de hoy - urgencia
(1,1,5,3, 2,2, CURDATE(),'09:30',20,'arrived','urgent',
 'Cojera miembro posterior derecho - 3 días evolución',6,'phone'),

-- Turno de hoy
(1,1,9,6, 2,1, CURDATE(),'10:00',30,'pending','normal',
 'Primer consulta - castración programada',6,'web'),

-- Turno de hoy - cirugía
(1,1,4,3, 3,6, CURDATE(),'11:00',90,'confirmed','normal',
 'OVH electiva',6,'in_person'),

-- Turno Córdoba - hoy
(1,2,6,4, 4,3, CURDATE(),'09:00',20,'completed','normal',
 'Control post-operatorio',6,'whatsapp'),

-- Turno futuro
(1,1,2,1, 2,4, DATE_ADD(CURDATE(),INTERVAL 3 DAY),'16:00',15,'pending','normal',
 'Vacuna triple felina anual',6,'app'),

-- Turno Bogotá
(1,3,8,5, 7,1, CURDATE(),'10:00',30,'confirmed','normal',
 'Control ERC - análisis de rutina',6,'whatsapp');

-- ============================================================
-- HISTORIA CLÍNICA - Max (Turno de ayer - ya firmada)
-- ============================================================
INSERT INTO medical_records
    (organization_id, branch_id, patient_id, client_id, veterinarian_id,
     appointment_id, record_date, record_time, record_type, weight_kg,
     bcs, status, signed_at, signed_by)
VALUES
(1,1,1,1,2, 1, DATE_SUB(CURDATE(),INTERVAL 1 DAY),'10:05',
 'routine', 28.5, 5, 'signed',
 DATE_SUB(NOW(),INTERVAL 23 HOUR), 2);
-- medical_record_id = 1

INSERT INTO anamnesis (medical_record_id, chief_complaint,
    symptom_onset, symptom_description,
    vaccination_status, last_vaccination_date,
    deworming_status, last_deworming_date, last_deworming_product,
    diet_type, diet_brand, diet_frequency,
    housing_type, reproductive_status,
    activity_level, owner_concerns)
VALUES
(1, 'Control anual de rutina. Sin quejas actuales.',
 NULL, 'Paciente asintomático, propietaria refiere buen apetito y actividad normal.',
 'up_to_date', DATE_SUB(CURDATE(),INTERVAL 13 MONTH),
 'up_to_date', DATE_SUB(CURDATE(),INTERVAL 3 MONTH), 'Milbemax',
 'commercial_dry', 'Royal Canin Medium Adult', '2 veces al día',
 'indoor', 'neutered',
 'normal', 'La propietaria pregunta sobre suplemento articular por displasia.');

INSERT INTO physical_examinations (medical_record_id,
    temperature_c, temp_route, heart_rate, respiratory_rate,
    pulse_quality, spo2_percent,
    general_condition, bcs, mcs,
    hydration_status,
    mucous_color, mucous_texture, crt_seconds,
    lymph_nodes,
    gait, gait_notes,
    pain_score,
    abnormalities_found, assessment_notes)
VALUES
(1,
 38.4,'rectal',88,18,
 'strong',98.5,
 'good',5,3,
 'normal',
 'pink','moist',1.5,
 'normal',
 'lame','Leve cojera miembro posterior derecho en frío, desaparece con movimiento.',
 2,
 'Leve cojera en MPD en frío, posiblemente relacionada a displasia de cadera conocida.',
 'Paciente en buenas condiciones generales. Displasia de cadera bilateral controlada.');

INSERT INTO diagnoses (medical_record_id, diagnosis_type, diagnosis_order,
    description, body_system, severity, prognosis, notes, created_by)
VALUES
(1,'definitive',1,'Displasia de cadera bilateral - controlada','musculoskeletal','mild','good',
 'Continúa con tratamiento con suplemento articular. Sin deterioro respecto a última consulta.',2),
(1,'definitive',2,'Paciente sano - control anual sin hallazgos relevantes',NULL,NULL,'excellent',NULL,2);

-- ============================================================
-- VACUNACIÓN de Max (en esa misma consulta)
-- ============================================================
-- Primero insertamos fabricante y vacuna demo si no existen
INSERT INTO vaccine_manufacturers (name, country_of_origin) VALUES
('Zoetis', 'Estados Unidos'),
('MSD Animal Health', 'Países Bajos'),
('Boehringer Ingelheim', 'Alemania');

INSERT INTO vaccines
    (organization_id, name, commercial_name, manufacturer_id, vaccine_type,
     disease_prevention, applicable_species,
     formulation, route, booster_interval_months, active)
VALUES
(1,'Séxtuple Canina','Nobivac DHPPi+L4',1,'core',
 '["distemper","hepatitis","parvovirus","parainfluenza","leptospirosis"]',
 '[1]','inactivated','SC',12,1),
(1,'Antirrábica Canina','Nobivac Rabies',1,'core',
 '["rabia"]','[1]','inactivated','SC',12,1),
(1,'Triple Felina','Feligen CRP',2,'core',
 '["rinotraqueitis","calicivirus","panleucopenia"]',
 '[2]','live_attenuated','SC',12,1),
(1,'Antirrábica Felina','Nobivac Feline Rabies',1,'core',
 '["rabia"]','[2]','inactivated','SC',12,1);
-- vaccine_ids: 1=Séxtuple, 2=Rabia canina, 3=Triple felina, 4=Rabia felina

INSERT INTO vaccinations
    (medical_record_id, patient_id, branch_id, vaccine_id,
     administering_vet_id, vaccination_date, dose_number,
     dose_ml, route, injection_site,
     lot_number, expiry_date, manufacturer_id,
     next_dose_due, next_dose_type, status)
VALUES
(1, 1, 1, 1, 2, DATE_SUB(CURDATE(),INTERVAL 1 DAY),
 1, 1.0, 'SC', 'Región escapular izquierda',
 'ZOE-2025-AAA','2026-06-30',1,
 DATE_ADD(CURDATE(),INTERVAL 11 MONTH),'booster','administered'),
(1, 1, 1, 2, 2, DATE_SUB(CURDATE(),INTERVAL 1 DAY),
 1, 1.0, 'SC', 'Región escapular derecha',
 'ZOE-2025-RAB','2026-06-30',1,
 DATE_ADD(CURDATE(),INTERVAL 11 MONTH),'booster','administered');

-- ============================================================
-- DESPARASITACIÓN de Max
-- ============================================================
INSERT INTO antiparasitic_products
    (organization_id, name, active_ingredient, product_type,
     target_parasites, formulation, applicable_species,
     recommended_interval_weeks, active)
VALUES
(1,'Milbemax Perro Grande','Milbemicina + Praziquantel','internal',
 '["roundworm","tapeworm","heartworm_prevention"]',
 'tablet','[1]',12,1),
(1,'Nexgard Spectra','Afoxolaner + Milbemicina','both',
 '["flea","tick","roundworm","heartworm_prevention"]',
 'tablet','[1]',4,1),
(1,'Bravecto Gato','Fluralaner','external',
 '["flea","tick"]','spot_on','[2]',12,1);

INSERT INTO deworming_records
    (medical_record_id, patient_id, branch_id, product_id,
     administered_by, administration_date, dose,
     weight_kg, route, lot_number, next_due_date)
VALUES
(1, 1, 1, 1, 2, DATE_SUB(CURDATE(),INTERVAL 1 DAY),
 '2 comprimidos', 28.5, 'oral', 'MIL-2025-001',
 DATE_ADD(CURDATE(),INTERVAL 12 WEEK));

-- ============================================================
-- HISTORIA CLÍNICA - Toby (turno de hoy - en progreso)
-- ============================================================
INSERT INTO medical_records
    (organization_id, branch_id, patient_id, client_id, veterinarian_id,
     appointment_id, record_date, record_time, record_type, weight_kg, bcs, status)
VALUES
(1,1,3,2,2, 2, CURDATE(), CURTIME(),'routine',8.1,4,'in_progress');
-- medical_record_id = 2

INSERT INTO anamnesis (medical_record_id, chief_complaint,
    symptom_onset, symptom_duration, symptom_progression,
    symptom_description, systems_affected,
    vaccination_status, deworming_status,
    diet_type, diet_brand,
    housing_type, water_intake,
    activity_level, owner_concerns)
VALUES
(2,'Vómitos desde hace 2 días sin causa aparente.',
 'sudden','2 días','stable',
 'El propietario refiere 3-4 episodios de vómito por día, contenido bilioso. Sin diarrea ni fiebre observada en casa.',
 '["digestive"]',
 'up_to_date','up_to_date',
 'commercial_dry','Purina Pro Plan','indoor','normal',
 'decreased',
 'El propietario menciona que pudo haber ingerido algo del jardín hace 3 días.');

INSERT INTO physical_examinations (medical_record_id,
    temperature_c, temp_route, heart_rate, respiratory_rate,
    pulse_quality, spo2_percent,
    general_condition, bcs, mcs,
    hydration_status, hydration_percent,
    mucous_color, mucous_texture, crt_seconds,
    lymph_nodes,
    abdomen_shape, abdominal_palpation, abdominal_notes,
    pain_score, pain_location,
    abnormalities_found, assessment_notes)
VALUES
(2,
 38.9,'rectal',96,20,
 'strong',99,
 'fair',4,3,
 'mild_dehydration',6,
 'pale','tacky',2.0,
 'normal',
 'normal','painful','Dolor a la palpación en región epigástrica y mesogástrica.',
 4,'Abdomen craneal',
 'Deshidratación leve, dolor abdominal craneal. Posible gastroenteritis o gastritis aguda. Descartar cuerpo extraño.',
 'Requiere hemograma y perfil bioquímico. Evaluar necesidad de radiografía abdominal.');

INSERT INTO diagnoses (medical_record_id, diagnosis_type, diagnosis_order,
    description, body_system, severity, prognosis, notes, created_by)
VALUES
(2,'presumptive',1,'Gastritis/Gastroenteritis aguda',
 'digestive','moderate','good',
 'Descartar ingesta de cuerpo extraño u objeto extraño.',2),
(2,'differential',2,'Pancreatitis aguda',
 'digestive','moderate','good','A confirmar con perfil de lipasa.',2),
(2,'rule_out',3,'Obstrucción intestinal por cuerpo extraño',
 'digestive','severe','guarded','Radiografía abdominal solicitada.',2);

-- Orden de laboratorio para Toby
INSERT INTO lab_orders
    (medical_record_id, branch_id, patient_id, ordering_vet_id,
     priority, status, clinical_notes)
VALUES
(2,1,3,2,'urgent','ordered',
 'Paciente con vómitos 2 días y dolor abdominal. Descartar pancreatitis y alteraciones renales/hepáticas.');
-- lab_order_id = 1

INSERT INTO lab_order_items (lab_order_id, panel_id, status)
VALUES (1, NULL, 'pending');  -- Se carga panel ad-hoc

-- Orden de imagen para Toby
INSERT INTO imaging_orders
    (medical_record_id, branch_id, patient_id, ordering_vet_id,
     imaging_type_id, body_region,
     views_requested, clinical_indication, priority, sedation_required)
VALUES
(2,1,3,2,
 1,'Abdomen',
 '["lateral_right","VD"]',
 'Vómitos 2 días, dolor abdominal. Descartar cuerpo extraño u obstrucción.',
 'urgent',0);

-- ============================================================
-- INTERNACIÓN DEMO - Rocky (pre-existente, activo)
-- ============================================================
INSERT INTO medical_records
    (organization_id, branch_id, patient_id, client_id, veterinarian_id,
     record_date, record_time, record_type, weight_kg, bcs, status, signed_at, signed_by)
VALUES
(1,1,5,3,2, DATE_SUB(CURDATE(),INTERVAL 3 DAY),'18:30',
 'emergency',35.0,6,'signed',DATE_SUB(NOW(),INTERVAL 70 HOUR),2);
-- medical_record_id = 3

INSERT INTO wards (branch_id, name, ward_type, capacity, active) VALUES
(1,'Guardia / UCI','icu',4,1),
(1,'Internación General','general',8,1),
(2,'Internación Córdoba','general',4,1);
-- ward_ids: 1=UCI CABA, 2=General CABA, 3=Córdoba

INSERT INTO kennels (ward_id, kennel_code, kennel_type, size_category, special_features, active) VALUES
(1,'UCI-01','cage','large','["oxygen","monitoring","heating"]',1),
(1,'UCI-02','cage','large','["oxygen","monitoring"]',1),
(2,'GEN-01','kennel','large','[]',1),
(2,'GEN-02','kennel','medium','[]',1),
(2,'GEN-03','kennel','medium','[]',1),
(3,'CBA-01','kennel','large','[]',1);

INSERT INTO hospitalizations
    (medical_record_id, branch_id, patient_id, client_id,
     admitting_vet_id, attending_vet_id,
     ward_id, kennel_id,
     admission_at, admission_reason, admission_diagnosis,
     urgency, isolation_required, status)
VALUES
(3,1,5,3, 2,2, 2,3,
 DATE_SUB(NOW(),INTERVAL 72 HOUR),
 'Gastroenteritis hemorrágica severa con deshidratación moderada-grave',
 'Gastroenteritis hemorrágica aguda + deshidratación moderada',
 'emergency',0,'active');
-- hospitalization_id = 1

INSERT INTO hospitalization_monitoring
    (hospitalization_id, recorded_at, recorded_by,
     temperature_c, heart_rate, respiratory_rate, consciousness, pain_score,
     food_offered, food_consumed, water_intake_ml, urine_output, vomiting,
     iv_fluid_type, iv_rate_ml_hr, iv_volume_ml, notes)
VALUES
(1, DATE_SUB(NOW(),INTERVAL 64 HOUR), 5,
 39.2, 118, 28, 'depressed', 5,
 'Dieta blanda', 'none', 0, 'decreased', 1,
 'Ringer Lactato', 80.0, 0,
 'Vómitos persistentes, inicia fluidoterapia IV. Muy decaído.'),
(1, DATE_SUB(NOW(),INTERVAL 40 HOUR), 5,
 38.8, 104, 24, 'alert', 3,
 'Dieta blanda 100g', '1_4', 50, 'normal', 0,
 'Ringer Lactato', 60.0, 4800,
 'Leve mejoría, toleró algo de alimento. Sin vómitos últimas 6h.'),
(1, DATE_SUB(NOW(),INTERVAL 16 HOUR), 5,
 38.5, 92, 20, 'alert', 2,
 'Dieta blanda 150g', '1_2', 150, 'normal', 0,
 'Ringer Lactato', 40.0, 8400,
 'Buena mejoría. Comió la mitad. Alerta y responde al propietario.');

INSERT INTO hospitalization_medications
    (hospitalization_id, medication_id, prescribed_by,
     dose, route, frequency, start_at, active)
VALUES
(1, 1, 2, '0.25mg/kg', 'IV', 'cada 8 horas',
 DATE_SUB(NOW(),INTERVAL 72 HOUR), 1),
(1, 2, 2, '20ml/kg/h inicial, luego 60ml/h mantenimiento', 'IV', 'continuo',
 DATE_SUB(NOW(),INTERVAL 72 HOUR), 1);

-- ============================================================
-- TRIAGE DE EMERGENCIA DEMO (activo)
-- ============================================================
INSERT INTO emergency_triage
    (branch_id, patient_id, client_id,
     arrival_datetime, arrival_mode, triage_priority,
     temperature_c, heart_rate, respiratory_rate,
     mucous_color, crt_seconds, consciousness, pain_score,
     reason_for_emergency, assigned_vet_id, triaged_by,
     triage_notes, status)
VALUES
(1, 10, 2,
 DATE_SUB(NOW(), INTERVAL 35 MINUTE), 'owner_vehicle', 'urgent',
 39.8, 140, 35,
 'pale', 2.5, 'depressed', 7,
 'Perro de 10 meses. Ingirió hueso de pollo cocido hace 2 horas. Tos, arcadas y dificultad para tragar.',
 2, 5,
 'Posible cuerpo extraño esofágico. Requiere radiografía urgente y evaluación endoscópica.',
 'being_treated');

-- ============================================================
-- FACTURA DEMO - Consulta de Max
-- ============================================================
INSERT INTO services_catalog
    (organization_id, category_id, code, name, service_type,
     default_price, price_currency, taxable, active)
VALUES
(1,1,'CONS-GEN','Consulta General Veterinaria','consultation',       3500,  'ARS',1,1),
(1,7,'VACC-SXT','Vacuna Séxtuple Canina',       'vaccination',        4200,  'ARS',1,1),
(1,7,'VACC-RAB','Vacuna Antirrábica Canina',    'vaccination',        2800,  'ARS',1,1),
(1,7,'DEWORM-P','Desparasitación Interna Perro','vaccination',        1500,  'ARS',1,1),
(1,2,'LAB-HEM', 'Hemograma Completo',           'laboratory',         2200,  'ARS',1,1),
(1,2,'LAB-BIO', 'Perfil Bioquímico Completo',   'laboratory',         4500,  'ARS',1,1),
(1,3,'RX-ABD',  'Radiografía Abdominal (2 vistas)','imaging',         5500,  'ARS',1,1),
(1,5,'CIR-OVH', 'Ovariohisterectomía Electiva', 'surgery',           35000,  'ARS',1,1),
(1,6,'INT-DIA', 'Internación por día',           'hospitalization',   8000,  'ARS',1,1),
(1,1,'CONS-URG','Consulta de Urgencia',          'consultation',      5500,  'ARS',1,1);

INSERT INTO invoices
    (organization_id, branch_id, invoice_number, client_id, patient_id,
     medical_record_id, invoice_date, due_date,
     subtotal, tax_amount, total, currency,
     status, payment_status, created_by)
VALUES
(1,1,'FAC-2025-000001',1,1,1,
 DATE_SUB(CURDATE(),INTERVAL 1 DAY), DATE_SUB(CURDATE(),INTERVAL 1 DAY),
 12000.00, 0, 12000.00, 'ARS',
 'paid','paid',6);

INSERT INTO invoice_items
    (invoice_id, service_id, description,
     quantity, unit_price, tax_pct, tax_amount, line_total)
VALUES
(1,1,'Consulta General - Max',     1.0, 3500,0,0,3500),
(1,2,'Vacuna Séxtuple - Max',      1.0, 4200,0,0,4200),
(1,3,'Vacuna Antirrábica - Max',   1.0, 2800,0,0,2800),
(1,4,'Desparasitación - Milbemax', 1.0, 1500,0,0,1500);

INSERT INTO payments
    (invoice_id, payment_date, amount, currency, payment_method, received_by)
VALUES
(1, DATE_SUB(CURDATE(),INTERVAL 1 DAY), 12000.00, 'ARS', 'cash', 6);

-- ============================================================
-- RECORDATORIOS PENDIENTES
-- ============================================================
INSERT INTO reminders
    (organization_id, patient_id, client_id, reminder_type,
     due_date, message, channel, status, linked_vaccination_id)
VALUES
(1,1,1,'vaccination',
 DATE_ADD(CURDATE(),INTERVAL 11 MONTH),
 'Recordatorio: vacuna Séxtuple de Max vence en 11 meses.',
 'whatsapp','pending',1),
(1,2,1,'vaccination',
 DATE_ADD(CURDATE(),INTERVAL 30 DAY),
 'Recordatorio: vacuna Triple Felina de Luna vence en 30 días.',
 'whatsapp','pending',NULL),
(1,3,2,'follow_up',
 DATE_ADD(CURDATE(),INTERVAL 3 DAY),
 'Seguimiento de Toby post-gastroenteritis. Consultar resultados de laboratorio.',
 'whatsapp','pending',NULL);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- VERIFICACIÓN RÁPIDA
-- ============================================================
SELECT 'DEMO DATA CARGADO CORRECTAMENTE' AS status;
SELECT COUNT(*) AS total_organizations FROM organizations;
SELECT COUNT(*) AS total_branches       FROM branches;
SELECT COUNT(*) AS total_users          FROM users;
SELECT COUNT(*) AS total_clients        FROM clients;
SELECT COUNT(*) AS total_patients       FROM patients;
SELECT COUNT(*) AS total_patient_owners FROM patient_owners;
SELECT COUNT(*) AS total_appointments   FROM appointments;
SELECT COUNT(*) AS total_medical_rec    FROM medical_records;
SELECT COUNT(*) AS total_vaccinations   FROM vaccinations;
SELECT COUNT(*) AS total_hospitaliz     FROM hospitalizations;
SELECT COUNT(*) AS total_invoices       FROM invoices;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 9/9: TRIGGERS
-- Grupos:
--   A. Integridad de datos
--   B. Automatización clínica
--   C. Facturación automática
--   D. Inventario
--   E. Auditoría automática
-- ============================================================

SET NAMES utf8mb4;
DELIMITER $$

-- ============================================================
-- GRUPO A: INTEGRIDAD DE DATOS
-- ============================================================

-- A1. Solo puede existir un propietario PRIMARY activo por paciente.
--     Al insertar uno nuevo, cierra automáticamente el anterior.
CREATE TRIGGER trg_patient_owners_before_insert
BEFORE INSERT ON patient_owners
FOR EACH ROW
BEGIN
    IF NEW.ownership_type = 'primary' AND NEW.active = 1 THEN
        UPDATE patient_owners
           SET active    = 0,
               end_date  = COALESCE(end_date, CURDATE()),
               updated_at = NOW()
        WHERE patient_id     = NEW.patient_id
          AND ownership_type = 'primary'
          AND active         = 1
          AND end_date IS NULL;
    END IF;
END$$

-- A2. Validar que la fecha de alta de internación no sea
--     anterior a la de admisión.
CREATE TRIGGER trg_hospitalizations_before_update
BEFORE UPDATE ON hospitalizations
FOR EACH ROW
BEGIN
    IF NEW.discharge_at IS NOT NULL
       AND NEW.discharge_at < NEW.admission_at THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La fecha de alta no puede ser anterior a la de admisión.';
    END IF;
    -- Al dar de alta, registrar en audit
    IF OLD.status = 'active' AND NEW.status = 'discharged' THEN
        SET NEW.discharge_at = COALESCE(NEW.discharge_at, NOW());
    END IF;
END$$

-- A3. Impedir modificar una HC firmada excepto para enmendarla.
CREATE TRIGGER trg_medical_records_before_update
BEFORE UPDATE ON medical_records
FOR EACH ROW
BEGIN
    IF OLD.status = 'signed'
       AND NEW.status NOT IN ('amended', 'signed')
       AND NEW.amended_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No se puede modificar una HC firmada. Use el proceso de enmienda.';
    END IF;
    -- Al firmar, registrar timestamp si no viene seteado
    IF OLD.status != 'signed' AND NEW.status = 'signed' THEN
        SET NEW.signed_at = COALESCE(NEW.signed_at, NOW());
    END IF;
END$$

-- A4. Controlar stock negativo antes de un movimiento de salida.
CREATE TRIGGER trg_inventory_movements_before_insert
BEFORE INSERT ON inventory_movements
FOR EACH ROW
BEGIN
    DECLARE v_current_stock DECIMAL(12,3);
    IF NEW.movement_type IN ('sale','transfer_out','expired','loss') THEN
        SELECT COALESCE(SUM(quantity), 0) INTO v_current_stock
        FROM inventory_stock
        WHERE item_id   = NEW.item_id
          AND branch_id = NEW.branch_id;
        IF v_current_stock < NEW.quantity THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Stock insuficiente para realizar este movimiento.';
        END IF;
    END IF;
END$$

-- ============================================================
-- GRUPO B: AUTOMATIZACIÓN CLÍNICA
-- ============================================================

-- B1. Al registrar una vacunación, crear automáticamente
--     el recordatorio para la próxima dosis si hay fecha.
CREATE TRIGGER trg_vaccinations_after_insert
AFTER INSERT ON vaccinations
FOR EACH ROW
BEGIN
    DECLARE v_org_id      INT;
    DECLARE v_client_id   INT;
    DECLARE v_channel     VARCHAR(30);
    DECLARE v_vac_name    VARCHAR(200);
    DECLARE v_pat_name    VARCHAR(100);

    IF NEW.next_dose_due IS NOT NULL AND NEW.status = 'administered' THEN
        -- Obtener datos necesarios
        SELECT p.organization_id, p.name INTO v_org_id, v_pat_name
        FROM patients p WHERE p.id = NEW.patient_id;

        SELECT po.client_id INTO v_client_id
        FROM patient_owners po
        WHERE po.patient_id = NEW.patient_id
          AND po.ownership_type = 'primary'
          AND po.active = 1 AND po.end_date IS NULL
        LIMIT 1;

        SELECT vc.name INTO v_vac_name FROM vaccines vc WHERE vc.id = NEW.vaccine_id;

        SELECT COALESCE(c.communication_preference,'whatsapp') INTO v_channel
        FROM clients c WHERE c.id = v_client_id;

        -- Insertar recordatorio (evitar duplicados)
        IF NOT EXISTS (
            SELECT 1 FROM reminders
            WHERE patient_id    = NEW.patient_id
              AND reminder_type = 'vaccination'
              AND due_date      = NEW.next_dose_due
              AND status NOT IN ('cancelled')
        ) THEN
            INSERT INTO reminders
                (organization_id, patient_id, client_id, reminder_type,
                 due_date, message, channel, status, linked_vaccination_id)
            VALUES
                (v_org_id, NEW.patient_id, v_client_id, 'vaccination',
                 NEW.next_dose_due,
                 CONCAT('Próx. dosis de ', v_vac_name, ' para ',
                        v_pat_name, ' el ', DATE_FORMAT(NEW.next_dose_due,'%d/%m/%Y')),
                 v_channel, 'pending', NEW.id);
        END IF;
    END IF;

    -- Actualizar la HC con referencia a la vacunación
    IF NEW.medical_record_id IS NOT NULL THEN
        UPDATE medical_records
           SET status    = 'in_progress',
               updated_at = NOW()
        WHERE id = NEW.medical_record_id AND status = 'open';
    END IF;
END$$

-- B2. Al registrar desparasitación, crear recordatorio automático.
CREATE TRIGGER trg_deworming_after_insert
AFTER INSERT ON deworming_records
FOR EACH ROW
BEGIN
    DECLARE v_org_id    INT;
    DECLARE v_client_id INT;
    DECLARE v_channel   VARCHAR(30);
    DECLARE v_prod_name VARCHAR(200);
    DECLARE v_pat_name  VARCHAR(100);

    IF NEW.next_due_date IS NOT NULL THEN
        SELECT p.organization_id, p.name INTO v_org_id, v_pat_name
        FROM patients p WHERE p.id = NEW.patient_id;

        SELECT po.client_id INTO v_client_id
        FROM patient_owners po
        WHERE po.patient_id    = NEW.patient_id
          AND po.ownership_type = 'primary'
          AND po.active = 1 AND po.end_date IS NULL
        LIMIT 1;

        SELECT ap.name INTO v_prod_name
        FROM antiparasitic_products ap WHERE ap.id = NEW.product_id;

        SELECT COALESCE(c.communication_preference,'whatsapp') INTO v_channel
        FROM clients c WHERE c.id = v_client_id;

        IF NOT EXISTS (
            SELECT 1 FROM reminders
            WHERE patient_id    = NEW.patient_id
              AND reminder_type = 'deworming'
              AND due_date      = NEW.next_due_date
              AND status NOT IN ('cancelled')
        ) THEN
            INSERT INTO reminders
                (organization_id, patient_id, client_id, reminder_type,
                 due_date, message, channel, status)
            VALUES
                (v_org_id, NEW.patient_id, v_client_id, 'deworming',
                 NEW.next_due_date,
                 CONCAT('Próx. desparasitación de ', v_pat_name,
                        ' con ', v_prod_name,
                        ' el ', DATE_FORMAT(NEW.next_due_date,'%d/%m/%Y')),
                 v_channel, 'pending');
        END IF;
    END IF;
END$$

-- B3. Al cargar un resultado de laboratorio con valor crítico,
--     generar una alerta de seguridad/clínica inmediata.
CREATE TRIGGER trg_lab_results_after_insert
AFTER INSERT ON lab_results
FOR EACH ROW
BEGIN
    DECLARE v_patient_id   INT;
    DECLARE v_org_id       INT;
    DECLARE v_test_name    VARCHAR(200);
    DECLARE v_pat_name     VARCHAR(100);
    DECLARE v_vet_id       INT;
    DECLARE v_branch_id    INT;

    IF NEW.interpretation IN ('critical_low','critical_high') THEN
        -- Obtener contexto del resultado
        SELECT lo.patient_id, lo.ordering_vet_id, lo.branch_id
          INTO v_patient_id, v_vet_id, v_branch_id
        FROM lab_order_items loi
        JOIN lab_orders lo ON lo.id = loi.lab_order_id
        WHERE loi.id = NEW.lab_order_item_id
        LIMIT 1;

        SELECT p.organization_id, p.name INTO v_org_id, v_pat_name
        FROM patients p WHERE p.id = v_patient_id;

        SELECT lt.name INTO v_test_name FROM lab_tests lt WHERE lt.id = NEW.test_id;

        -- Registrar alerta de seguridad/clínica crítica
        INSERT INTO security_alerts
            (organization_id, user_id, alert_type, severity, description,
             metadata)
        VALUES
            (v_org_id, v_vet_id, 'brute_force', 'critical',
             CONCAT('⚠ VALOR CRÍTICO en ', v_test_name,
                    ' para paciente ', v_pat_name,
                    '. Valor: ', COALESCE(NEW.result_value,''), ' ', COALESCE(NEW.unit,''),
                    ' — Interpretación: ', NEW.interpretation),
             JSON_OBJECT(
                 'patient_id',  v_patient_id,
                 'test_name',   v_test_name,
                 'value',       NEW.result_numeric,
                 'unit',        NEW.unit,
                 'alert_type',  'critical_lab_value',
                 'branch_id',   v_branch_id
             ));

        -- Marcar la orden de lab como requiere revisión urgente
        UPDATE lab_orders lo
        JOIN lab_order_items loi ON loi.lab_order_id = lo.id
        SET lo.status = 'partial_results'
        WHERE loi.id = NEW.lab_order_item_id
          AND lo.status IN ('processing','sample_collected');
    END IF;

    -- Marcar el ítem como completado
    UPDATE lab_order_items
       SET status = 'completed'
    WHERE id = NEW.lab_order_item_id AND status = 'processing';
END$$

-- B4. Al registrar constantes vitales en internación,
--     detectar valores fuera de rango crítico y generar alerta.
CREATE TRIGGER trg_hosp_monitoring_after_insert
AFTER INSERT ON hospitalization_monitoring
FOR EACH ROW
BEGIN
    DECLARE v_patient_id INT;
    DECLARE v_org_id     INT;
    DECLARE v_vet_id     INT;
    DECLARE v_pat_name   VARCHAR(100);
    DECLARE v_alert_msg  TEXT DEFAULT '';
    DECLARE v_sp_temp_min DECIMAL(4,1);
    DECLARE v_sp_temp_max DECIMAL(4,1);
    DECLARE v_sp_hr_min   SMALLINT;
    DECLARE v_sp_hr_max   SMALLINT;

    SELECT h.patient_id, h.attending_vet_id INTO v_patient_id, v_vet_id
    FROM hospitalizations h WHERE h.id = NEW.hospitalization_id;

    SELECT p.organization_id, p.name,
           sp.temp_min_c, sp.temp_max_c, sp.hr_min, sp.hr_max
      INTO v_org_id, v_pat_name,
           v_sp_temp_min, v_sp_temp_max, v_sp_hr_min, v_sp_hr_max
    FROM patients p
    JOIN species sp ON sp.id = p.species_id
    WHERE p.id = v_patient_id;

    -- Evaluar temperatura
    IF NEW.temperature_c IS NOT NULL AND v_sp_temp_min IS NOT NULL THEN
        IF NEW.temperature_c < v_sp_temp_min - 1.0 THEN
            SET v_alert_msg = CONCAT(v_alert_msg,
                '🌡 HIPOTERMIA: Temp=', NEW.temperature_c, '°C. ');
        ELSEIF NEW.temperature_c > v_sp_temp_max + 1.5 THEN
            SET v_alert_msg = CONCAT(v_alert_msg,
                '🌡 HIPERTERMIA: Temp=', NEW.temperature_c, '°C. ');
        END IF;
    END IF;

    -- Evaluar frecuencia cardíaca
    IF NEW.heart_rate IS NOT NULL AND v_sp_hr_min IS NOT NULL THEN
        IF NEW.heart_rate < v_sp_hr_min * 0.7 THEN
            SET v_alert_msg = CONCAT(v_alert_msg,
                '💓 BRADICARDIA: FC=', NEW.heart_rate, ' lpm. ');
        ELSEIF NEW.heart_rate > v_sp_hr_max * 1.5 THEN
            SET v_alert_msg = CONCAT(v_alert_msg,
                '💓 TAQUICARDIA: FC=', NEW.heart_rate, ' lpm. ');
        END IF;
    END IF;

    -- Evaluar nivel de consciencia
    IF NEW.consciousness IN ('stuporous','comatose') THEN
        SET v_alert_msg = CONCAT(v_alert_msg,
            '🧠 CONSCIENCIA CRÍTICA: ', NEW.consciousness, '. ');
    END IF;

    -- Evaluar dolor severo
    IF NEW.pain_score IS NOT NULL AND NEW.pain_score >= 8 THEN
        SET v_alert_msg = CONCAT(v_alert_msg,
            '⚡ DOLOR SEVERO: Score=', NEW.pain_score, '/10. ');
    END IF;

    -- Crear alerta si hay hallazgos críticos
    IF v_alert_msg != '' THEN
        INSERT INTO security_alerts
            (organization_id, user_id, alert_type, severity, description, metadata)
        VALUES
            (v_org_id, v_vet_id, 'suspicious_ip', 'critical',
             CONCAT('⚠ CONSTANTES CRÍTICAS — Paciente internado: ',
                    v_pat_name, ' | ', v_alert_msg),
             JSON_OBJECT(
                 'hospitalization_id', NEW.hospitalization_id,
                 'patient_id',         v_patient_id,
                 'temperature',        NEW.temperature_c,
                 'heart_rate',         NEW.heart_rate,
                 'consciousness',      NEW.consciousness,
                 'pain_score',         NEW.pain_score,
                 'alert_type',         'critical_vital_signs'
             ));
    END IF;
END$$

-- B5. Al completar un turno, actualizar la HC vinculada
--     y registrar la hora de finalización.
CREATE TRIGGER trg_appointments_after_update
AFTER UPDATE ON appointments
FOR EACH ROW
BEGIN
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        UPDATE medical_records
           SET status      = 'in_progress',
               updated_at  = NOW()
        WHERE appointment_id = NEW.id
          AND status IN ('open','in_progress');
    END IF;

    -- Si se cancela el turno y la HC está abierta, marcarla como cancelada
    IF OLD.status != 'cancelled' AND NEW.status = 'cancelled' THEN
        UPDATE medical_records
           SET status     = 'completed',
               updated_at = NOW()
        WHERE appointment_id = NEW.id
          AND status = 'open';
    END IF;
END$$

-- B6. Al admitir una emergencia y asignar veterinario,
--     crear un turno de emergencia automáticamente.
CREATE TRIGGER trg_emergency_triage_after_update
AFTER UPDATE ON emergency_triage
FOR EACH ROW
BEGIN
    DECLARE v_org_id INT;

    -- Cuando se asigna veterinario y pasa a "being_treated"
    IF OLD.status = 'waiting'
       AND NEW.status = 'being_treated'
       AND NEW.assigned_vet_id IS NOT NULL
       AND NEW.patient_id IS NOT NULL
       AND NEW.client_id IS NOT NULL THEN

        SELECT organization_id INTO v_org_id
        FROM branches WHERE id = NEW.branch_id;

        -- Solo crear si no existe turno de emergencia para este triage
        IF NOT EXISTS (
            SELECT 1 FROM appointments
            WHERE patient_id     = NEW.patient_id
              AND priority        = 'emergency'
              AND scheduled_date  = DATE(NEW.arrival_datetime)
              AND status NOT IN ('cancelled')
        ) THEN
            INSERT INTO appointments
                (organization_id, branch_id, patient_id, client_id,
                 veterinarian_id, appointment_type_id,
                 scheduled_date, scheduled_time, duration_minutes,
                 status, priority, chief_complaint, booking_channel)
            VALUES
                (v_org_id, NEW.branch_id, NEW.patient_id, NEW.client_id,
                 NEW.assigned_vet_id, 2,   -- tipo "Urgencia"
                 DATE(NEW.arrival_datetime), TIME(NEW.arrival_datetime), 30,
                 'in_progress', 'emergency', NEW.reason_for_emergency, 'in_person');
        END IF;
    END IF;
END$$

-- B7. Al actualizar el peso en una HC, sincronizar con
--     el campo weight_kg del paciente.
CREATE TRIGGER trg_medical_records_after_insert
AFTER INSERT ON medical_records
FOR EACH ROW
BEGIN
    IF NEW.weight_kg IS NOT NULL THEN
        UPDATE patients
           SET weight_kg  = NEW.weight_kg,
               updated_at = NOW()
        WHERE id = NEW.patient_id;
    END IF;
END$$

CREATE TRIGGER trg_medical_records_weight_after_update
AFTER UPDATE ON medical_records
FOR EACH ROW
BEGIN
    IF NEW.weight_kg IS NOT NULL AND NEW.weight_kg != OLD.weight_kg THEN
        UPDATE patients
           SET weight_kg  = NEW.weight_kg,
               updated_at = NOW()
        WHERE id = NEW.patient_id;
    END IF;
END$$

-- ============================================================
-- GRUPO C: FACTURACIÓN AUTOMÁTICA
-- ============================================================

-- C1. Recalcular totales de la factura al insertar un ítem.
CREATE TRIGGER trg_invoice_items_after_insert
AFTER INSERT ON invoice_items
FOR EACH ROW
BEGIN
    UPDATE invoices
       SET subtotal       = (SELECT COALESCE(SUM(unit_price * quantity), 0)
                             FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           discount_amount = (SELECT COALESCE(SUM(discount_amount), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           tax_amount      = (SELECT COALESCE(SUM(tax_amount), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           total           = (SELECT COALESCE(SUM(line_total), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           updated_at      = NOW()
    WHERE id = NEW.invoice_id;
END$$

-- C2. Recalcular al actualizar un ítem.
CREATE TRIGGER trg_invoice_items_after_update
AFTER UPDATE ON invoice_items
FOR EACH ROW
BEGIN
    UPDATE invoices
       SET subtotal        = (SELECT COALESCE(SUM(unit_price * quantity), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           discount_amount = (SELECT COALESCE(SUM(discount_amount), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           tax_amount      = (SELECT COALESCE(SUM(tax_amount), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           total           = (SELECT COALESCE(SUM(line_total), 0)
                              FROM invoice_items WHERE invoice_id = NEW.invoice_id),
           updated_at      = NOW()
    WHERE id = NEW.invoice_id;
END$$

-- C3. Recalcular al eliminar un ítem.
CREATE TRIGGER trg_invoice_items_after_delete
AFTER DELETE ON invoice_items
FOR EACH ROW
BEGIN
    UPDATE invoices
       SET subtotal        = (SELECT COALESCE(SUM(unit_price * quantity), 0)
                              FROM invoice_items WHERE invoice_id = OLD.invoice_id),
           discount_amount = (SELECT COALESCE(SUM(discount_amount), 0)
                              FROM invoice_items WHERE invoice_id = OLD.invoice_id),
           tax_amount      = (SELECT COALESCE(SUM(tax_amount), 0)
                              FROM invoice_items WHERE invoice_id = OLD.invoice_id),
           total           = (SELECT COALESCE(SUM(line_total), 0)
                              FROM invoice_items WHERE invoice_id = OLD.invoice_id),
           updated_at      = NOW()
    WHERE id = OLD.invoice_id;
END$$

-- C4. Al registrar un pago, actualizar automáticamente
--     el estado de la factura y el saldo pendiente del cliente.
CREATE TRIGGER trg_payments_after_insert
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
    DECLARE v_total      DECIMAL(12,2);
    DECLARE v_paid       DECIMAL(12,2);
    DECLARE v_client_id  INT;
    DECLARE v_org_id     INT;

    SELECT inv.total, inv.client_id, inv.organization_id
      INTO v_total, v_client_id, v_org_id
    FROM invoices inv WHERE inv.id = NEW.invoice_id;

    SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
    FROM payments p WHERE p.invoice_id = NEW.invoice_id;

    -- Actualizar estado de la factura
    IF v_paid >= v_total THEN
        UPDATE invoices
           SET status         = 'paid',
               payment_status = 'paid',
               updated_at     = NOW()
        WHERE id = NEW.invoice_id;
    ELSE
        UPDATE invoices
           SET status         = 'partially_paid',
               payment_status = 'partial',
               updated_at     = NOW()
        WHERE id = NEW.invoice_id;
    END IF;

    -- Actualizar saldo pendiente del cliente
    UPDATE clients
       SET outstanding_balance = (
           SELECT COALESCE(SUM(inv2.total), 0) -
                  COALESCE((SELECT SUM(p2.amount) FROM payments p2
                            JOIN invoices inv3 ON inv3.id = p2.invoice_id
                            WHERE inv3.client_id = v_client_id
                              AND inv3.status != 'cancelled'), 0)
           FROM invoices inv2
           WHERE inv2.client_id   = v_client_id
             AND inv2.status NOT IN ('draft','cancelled')
       ),
       updated_at = NOW()
    WHERE id = v_client_id;
END$$

-- C5. Al emitir/finalizar una factura, actualizar saldo del cliente.
CREATE TRIGGER trg_invoices_after_update
AFTER UPDATE ON invoices
FOR EACH ROW
BEGIN
    -- Detectar cambio a 'overdue' (la aplicación debe correr esto periódicamente)
    IF NEW.status = 'overdue' AND OLD.status != 'overdue' THEN
        -- Crear alerta de cobranza
        INSERT INTO security_alerts
            (organization_id, user_id, alert_type, severity, description, metadata)
        VALUES
            (NEW.organization_id, NULL, 'after_hours_access', 'warning',
             CONCAT('Factura vencida: ', NEW.invoice_number,
                    ' — Total: ', NEW.currency, ' ', FORMAT(NEW.total, 2)),
             JSON_OBJECT(
                 'invoice_id',     NEW.id,
                 'invoice_number', NEW.invoice_number,
                 'client_id',      NEW.client_id,
                 'total',          NEW.total,
                 'due_date',       NEW.due_date,
                 'alert_type',     'overdue_invoice'
             ));
    END IF;
END$$

-- ============================================================
-- GRUPO D: INVENTARIO
-- ============================================================

-- D1. Al insertar un movimiento, actualizar el stock
--     correspondiente (suma o resta según tipo).
CREATE TRIGGER trg_inventory_movements_after_insert
AFTER INSERT ON inventory_movements
FOR EACH ROW
BEGIN
    -- Entradas
    IF NEW.movement_type IN ('purchase','transfer_in','return') THEN
        -- Intentar actualizar lote existente
        UPDATE inventory_stock
           SET quantity    = quantity + NEW.quantity,
               unit_cost   = COALESCE(NEW.unit_cost, unit_cost),
               updated_at  = NOW()
        WHERE item_id   = NEW.item_id
          AND branch_id = NEW.branch_id
          AND (lot_number IS NULL OR lot_number = '')
        LIMIT 1;

        -- Si no existe fila de stock para ese item/sucursal, crearla
        IF ROW_COUNT() = 0 THEN
            INSERT INTO inventory_stock (item_id, branch_id, quantity, unit_cost)
            VALUES (NEW.item_id, NEW.branch_id, NEW.quantity, NEW.unit_cost)
            ON DUPLICATE KEY UPDATE
                quantity   = quantity + NEW.quantity,
                updated_at = NOW();
        END IF;
    END IF;

    -- Salidas
    IF NEW.movement_type IN ('sale','transfer_out','expired','loss') THEN
        UPDATE inventory_stock
           SET quantity   = GREATEST(0, quantity - NEW.quantity),
               updated_at = NOW()
        WHERE item_id   = NEW.item_id
          AND branch_id = NEW.branch_id
        LIMIT 1;
    END IF;

    -- Ajuste (puede ser positivo o negativo según el signo de quantity)
    IF NEW.movement_type = 'adjustment' THEN
        UPDATE inventory_stock
           SET quantity   = GREATEST(0, quantity + NEW.quantity),
               updated_at = NOW()
        WHERE item_id   = NEW.item_id
          AND branch_id = NEW.branch_id
        LIMIT 1;
    END IF;
END$$

-- D2. Al actualizar stock, verificar si está por debajo
--     del punto de reorden y generar una alerta.
CREATE TRIGGER trg_inventory_stock_after_update
AFTER UPDATE ON inventory_stock
FOR EACH ROW
BEGIN
    DECLARE v_reorder_point DECIMAL(10,2);
    DECLARE v_product_name  VARCHAR(200);
    DECLARE v_org_id        INT;
    DECLARE v_branch_name   VARCHAR(200);

    IF NEW.quantity < OLD.quantity THEN  -- Solo al bajar el stock
        SELECT ii.reorder_point, ii.product_name, o.id
          INTO v_reorder_point, v_product_name, v_org_id
        FROM inventory_items ii
        JOIN organizations o ON o.id = ii.organization_id
        WHERE ii.id = NEW.item_id;

        SELECT name INTO v_branch_name FROM branches WHERE id = NEW.branch_id;

        IF v_reorder_point IS NOT NULL AND NEW.quantity <= v_reorder_point
           AND OLD.quantity > v_reorder_point THEN
            INSERT INTO security_alerts
                (organization_id, user_id, alert_type, severity, description, metadata)
            VALUES
                (v_org_id, NULL, 'mass_export', 'warning',
                 CONCAT('📦 STOCK BAJO: ', v_product_name,
                        ' — Stock actual: ', NEW.quantity,
                        ' | Punto de reorden: ', v_reorder_point,
                        ' | Sede: ', v_branch_name),
                 JSON_OBJECT(
                     'item_id',       NEW.item_id,
                     'branch_id',     NEW.branch_id,
                     'current_stock', NEW.quantity,
                     'reorder_point', v_reorder_point,
                     'alert_type',    'low_stock'
                 ));
        END IF;

        -- Alerta crítica: sin stock
        IF NEW.quantity = 0 AND OLD.quantity > 0 THEN
            INSERT INTO security_alerts
                (organization_id, user_id, alert_type, severity, description, metadata)
            VALUES
                (v_org_id, NULL, 'mass_export', 'critical',
                 CONCAT('🚨 SIN STOCK: ', v_product_name,
                        ' en sede ', v_branch_name),
                 JSON_OBJECT(
                     'item_id',    NEW.item_id,
                     'branch_id',  NEW.branch_id,
                     'alert_type', 'zero_stock'
                 ));
        END IF;
    END IF;
END$$

-- ============================================================
-- GRUPO E: AUDITORÍA AUTOMÁTICA
-- ============================================================

-- E1. Auditar firma y enmienda de historias clínicas.
CREATE TRIGGER trg_medical_records_audit_after_update
AFTER UPDATE ON medical_records
FOR EACH ROW
BEGIN
    DECLARE v_action VARCHAR(20);
    DECLARE v_risk   VARCHAR(20) DEFAULT 'low';

    IF OLD.status != 'signed' AND NEW.status = 'signed' THEN
        SET v_action = 'SIGN';
        SET v_risk   = 'medium';
    ELSEIF OLD.status = 'signed' AND NEW.status = 'amended' THEN
        SET v_action = 'APPROVE';  -- enmienda = requiere aprobación
        SET v_risk   = 'high';
    ELSE
        SET v_action = 'UPDATE';
    END IF;

    INSERT INTO audit_logs
        (organization_id, branch_id, user_id, action, module,
         entity, entity_id, entity_uuid,
         old_values, new_values, risk_level)
    VALUES
        (NEW.organization_id, NEW.branch_id,
         COALESCE(NEW.signed_by, NEW.amended_by, NEW.veterinarian_id),
         v_action, 'medical_records',
         'medical_records', NEW.id, NEW.uuid,
         JSON_OBJECT('status', OLD.status, 'signed_at', OLD.signed_at),
         JSON_OBJECT('status', NEW.status, 'signed_at', NEW.signed_at,
                     'amendment_reason', NEW.amendment_reason),
         v_risk);
END$$

-- E2. Auditar altas de usuarios.
CREATE TRIGGER trg_users_after_insert
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs
        (organization_id, user_id, action, module,
         entity, entity_id, entity_uuid,
         new_values, risk_level)
    VALUES
        (NEW.organization_id, NEW.id, 'CREATE', 'users',
         'users', NEW.id, NEW.uuid,
         JSON_OBJECT('email', NEW.email, 'username', NEW.username,
                     'active', NEW.active),
         'medium');
END$$

-- E3. Auditar cambios críticos en usuarios
--     (cambio de email, bloqueo, activación/desactivación).
CREATE TRIGGER trg_users_audit_after_update
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    DECLARE v_risk    VARCHAR(20) DEFAULT 'low';
    DECLARE v_action  VARCHAR(20) DEFAULT 'UPDATE';
    DECLARE v_changes JSON;

    SET v_changes = JSON_OBJECT();

    -- Email cambiado
    IF OLD.email != NEW.email THEN
        SET v_risk    = 'high';
        SET v_changes = JSON_SET(v_changes, '$.email_old', OLD.email, '$.email_new', NEW.email);
    END IF;

    -- Cuenta bloqueada/desbloqueada
    IF OLD.locked_until IS NULL AND NEW.locked_until IS NOT NULL THEN
        SET v_risk    = 'high';
        SET v_action  = 'REVOKE';
        SET v_changes = JSON_SET(v_changes, '$.locked_until', CAST(NEW.locked_until AS CHAR));
    END IF;

    -- Cuenta desactivada
    IF OLD.active = 1 AND NEW.active = 0 THEN
        SET v_risk    = 'high';
        SET v_action  = 'DELETE';
        SET v_changes = JSON_SET(v_changes, '$.active', 0);
    END IF;

    -- Password cambiado
    IF OLD.password_hash != NEW.password_hash THEN
        SET v_risk    = 'medium';
        SET v_changes = JSON_SET(v_changes, '$.password_changed', 1);
    END IF;

    -- Solo auditar si hubo cambios relevantes
    IF JSON_LENGTH(v_changes) > 0 THEN
        INSERT INTO audit_logs
            (organization_id, user_id, action, module,
             entity, entity_id, entity_uuid,
             diff, risk_level)
        VALUES
            (NEW.organization_id, NEW.id, v_action, 'users',
             'users', NEW.id, NEW.uuid,
             v_changes, v_risk);
    END IF;
END$$

-- E4. Auditar transferencias de propiedad de mascotas.
CREATE TRIGGER trg_patient_owners_after_insert
AFTER INSERT ON patient_owners
FOR EACH ROW
BEGIN
    DECLARE v_org_id INT;
    SELECT organization_id INTO v_org_id FROM patients WHERE id = NEW.patient_id;

    INSERT INTO audit_logs
        (organization_id, user_id, action, module,
         entity, entity_id,
         new_values, risk_level)
    VALUES
        (v_org_id, NEW.registered_by, 'CREATE', 'patients',
         'patient_owners', NEW.id,
         JSON_OBJECT(
             'patient_id',     NEW.patient_id,
             'client_id',      NEW.client_id,
             'ownership_type', NEW.ownership_type,
             'start_date',     CAST(NEW.start_date AS CHAR)
         ),
         'medium');
END$$

-- E5. Auditar cambios en roles de usuario (escalamiento de privilegios).
CREATE TRIGGER trg_user_roles_after_insert
AFTER INSERT ON user_roles
FOR EACH ROW
BEGIN
    DECLARE v_role_name VARCHAR(60);
    DECLARE v_risk      VARCHAR(20) DEFAULT 'medium';

    SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;

    -- Roles de alto riesgo
    IF NEW.role_id IN (1, 2) THEN SET v_risk = 'critical'; END IF;

    INSERT INTO audit_logs
        (organization_id, branch_id, user_id, action, module,
         entity, entity_id,
         new_values, risk_level)
    VALUES
        (NEW.organization_id, NEW.branch_id,
         NEW.assigned_by, 'APPROVE', 'users',
         'user_roles', NEW.id,
         JSON_OBJECT(
             'user_id',   NEW.user_id,
             'role',      v_role_name,
             'branch_id', NEW.branch_id
         ),
         v_risk);
END$$

-- E6. Auditar revocación de roles.
CREATE TRIGGER trg_user_roles_audit_after_update
AFTER UPDATE ON user_roles
FOR EACH ROW
BEGIN
    DECLARE v_role_name VARCHAR(60);
    IF OLD.active = 1 AND NEW.active = 0 THEN
        SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;
        INSERT INTO audit_logs
            (organization_id, user_id, action, module,
             entity, entity_id,
             diff, risk_level)
        VALUES
            (NEW.organization_id, NEW.user_id, 'REVOKE', 'users',
             'user_roles', NEW.id,
             JSON_OBJECT('role_revoked', v_role_name, 'user_id', NEW.user_id),
             'high');
    END IF;
END$$

-- E7. Auditar cancelaciones de facturas.
CREATE TRIGGER trg_invoices_audit_after_update
AFTER UPDATE ON invoices
FOR EACH ROW
BEGIN
    IF OLD.status != 'cancelled' AND NEW.status = 'cancelled' THEN
        INSERT INTO audit_logs
            (organization_id, branch_id, user_id, action, module,
             entity, entity_id, entity_uuid,
             old_values, new_values, risk_level)
        VALUES
            (NEW.organization_id, NEW.branch_id, NEW.created_by,
             'DELETE', 'billing',
             'invoices', NEW.id, NEW.uuid,
             JSON_OBJECT('status', OLD.status, 'total', OLD.total),
             JSON_OBJECT('status', NEW.status),
             'high');
    END IF;
END$$

-- E8. Auditar exportaciones masivas (detección de fuga de datos).
--     Se activa cuando el campo action = 'EXPORT' se registra en audit_logs.
--     Verifica si el mismo usuario ha hecho >10 exports en 1 hora.
CREATE TRIGGER trg_audit_logs_after_insert
AFTER INSERT ON audit_logs
FOR EACH ROW
BEGIN
    DECLARE v_export_count INT;

    IF NEW.action = 'EXPORT' AND NEW.user_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_export_count
        FROM audit_logs
        WHERE user_id    = NEW.user_id
          AND action     = 'EXPORT'
          AND created_at >= NOW() - INTERVAL 1 HOUR;

        IF v_export_count >= 10 THEN
            INSERT INTO security_alerts
                (organization_id, user_id, alert_type, severity, description, metadata)
            VALUES
                (NEW.organization_id, NEW.user_id, 'mass_export', 'critical',
                 CONCAT('🚨 POSIBLE FUGA DE DATOS: ',
                        v_export_count, ' exportaciones en la última hora.'),
                 JSON_OBJECT(
                     'user_id',       NEW.user_id,
                     'export_count',  v_export_count,
                     'window_hours',  1,
                     'alert_type',    'mass_export_detected'
                 ));
        END IF;
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- VERIFICACIÓN: listar todos los triggers creados
-- ============================================================
SELECT
    TRIGGER_NAME,
    EVENT_MANIPULATION AS event,
    EVENT_OBJECT_TABLE AS `table`,
    ACTION_TIMING      AS timing
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 10: MÓDULO DE TELECONSULTA / TELEMEDICINA
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- PLATAFORMAS DE VIDEOLLAMADA
-- ============================================================

CREATE TABLE tele_platforms (
    id           TINYINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name         VARCHAR(80)       NOT NULL,   -- Zoom, Google Meet, WhatsApp, Teams...
    code         VARCHAR(20)       NOT NULL,
    logo_url     VARCHAR(300),
    requires_link TINYINT(1)       NOT NULL DEFAULT 1,
    active       TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tplat_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PLANES DE TELECONSULTA
-- Permite paquetes de N sesiones prepagadas.
-- ============================================================

CREATE TABLE tele_plans (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(100)      NOT NULL,
    sessions_included TINYINT UNSIGNED NOT NULL DEFAULT 1,
    validity_days    SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    price            DECIMAL(12,2)     NOT NULL,
    currency         CHAR(3)           NOT NULL DEFAULT 'USD',
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_tplan_org (organization_id),
    CONSTRAINT fk_tplan_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Suscripciones de clientes a planes de teleconsulta
CREATE TABLE tele_plan_subscriptions (
    id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED      NOT NULL,
    client_id        INT UNSIGNED      NOT NULL,
    plan_id          SMALLINT UNSIGNED NOT NULL,
    sessions_total   TINYINT UNSIGNED  NOT NULL,
    sessions_used    TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    sessions_remaining TINYINT UNSIGNED NOT NULL,
    starts_at        DATE              NOT NULL,
    expires_at       DATE              NOT NULL,
    invoice_id       INT UNSIGNED,
    status           ENUM('active','expired','exhausted','cancelled') NOT NULL DEFAULT 'active',
    created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_tsub_org    (organization_id),
    KEY fk_tsub_client (client_id),
    KEY fk_tsub_plan   (plan_id),
    KEY fk_tsub_inv    (invoice_id),
    CONSTRAINT fk_tsub_org    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_tsub_client FOREIGN KEY (client_id)       REFERENCES clients(id),
    CONSTRAINT fk_tsub_plan   FOREIGN KEY (plan_id)         REFERENCES tele_plans(id),
    CONSTRAINT fk_tsub_inv    FOREIGN KEY (invoice_id)      REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SESIONES DE TELECONSULTA
-- ============================================================

CREATE TABLE tele_sessions (
    id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)          NOT NULL DEFAULT (UUID()),
    organization_id   INT UNSIGNED      NOT NULL,
    branch_id         INT UNSIGNED      NOT NULL,
    appointment_id    INT UNSIGNED,
    medical_record_id INT UNSIGNED,
    patient_id        INT UNSIGNED      NOT NULL,
    client_id         INT UNSIGNED      NOT NULL,
    veterinarian_id   INT UNSIGNED      NOT NULL,
    subscription_id   INT UNSIGNED,
    platform_id       TINYINT UNSIGNED  NOT NULL,
    -- Programación
    scheduled_at      DATETIME          NOT NULL,
    duration_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 20,
    -- Acceso
    meeting_url       VARCHAR(500),
    meeting_id        VARCHAR(200),
    meeting_password  VARCHAR(100),
    host_token        VARCHAR(500),      -- token del vet (no exponer al cliente)
    -- Estado
    status            ENUM('scheduled','waiting','in_progress',
                           'completed','missed','cancelled','technical_failure')
                      NOT NULL DEFAULT 'scheduled',
    -- Tiempos reales
    vet_joined_at     DATETIME,
    client_joined_at  DATETIME,
    started_at        DATETIME,
    ended_at          DATETIME,
    actual_duration_min SMALLINT UNSIGNED,
    -- Motivo
    chief_complaint   TEXT              NOT NULL,
    session_type      ENUM('first_consult','follow_up','prescription_renewal',
                           'result_review','emergency','second_opinion') NOT NULL,
    -- Resultado de la sesión
    session_notes     TEXT,             -- notas del veterinario durante la sesión
    recommendations   TEXT,
    requires_in_person TINYINT(1)       NOT NULL DEFAULT 0,
    in_person_urgency  ENUM('immediate','within_48h','within_week','elective'),
    in_person_reason   TEXT,
    -- Cancelación
    cancelled_by      ENUM('client','vet','system'),
    cancellation_reason TEXT,
    cancelled_at      DATETIME,
    -- Técnico
    connection_quality ENUM('excellent','good','fair','poor','failed'),
    technical_issues  TEXT,
    recording_url     VARCHAR(500),     -- si la organización graba (con consentimiento)
    recording_consent TINYINT(1)        NOT NULL DEFAULT 0,
    -- Facturación
    invoice_id        INT UNSIGNED,
    created_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tsess_uuid (uuid),
    KEY fk_ts_org    (organization_id),
    KEY fk_ts_branch (branch_id),
    KEY fk_ts_appt   (appointment_id),
    KEY fk_ts_mr     (medical_record_id),
    KEY fk_ts_pat    (patient_id),
    KEY fk_ts_client (client_id),
    KEY fk_ts_vet    (veterinarian_id),
    KEY fk_ts_sub    (subscription_id),
    KEY fk_ts_plat   (platform_id),
    KEY fk_ts_inv    (invoice_id),
    KEY idx_ts_sched (scheduled_at),
    KEY idx_ts_status (status),
    CONSTRAINT fk_ts_org    FOREIGN KEY (organization_id)   REFERENCES organizations(id),
    CONSTRAINT fk_ts_branch FOREIGN KEY (branch_id)         REFERENCES branches(id),
    CONSTRAINT fk_ts_appt   FOREIGN KEY (appointment_id)    REFERENCES appointments(id),
    CONSTRAINT fk_ts_mr     FOREIGN KEY (medical_record_id) REFERENCES medical_records(id),
    CONSTRAINT fk_ts_pat    FOREIGN KEY (patient_id)        REFERENCES patients(id),
    CONSTRAINT fk_ts_client FOREIGN KEY (client_id)         REFERENCES clients(id),
    CONSTRAINT fk_ts_vet    FOREIGN KEY (veterinarian_id)   REFERENCES users(id),
    CONSTRAINT fk_ts_sub    FOREIGN KEY (subscription_id)   REFERENCES tele_plan_subscriptions(id),
    CONSTRAINT fk_ts_plat   FOREIGN KEY (platform_id)       REFERENCES tele_platforms(id),
    CONSTRAINT fk_ts_inv    FOREIGN KEY (invoice_id)        REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ANAMNESIS DE TELECONSULTA
-- Pre-llenada por el cliente ANTES de la sesión.
-- ============================================================

CREATE TABLE tele_pre_anamnesis (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    session_id       INT UNSIGNED  NOT NULL,
    -- Completada por el cliente
    chief_complaint  TEXT          NOT NULL,
    symptom_onset    ENUM('sudden','gradual','unknown'),
    symptom_duration VARCHAR(100),
    symptom_description TEXT,
    current_medications TEXT,
    recent_changes   TEXT,           -- cambios en alimentación, ambiente, rutina
    -- Fotos y videos enviados por el cliente (URLs externas)
    media_urls       JSON,           -- [{url, type:"photo|video", description}]
    -- Datos actuales
    last_weight_kg   DECIMAL(8,3),
    appetite         ENUM('normal','increased','decreased','absent'),
    water_intake     ENUM('normal','increased','decreased','absent'),
    activity_level   ENUM('normal','increased','decreased','lethargic'),
    -- Urgencia percibida por el cliente
    client_urgency   ENUM('not_urgent','somewhat_urgent','urgent','very_urgent'),
    submitted_at     DATETIME,       -- cuando el cliente completó el formulario
    PRIMARY KEY (id),
    UNIQUE KEY uq_tpre_session (session_id),
    CONSTRAINT fk_tpre_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CHAT / MENSAJERÍA ASÍNCRONA DE TELECONSULTA
-- Mensajes de texto entre cliente y vet antes/después de la sesión.
-- ============================================================

CREATE TABLE tele_messages (
    id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    session_id   INT UNSIGNED      NOT NULL,
    sender_type  ENUM('client','vet','system') NOT NULL,
    sender_id    INT UNSIGNED,               -- user_id o client_id según sender_type
    message_type ENUM('text','image','file','audio','system') NOT NULL DEFAULT 'text',
    content      TEXT,
    media_url    VARCHAR(500),
    file_name    VARCHAR(200),
    read_at      DATETIME,
    sent_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_tmsg_session (session_id),
    KEY idx_tmsg_sent   (sent_at),
    CONSTRAINT fk_tmsg_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PRESCRIPCIONES DIGITALES DE TELECONSULTA
-- Referencia la prescripción estándar y agrega firma digital.
-- ============================================================

CREATE TABLE tele_digital_prescriptions (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    session_id       INT UNSIGNED  NOT NULL,
    prescription_id  INT UNSIGNED  NOT NULL,   -- FK a prescriptions
    digital_signature_hash VARCHAR(512),       -- hash de firma digital del vet
    signed_certificate TEXT,                   -- certificado X.509 base64
    qr_code_url      VARCHAR(500),             -- URL del QR de verificación
    pdf_url          VARCHAR(500),             -- PDF generado
    valid_from       DATE          NOT NULL,
    valid_until      DATE,
    status           ENUM('issued','verified','expired','revoked') NOT NULL DEFAULT 'issued',
    issued_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_tdp_session (session_id),
    KEY fk_tdp_rx      (prescription_id),
    CONSTRAINT fk_tdp_session FOREIGN KEY (session_id)      REFERENCES tele_sessions(id),
    CONSTRAINT fk_tdp_rx      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DOCUMENTOS COMPARTIDOS EN SESIÓN
-- Archivos que el vet o el cliente comparten durante la consulta.
-- ============================================================

CREATE TABLE tele_shared_documents (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    session_id   INT UNSIGNED  NOT NULL,
    uploaded_by  ENUM('vet','client') NOT NULL,
    uploader_id  INT UNSIGNED,
    doc_type     ENUM('lab_result','imaging','prescription','referral',
                      'previous_record','owner_photo','other') NOT NULL,
    title        VARCHAR(200)  NOT NULL,
    file_url     VARCHAR(500)  NOT NULL,
    file_type    VARCHAR(50),
    file_size_kb INT UNSIGNED,
    description  TEXT,
    uploaded_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_tsd_session (session_id),
    CONSTRAINT fk_tsd_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CALIFICACIONES DE SESIÓN
-- El cliente califica al finalizar y el vet puede dejar notas.
-- ============================================================

CREATE TABLE tele_ratings (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    session_id       INT UNSIGNED  NOT NULL,
    -- Calificación del cliente
    client_rating        TINYINT UNSIGNED,     -- 1-5 estrellas
    client_comment       TEXT,
    client_rated_at      DATETIME,
    -- Indicadores específicos
    rating_connection    TINYINT UNSIGNED,     -- calidad de conexión 1-5
    rating_vet_attention TINYINT UNSIGNED,     -- atención del vet 1-5
    rating_resolution    TINYINT UNSIGNED,     -- si resolvió el problema 1-5
    would_recommend      TINYINT(1),
    -- Feedback interno del vet (no visible al cliente)
    vet_internal_notes   TEXT,
    client_cooperation   ENUM('excellent','good','fair','poor'),
    case_complexity      ENUM('simple','moderate','complex'),
    PRIMARY KEY (id),
    UNIQUE KEY uq_trat_session (session_id),
    CONSTRAINT fk_trat_session FOREIGN KEY (session_id) REFERENCES tele_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TRIGGERS TELECONSULTA
-- ============================================================
DELIMITER $$

-- Al completar la sesión, descuenta una sesión de la suscripción.
CREATE TRIGGER trg_tele_sessions_after_update
AFTER UPDATE ON tele_sessions
FOR EACH ROW
BEGIN
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        -- Descontar sesión del plan si existe
        IF NEW.subscription_id IS NOT NULL THEN
            UPDATE tele_plan_subscriptions
               SET sessions_used      = sessions_used + 1,
                   sessions_remaining = GREATEST(0, sessions_remaining - 1),
                   status = CASE
                       WHEN (sessions_remaining - 1) <= 0 THEN 'exhausted'
                       WHEN expires_at < CURDATE()        THEN 'expired'
                       ELSE 'active'
                   END
            WHERE id = NEW.subscription_id;
        END IF;

        -- Calcular duración real
        IF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
            UPDATE tele_sessions
               SET actual_duration_min = TIMESTAMPDIFF(MINUTE, NEW.started_at, NEW.ended_at)
            WHERE id = NEW.id;
        END IF;
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- VISTAS TELECONSULTA
-- ============================================================

CREATE OR REPLACE VIEW v_tele_today AS
SELECT
    ts.id                  AS session_id,
    ts.uuid,
    ts.scheduled_at,
    ts.duration_minutes,
    ts.status,
    ts.session_type,
    ts.chief_complaint,
    tp.name                AS platform,
    -- Paciente
    p.id                   AS patient_id,
    p.name                 AS patient_name,
    sp.common_name         AS species,
    -- Cliente
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.whatsapp, c.email,
    -- Veterinario
    CONCAT(u.first_name,' ',u.last_name) AS vet_name,
    ts.meeting_url,
    -- Pre-anamnesis enviada
    CASE WHEN tpa.id IS NOT NULL THEN 1 ELSE 0 END AS pre_anamnesis_received,
    tpa.client_urgency,
    -- Tiempo hasta la sesión
    TIMESTAMPDIFF(MINUTE, NOW(), ts.scheduled_at) AS minutes_until_session
FROM tele_sessions ts
JOIN tele_platforms tp     ON tp.id  = ts.platform_id
JOIN patients p            ON p.id   = ts.patient_id
JOIN species sp            ON sp.id  = p.species_id
JOIN clients c             ON c.id   = ts.client_id
JOIN users u               ON u.id   = ts.veterinarian_id
LEFT JOIN tele_pre_anamnesis tpa ON tpa.session_id = ts.id
WHERE DATE(ts.scheduled_at) = CURDATE()
  AND ts.status NOT IN ('cancelled','missed')
ORDER BY ts.scheduled_at ASC;

CREATE OR REPLACE VIEW v_tele_vet_stats AS
SELECT
    u.id                   AS vet_id,
    CONCAT(u.first_name,' ',u.last_name) AS vet_name,
    u.organization_id,
    COUNT(ts.id)           AS total_sessions,
    SUM(ts.status = 'completed')  AS completed,
    SUM(ts.status = 'missed')     AS missed,
    SUM(ts.status = 'cancelled')  AS cancelled,
    ROUND(SUM(ts.status = 'completed') / NULLIF(COUNT(ts.id),0) * 100, 1) AS completion_pct,
    ROUND(AVG(CASE WHEN ts.status = 'completed' THEN ts.actual_duration_min END), 1) AS avg_duration_min,
    ROUND(AVG(tr.client_rating), 2) AS avg_rating,
    SUM(ts.requires_in_person) AS derivaciones_presenciales
FROM users u
JOIN tele_sessions ts ON ts.veterinarian_id = u.id
LEFT JOIN tele_ratings tr ON tr.session_id = ts.id
GROUP BY u.id, u.first_name, u.last_name, u.organization_id;

-- ============================================================
-- SEED: PLATAFORMAS
-- ============================================================

INSERT INTO tele_platforms (name, code, requires_link) VALUES
('Zoom',              'ZOOM',     1),
('Google Meet',       'GMEET',    1),
('WhatsApp Video',    'WHATSAPP', 0),
('Microsoft Teams',   'TEAMS',    1),
('Plataforma Propia', 'CUSTOM',   1),
('Jitsi Meet',        'JITSI',    1);

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- VETMANAGER SAAS v2.0
-- ARCHIVO 11: MÓDULO DE PELUQUERÍA / GROOMING DETALLADO
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- CATÁLOGO DE SERVICIOS DE GROOMING
-- ============================================================

CREATE TABLE grooming_service_types (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED,
    name             VARCHAR(100)      NOT NULL,
    description      TEXT,
    applicable_species JSON,            -- array de species_id
    -- Clasificación
    category         ENUM('bath','haircut','full_grooming','nail_trim',
                          'ear_cleaning','dental_brushing','anal_glands',
                          'dematting','medicated_bath','spa','other') NOT NULL,
    -- Duración y precio base (varían según tamaño)
    base_price       DECIMAL(12,2),
    currency         CHAR(3)           NOT NULL DEFAULT 'USD',
    -- Duración aproximada según tamaño
    duration_small_min  SMALLINT UNSIGNED,
    duration_medium_min SMALLINT UNSIGNED,
    duration_large_min  SMALLINT UNSIGNED,
    duration_giant_min  SMALLINT UNSIGNED,
    -- Precio según tamaño (puede variar por tamaño del animal)
    price_small      DECIMAL(12,2),
    price_medium     DECIMAL(12,2),
    price_large      DECIMAL(12,2),
    price_giant      DECIMAL(12,2),
    -- Requisitos
    requires_health_check  TINYINT(1)  NOT NULL DEFAULT 0,
    requires_vaccination   TINYINT(1)  NOT NULL DEFAULT 1,
    min_age_weeks          TINYINT UNSIGNED,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_gst_org (organization_id),
    CONSTRAINT fk_gst_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAQUETES DE GROOMING (combos)
-- ============================================================

CREATE TABLE grooming_packages (
    id               SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id  INT UNSIGNED      NOT NULL,
    name             VARCHAR(100)      NOT NULL,
    description      TEXT,
    applicable_species JSON,
    services_included  JSON,            -- array de grooming_service_type_id
    price_small      DECIMAL(12,2),
    price_medium     DECIMAL(12,2),
    price_large      DECIMAL(12,2),
    price_giant      DECIMAL(12,2),
    currency         CHAR(3)           NOT NULL DEFAULT 'USD',
    sessions_count   TINYINT UNSIGNED  NOT NULL DEFAULT 1,   -- 1 sesión o pack
    validity_days    SMALLINT UNSIGNED,
    discount_pct     DECIMAL(5,2)      NOT NULL DEFAULT 0,
    active           TINYINT(1)        NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_gpkg_org (organization_id),
    CONSTRAINT fk_gpkg_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- GROOMERS (personal de peluquería)
-- Se vinculan a usuarios existentes con rol 'groomer'.
-- ============================================================

CREATE TABLE groomers (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id          INT UNSIGNED  NOT NULL,
    branch_id        INT UNSIGNED  NOT NULL,
    display_name     VARCHAR(100)  NOT NULL,
    bio              TEXT,
    specializations  JSON,          -- ["canine","feline","nordic_breeds",...]
    certifications   JSON,          -- [{name,issuer,year}]
    photo_url        VARCHAR(300),
    -- Disponibilidad por defecto (horarios)
    working_days     JSON,          -- [1,2,3,4,5] (lun-vie)
    start_time       TIME          NOT NULL DEFAULT '09:00:00',
    end_time         TIME          NOT NULL DEFAULT '18:00:00',
    slot_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    active           TINYINT(1)    NOT NULL DEFAULT 1,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_groomer_user_branch (user_id, branch_id),
    KEY fk_gr_user   (user_id),
    KEY fk_gr_branch (branch_id),
    CONSTRAINT fk_gr_user   FOREIGN KEY (user_id)   REFERENCES users(id),
    CONSTRAINT fk_gr_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PREFERENCIAS DE GROOMING POR PACIENTE
-- Historial de cómo le gusta el corte, productos, etc.
-- ============================================================

CREATE TABLE patient_grooming_profile (
    id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    patient_id        INT UNSIGNED  NOT NULL,
    -- Preferencias de corte
    preferred_cut_style    VARCHAR(200),
    cut_description        TEXT,
    cut_reference_photo_url VARCHAR(500),
    -- Comportamiento
    behavior_during_grooming ENUM('excellent','calm','nervous','aggressive',
                                   'needs_muzzle','sedation_recommended'),
    behavior_notes         TEXT,
    muzzle_required        TINYINT(1)   NOT NULL DEFAULT 0,
    -- Alergias a productos
    product_allergies      TEXT,
    -- Condiciones de piel/pelaje
    skin_conditions        TEXT,
    coat_conditions        TEXT,
    -- Productos preferidos
    preferred_shampoo      VARCHAR(200),
    preferred_conditioner  VARCHAR(200),
    preferred_perfume      VARCHAR(200),
    avoid_products         TEXT,
    -- Instrucciones especiales del dueño
    owner_special_instructions TEXT,
    -- Groomer preferido
    preferred_groomer_id   INT UNSIGNED,
    updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pgp_patient (patient_id),
    KEY fk_pgp_pat    (patient_id),
    KEY fk_pgp_gromer (preferred_groomer_id),
    CONSTRAINT fk_pgp_pat    FOREIGN KEY (patient_id)          REFERENCES patients(id),
    CONSTRAINT fk_pgp_gromer FOREIGN KEY (preferred_groomer_id) REFERENCES groomers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TURNOS DE GROOMING
-- ============================================================

CREATE TABLE grooming_appointments (
    id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    uuid             CHAR(36)          NOT NULL DEFAULT (UUID()),
    organization_id  INT UNSIGNED      NOT NULL,
    branch_id        INT UNSIGNED      NOT NULL,
    patient_id       INT UNSIGNED      NOT NULL,
    client_id        INT UNSIGNED      NOT NULL,
    groomer_id       INT UNSIGNED,
    package_id       SMALLINT UNSIGNED,
    scheduled_at     DATETIME          NOT NULL,
    estimated_duration_min SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    status           ENUM('pending','confirmed','patient_arrived','in_progress',
                          'ready_for_pickup','completed','cancelled','no_show')
                     NOT NULL DEFAULT 'pending',
    priority         ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
    -- Servicios a realizar
    services_requested JSON,            -- array de grooming_service_type_id
    notes_for_groomer TEXT,
    booked_by        INT UNSIGNED,
    booking_channel  ENUM('in_person','phone','web','app','whatsapp'),
    -- Control de tiempo
    arrived_at       DATETIME,
    started_at       DATETIME,
    finished_at      DATETIME,
    pickup_notified_at DATETIME,        -- cuando se avisa que está listo
    picked_up_at     DATETIME,
    -- Cancelación
    cancelled_by     ENUM('client','groomer','branch'),
    cancellation_reason TEXT,
    -- Facturación
    invoice_id       INT UNSIGNED,
    created_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ga_uuid (uuid),
    KEY fk_ga_org    (organization_id),
    KEY fk_ga_branch (branch_id),
    KEY fk_ga_pat    (patient_id),
    KEY fk_ga_client (client_id),
    KEY fk_ga_grm    (groomer_id),
    KEY fk_ga_pkg    (package_id),
    KEY fk_ga_booked (booked_by),
    KEY fk_ga_inv    (invoice_id),
    KEY idx_ga_sched (scheduled_at, branch_id),
    KEY idx_ga_status (status),
    CONSTRAINT fk_ga_org    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_ga_branch FOREIGN KEY (branch_id)       REFERENCES branches(id),
    CONSTRAINT fk_ga_pat    FOREIGN KEY (patient_id)      REFERENCES patients(id),
    CONSTRAINT fk_ga_client FOREIGN KEY (client_id)       REFERENCES clients(id),
    CONSTRAINT fk_ga_grm    FOREIGN KEY (groomer_id)      REFERENCES groomers(id),
    CONSTRAINT fk_ga_pkg    FOREIGN KEY (package_id)      REFERENCES grooming_packages(id),
    CONSTRAINT fk_ga_booked FOREIGN KEY (booked_by)       REFERENCES users(id),
    CONSTRAINT fk_ga_inv    FOREIGN KEY (invoice_id)      REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- REGISTRO DE SESIÓN DE GROOMING
-- Lo que realmente se realizó durante la sesión.
-- ============================================================

CREATE TABLE grooming_records (
    id                     INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    grooming_appointment_id INT UNSIGNED     NOT NULL,
    groomer_id             INT UNSIGNED      NOT NULL,
    -- Condición al ingreso
    coat_condition_arrival ENUM('excellent','good','fair','matted','very_matted','poor'),
    skin_condition_arrival TEXT,
    ectoparasites_found    TINYINT(1)        NOT NULL DEFAULT 0,
    ectoparasites_notes    TEXT,
    injuries_found         TINYINT(1)        NOT NULL DEFAULT 0,
    injuries_description   TEXT,             -- heridas, irritaciones, masas encontradas
    -- Servicios efectivamente realizados
    services_performed     JSON,             -- [{service_id, service_name, price}]
    -- Detalles del corte
    cut_style_applied      VARCHAR(200),
    cut_notes              TEXT,
    -- Productos utilizados
    shampoo_used           VARCHAR(200),
    conditioner_used       VARCHAR(200),
    other_products_used    JSON,             -- [{product, amount}]
    -- Comportamiento durante sesión
    behavior               ENUM('excellent','calm','nervous','aggressive','needs_muzzle'),
    behavior_notes         TEXT,
    sedation_required      TINYINT(1)        NOT NULL DEFAULT 0,
    -- Hallazgos para el veterinario
    vet_referral_needed    TINYINT(1)        NOT NULL DEFAULT 0,
    vet_referral_reason    TEXT,             -- hallazgo que requiere atención médica
    -- Fotos antes/después (URLs al servidor de imágenes externo)
    photos_before          JSON,             -- array de URLs
    photos_after           JSON,             -- array de URLs
    -- Tiempo real
    duration_minutes       SMALLINT UNSIGNED,
    -- Observaciones generales
    general_notes          TEXT,
    next_appointment_recommended_weeks TINYINT UNSIGNED,
    created_at             TIMESTAMP         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_gr_appt (grooming_appointment_id),
    KEY fk_grr_appt   (grooming_appointment_id),
    KEY fk_grr_gromer (groomer_id),
    CONSTRAINT fk_grr_appt   FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments(id),
    CONSTRAINT fk_grr_gromer FOREIGN KEY (groomer_id)              REFERENCES groomers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMISIONES DE GROOMERS
-- ============================================================

CREATE TABLE groomer_commissions (
    id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    groomer_id       INT UNSIGNED  NOT NULL,
    organization_id  INT UNSIGNED  NOT NULL,
    commission_type  ENUM('fixed','percentage') NOT NULL DEFAULT 'percentage',
    commission_value DECIMAL(8,4)  NOT NULL,    -- % o monto fijo
    applies_to       ENUM('all','services','packages') NOT NULL DEFAULT 'all',
    effective_from   DATE          NOT NULL,
    effective_until  DATE,
    active           TINYINT(1)    NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY fk_gc_grm (groomer_id),
    KEY fk_gc_org (organization_id),
    CONSTRAINT fk_gc_grm FOREIGN KEY (groomer_id)      REFERENCES groomers(id),
    CONSTRAINT fk_gc_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE groomer_commission_records (
    id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    groomer_id             INT UNSIGNED  NOT NULL,
    grooming_appointment_id INT UNSIGNED NOT NULL,
    invoice_id             INT UNSIGNED,
    service_total          DECIMAL(12,2) NOT NULL,
    commission_pct         DECIMAL(8,4)  NOT NULL,
    commission_amount      DECIMAL(12,2) NOT NULL,
    period_month           DATE          NOT NULL,    -- primer día del mes
    paid                   TINYINT(1)    NOT NULL DEFAULT 0,
    paid_at                DATETIME,
    paid_by                INT UNSIGNED,
    created_at             TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY fk_gcr_grm  (groomer_id),
    KEY fk_gcr_appt (grooming_appointment_id),
    KEY fk_gcr_inv  (invoice_id),
    CONSTRAINT fk_gcr_grm  FOREIGN KEY (groomer_id)              REFERENCES groomers(id),
    CONSTRAINT fk_gcr_appt FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments(id),
    CONSTRAINT fk_gcr_inv  FOREIGN KEY (invoice_id)              REFERENCES invoices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CALIFICACIONES DE GROOMING
-- ============================================================

CREATE TABLE grooming_ratings (
    id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    grooming_appointment_id INT UNSIGNED NOT NULL,
    client_rating          TINYINT UNSIGNED,        -- 1-5
    client_comment         TEXT,
    rated_at               DATETIME,
    would_recommend        TINYINT(1),
    -- Dimensiones específicas
    rating_cut_quality     TINYINT UNSIGNED,        -- calidad del corte 1-5
    rating_time            TINYINT UNSIGNED,        -- puntualidad 1-5
    rating_treatment       TINYINT UNSIGNED,        -- trato al animal 1-5
    rating_value           TINYINT UNSIGNED,        -- relación precio/calidad 1-5
    PRIMARY KEY (id),
    UNIQUE KEY uq_grrat_appt (grooming_appointment_id),
    CONSTRAINT fk_grrat_appt FOREIGN KEY (grooming_appointment_id) REFERENCES grooming_appointments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TRIGGERS GROOMING
-- ============================================================
DELIMITER $$

-- Al completar grooming: crear recordatorio para próxima sesión,
-- calcular comisión y avisar al cliente que puede retirar.
CREATE TRIGGER trg_grooming_appt_after_update
AFTER UPDATE ON grooming_appointments
FOR EACH ROW
BEGIN
    DECLARE v_org_id        INT;
    DECLARE v_comm_pct      DECIMAL(8,4);
    DECLARE v_invoice_total DECIMAL(12,2);
    DECLARE v_comm_amount   DECIMAL(12,2);
    DECLARE v_client_id     INT;
    DECLARE v_channel       VARCHAR(30);
    DECLARE v_pat_name      VARCHAR(100);
    DECLARE v_next_weeks    TINYINT UNSIGNED;

    SELECT organization_id INTO v_org_id FROM branches WHERE id = NEW.branch_id;

    -- Notificar al cliente cuando esté listo para retirar
    IF OLD.status != 'ready_for_pickup' AND NEW.status = 'ready_for_pickup' THEN
        UPDATE grooming_appointments
           SET pickup_notified_at = NOW()
        WHERE id = NEW.id;
    END IF;

    -- Al completar: calcular comisión y generar recordatorio
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        -- Obtener groomer commission
        IF NEW.groomer_id IS NOT NULL AND NEW.invoice_id IS NOT NULL THEN
            SELECT gc.commission_value INTO v_comm_pct
            FROM groomer_commissions gc
            WHERE gc.groomer_id = NEW.groomer_id
              AND gc.active     = 1
              AND gc.effective_from <= CURDATE()
              AND (gc.effective_until IS NULL OR gc.effective_until >= CURDATE())
            LIMIT 1;

            SELECT total INTO v_invoice_total
            FROM invoices WHERE id = NEW.invoice_id;

            IF v_comm_pct IS NOT NULL AND v_invoice_total IS NOT NULL THEN
                SET v_comm_amount = v_invoice_total * v_comm_pct / 100;
                INSERT INTO groomer_commission_records
                    (groomer_id, grooming_appointment_id, invoice_id,
                     service_total, commission_pct, commission_amount,
                     period_month, paid)
                VALUES
                    (NEW.groomer_id, NEW.id, NEW.invoice_id,
                     v_invoice_total, v_comm_pct, v_comm_amount,
                     DATE_FORMAT(CURDATE(),'%Y-%m-01'), 0);
            END IF;
        END IF;

        -- Recordatorio para próxima sesión según recomendación del groomer
        SELECT gr.next_appointment_recommended_weeks INTO v_next_weeks
        FROM grooming_records gr WHERE gr.grooming_appointment_id = NEW.id;

        IF v_next_weeks IS NOT NULL AND v_next_weeks > 0 THEN
            SELECT c.id, COALESCE(c.communication_preference,'whatsapp'), p.name
              INTO v_client_id, v_channel, v_pat_name
            FROM clients c
            JOIN patients p ON p.id = NEW.patient_id
            WHERE c.id = NEW.client_id;

            INSERT INTO reminders
                (organization_id, patient_id, client_id, reminder_type,
                 due_date, message, channel, status)
            VALUES
                (v_org_id, NEW.patient_id, NEW.client_id, 'other',
                 DATE_ADD(CURDATE(), INTERVAL v_next_weeks WEEK),
                 CONCAT('Es hora del próximo baño/corte de ',
                        v_pat_name, '. ¡Te esperamos!'),
                 v_channel, 'pending');
        END IF;
    END IF;
END$$

-- Al crear registro de grooming con hallazgos médicos,
-- crear una alerta para que el veterinario lo evalúe.
CREATE TRIGGER trg_grooming_records_after_insert
AFTER INSERT ON grooming_records
FOR EACH ROW
BEGIN
    DECLARE v_org_id    INT;
    DECLARE v_pat_name  VARCHAR(100);
    DECLARE v_branch_id INT;

    IF NEW.vet_referral_needed = 1 OR NEW.injuries_found = 1 THEN
        SELECT ga.branch_id INTO v_branch_id
        FROM grooming_appointments ga WHERE ga.id = NEW.grooming_appointment_id;

        SELECT o.id, p.name INTO v_org_id, v_pat_name
        FROM grooming_appointments ga
        JOIN patients p ON p.id = ga.patient_id
        JOIN branches br ON br.id = ga.branch_id
        JOIN organizations o ON o.id = br.organization_id
        WHERE ga.id = NEW.grooming_appointment_id;

        INSERT INTO security_alerts
            (organization_id, user_id, alert_type, severity, description, metadata)
        VALUES
            (v_org_id, NEW.groomer_id, 'suspicious_ip', 'warning',
             CONCAT('🐾 HALLAZGO EN GROOMING — Paciente: ', v_pat_name,
                    IF(NEW.injuries_found = 1, ' | Heridas/lesiones detectadas.', ''),
                    IF(NEW.vet_referral_needed = 1,
                       CONCAT(' | Derivación veterinaria: ', NEW.vet_referral_reason), '')),
             JSON_OBJECT(
                 'grooming_appointment_id', NEW.grooming_appointment_id,
                 'injuries_found',         NEW.injuries_found,
                 'vet_referral_needed',    NEW.vet_referral_needed,
                 'vet_referral_reason',    NEW.vet_referral_reason,
                 'alert_type',             'grooming_finding'
             ));
    END IF;
END$$

DELIMITER ;

-- ============================================================
-- VISTAS GROOMING
-- ============================================================

CREATE OR REPLACE VIEW v_grooming_today AS
SELECT
    ga.id                  AS appointment_id,
    ga.uuid,
    ga.scheduled_at,
    ga.estimated_duration_min,
    ga.status,
    br.name                AS branch_name,
    -- Paciente
    p.id                   AS patient_id,
    p.name                 AS patient_name,
    sp.common_name         AS species,
    b.name                 AS breed,
    p.weight_kg,
    -- Perfil grooming
    pgp.behavior_during_grooming,
    pgp.muzzle_required,
    pgp.preferred_cut_style,
    pgp.preferred_shampoo,
    pgp.owner_special_instructions,
    -- Propietario
    CONCAT(c.first_name,' ',c.last_name) AS owner_name,
    c.phone_primary, c.whatsapp,
    -- Groomer
    g.display_name         AS groomer_name,
    -- Última sesión
    (SELECT DATE(ga2.scheduled_at) FROM grooming_appointments ga2
     WHERE ga2.patient_id = p.id AND ga2.status = 'completed'
     ORDER BY ga2.scheduled_at DESC LIMIT 1) AS last_grooming_date,
    ga.notes_for_groomer
FROM grooming_appointments ga
JOIN branches br              ON br.id = ga.branch_id
JOIN patients p               ON p.id  = ga.patient_id
JOIN species sp               ON sp.id = p.species_id
LEFT JOIN breeds b            ON b.id  = p.breed_id
JOIN clients c                ON c.id  = ga.client_id
LEFT JOIN groomers g          ON g.id  = ga.groomer_id
LEFT JOIN patient_grooming_profile pgp ON pgp.patient_id = p.id
WHERE DATE(ga.scheduled_at) = CURDATE()
  AND ga.status NOT IN ('cancelled','no_show')
ORDER BY ga.scheduled_at ASC;

CREATE OR REPLACE VIEW v_groomer_performance AS
SELECT
    g.id                   AS groomer_id,
    g.display_name,
    g.branch_id,
    br.name                AS branch_name,
    COUNT(ga.id)           AS total_appointments,
    SUM(ga.status = 'completed')  AS completed,
    SUM(ga.status = 'no_show')    AS no_shows,
    SUM(ga.status = 'cancelled')  AS cancelled,
    ROUND(AVG(gr2.client_rating), 2) AS avg_rating,
    ROUND(AVG(gr.duration_minutes), 1) AS avg_duration_min,
    COALESCE(SUM(gcr.commission_amount), 0) AS total_commissions_earned,
    COALESCE(SUM(CASE WHEN gcr.paid = 1 THEN gcr.commission_amount END), 0) AS commissions_paid,
    COALESCE(SUM(CASE WHEN gcr.paid = 0 THEN gcr.commission_amount END), 0) AS commissions_pending
FROM groomers g
JOIN branches br ON br.id = g.branch_id
LEFT JOIN grooming_appointments ga ON ga.groomer_id = g.id
LEFT JOIN grooming_records gr      ON gr.grooming_appointment_id = ga.id
LEFT JOIN grooming_ratings gr2     ON gr2.grooming_appointment_id = ga.id
LEFT JOIN groomer_commission_records gcr ON gcr.groomer_id = g.id
WHERE g.active = 1
GROUP BY g.id, g.display_name, g.branch_id, br.name;

-- ============================================================
-- SEED: TIPOS DE SERVICIO DE GROOMING
-- ============================================================

INSERT INTO grooming_service_types
    (name, category, applicable_species,
     duration_small_min, duration_medium_min, duration_large_min, duration_giant_min,
     price_small, price_medium, price_large, price_giant,
     requires_vaccination, active)
VALUES
('Baño y Secado',             'bath',          '[1,2]', 45,60,90,120,  1500,2500,3500,5000, 1,1),
('Corte de Pelo',             'haircut',        '[1,2]', 45,60,90,120,  2000,3000,4500,6000, 1,1),
('Baño + Corte Completo',     'full_grooming',  '[1,2]', 75,105,150,180,3000,5000,7000,9500, 1,1),
('Corte de Uñas',             'nail_trim',      '[1,2]', 15,15,20,20,    500,500,700,700,    1,1),
('Limpieza de Oídos',         'ear_cleaning',   '[1,2]', 15,15,20,20,    400,400,600,600,    1,1),
('Cepillado Dental',          'dental_brushing','[1,2]', 20,20,25,25,    600,600,800,800,    1,1),
('Vaciado de Glándulas Anales','anal_glands',   '[1]',   20,20,25,30,    500,500,700,700,    1,1),
('Desmattado',                'dematting',      '[1,2]', 60,90,120,180,  2500,3500,5000,7000,1,1),
('Baño Medicado',             'medicated_bath', '[1,2]', 60,75,90,120,   2000,3000,4500,6000,1,1),
('Spa Completo',              'spa',            '[1,2]', 90,120,150,180, 4500,6500,9000,12000,1,1),
('Baño + Corte para Gatos',   'full_grooming',  '[2]',   60,75,NULL,NULL,4000,5000,NULL,NULL, 1,1);

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
--  VetManager Pro — Módulo 12: REPORTES EJECUTIVOS
--  Motor: MySQL 8.0+ / InnoDB / utf8mb4_unicode_ci
--  Descripción: KPIs, dashboards ejecutivos, métricas SaaS
--  Orden de creación: archivo 12 de 12
-- ============================================================

USE vetmanager;

-- ============================================================
-- SECCIÓN 1: VISTAS DE REPORTES EJECUTIVOS
-- ============================================================

-- ----------------------------------------------------------
-- 1.1 Ingresos mensuales por sucursal (últimos 24 meses)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_monthly_by_branch AS
SELECT
    o.id                                            AS organization_id,
    o.name                                          AS organization,
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    c.code                                          AS currency,
    YEAR(i.issued_date)                             AS year,
    MONTH(i.issued_date)                            AS month,
    DATE_FORMAT(i.issued_date, '%Y-%m')             AS period,
    COUNT(DISTINCT i.id)                            AS total_invoices,
    COUNT(DISTINCT i.patient_id)                    AS unique_patients,
    SUM(i.subtotal)                                 AS subtotal,
    SUM(i.tax_amount)                               AS tax_total,
    SUM(i.discount_amount)                          AS discount_total,
    SUM(i.total_amount)                             AS gross_revenue,
    SUM(i.paid_amount)                              AS collected_revenue,
    SUM(i.total_amount - i.paid_amount)             AS outstanding,
    COUNT(DISTINCT CASE WHEN i.status = 'paid'     THEN i.id END) AS invoices_paid,
    COUNT(DISTINCT CASE WHEN i.status = 'overdue'  THEN i.id END) AS invoices_overdue,
    COUNT(DISTINCT CASE WHEN i.status = 'cancelled'THEN i.id END) AS invoices_cancelled,
    ROUND(SUM(i.paid_amount) / NULLIF(SUM(i.total_amount),0) * 100, 2) AS collection_rate_pct
FROM invoices i
JOIN branches   b ON i.branch_id   = b.id
JOIN organizations o ON b.organization_id = o.id
JOIN currencies c ON i.currency_id = c.id
WHERE i.issued_date >= DATE_SUB(CURDATE(), INTERVAL 24 MONTH)
  AND i.status <> 'draft'
GROUP BY o.id, o.name, b.id, b.name, c.code,
         YEAR(i.issued_date), MONTH(i.issued_date);

-- ----------------------------------------------------------
-- 1.2 Ingresos por tipo de servicio (mix de servicios)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_revenue_by_service_type AS
SELECT
    o.id                                        AS organization_id,
    o.name                                      AS organization,
    b.id                                        AS branch_id,
    b.name                                      AS branch,
    DATE_FORMAT(i.issued_date, '%Y-%m')         AS period,
    sc.name                                     AS service_category,
    ii.description                              AS service_name,
    COUNT(*)                                    AS qty_sold,
    SUM(ii.quantity)                            AS total_units,
    SUM(ii.subtotal)                            AS revenue,
    SUM(ii.discount_amount)                     AS discounts,
    ROUND(AVG(ii.unit_price), 2)                AS avg_unit_price,
    ROUND(SUM(ii.subtotal) / NULLIF(SUM(SUM(ii.subtotal)) OVER (
        PARTITION BY b.id, DATE_FORMAT(i.issued_date,'%Y-%m')
    ), 0) * 100, 2)                             AS revenue_share_pct
FROM invoice_items  ii
JOIN invoices       i  ON ii.invoice_id     = i.id
JOIN branches       b  ON i.branch_id       = b.id
JOIN organizations  o  ON b.organization_id = o.id
LEFT JOIN services_catalog sc2 ON ii.service_id = sc2.id
LEFT JOIN service_categories sc ON sc2.category_id = sc.id
WHERE i.issued_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
  AND i.status <> 'cancelled'
GROUP BY o.id, o.name, b.id, b.name,
         DATE_FORMAT(i.issued_date,'%Y-%m'),
         sc.name, ii.description;

-- ----------------------------------------------------------
-- 1.3 Top 20 clientes por gasto acumulado
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_top_clients AS
SELECT
    b.id                                                AS branch_id,
    b.name                                              AS branch,
    cl.id                                               AS client_id,
    CONCAT(cl.first_name,' ',cl.last_name)              AS client_name,
    cl.email,
    cl.phone,
    COUNT(DISTINCT i.id)                                AS total_invoices,
    COUNT(DISTINCT i.patient_id)                        AS pets,
    SUM(i.total_amount)                                 AS lifetime_value,
    SUM(i.paid_amount)                                  AS total_paid,
    cl.outstanding_balance,
    MIN(i.issued_date)                                  AS first_invoice,
    MAX(i.issued_date)                                  AS last_invoice,
    DATEDIFF(MAX(i.issued_date), MIN(i.issued_date))    AS tenure_days,
    ROUND(SUM(i.total_amount) / NULLIF(COUNT(DISTINCT i.id), 0), 2) AS avg_ticket,
    DENSE_RANK() OVER (PARTITION BY b.id ORDER BY SUM(i.total_amount) DESC) AS revenue_rank
FROM clients    cl
JOIN invoices   i  ON i.client_id  = cl.id
JOIN branches   b  ON i.branch_id  = b.id
WHERE i.status <> 'cancelled'
GROUP BY b.id, b.name, cl.id, cl.first_name, cl.last_name,
         cl.email, cl.phone, cl.outstanding_balance;

-- ----------------------------------------------------------
-- 1.4 Adquisición de pacientes nuevos por mes
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_new_patients_monthly AS
SELECT
    b.id                                    AS branch_id,
    b.name                                  AS branch,
    o.name                                  AS organization,
    DATE_FORMAT(p.created_at, '%Y-%m')      AS period,
    YEAR(p.created_at)                      AS year,
    MONTH(p.created_at)                     AS month,
    COUNT(*)                                AS new_patients,
    COUNT(DISTINCT p.species_id)            AS species_diversity,
    SUM(CASE WHEN p.sex = 'male'   THEN 1 ELSE 0 END) AS males,
    SUM(CASE WHEN p.sex = 'female' THEN 1 ELSE 0 END) AS females,
    SUM(CASE WHEN p.is_sterilized  THEN 1 ELSE 0 END) AS sterilized,
    LAG(COUNT(*)) OVER (PARTITION BY b.id ORDER BY DATE_FORMAT(p.created_at,'%Y-%m')) AS prev_month,
    ROUND(
        (COUNT(*) - LAG(COUNT(*)) OVER (PARTITION BY b.id ORDER BY DATE_FORMAT(p.created_at,'%Y-%m')))
        / NULLIF(LAG(COUNT(*)) OVER (PARTITION BY b.id ORDER BY DATE_FORMAT(p.created_at,'%Y-%m')), 0) * 100
    , 2)                                    AS mom_growth_pct
FROM patients       p
JOIN patient_owners po ON po.patient_id = p.id AND po.ownership_type = 'primary'
JOIN clients        cl ON po.client_id  = cl.id
JOIN branches       b  ON cl.branch_id  = b.id
JOIN organizations  o  ON b.organization_id = o.id
WHERE p.created_at >= DATE_SUB(CURDATE(), INTERVAL 24 MONTH)
  AND p.is_active = TRUE
GROUP BY b.id, b.name, o.name,
         DATE_FORMAT(p.created_at,'%Y-%m'), YEAR(p.created_at), MONTH(p.created_at);

-- ----------------------------------------------------------
-- 1.5 Embudo de citas (agendadas → atendidas → facturadas)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_appointment_funnel AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    DATE_FORMAT(a.scheduled_date, '%Y-%m')          AS period,
    COUNT(*)                                        AS total_scheduled,
    SUM(CASE WHEN a.status = 'confirmed'  THEN 1 ELSE 0 END) AS confirmed,
    SUM(CASE WHEN a.status = 'in_progress'THEN 1 ELSE 0 END) AS in_progress,
    SUM(CASE WHEN a.status = 'completed'  THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN a.status = 'cancelled'  THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN a.status = 'no_show'    THEN 1 ELSE 0 END) AS no_show,
    SUM(CASE WHEN a.is_emergency          THEN 1 ELSE 0 END) AS emergencies,
    COUNT(DISTINCT CASE WHEN mr.id IS NOT NULL THEN a.id END) AS with_medical_record,
    COUNT(DISTINCT CASE WHEN i.id  IS NOT NULL THEN a.id END) AS billed,
    ROUND(SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(*),0) * 100, 2)            AS completion_rate_pct,
    ROUND(COUNT(DISTINCT CASE WHEN i.id IS NOT NULL THEN a.id END)
          / NULLIF(SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END),0) * 100, 2) AS billing_conversion_pct,
    ROUND(SUM(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 ELSE 0 END)
          / NULLIF(COUNT(*),0) * 100, 2)            AS cancellation_rate_pct
FROM appointments       a
JOIN branches           b  ON a.branch_id     = b.id
LEFT JOIN medical_records mr ON mr.appointment_id = a.id
LEFT JOIN invoices       i  ON i.appointment_id  = a.id AND i.status <> 'cancelled'
WHERE a.scheduled_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, DATE_FORMAT(a.scheduled_date, '%Y-%m');

-- ----------------------------------------------------------
-- 1.6 Cumplimiento del plan vacunal por sucursal
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_vaccination_compliance AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    sp.common_name                                  AS species,
    DATE_FORMAT(CURDATE(),'%Y-%m')                  AS period,
    COUNT(DISTINCT p.id)                            AS total_active_patients,
    COUNT(DISTINCT v.patient_id)                    AS patients_vaccinated_12m,
    COUNT(DISTINCT CASE
        WHEN v.next_due_date < CURDATE() THEN v.patient_id
    END)                                            AS patients_overdue,
    COUNT(DISTINCT CASE
        WHEN v.next_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
        THEN v.patient_id
    END)                                            AS patients_due_30days,
    ROUND(COUNT(DISTINCT v.patient_id)
          / NULLIF(COUNT(DISTINCT p.id),0) * 100, 2) AS compliance_rate_pct,
    COUNT(v.id)                                     AS total_vaccinations_12m
FROM patients           p
JOIN patient_owners     po ON po.patient_id = p.id AND po.ownership_type = 'primary'
JOIN clients            cl ON po.client_id  = cl.id
JOIN branches           b  ON cl.branch_id  = b.id
JOIN species            sp ON p.species_id  = sp.id
LEFT JOIN vaccinations  v  ON v.patient_id  = p.id
    AND v.administered_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
WHERE p.is_active = TRUE
GROUP BY b.id, b.name, sp.common_name;

-- ----------------------------------------------------------
-- 1.7 Ocupación de hospitalización por sucursal
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_hospitalization_occupancy AS
SELECT
    b.id                                                AS branch_id,
    b.name                                              AS branch,
    DATE_FORMAT(h.admission_date, '%Y-%m')              AS period,
    COUNT(DISTINCT k.id)                                AS total_kennels,
    COUNT(DISTINCT CASE WHEN k.is_active THEN k.id END) AS available_kennels,
    COUNT(DISTINCT h.id)                                AS total_admissions,
    COUNT(DISTINCT CASE WHEN h.status = 'active'   THEN h.id END) AS currently_admitted,
    COUNT(DISTINCT CASE WHEN h.status = 'discharged'THEN h.id END) AS discharged,
    AVG(CASE WHEN h.status = 'discharged'
        THEN DATEDIFF(h.discharge_date, h.admission_date)
    END)                                                AS avg_stay_days,
    MAX(CASE WHEN h.status = 'discharged'
        THEN DATEDIFF(h.discharge_date, h.admission_date)
    END)                                                AS max_stay_days,
    ROUND(COUNT(DISTINCT CASE WHEN h.status='active' THEN h.id END)
          / NULLIF(COUNT(DISTINCT CASE WHEN k.is_active THEN k.id END),0) * 100,2) AS occupancy_rate_pct
FROM branches           b
JOIN wards              w  ON w.branch_id  = b.id
JOIN kennels            k  ON k.ward_id    = w.id
LEFT JOIN hospitalizations h ON h.kennel_id = k.id
    AND h.admission_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, DATE_FORMAT(h.admission_date, '%Y-%m');

-- ----------------------------------------------------------
-- 1.8 Tiempos de respuesta de laboratorio (TAT)
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_lab_turnaround AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    ltc.name                                        AS test_category,
    DATE_FORMAT(lo.ordered_at, '%Y-%m')             AS period,
    COUNT(lo.id)                                    AS total_orders,
    SUM(CASE WHEN lo.status = 'completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN lo.status = 'pending'   THEN 1 ELSE 0 END) AS pending,
    ROUND(AVG(CASE WHEN lo.status = 'completed'
        THEN TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.resulted_at)
    END), 1)                                        AS avg_tat_hours,
    ROUND(MIN(CASE WHEN lo.status = 'completed'
        THEN TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.resulted_at)
    END), 1)                                        AS min_tat_hours,
    ROUND(MAX(CASE WHEN lo.status = 'completed'
        THEN TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.resulted_at)
    END), 1)                                        AS max_tat_hours,
    SUM(CASE WHEN lo.status = 'completed'
         AND TIMESTAMPDIFF(HOUR, lo.ordered_at, lo.resulted_at) > 24
        THEN 1 ELSE 0 END)                          AS exceeded_24h
FROM lab_orders         lo
JOIN branches           b   ON lo.branch_id  = b.id
JOIN lab_order_items    loi ON loi.order_id  = lo.id
JOIN lab_tests          lt  ON loi.test_id   = lt.id
JOIN lab_test_categories ltc ON lt.category_id = ltc.id
WHERE lo.ordered_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, ltc.name, DATE_FORMAT(lo.ordered_at,'%Y-%m');

-- ----------------------------------------------------------
-- 1.9 KPIs de diagnósticos más frecuentes
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_top_diagnoses AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    sp.common_name                                  AS species,
    DATE_FORMAT(mr.opened_at, '%Y-%m')              AS period,
    d.diagnosis_code                                AS cie_code,
    d.diagnosis_name,
    d.diagnosis_type,
    COUNT(*)                                        AS frequency,
    COUNT(DISTINCT mr.patient_id)                   AS unique_patients,
    ROUND(AVG(DATEDIFF(
        COALESCE(mr.signed_at, CURDATE()), mr.opened_at
    )), 1)                                          AS avg_resolution_days,
    DENSE_RANK() OVER (
        PARTITION BY b.id, DATE_FORMAT(mr.opened_at,'%Y-%m')
        ORDER BY COUNT(*) DESC
    )                                               AS rank_in_period
FROM diagnoses          d
JOIN medical_records    mr ON d.medical_record_id = mr.id
JOIN patients           p  ON mr.patient_id       = p.id
JOIN species            sp ON p.species_id         = sp.id
JOIN appointments       a  ON mr.appointment_id   = a.id
JOIN branches           b  ON a.branch_id          = b.id
WHERE mr.opened_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, sp.common_name,
         DATE_FORMAT(mr.opened_at,'%Y-%m'),
         d.diagnosis_code, d.diagnosis_name, d.diagnosis_type;

-- ----------------------------------------------------------
-- 1.10 Rendimiento de veterinarios
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_vet_performance AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    u.id                                            AS vet_id,
    CONCAT(u.first_name,' ',u.last_name)            AS veterinarian,
    u.license_number,
    DATE_FORMAT(a.scheduled_date, '%Y-%m')          AS period,
    COUNT(DISTINCT a.id)                            AS total_appointments,
    SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN a.status IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS lost,
    COUNT(DISTINCT mr.id)                           AS medical_records_opened,
    COUNT(DISTINCT CASE WHEN mr.status='signed' THEN mr.id END) AS medical_records_signed,
    COUNT(DISTINCT lo.id)                           AS lab_orders,
    COUNT(DISTINCT io.id)                           AS imaging_orders,
    COUNT(DISTINCT s.id)                            AS surgeries,
    COUNT(DISTINCT i.id)                            AS invoices_generated,
    ROUND(SUM(i.total_amount),2)                    AS revenue_generated,
    ROUND(SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(DISTINCT a.id),0)*100,2)   AS completion_rate_pct
FROM users              u
JOIN appointments       a  ON a.vet_id      = u.id
JOIN branches           b  ON a.branch_id   = b.id
LEFT JOIN medical_records mr ON mr.appointment_id = a.id
LEFT JOIN lab_orders    lo ON lo.medical_record_id = mr.id
LEFT JOIN imaging_orders io ON io.medical_record_id= mr.id
LEFT JOIN surgeries     s  ON s.primary_surgeon_id = u.id
    AND DATE_FORMAT(s.surgery_date,'%Y-%m') = DATE_FORMAT(a.scheduled_date,'%Y-%m')
LEFT JOIN invoices       i  ON i.appointment_id = a.id AND i.status <> 'cancelled'
WHERE a.scheduled_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, u.id, u.first_name, u.last_name,
         u.license_number, DATE_FORMAT(a.scheduled_date,'%Y-%m');

-- ----------------------------------------------------------
-- 1.11 Métricas de teleconsulta
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_telemedicine_kpis AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    DATE_FORMAT(ts.scheduled_at, '%Y-%m')           AS period,
    tp.platform_name,
    COUNT(ts.id)                                    AS total_sessions,
    SUM(CASE WHEN ts.status='completed'  THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN ts.status='cancelled'  THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN ts.status='no_show'    THEN 1 ELSE 0 END) AS no_show,
    ROUND(AVG(CASE WHEN ts.status='completed'
        THEN ts.actual_duration_minutes END),1)     AS avg_duration_min,
    COUNT(DISTINCT tdp.id)                          AS digital_prescriptions,
    COUNT(DISTINCT tm.id)                           AS async_messages,
    ROUND(AVG(tr.overall_rating),2)                 AS avg_rating,
    ROUND(SUM(CASE WHEN ts.status='completed' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(ts.id),0)*100,2)           AS completion_rate_pct,
    SUM(CASE WHEN ts.recording_consent=TRUE
             AND ts.status='completed' THEN 1 ELSE 0 END) AS recorded_sessions
FROM tele_sessions          ts
JOIN branches               b  ON ts.branch_id   = b.id
JOIN tele_platforms         tp ON ts.platform_id  = tp.id
LEFT JOIN tele_digital_prescriptions tdp ON tdp.tele_session_id = ts.id
LEFT JOIN tele_messages             tm  ON tm.session_id        = ts.id
LEFT JOIN tele_ratings              tr  ON tr.session_id        = ts.id
WHERE ts.scheduled_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, DATE_FORMAT(ts.scheduled_at,'%Y-%m'), tp.platform_name;

-- ----------------------------------------------------------
-- 1.12 Métricas de grooming
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_grooming_kpis AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    DATE_FORMAT(ga.scheduled_date, '%Y-%m')         AS period,
    COUNT(ga.id)                                    AS total_appointments,
    SUM(CASE WHEN ga.status='completed' THEN 1 ELSE 0 END) AS completed,
    SUM(CASE WHEN ga.status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
    SUM(CASE WHEN ga.status='no_show'   THEN 1 ELSE 0 END) AS no_show,
    COUNT(DISTINCT ga.patient_id)                   AS unique_pets,
    COUNT(DISTINCT ga.groomer_id)                   AS active_groomers,
    ROUND(SUM(ga.final_price),2)                    AS gross_revenue,
    ROUND(AVG(ga.final_price),2)                    AS avg_ticket,
    ROUND(AVG(gr.overall_rating),2)                 AS avg_rating,
    SUM(CASE WHEN gr.vet_referral_needed THEN 1 ELSE 0 END) AS vet_referrals,
    SUM(CASE WHEN ga.pickup_requested    THEN 1 ELSE 0 END) AS pickup_services,
    ROUND(SUM(CASE WHEN ga.status='completed' THEN 1 ELSE 0 END)
          / NULLIF(COUNT(ga.id),0)*100,2)           AS completion_rate_pct
FROM grooming_appointments  ga
JOIN branches               b  ON ga.branch_id = b.id
LEFT JOIN grooming_records  gr ON gr.appointment_id = ga.id
LEFT JOIN grooming_ratings  grt ON grt.appointment_id = ga.id
WHERE ga.scheduled_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
GROUP BY b.id, b.name, DATE_FORMAT(ga.scheduled_date,'%Y-%m');

-- ----------------------------------------------------------
-- 1.13 Resumen SaaS: uso de planes por organización
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_saas_plan_summary AS
SELECT
    o.id                                            AS organization_id,
    o.name                                          AS organization,
    o.country_code,
    sp.name                                         AS plan_name,
    sp.tier,
    o.subscription_status,
    o.subscription_start,
    o.subscription_end,
    DATEDIFF(o.subscription_end, CURDATE())         AS days_to_renewal,
    sp.price_usd                                    AS plan_price_usd,
    COUNT(DISTINCT b.id)                            AS active_branches,
    sp.max_branches                                 AS plan_max_branches,
    COUNT(DISTINCT u.id)                            AS active_users,
    sp.max_users                                    AS plan_max_users,
    COUNT(DISTINCT p.id)                            AS total_patients,
    sp.max_patients                                 AS plan_max_patients,
    ou.api_calls_this_month,
    ou.storage_gb_used,
    sp.storage_gb_included,
    ROUND(ou.storage_gb_used / NULLIF(sp.storage_gb_included,0)*100,2) AS storage_usage_pct,
    ROUND(COUNT(DISTINCT u.id) / NULLIF(sp.max_users,0)*100,2)         AS user_usage_pct,
    ROUND(COUNT(DISTINCT p.id)/ NULLIF(sp.max_patients,0)*100,2)       AS patient_usage_pct
FROM organizations          o
JOIN subscription_plans     sp ON o.plan_id       = sp.id
LEFT JOIN branches          b  ON b.organization_id = o.id AND b.is_active = TRUE
LEFT JOIN users             u  ON u.branch_id      = b.id AND u.is_active = TRUE
LEFT JOIN patients          p  ON p.created_at >= o.subscription_start
LEFT JOIN patient_owners    po ON po.patient_id = p.id
LEFT JOIN clients           cl ON po.client_id  = cl.id AND cl.branch_id = b.id
LEFT JOIN organization_usage ou ON ou.organization_id = o.id
    AND ou.period_month = DATE_FORMAT(CURDATE(),'%Y-%m')
WHERE o.is_active = TRUE
GROUP BY o.id, o.name, o.country_code, sp.name, sp.tier,
         o.subscription_status, o.subscription_start, o.subscription_end,
         sp.price_usd, sp.max_branches, sp.max_users, sp.max_patients,
         sp.storage_gb_included, ou.api_calls_this_month, ou.storage_gb_used;

-- ----------------------------------------------------------
-- 1.14 Inventario: rotación y alertas de stock
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW v_inventory_rotation AS
SELECT
    b.id                                            AS branch_id,
    b.name                                          AS branch,
    ii.id                                           AS item_id,
    ii.name                                         AS item_name,
    ii.sku,
    ii.item_type,
    ist.quantity_available,
    ist.minimum_stock,
    ist.reorder_point,
    ii.unit_cost,
    ROUND(ist.quantity_available * ii.unit_cost, 2) AS stock_value,
    COUNT(im.id)                                    AS movements_last_90d,
    SUM(CASE WHEN im.movement_type='sale'
             AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 90 DAY)
        THEN im.quantity ELSE 0 END)                AS units_sold_90d,
    ROUND(SUM(CASE WHEN im.movement_type='sale'
             AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 90 DAY)
        THEN im.quantity ELSE 0 END) / 90, 2)      AS daily_avg_sales,
    CASE
        WHEN ist.quantity_available = 0                      THEN 'OUT_OF_STOCK'
        WHEN ist.quantity_available <= ist.minimum_stock     THEN 'CRITICAL'
        WHEN ist.quantity_available <= ist.reorder_point     THEN 'LOW'
        ELSE 'OK'
    END                                             AS stock_status,
    CASE
        WHEN ROUND(SUM(CASE WHEN im.movement_type='sale'
             AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 90 DAY)
        THEN im.quantity ELSE 0 END) / 90, 2) > 0
        THEN ROUND(ist.quantity_available
             / (SUM(CASE WHEN im.movement_type='sale'
             AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 90 DAY)
        THEN im.quantity ELSE 0 END) / 90), 0)
        ELSE NULL
    END                                             AS days_of_stock_remaining,
    ii.expiry_date,
    CASE
        WHEN ii.expiry_date IS NOT NULL AND ii.expiry_date < CURDATE() THEN 'EXPIRED'
        WHEN ii.expiry_date IS NOT NULL AND ii.expiry_date < DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
        ELSE 'OK'
    END                                             AS expiry_status
FROM inventory_items    ii
JOIN inventory_stock    ist ON ist.item_id   = ii.id
JOIN branches           b   ON ist.branch_id = b.id
LEFT JOIN inventory_movements im ON im.item_id = ii.id AND im.branch_id = b.id
GROUP BY b.id, b.name, ii.id, ii.name, ii.sku, ii.item_type,
         ist.quantity_available, ist.minimum_stock, ist.reorder_point,
         ii.unit_cost, ii.expiry_date;

-- ============================================================
-- SECCIÓN 2: STORED PROCEDURES DE REPORTES EJECUTIVOS
-- ============================================================

DELIMITER $$

-- ----------------------------------------------------------
-- 2.1 Dashboard ejecutivo de sucursal
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_branch_executive_dashboard$$
CREATE PROCEDURE sp_branch_executive_dashboard(
    IN p_branch_id      INT,
    IN p_period_start   DATE,
    IN p_period_end     DATE
)
BEGIN
    DECLARE v_branch_name   VARCHAR(120);
    DECLARE v_org_name      VARCHAR(120);

    SELECT b.name, o.name
    INTO v_branch_name, v_org_name
    FROM branches b JOIN organizations o ON b.organization_id = o.id
    WHERE b.id = p_branch_id;

    -- Encabezado
    SELECT
        p_branch_id                             AS branch_id,
        v_branch_name                           AS branch,
        v_org_name                              AS organization,
        p_period_start                          AS period_start,
        p_period_end                            AS period_end,
        DATEDIFF(p_period_end, p_period_start)  AS period_days;

    -- KPIs financieros
    SELECT
        'FINANCIAL_KPIs'                        AS section,
        COUNT(DISTINCT i.id)                    AS total_invoices,
        ROUND(SUM(i.total_amount),2)            AS gross_revenue,
        ROUND(SUM(i.paid_amount),2)             AS collected_revenue,
        ROUND(SUM(i.total_amount - i.paid_amount),2) AS outstanding,
        ROUND(AVG(i.total_amount),2)            AS avg_ticket,
        ROUND(SUM(i.paid_amount)/NULLIF(SUM(i.total_amount),0)*100,2) AS collection_rate_pct,
        COUNT(DISTINCT i.client_id)             AS unique_paying_clients
    FROM invoices i
    WHERE i.branch_id = p_branch_id
      AND i.issued_date BETWEEN p_period_start AND p_period_end
      AND i.status <> 'cancelled';

    -- KPIs operacionales
    SELECT
        'OPERATIONAL_KPIs'                      AS section,
        COUNT(DISTINCT a.id)                    AS total_appointments,
        SUM(CASE WHEN a.status='completed' THEN 1 ELSE 0 END) AS completed_appointments,
        SUM(CASE WHEN a.is_emergency        THEN 1 ELSE 0 END) AS emergencies,
        COUNT(DISTINCT mr.id)                   AS medical_records,
        COUNT(DISTINCT h.id)                    AS hospitalizations,
        COUNT(DISTINCT lo.id)                   AS lab_orders,
        COUNT(DISTINCT io.id)                   AS imaging_orders,
        COUNT(DISTINCT s.id)                    AS surgeries,
        COUNT(DISTINCT v.id)                    AS vaccinations,
        COUNT(DISTINCT ts.id)                   AS tele_sessions,
        COUNT(DISTINCT ga.id)                   AS grooming_appointments
    FROM branches b
    LEFT JOIN appointments    a  ON a.branch_id = b.id
        AND a.scheduled_date BETWEEN p_period_start AND p_period_end
    LEFT JOIN medical_records mr ON mr.appointment_id = a.id
    LEFT JOIN lab_orders      lo ON lo.branch_id = b.id
        AND DATE(lo.ordered_at) BETWEEN p_period_start AND p_period_end
    LEFT JOIN imaging_orders  io ON io.branch_id = b.id
        AND DATE(io.ordered_at) BETWEEN p_period_start AND p_period_end
    LEFT JOIN surgeries       s  ON s.branch_id = b.id
        AND s.surgery_date BETWEEN p_period_start AND p_period_end
    LEFT JOIN vaccinations    vac ON vac.branch_id = b.id
        AND vac.administered_date BETWEEN p_period_start AND p_period_end
    LEFT JOIN tele_sessions   ts ON ts.branch_id = b.id
        AND DATE(ts.scheduled_at) BETWEEN p_period_start AND p_period_end
    LEFT JOIN grooming_appointments ga ON ga.branch_id = b.id
        AND ga.scheduled_date BETWEEN p_period_start AND p_period_end
    LEFT JOIN hospitalizations h ON h.branch_id = b.id
        AND h.admission_date BETWEEN p_period_start AND p_period_end
    -- explicit alias reference to avoid subquery
    JOIN (SELECT id, name FROM branches WHERE id = p_branch_id) AS bref ON bref.id = b.id
    WHERE b.id = p_branch_id
    -- need a join for vaccinations
    ;

    -- KPIs de pacientes
    SELECT
        'PATIENT_KPIs'                          AS section,
        COUNT(DISTINCT p.id)                    AS total_active_patients,
        COUNT(DISTINCT CASE
            WHEN p.created_at BETWEEN p_period_start AND p_period_end
            THEN p.id END)                      AS new_patients,
        COUNT(DISTINCT sp.id)                   AS species_count,
        ROUND(AVG(
            CASE WHEN p.birthdate IS NOT NULL
            THEN TIMESTAMPDIFF(MONTH, p.birthdate, CURDATE())/12.0 END
        ),1)                                    AS avg_patient_age_years
    FROM patients           p
    JOIN patient_owners     po ON po.patient_id = p.id AND po.ownership_type = 'primary'
    JOIN clients            cl ON po.client_id = cl.id
    JOIN branches           b  ON cl.branch_id = b.id
    JOIN species            sp ON p.species_id = sp.id
    WHERE b.id = p_branch_id
      AND p.is_active = TRUE;

    -- Revenue por categoría de servicio
    SELECT
        'REVENUE_BY_CATEGORY'                   AS section,
        COALESCE(sc.name, 'Sin categoría')      AS service_category,
        COUNT(ii.id)                            AS qty,
        ROUND(SUM(ii.subtotal),2)               AS revenue,
        ROUND(SUM(ii.subtotal)/NULLIF(SUM(SUM(ii.subtotal)) OVER (),0)*100,2) AS share_pct
    FROM invoice_items  ii
    JOIN invoices       i   ON ii.invoice_id = i.id
    LEFT JOIN services_catalog sc2 ON ii.service_id = sc2.id
    LEFT JOIN service_categories sc ON sc2.category_id = sc.id
    WHERE i.branch_id = p_branch_id
      AND i.issued_date BETWEEN p_period_start AND p_period_end
      AND i.status <> 'cancelled'
    GROUP BY sc.name
    ORDER BY revenue DESC;

    -- Top 5 veterinarios por revenue generado
    SELECT
        'TOP_VETS'                              AS section,
        CONCAT(u.first_name,' ',u.last_name)    AS veterinarian,
        COUNT(DISTINCT a.id)                    AS appointments,
        ROUND(SUM(i.total_amount),2)            AS revenue_generated,
        ROUND(AVG(i.total_amount),2)            AS avg_ticket
    FROM appointments   a
    JOIN users          u  ON a.vet_id = u.id
    LEFT JOIN invoices  i  ON i.appointment_id = a.id AND i.status <> 'cancelled'
    WHERE a.branch_id = p_branch_id
      AND a.scheduled_date BETWEEN p_period_start AND p_period_end
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY revenue_generated DESC
    LIMIT 5;

END$$

-- ----------------------------------------------------------
-- 2.2 Reporte de crecimiento MoM/YoY por organización
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_org_growth_report$$
CREATE PROCEDURE sp_org_growth_report(
    IN p_organization_id INT,
    IN p_months          INT  -- cuántos meses hacia atrás analizar (máx 36)
)
BEGIN
    SET p_months = LEAST(COALESCE(p_months, 12), 36);

    SELECT
        b.name                                              AS branch,
        DATE_FORMAT(i.issued_date,'%Y-%m')                  AS period,
        ROUND(SUM(i.total_amount),2)                        AS revenue,
        COUNT(DISTINCT i.client_id)                         AS active_clients,
        COUNT(DISTINCT i.patient_id)                        AS active_patients,
        COUNT(DISTINCT i.id)                                AS invoices,
        LAG(ROUND(SUM(i.total_amount),2),1) OVER (
            PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
        )                                                   AS prev_month_revenue,
        ROUND(
            (ROUND(SUM(i.total_amount),2)
             - LAG(ROUND(SUM(i.total_amount),2),1) OVER (
                 PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
               ))
            / NULLIF(LAG(ROUND(SUM(i.total_amount),2),1) OVER (
                PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
              ), 0) * 100
        , 2)                                                AS mom_growth_pct,
        LAG(ROUND(SUM(i.total_amount),2),12) OVER (
            PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
        )                                                   AS same_month_prev_year,
        ROUND(
            (ROUND(SUM(i.total_amount),2)
             - LAG(ROUND(SUM(i.total_amount),2),12) OVER (
                 PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
               ))
            / NULLIF(LAG(ROUND(SUM(i.total_amount),2),12) OVER (
                PARTITION BY b.id ORDER BY DATE_FORMAT(i.issued_date,'%Y-%m')
              ), 0) * 100
        , 2)                                                AS yoy_growth_pct
    FROM invoices       i
    JOIN branches       b ON i.branch_id = b.id
    WHERE b.organization_id = p_organization_id
      AND i.status <> 'cancelled'
      AND i.issued_date >= DATE_SUB(CURDATE(), INTERVAL p_months MONTH)
    GROUP BY b.id, b.name, DATE_FORMAT(i.issued_date,'%Y-%m')
    ORDER BY b.name, period;
END$$

-- ----------------------------------------------------------
-- 2.3 Reporte de retención de clientes
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_client_retention_report$$
CREATE PROCEDURE sp_client_retention_report(
    IN p_branch_id  INT,
    IN p_year       INT
)
BEGIN
    SET p_year = COALESCE(p_year, YEAR(CURDATE()));

    -- Clientes nuevos vs recurrentes por mes
    SELECT
        DATE_FORMAT(i.issued_date,'%Y-%m')  AS period,
        COUNT(DISTINCT i.client_id)         AS total_clients,
        SUM(CASE
            WHEN (SELECT MIN(issued_date) FROM invoices i2
                  WHERE i2.client_id = i.client_id
                    AND i2.branch_id = p_branch_id
                    AND i2.status <> 'cancelled')
                 >= DATE_FORMAT(i.issued_date,'%Y-%m-01')
            THEN 1 ELSE 0
        END)                                AS new_clients,
        SUM(CASE
            WHEN (SELECT MIN(issued_date) FROM invoices i2
                  WHERE i2.client_id = i.client_id
                    AND i2.branch_id = p_branch_id
                    AND i2.status <> 'cancelled')
                 < DATE_FORMAT(i.issued_date,'%Y-%m-01')
            THEN 1 ELSE 0
        END)                                AS returning_clients,
        ROUND(
            SUM(CASE
                WHEN (SELECT MIN(issued_date) FROM invoices i2
                      WHERE i2.client_id = i.client_id
                        AND i2.branch_id = p_branch_id
                        AND i2.status <> 'cancelled')
                     < DATE_FORMAT(i.issued_date,'%Y-%m-01')
                THEN 1 ELSE 0
            END) / NULLIF(COUNT(DISTINCT i.client_id),0) * 100
        , 2)                                AS retention_rate_pct
    FROM invoices i
    WHERE i.branch_id = p_branch_id
      AND YEAR(i.issued_date) = p_year
      AND i.status <> 'cancelled'
    GROUP BY DATE_FORMAT(i.issued_date,'%Y-%m')
    ORDER BY period;

    -- Churn: clientes que dejaron de venir (no actividad en últimos 90 días)
    SELECT
        COUNT(DISTINCT cl.id)               AS clients_at_risk,
        ROUND(COUNT(DISTINCT cl.id)
              / NULLIF((SELECT COUNT(DISTINCT client_id) FROM invoices
                        WHERE branch_id = p_branch_id
                          AND status <> 'cancelled'), 0)*100, 2) AS churn_risk_pct
    FROM clients cl
    JOIN invoices i ON i.client_id = cl.id
    WHERE cl.branch_id = p_branch_id
      AND i.status <> 'cancelled'
    GROUP BY cl.id
    HAVING MAX(i.issued_date) < DATE_SUB(CURDATE(), INTERVAL 90 DAY);
END$$

-- ----------------------------------------------------------
-- 2.4 Reporte de inventario y compras sugeridas
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_inventory_purchase_suggestions$$
CREATE PROCEDURE sp_inventory_purchase_suggestions(
    IN p_branch_id  INT
)
BEGIN
    SELECT
        ii.id                                           AS item_id,
        ii.sku,
        ii.name                                         AS item_name,
        ii.item_type,
        ist.quantity_available                          AS current_stock,
        ist.minimum_stock,
        ist.reorder_point,
        ROUND(
            SUM(CASE WHEN im.movement_type='sale'
                     AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                THEN im.quantity ELSE 0 END)
        ,0)                                             AS sold_last_30d,
        ROUND(
            SUM(CASE WHEN im.movement_type='sale'
                     AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                THEN im.quantity ELSE 0 END) / 30
        ,2)                                             AS daily_demand,
        CASE
            WHEN ROUND(SUM(CASE WHEN im.movement_type='sale'
                 AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                 THEN im.quantity ELSE 0 END)/30,2) > 0
            THEN ROUND(ist.quantity_available
                 / (SUM(CASE WHEN im.movement_type='sale'
                 AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                 THEN im.quantity ELSE 0 END)/30), 0)
            ELSE 9999
        END                                             AS days_remaining,
        -- Sugerencia de compra: cubrir 60 días de demanda
        GREATEST(0, CEIL(
            (60 * ROUND(
                SUM(CASE WHEN im.movement_type='sale'
                AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                THEN im.quantity ELSE 0 END)/30
            ,2)) - ist.quantity_available
        ))                                              AS suggested_order_qty,
        ROUND(GREATEST(0, CEIL(
            (60 * ROUND(
                SUM(CASE WHEN im.movement_type='sale'
                AND im.created_at >= DATE_SUB(CURDATE(),INTERVAL 30 DAY)
                THEN im.quantity ELSE 0 END)/30
            ,2)) - ist.quantity_available
        )) * ii.unit_cost, 2)                           AS estimated_purchase_cost,
        ii.expiry_date,
        CASE
            WHEN ii.expiry_date < CURDATE()              THEN 'EXPIRED'
            WHEN ii.expiry_date < DATE_ADD(CURDATE(),INTERVAL 30 DAY) THEN 'EXPIRING_SOON'
            WHEN ist.quantity_available = 0              THEN 'OUT_OF_STOCK'
            WHEN ist.quantity_available <= ist.minimum_stock THEN 'REORDER_CRITICAL'
            WHEN ist.quantity_available <= ist.reorder_point THEN 'REORDER'
            ELSE 'OK'
        END                                             AS action_required
    FROM inventory_items    ii
    JOIN inventory_stock    ist ON ist.item_id = ii.id AND ist.branch_id = p_branch_id
    LEFT JOIN inventory_movements im ON im.item_id = ii.id AND im.branch_id = p_branch_id
    WHERE ii.is_active = TRUE
    GROUP BY ii.id, ii.sku, ii.name, ii.item_type,
             ist.quantity_available, ist.minimum_stock,
             ist.reorder_point, ii.unit_cost, ii.expiry_date
    HAVING action_required <> 'OK'
       OR suggested_order_qty > 0
    ORDER BY
        FIELD(action_required,'EXPIRED','REORDER_CRITICAL','OUT_OF_STOCK','EXPIRING_SOON','REORDER','OK'),
        days_remaining ASC;
END$$

-- ----------------------------------------------------------
-- 2.5 Dashboard SaaS para el super-administrador
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_saas_superadmin_dashboard$$
CREATE PROCEDURE sp_saas_superadmin_dashboard()
BEGIN
    -- Resumen de organizaciones activas
    SELECT
        'ORGANIZATIONS_SUMMARY'             AS section,
        COUNT(*)                            AS total_organizations,
        SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN subscription_status='active' THEN 1 ELSE 0 END) AS subscribed,
        SUM(CASE WHEN subscription_status='trial'  THEN 1 ELSE 0 END) AS on_trial,
        SUM(CASE WHEN subscription_status='expired' THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN subscription_end < DATE_ADD(CURDATE(),INTERVAL 30 DAY)
                  AND subscription_status='active' THEN 1 ELSE 0 END) AS renewing_30d
    FROM organizations;

    -- MRR (Monthly Recurring Revenue) estimado en USD
    SELECT
        'MRR'                               AS section,
        sp.name                             AS plan,
        sp.tier,
        sp.price_usd,
        sp.billing_cycle,
        COUNT(o.id)                         AS subscribers,
        ROUND(
            COUNT(o.id) * CASE sp.billing_cycle
                WHEN 'monthly' THEN sp.price_usd
                WHEN 'annual'  THEN sp.price_usd / 12
                ELSE sp.price_usd
            END
        , 2)                                AS mrr_usd
    FROM organizations  o
    JOIN subscription_plans sp ON o.plan_id = sp.id
    WHERE o.subscription_status IN ('active','trial')
    GROUP BY sp.id, sp.name, sp.tier, sp.price_usd, sp.billing_cycle
    ORDER BY mrr_usd DESC;

    -- Usuarios activos en últimas 24h (sesiones activas)
    SELECT
        'ACTIVE_USERS_24H'                  AS section,
        COUNT(DISTINCT s.user_id)           AS active_users,
        COUNT(*)                            AS active_sessions,
        COUNT(DISTINCT s.device_type)       AS device_types
    FROM sessions s
    WHERE s.expires_at > NOW()
      AND s.is_revoked = FALSE
      AND s.last_activity_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR);

    -- Alertas de seguridad activas
    SELECT
        'SECURITY_ALERTS'                   AS section,
        severity,
        alert_type,
        COUNT(*)                            AS count,
        MAX(created_at)                     AS latest
    FROM security_alerts
    WHERE is_resolved = FALSE
      AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    GROUP BY severity, alert_type
    ORDER BY FIELD(severity,'critical','high','medium','low'), count DESC;

    -- Top 10 organizaciones por facturación
    SELECT
        'TOP_ORGS_BY_REVENUE'               AS section,
        o.name                              AS organization,
        o.country_code,
        COUNT(DISTINCT i.id)                AS invoices_this_month,
        ROUND(SUM(i.total_amount),2)        AS revenue_this_month
    FROM organizations  o
    JOIN branches       b  ON b.organization_id = o.id
    JOIN invoices       i  ON i.branch_id = b.id
    WHERE YEAR(i.issued_date)  = YEAR(CURDATE())
      AND MONTH(i.issued_date) = MONTH(CURDATE())
      AND i.status <> 'cancelled'
    GROUP BY o.id, o.name, o.country_code
    ORDER BY revenue_this_month DESC
    LIMIT 10;

    -- Organizaciones con más pacientes
    SELECT
        'TOP_ORGS_BY_PATIENTS'              AS section,
        o.name                              AS organization,
        o.country_code,
        COUNT(DISTINCT p.id)                AS total_patients
    FROM organizations  o
    JOIN branches       b   ON b.organization_id = o.id
    JOIN clients        cl  ON cl.branch_id = b.id
    JOIN patient_owners po  ON po.client_id = cl.id AND po.ownership_type = 'primary'
    JOIN patients       p   ON po.patient_id = p.id AND p.is_active = TRUE
    GROUP BY o.id, o.name, o.country_code
    ORDER BY total_patients DESC
    LIMIT 10;
END$$

-- ----------------------------------------------------------
-- 2.6 Reporte de productividad de groomers
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_groomer_productivity_report$$
CREATE PROCEDURE sp_groomer_productivity_report(
    IN p_branch_id      INT,
    IN p_period_start   DATE,
    IN p_period_end     DATE
)
BEGIN
    SELECT
        CONCAT(u.first_name,' ',u.last_name)        AS groomer,
        g.specialty,
        COUNT(ga.id)                                AS total_appointments,
        SUM(CASE WHEN ga.status='completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN ga.status IN ('cancelled','no_show') THEN 1 ELSE 0 END) AS lost,
        COUNT(DISTINCT ga.patient_id)               AS unique_pets,
        ROUND(SUM(ga.final_price),2)                AS gross_revenue,
        ROUND(AVG(ga.final_price),2)                AS avg_ticket,
        ROUND(SUM(
            COALESCE(gcr.commission_amount, 0)
        ),2)                                        AS total_commission,
        ROUND(AVG(gr.overall_rating),2)             AS avg_rating,
        COUNT(DISTINCT CASE WHEN gr2.vet_referral_needed THEN ga.id END) AS vet_referrals,
        ROUND(SUM(CASE WHEN ga.status='completed' THEN 1 ELSE 0 END)
              / NULLIF(COUNT(ga.id),0)*100,2)       AS completion_rate_pct,
        ROUND(SUM(COALESCE(gcr.commission_amount,0))
              / NULLIF(SUM(ga.final_price),0)*100,2) AS commission_rate_pct
    FROM groomers               g
    JOIN users                  u  ON g.user_id = u.id
    JOIN grooming_appointments  ga ON ga.groomer_id = g.id
    LEFT JOIN groomer_commission_records gcr ON gcr.appointment_id = ga.id
    LEFT JOIN grooming_ratings   gr ON gr.appointment_id = ga.id
    LEFT JOIN grooming_records   gr2 ON gr2.appointment_id = ga.id
    WHERE ga.branch_id = p_branch_id
      AND ga.scheduled_date BETWEEN p_period_start AND p_period_end
    GROUP BY g.id, u.first_name, u.last_name, g.specialty
    ORDER BY gross_revenue DESC;
END$$

-- ----------------------------------------------------------
-- 2.7 Reporte de alertas clínicas del período
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_clinical_alerts_report$$
CREATE PROCEDURE sp_clinical_alerts_report(
    IN p_branch_id      INT,
    IN p_period_start   DATE,
    IN p_period_end     DATE
)
BEGIN
    -- Resumen de alertas de seguridad relacionadas con pacientes/clínica
    SELECT
        sa.alert_type,
        sa.severity,
        COUNT(*)                                AS total,
        SUM(CASE WHEN sa.is_resolved THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN NOT sa.is_resolved THEN 1 ELSE 0 END) AS pending,
        MIN(sa.created_at)                      AS first_alert,
        MAX(sa.created_at)                      AS last_alert
    FROM security_alerts sa
    WHERE sa.branch_id = p_branch_id
      AND DATE(sa.created_at) BETWEEN p_period_start AND p_period_end
      AND sa.alert_type IN (
          'CRITICAL_LAB_VALUE',
          'CRITICAL_VITALS',
          'VET_REFERRAL_GROOMING',
          'PATIENT_WEIGHT_CHANGE'
      )
    GROUP BY sa.alert_type, sa.severity
    ORDER BY FIELD(sa.severity,'critical','high','medium','low');

    -- Pacientes con más alertas
    SELECT
        p.id                                    AS patient_id,
        p.name                                  AS patient,
        sp.common_name                          AS species,
        COUNT(sa.id)                            AS alert_count,
        GROUP_CONCAT(DISTINCT sa.alert_type ORDER BY sa.alert_type SEPARATOR ', ') AS alert_types,
        MAX(sa.created_at)                      AS last_alert
    FROM security_alerts    sa
    JOIN patients           p  ON sa.patient_id = p.id
    JOIN species            sp ON p.species_id  = sp.id
    WHERE sa.branch_id = p_branch_id
      AND DATE(sa.created_at) BETWEEN p_period_start AND p_period_end
      AND sa.patient_id IS NOT NULL
    GROUP BY p.id, p.name, sp.common_name
    ORDER BY alert_count DESC
    LIMIT 20;
END$$

-- ----------------------------------------------------------
-- 2.8 Función: calcular NPS de la sucursal
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS fn_branch_nps$$
CREATE FUNCTION fn_branch_nps(
    p_branch_id     INT,
    p_period_start  DATE,
    p_period_end    DATE
)
RETURNS DECIMAL(5,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_promoters   INT DEFAULT 0;
    DECLARE v_detractors  INT DEFAULT 0;
    DECLARE v_total       INT DEFAULT 0;

    -- NPS basado en ratings de grooming (overall_rating 9-10 = promotor, 1-6 = detractor)
    SELECT
        SUM(CASE WHEN gr.overall_rating >= 9 THEN 1 ELSE 0 END),
        SUM(CASE WHEN gr.overall_rating <= 6 THEN 1 ELSE 0 END),
        COUNT(*)
    INTO v_promoters, v_detractors, v_total
    FROM grooming_ratings gr
    JOIN grooming_appointments ga ON gr.appointment_id = ga.id
    WHERE ga.branch_id = p_branch_id
      AND ga.scheduled_date BETWEEN p_period_start AND p_period_end;

    -- También incluir ratings de teleconsulta
    SELECT
        v_promoters + SUM(CASE WHEN tr.overall_rating >= 9 THEN 1 ELSE 0 END),
        v_detractors + SUM(CASE WHEN tr.overall_rating <= 6 THEN 1 ELSE 0 END),
        v_total + COUNT(*)
    INTO v_promoters, v_detractors, v_total
    FROM tele_ratings tr
    JOIN tele_sessions ts ON tr.session_id = ts.id
    WHERE ts.branch_id = p_branch_id
      AND DATE(ts.scheduled_at) BETWEEN p_period_start AND p_period_end;

    IF v_total = 0 THEN RETURN NULL; END IF;

    RETURN ROUND(((v_promoters - v_detractors) / v_total) * 100, 2);
END$$

-- ----------------------------------------------------------
-- 2.9 Reporte maestro ejecutivo (llama a otros procedures)
--     Genera un informe consolidado del mes en curso
-- ----------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_monthly_executive_report$$
CREATE PROCEDURE sp_monthly_executive_report(
    IN p_organization_id    INT,
    IN p_year               INT,
    IN p_month              INT
)
BEGIN
    DECLARE v_period_start  DATE;
    DECLARE v_period_end    DATE;
    DECLARE v_org_name      VARCHAR(120);

    SET p_year  = COALESCE(p_year,  YEAR(CURDATE()));
    SET p_month = COALESCE(p_month, MONTH(CURDATE()));
    SET v_period_start = DATE(CONCAT(p_year,'-',LPAD(p_month,2,'0'),'-01'));
    SET v_period_end   = LAST_DAY(v_period_start);

    SELECT name INTO v_org_name FROM organizations WHERE id = p_organization_id;

    -- Encabezado del reporte
    SELECT
        p_organization_id           AS organization_id,
        v_org_name                  AS organization,
        v_period_start              AS period_start,
        v_period_end                AS period_end,
        CONCAT(MONTHNAME(v_period_start),' ',p_year) AS period_label,
        NOW()                       AS generated_at;

    -- Resumen financiero consolidado por sucursal
    SELECT
        'FINANCIAL_SUMMARY'         AS section,
        b.name                      AS branch,
        COUNT(DISTINCT i.id)        AS invoices,
        ROUND(SUM(i.total_amount),2) AS gross_revenue,
        ROUND(SUM(i.paid_amount),2)  AS collected,
        ROUND(SUM(i.total_amount - i.paid_amount),2) AS outstanding,
        ROUND(AVG(i.total_amount),2) AS avg_ticket
    FROM invoices   i
    JOIN branches   b ON i.branch_id = b.id
    WHERE b.organization_id = p_organization_id
      AND i.issued_date BETWEEN v_period_start AND v_period_end
      AND i.status <> 'cancelled'
    GROUP BY b.id, b.name
    ORDER BY gross_revenue DESC;

    -- Pacientes nuevos del período
    SELECT
        'NEW_PATIENTS'              AS section,
        b.name                      AS branch,
        COUNT(DISTINCT p.id)        AS new_patients,
        GROUP_CONCAT(DISTINCT sp.common_name ORDER BY sp.common_name SEPARATOR ', ') AS species_mix
    FROM patients           p
    JOIN patient_owners     po ON po.patient_id = p.id AND po.ownership_type = 'primary'
    JOIN clients            cl ON po.client_id = cl.id
    JOIN branches           b  ON cl.branch_id = b.id
    JOIN species            sp ON p.species_id  = sp.id
    WHERE b.organization_id = p_organization_id
      AND p.created_at BETWEEN v_period_start AND v_period_end
    GROUP BY b.id, b.name;

    -- Servicios más facturados del período
    SELECT
        'TOP_SERVICES'              AS section,
        COALESCE(sc.name,'Sin cat') AS category,
        ii.description              AS service,
        COUNT(*)                    AS qty,
        ROUND(SUM(ii.subtotal),2)   AS revenue
    FROM invoice_items      ii
    JOIN invoices           i   ON ii.invoice_id = i.id
    JOIN branches           b   ON i.branch_id   = b.id
    LEFT JOIN services_catalog sc2 ON ii.service_id = sc2.id
    LEFT JOIN service_categories sc ON sc2.category_id = sc.id
    WHERE b.organization_id = p_organization_id
      AND i.issued_date BETWEEN v_period_start AND v_period_end
      AND i.status <> 'cancelled'
    GROUP BY sc.name, ii.description
    ORDER BY revenue DESC
    LIMIT 10;

    -- NPS por sucursal del período
    SELECT
        'NPS_BY_BRANCH'             AS section,
        b.name                      AS branch,
        fn_branch_nps(b.id, v_period_start, v_period_end) AS nps_score
    FROM branches b
    WHERE b.organization_id = p_organization_id
      AND b.is_active = TRUE;

    -- Diagnósticos más frecuentes del período
    SELECT
        'TOP_DIAGNOSES'             AS section,
        d.diagnosis_name,
        sp.common_name              AS species,
        COUNT(*)                    AS frequency
    FROM diagnoses          d
    JOIN medical_records    mr ON d.medical_record_id = mr.id
    JOIN patients           p  ON mr.patient_id = p.id
    JOIN species            sp ON p.species_id  = sp.id
    JOIN appointments       a  ON mr.appointment_id = a.id
    JOIN branches           b  ON a.branch_id = b.id
    WHERE b.organization_id = p_organization_id
      AND mr.opened_at BETWEEN v_period_start AND v_period_end
    GROUP BY d.diagnosis_name, sp.common_name
    ORDER BY frequency DESC
    LIMIT 10;

    -- Tasa de cumplimiento vacunal
    SELECT
        'VACCINATION_COMPLIANCE'    AS section,
        b.name                      AS branch,
        sp.common_name              AS species,
        COUNT(DISTINCT p.id)        AS total_patients,
        COUNT(DISTINCT v.patient_id) AS vaccinated_12m,
        ROUND(COUNT(DISTINCT v.patient_id)
              /NULLIF(COUNT(DISTINCT p.id),0)*100,2) AS compliance_pct
    FROM patients           p
    JOIN patient_owners     po ON po.patient_id = p.id AND po.ownership_type = 'primary'
    JOIN clients            cl ON po.client_id = cl.id
    JOIN branches           b  ON cl.branch_id  = b.id
    JOIN species            sp ON p.species_id   = sp.id
    LEFT JOIN vaccinations  v  ON v.patient_id  = p.id
        AND v.administered_date >= DATE_SUB(v_period_end, INTERVAL 12 MONTH)
    WHERE b.organization_id = p_organization_id
      AND p.is_active = TRUE
    GROUP BY b.id, b.name, sp.common_name;

END$$

DELIMITER ;

-- ============================================================
-- SECCIÓN 3: TABLA DE CONFIGURACIÓN DE REPORTES PROGRAMADOS
-- ============================================================

CREATE TABLE IF NOT EXISTS report_schedules (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id     INT UNSIGNED NOT NULL,
    branch_id           INT UNSIGNED,                       -- NULL = toda la organización
    report_type         ENUM(
                            'monthly_executive',
                            'branch_dashboard',
                            'growth_report',
                            'retention_report',
                            'inventory_suggestions',
                            'clinical_alerts',
                            'groomer_productivity',
                            'custom'
                        ) NOT NULL,
    frequency           ENUM('daily','weekly','monthly')    NOT NULL DEFAULT 'monthly',
    day_of_month        TINYINT                             DEFAULT 1,  -- para frecuencia mensual
    day_of_week         TINYINT                             DEFAULT 1,  -- 1=lunes para frecuencia semanal
    recipients_json     JSON                                NOT NULL,   -- array de emails
    last_run_at         DATETIME,
    next_run_at         DATETIME,
    is_active           TINYINT(1)                          NOT NULL DEFAULT 1,
    created_by          INT UNSIGNED                        NOT NULL,
    created_at          DATETIME                            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME                            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_repsched_org    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_repsched_branch FOREIGN KEY (branch_id)       REFERENCES branches(id),
    CONSTRAINT fk_repsched_user   FOREIGN KEY (created_by)      REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Configuración de reportes automáticos programados';

-- ============================================================
-- SECCIÓN 4: TABLA DE CACHÉ DE REPORTES GENERADOS
-- ============================================================

CREATE TABLE IF NOT EXISTS report_cache (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    organization_id     INT UNSIGNED NOT NULL,
    branch_id           INT UNSIGNED,
    report_type         VARCHAR(60)                         NOT NULL,
    period_start        DATE                                NOT NULL,
    period_end          DATE                                NOT NULL,
    report_data         LONGTEXT                            NOT NULL,  -- JSON del reporte
    generated_by        INT UNSIGNED,
    generated_at        DATETIME                            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at          DATETIME,
    PRIMARY KEY (id),
    INDEX idx_rptcache_org_type_period (organization_id, report_type, period_start),
    CONSTRAINT fk_rptcache_org  FOREIGN KEY (organization_id) REFERENCES organizations(id),
    CONSTRAINT fk_rptcache_usr  FOREIGN KEY (generated_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Caché de reportes ejecutivos generados (evita recálculo)';

-- ============================================================
-- SECCIÓN 5: VERIFICACIÓN FINAL
-- ============================================================

SELECT 'MÓDULO 12 - REPORTES EJECUTIVOS' AS modulo,
       'INSTALADO CORRECTAMENTE'         AS estado,
       NOW()                             AS timestamp;

SELECT
    TABLE_NAME                          AS vista_o_tabla,
    TABLE_TYPE                          AS tipo
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'vetmanager'
  AND TABLE_NAME IN (
      'v_revenue_monthly_by_branch',
      'v_revenue_by_service_type',
      'v_top_clients',
      'v_new_patients_monthly',
      'v_appointment_funnel',
      'v_vaccination_compliance',
      'v_hospitalization_occupancy',
      'v_lab_turnaround',
      'v_top_diagnoses',
      'v_vet_performance',
      'v_telemedicine_kpis',
      'v_grooming_kpis',
      'v_saas_plan_summary',
      'v_inventory_rotation',
      'report_schedules',
      'report_cache'
  )
ORDER BY TABLE_TYPE, TABLE_NAME;

SELECT
    ROUTINE_NAME                        AS procedimiento,
    ROUTINE_TYPE                        AS tipo
FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'vetmanager'
  AND ROUTINE_NAME IN (
      'sp_branch_executive_dashboard',
      'sp_org_growth_report',
      'sp_client_retention_report',
      'sp_inventory_purchase_suggestions',
      'sp_saas_superadmin_dashboard',
      'sp_groomer_productivity_report',
      'sp_clinical_alerts_report',
      'fn_branch_nps',
      'sp_monthly_executive_report'
  )
ORDER BY ROUTINE_TYPE, ROUTINE_NAME;
