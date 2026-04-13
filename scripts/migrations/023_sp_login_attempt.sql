-- ============================================================
-- 023_sp_login_attempt.sql
-- Stored procedure para control de intentos de login fallidos
-- a nivel de base de datos (segunda capa, complementa Redis).
--
-- Lógica:
--   1. Verifica si la cuenta está bloqueada (locked_until > NOW())
--   2. Registra el intento fallido si se requiere (llamar tras verificar credenciales)
--   3. Bloquea la cuenta tras N intentos consecutivos
--
-- Umbrales:
--   5  intentos → bloqueo 5 min
--   10 intentos → bloqueo 30 min
--   15 intentos → bloqueo 24 h
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_login_attempt$$

CREATE PROCEDURE sp_login_attempt(
  IN  p_email      VARCHAR(255),
  IN  p_ip_address VARCHAR(45)
)
BEGIN
  DECLARE v_user_id        BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_locked_until   DATETIME        DEFAULT NULL;
  DECLARE v_failed_attempts TINYINT UNSIGNED DEFAULT 0;

  -- Buscar usuario activo
  SELECT id, locked_until, failed_login_attempts
  INTO   v_user_id, v_locked_until, v_failed_attempts
  FROM   users
  WHERE  email = p_email
    AND  is_active = TRUE
  LIMIT  1;

  -- Si no existe el usuario devolver estado neutro (no revelar si el email existe)
  IF v_user_id IS NULL THEN
    SELECT FALSE AS locked, NULL AS locked_until, 0 AS failed_attempts;
    LEAVE sp_login_attempt;
  END IF;

  -- Verificar si la cuenta está bloqueada
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    SELECT TRUE AS locked, v_locked_until AS locked_until, v_failed_attempts AS failed_attempts;
  ELSE
    -- Si el bloqueo expiró, limpiar (se actualizará en el siguiente intento exitoso o fallido)
    IF v_locked_until IS NOT NULL AND v_locked_until <= NOW() THEN
      UPDATE users
      SET    locked_until          = NULL,
             failed_login_attempts = 0
      WHERE  id = v_user_id;
      SET v_failed_attempts = 0;
    END IF;

    SELECT FALSE AS locked, NULL AS locked_until, v_failed_attempts AS failed_attempts;
  END IF;
END$$

-- ────────────────────────────────────────────────────────────────────────────
-- sp_record_failed_login: registra un intento fallido y aplica lockout si corresponde
-- Llamar DESPUÉS de verificar que las credenciales son incorrectas.
-- ────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS sp_record_failed_login$$

CREATE PROCEDURE sp_record_failed_login(
  IN p_email      VARCHAR(255),
  IN p_ip_address VARCHAR(45)
)
BEGIN
  DECLARE v_user_id        BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_failed_attempts TINYINT UNSIGNED DEFAULT 0;
  DECLARE v_new_attempts    TINYINT UNSIGNED DEFAULT 0;
  DECLARE v_lock_until      DATETIME DEFAULT NULL;

  SELECT id, failed_login_attempts
  INTO   v_user_id, v_failed_attempts
  FROM   users
  WHERE  email     = p_email
    AND  is_active = TRUE
  LIMIT  1;

  IF v_user_id IS NULL THEN
    LEAVE sp_record_failed_login;
  END IF;

  SET v_new_attempts = v_failed_attempts + 1;

  -- Determinar si corresponde bloqueo y por cuánto tiempo
  CASE
    WHEN v_new_attempts >= 15 THEN SET v_lock_until = DATE_ADD(NOW(), INTERVAL 24 HOUR);
    WHEN v_new_attempts >= 10 THEN SET v_lock_until = DATE_ADD(NOW(), INTERVAL 30 MINUTE);
    WHEN v_new_attempts >= 5  THEN SET v_lock_until = DATE_ADD(NOW(), INTERVAL 5 MINUTE);
    ELSE                           SET v_lock_until = NULL;
  END CASE;

  UPDATE users
  SET    failed_login_attempts = v_new_attempts,
         locked_until          = v_lock_until,
         updated_at            = NOW()
  WHERE  id = v_user_id;

END$$

-- ────────────────────────────────────────────────────────────────────────────
-- sp_clear_failed_logins: limpia el contador al login exitoso
-- ────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS sp_clear_failed_logins$$

CREATE PROCEDURE sp_clear_failed_logins(IN p_user_id BIGINT UNSIGNED)
BEGIN
  UPDATE users
  SET    failed_login_attempts = 0,
         locked_until          = NULL,
         updated_at            = NOW()
  WHERE  id = p_user_id;
END$$

-- ────────────────────────────────────────────────────────────────────────────
-- sp_revoke_user_sessions: revoca todas las sesiones activas de un usuario
-- ────────────────────────────────────────────────────────────────────────────

DROP PROCEDURE IF EXISTS sp_revoke_user_sessions$$

CREATE PROCEDURE sp_revoke_user_sessions(IN p_user_id BIGINT UNSIGNED)
BEGIN
  UPDATE sessions
  SET    is_revoked  = TRUE,
         revoked_at  = NOW()
  WHERE  user_id     = p_user_id
    AND  is_revoked  = FALSE;
END$$

DELIMITER ;
