-- 017_data_governance.sql
-- Políticas de retención de datos configurables por organización

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id         INT UNSIGNED     NOT NULL,
  data_type      VARCHAR(60)      NOT NULL COMMENT 'clients|medical_records|audit_logs|appointments|lab_results|invoices',
  retention_days INT UNSIGNED     NOT NULL DEFAULT 365,
  action         ENUM('anonymize','delete','archive') DEFAULT 'anonymize',
  is_active      BOOLEAN          DEFAULT TRUE,
  created_by     INT UNSIGNED     NULL,
  created_at     DATETIME         DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME         DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE  KEY uq_org_type (org_id, data_type),
  INDEX   idx_org        (org_id),
  INDEX   idx_active     (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos de clasificación de datos (estáticos, referencia)
CREATE TABLE IF NOT EXISTS data_classification_registry (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_name     VARCHAR(60)  NOT NULL,
  field_name     VARCHAR(60)  NOT NULL,
  classification ENUM('public','internal','sensitive','critical') NOT NULL,
  notes          VARCHAR(255),
  UNIQUE KEY uq_table_field (table_name, field_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed de clasificaciones
INSERT IGNORE INTO data_classification_registry (table_name, field_name, classification, notes) VALUES
  ('clients',       'full_name',         'sensitive',  'PII - nombre completo'),
  ('clients',       'email',             'sensitive',  'PII - email'),
  ('clients',       'phone',             'sensitive',  'PII - teléfono'),
  ('clients',       'address',           'sensitive',  'PII - dirección'),
  ('clients',       'dni',               'critical',   'PII - documento de identidad'),
  ('medical_records','diagnosis',        'critical',   'Datos de salud del paciente'),
  ('medical_records','treatment_notes',  'critical',   'Datos de salud del paciente'),
  ('lab_results',   'result_value',      'critical',   'Resultados de laboratorio'),
  ('invoices',      'total_amount',      'internal',   'Datos financieros'),
  ('payments',      'payment_method',    'internal',   'Datos financieros'),
  ('users',         'password_hash',     'critical',   'Credenciales'),
  ('users',         'email',             'sensitive',  'PII'),
  ('audit_logs',    'user_id',           'internal',   'Trazabilidad'),
  ('appointments',  'notes',             'sensitive',  'Notas clínicas'),
  ('patients',      'name',              'internal',   'Nombre del paciente'),
  ('patients',      'microchip',         'sensitive',  'Identificador único');
