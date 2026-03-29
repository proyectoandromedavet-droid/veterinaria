-- Migración 008: AFIP — columnas de factura electrónica y credenciales por organización

-- Columnas AFIP en invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS afip_tipo             TINYINT UNSIGNED  NULL COMMENT 'Tipo comprobante AFIP (1=FA, 6=FB, 11=FC)' AFTER paid_amount,
  ADD COLUMN IF NOT EXISTS afip_punto_venta      SMALLINT UNSIGNED NULL COMMENT 'Punto de venta AFIP' AFTER afip_tipo,
  ADD COLUMN IF NOT EXISTS afip_nro_comprobante  INT UNSIGNED      NULL COMMENT 'Nro de comprobante AFIP' AFTER afip_punto_venta,
  ADD COLUMN IF NOT EXISTS afip_cae              VARCHAR(20)       NULL COMMENT 'CAE otorgado por AFIP' AFTER afip_nro_comprobante,
  ADD COLUMN IF NOT EXISTS afip_cae_vto          DATE              NULL COMMENT 'Fecha vencimiento CAE' AFTER afip_cae;

-- Condición fiscal del cliente (RI=Responsable Inscripto, MO=Monotributo, CF=Consumidor Final, EX=Exento)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS fiscal_condition ENUM('RI','MO','CF','EX') NOT NULL DEFAULT 'CF' AFTER tax_id;

-- Credenciales AFIP por organización
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS afip_cuit          VARCHAR(20)  NULL COMMENT 'CUIT de la organización para AFIP' AFTER name,
  ADD COLUMN IF NOT EXISTS afip_punto_venta   SMALLINT     NOT NULL DEFAULT 1 AFTER afip_cuit,
  ADD COLUMN IF NOT EXISTS afip_production    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '0=homologación, 1=producción' AFTER afip_punto_venta,
  ADD COLUMN IF NOT EXISTS afip_cert          TEXT         NULL COMMENT 'Certificado .pem' AFTER afip_production,
  ADD COLUMN IF NOT EXISTS afip_key           TEXT         NULL COMMENT 'Clave privada .key' AFTER afip_cert;

-- Índice para búsqueda por CAE
CREATE INDEX IF NOT EXISTS idx_invoices_afip_cae ON invoices(afip_cae);
