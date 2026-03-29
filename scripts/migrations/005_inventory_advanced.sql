-- Migración 005: Inventario avanzado — lotes, proveedores, órdenes de compra

-- ── Proveedores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  org_id          INT UNSIGNED    NOT NULL,
  name            VARCHAR(120)    NOT NULL,
  tax_id          VARCHAR(30)     NULL,
  contact_name    VARCHAR(80)     NULL,
  email           VARCHAR(120)    NULL,
  phone           VARCHAR(30)     NULL,
  address         TEXT            NULL,
  payment_terms   INT             NOT NULL DEFAULT 30 COMMENT 'Días de plazo de pago',
  notes           TEXT            NULL,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_suppliers_org (org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Lotes de inventario ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  item_id             INT UNSIGNED     NOT NULL,
  branch_id           INT UNSIGNED     NOT NULL,
  supplier_id         INT UNSIGNED     NULL,
  lot_number          VARCHAR(60)      NOT NULL,
  manufacture_date    DATE             NULL,
  expiry_date         DATE             NULL,
  quantity_received   DECIMAL(10,3)    NOT NULL DEFAULT 0,
  quantity_available  DECIMAL(10,3)    NOT NULL DEFAULT 0,
  unit_cost           DECIMAL(12,4)    NULL,
  purchase_order_id   INT UNSIGNED     NULL,
  notes               TEXT             NULL,
  created_by          INT UNSIGNED     NULL,
  created_at          DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_batch_item    (item_id, branch_id),
  INDEX idx_batch_expiry  (expiry_date),
  INDEX idx_batch_lot     (lot_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Órdenes de compra ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  branch_id       INT UNSIGNED    NOT NULL,
  supplier_id     INT UNSIGNED    NOT NULL,
  po_number       VARCHAR(30)     NOT NULL,
  status          ENUM('draft','sent','partial','received','cancelled') NOT NULL DEFAULT 'draft',
  ordered_date    DATE            NULL,
  expected_date   DATE            NULL,
  received_date   DATE            NULL,
  subtotal        DECIMAL(12,2)   NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0,
  total_amount    DECIMAL(12,2)   NOT NULL DEFAULT 0,
  notes           TEXT            NULL,
  created_by      INT UNSIGNED    NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_po_number (branch_id, po_number),
  INDEX idx_po_branch_status (branch_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  purchase_order_id   INT UNSIGNED    NOT NULL,
  item_id             INT UNSIGNED    NOT NULL,
  quantity_ordered    DECIMAL(10,3)   NOT NULL,
  quantity_received   DECIMAL(10,3)   NOT NULL DEFAULT 0,
  unit_cost           DECIMAL(12,4)   NOT NULL,
  subtotal            DECIMAL(12,2)   GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  lot_number          VARCHAR(60)     NULL,
  expiry_date         DATE            NULL,
  notes               TEXT            NULL,
  PRIMARY KEY (id),
  INDEX idx_poi_po   (purchase_order_id),
  INDEX idx_poi_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Alertas de stock ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_alerts (
  id              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  branch_id       INT UNSIGNED     NOT NULL,
  item_id         INT UNSIGNED     NOT NULL,
  alert_type      ENUM('low_stock','out_of_stock','expiring_soon','expired') NOT NULL,
  current_stock   DECIMAL(10,3)    NULL,
  threshold       DECIMAL(10,3)    NULL,
  expiry_date     DATE             NULL,
  notified        TINYINT(1)       NOT NULL DEFAULT 0,
  resolved        TINYINT(1)       NOT NULL DEFAULT 0,
  resolved_at     DATETIME         NULL,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_alert_branch  (branch_id, resolved),
  INDEX idx_alert_item    (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Columna supplier_id en inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS supplier_id INT UNSIGNED NULL AFTER is_active;

-- Columna lot_number en inventory_movements para trazabilidad
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS batch_id BIGINT UNSIGNED NULL COMMENT 'Lote usado' AFTER notes;
