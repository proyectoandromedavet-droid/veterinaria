ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

ALTER TABLE stock_alerts
  ADD COLUMN IF NOT EXISTS deleted_at DATETIME NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at ON suppliers(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_deleted_at ON inventory_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_deleted_at ON inventory_batches(deleted_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_deleted_at ON purchase_orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_deleted_at ON purchase_order_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_deleted_at ON stock_alerts(deleted_at);
