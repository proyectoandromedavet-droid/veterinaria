# Kubernetes Probes

Manifiestos base con `livenessProbe` y `readinessProbe` diferenciados.

- `gateway`: `/health/live` y `/health/ready`
- `auth`: `/health/live` y `/health/ready`
- `medical`: `/health/live` y `/health/ready`
- `notifications`: `/health/live` y `/health/ready`
- `ai`: `/health/live` y `/health/ready`
- `portal`: `/health/live` y `/health/ready`

Aplicar:

```bash
kubectl apply -f k8s/
```

