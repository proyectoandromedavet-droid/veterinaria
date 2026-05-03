-- Migration 032: Add extended columns to vaccinations table
-- These columns are referenced by the vaccination.routes.js INSERT but may
-- not exist if the table was created from the minimal seed schema.

ALTER TABLE vaccinations
  ADD COLUMN IF NOT EXISTS medical_record_id INT NULL,
  ADD COLUMN IF NOT EXISTS batch_number      VARCHAR(100) NULL COMMENT 'Número de lote / batch',
  ADD COLUMN IF NOT EXISTS expiry_date       DATE NULL COMMENT 'Vencimiento del lote',
  ADD COLUMN IF NOT EXISTS dose              VARCHAR(100) NULL COMMENT 'Dosis administrada',
  ADD COLUMN IF NOT EXISTS route             VARCHAR(50)  NULL COMMENT 'Vía de administración (SC, IM, IN, etc.)',
  ADD COLUMN IF NOT EXISTS administration_site VARCHAR(100) NULL COMMENT 'Sitio de aplicación';

-- Add FK for medical_record_id if the column was just created
-- (safe to run multiple times — FK name is explicit)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME         = 'vaccinations'
    AND CONSTRAINT_NAME    = 'fk_vaccinations_medical_record'
    AND CONSTRAINT_TYPE    = 'FOREIGN KEY'
);

SET @sql = IF(
  @fk_exists = 0,
  'ALTER TABLE vaccinations ADD CONSTRAINT fk_vaccinations_medical_record FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE SET NULL',
  'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
