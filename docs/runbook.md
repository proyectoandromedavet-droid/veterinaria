# Runbook

## 1. MySQL caído

- Verificar `GET /health/ready` del servicio afectado.
- Revisar conectividad a `MYSQL_HOST` y credenciales.
- Confirmar si la réplica también está degradada.
- Si el primario volvió, los pools reintentan warm-up al reiniciar proceso.
- Si hubo failover externo, actualizar `MYSQL_*` y `MYSQL_READ_*`.

## 2. Redis caído

- El sistema entra en modo degradado:
  - revocación de JWT puede no consultarse,
  - RBAC dinámico puede quedar sólo con permisos base,
  - pub/sub de notificaciones se degrada.
- Recuperar Redis y reiniciar gateway/auth/notifications si hace falta recalentar cache.

## 3. Falla de refresh token

- Revisar cookies `refreshToken` y `accessToken`.
- Confirmar `SameSite`, `secure` y path `/api/v1/auth/refresh`.
- Buscar eventos `AUTH_005` o `AUTH_006`.
- Si hubo replay, revocar sesiones del usuario.

## 4. OpenAI/IA degradado

- Revisar estado del breaker en `/api/v1/health/services`.
- Si está `OPEN`, esperar el timeout configurado o reiniciar el servicio AI tras resolver credenciales/red.
- El flujo clínico debe seguir sin depender del diagnóstico asistido.

## 5. Notificaciones fallidas

- Consultar `GET /notifications/retries`.
- Confirmar credenciales Twilio/FCM/SMTP.
- Los jobs reintentan automáticamente con backoff.
- Si un job queda `failed`, reprocesarlo manualmente reenqueuándolo.

## 6. Disco lleno

- Limpiar `logs/` y verificar rotación.
- Revisar tamaño de backups locales.
- Verificar tablas `audit_logs`, `notification_logs`, `message_logs`.

## 7. Staging deploy falló

- Revisar workflow `CI` en GitHub Actions.
- Verificar secretos `STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`.
- Repetir deploy desde el commit estable anterior si el último quedó inconsistente.
