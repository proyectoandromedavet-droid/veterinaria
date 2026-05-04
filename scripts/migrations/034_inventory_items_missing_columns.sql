-- Migration 034: Add missing columns to inventory_items
-- The table was created with an older schema (branch_id, unit, stock_quantity).
-- The current billing service code expects sku, description, sale_price,
-- requires_prescription, supplier_id, expiry_date, updated_at, deleted_at.

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS sku                  VARCHAR(100)   NULL,
  ADD COLUMN IF NOT EXISTS description          TEXT           NULL,
  ADD COLUMN IF NOT EXISTS sale_price           DECIMAL(15,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_prescription TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id          INT            NULL,
  ADD COLUMN IF NOT EXISTS expiry_date          DATE           NULL,
  ADD COLUMN IF NOT EXISTS updated_at           DATETIME       NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at           DATETIME       NULL;

-- Add unique index on sku (nullable — only enforce when not null)
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'inventory_items'
    AND INDEX_NAME   = 'uq_inventory_items_sku'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE inventory_items ADD UNIQUE INDEX uq_inventory_items_sku (sku)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- FK to suppliers if table exists
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME         = 'inventory_items'
    AND CONSTRAINT_NAME    = 'fk_inv_items_supplier'
    AND CONSTRAINT_TYPE    = 'FOREIGN KEY'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE inventory_items ADD CONSTRAINT fk_inv_items_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
