-- 024_permission_audit.sql
-- Auditoria de cambios de roles y overrides de permisos

CREATE TABLE IF NOT EXISTS permission_change_audit (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id                BIGINT UNSIGNED NOT NULL,
  actor_user_id         BIGINT UNSIGNED NULL,
  target_user_id        BIGINT UNSIGNED NULL,
  target_role_name      VARCHAR(60) NULL,
  action_type           ENUM('user_role_assigned','user_role_changed','user_role_revoked','role_override_updated','role_override_deleted') NOT NULL,
  previous_value_json   JSON NULL,
  new_value_json        JSON NULL,
  request_id            VARCHAR(64) NULL,
  ip_address            VARCHAR(45) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pca_org_created (org_id, created_at),
  INDEX idx_pca_target_user (target_user_id, created_at),
  INDEX idx_pca_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
