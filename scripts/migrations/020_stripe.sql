-- 020_stripe.sql
-- Integración Stripe para cobro automático por plan

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS stripe_price_id        VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS billing_email          VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS next_billing_date      DATE NULL;

CREATE TABLE IF NOT EXISTS subscription_events (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id           INT UNSIGNED NOT NULL,
  event_type       VARCHAR(60)  NOT NULL,
  stripe_event_id  VARCHAR(80)  NULL,
  amount_cents     INT UNSIGNED NULL,
  currency         VARCHAR(3)   DEFAULT 'usd',
  payload          JSON,
  processed_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stripe_event (stripe_event_id),
  INDEX idx_org     (org_id),
  INDEX idx_type    (event_type),
  INDEX idx_created (processed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
