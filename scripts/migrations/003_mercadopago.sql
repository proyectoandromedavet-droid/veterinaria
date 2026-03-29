-- Migración 003: columnas para integración MercadoPago
-- Ejecutar sobre la BD vetmanager

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS mp_preference_id VARCHAR(120) NULL COMMENT 'ID de preferencia MercadoPago' AFTER paid_amount;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mp_payment_id VARCHAR(60) NULL COMMENT 'ID de pago en MercadoPago' AFTER reference,
  ADD COLUMN IF NOT EXISTS payment_status ENUM('pending','completed','failed','refunded','cancelled') NOT NULL DEFAULT 'completed' AFTER mp_payment_id;

-- Índice para búsqueda rápida por mp_payment_id
CREATE INDEX idx_payments_mp_payment_id ON payments(mp_payment_id);
