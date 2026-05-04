-- Migration 034: Add missing columns to inventory_items
-- Uses information_schema checks for compatibility with MySQL < 8.0

DROP PROCEDURE IF EXISTS _mig034_add_col;
DELIMITER $$
CREATE PROCEDURE _mig034_add_col()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'sku') THEN
    ALTER TABLE inventory_items ADD COLUMN sku VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'description') THEN
    ALTER TABLE inventory_items ADD COLUMN description TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'sale_price') THEN
    ALTER TABLE inventory_items ADD COLUMN sale_price DECIMAL(15,4) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'requires_prescription') THEN
    ALTER TABLE inventory_items ADD COLUMN requires_prescription TINYINT(1) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'supplier_id') THEN
    ALTER TABLE inventory_items ADD COLUMN supplier_id INT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'expiry_date') THEN
    ALTER TABLE inventory_items ADD COLUMN expiry_date DATE NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'updated_at') THEN
    ALTER TABLE inventory_items ADD COLUMN updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND COLUMN_NAME = 'deleted_at') THEN
    ALTER TABLE inventory_items ADD COLUMN deleted_at DATETIME NULL;
  END IF;

  -- Unique index on sku
  IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND INDEX_NAME = 'uq_inventory_items_sku') THEN
    ALTER TABLE inventory_items ADD UNIQUE INDEX uq_inventory_items_sku (sku);
  END IF;

  -- FK to suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'inventory_items' AND CONSTRAINT_NAME = 'fk_inv_items_supplier' AND CONSTRAINT_TYPE = 'FOREIGN KEY') THEN
    ALTER TABLE inventory_items ADD CONSTRAINT fk_inv_items_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
  END IF;
END$$
DELIMITER ;

CALL _mig034_add_col();
DROP PROCEDURE IF EXISTS _mig034_add_col;
