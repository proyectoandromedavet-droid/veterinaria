-- 018_business_rules.sql
-- Motor de reglas de negocio configurables por veterinaria

CREATE TABLE IF NOT EXISTS business_rules (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id         INT UNSIGNED  NOT NULL,
  branch_id      INT UNSIGNED  NULL,
  rule_type      VARCHAR(40)   NOT NULL,
  name           VARCHAR(120)  NOT NULL,
  description    TEXT,
  conditions     JSON          NOT NULL,
  action         ENUM('block','warn','alert') DEFAULT 'warn',
  action_message VARCHAR(255),
  priority       SMALLINT      DEFAULT 100,
  is_active      BOOLEAN       DEFAULT TRUE,
  created_by     INT UNSIGNED  NULL,
  created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_org_type (org_id, rule_type, is_active),
  INDEX idx_branch   (branch_id),
  INDEX idx_priority (org_id, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
