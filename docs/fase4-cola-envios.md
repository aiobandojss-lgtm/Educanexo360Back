# Fase 4 — Cola de envíos, push masivo y correo

Guía operativa del backend. Se amplía en cada ítem de la Fase 4.

## 4.1 Cola (outbox) en MongoDB

- Colección `outbox` (modelo `src/models/outbox.model.ts`). Cada documento es un trabajo: un correo, un lote
  de ~50 destinatarios de push o correo, las copias a acudientes de un mensaje, el resumen diario, etc.
- Estados: `PENDIENTE` → `PROCESANDO` → `HECHO` | `FALLIDO`.
- **Worker** (`src/queue/outbox.ts`): corre dentro del mismo proceso de Node (Passenger, sin Redis), con un
  `setInterval` de `OUTBOX_INTERVAL_MS` (5 s). Arranca después de conectar Mongo y se detiene limpio en
  `SIGTERM` (espera los trabajos en curso).
  - Toma trabajos con `findOneAndUpdate` atómico. Primero la prioridad `alta`, con concurrencia acotada.
  - Reintentos con backoff exponencial (30 s, 1, 2, 4 min). Al llegar a `OUTBOX_MAX_INTENTOS` (5) → `FALLIDO`,
    con el error guardado y registrado en el log.
  - Si el proceso muere a mitad de un trabajo, su `lockedUntil` vence y el siguiente tick lo retoma.
  - **Entrega "al menos una vez"**: si el proceso muere después de enviar y antes de marcar `HECHO`, ese
    trabajo se repite. Los lotes guardan en `enviados` los ids ya atendidos, así el reintento no los repite.
- **Espacio en el M0**: `HECHO` y `FALLIDO` se borran solos 7 días después (índice TTL sobre `expireAt`).
  Los `PENDIENTE` nunca expiran.

### ⚠️ Riesgo: Passenger dormido

Passenger puede apagar la app cuando no hay tráfico. Con la app dormida **la cola no avanza** y el resumen
diario de las 18:00 no sale hasta la siguiente petición. Mitigación (una de las dos):

1. `PassengerMinInstances 1` en la configuración de la app (si el hosting lo permite), o
2. Un **cron de cPanel** cada 5 minutos que haga ping al health check:
   ```
   */5 * * * * curl -s https://<dominio>/educanexo360/api/health > /dev/null
   ```

### Cómo verificar en producción que el worker corre

`GET /api/system/outbox` con token de **SUPER_ADMIN** (toda la cola, o `?escuelaId=`). Un **ADMIN** solo ve
los trabajos de su colegio; los demás roles reciben 403. Responde:

- `worker.activo` y `worker.ultimoTick`: el último tick debe tener menos de ~5 s (o el tiempo desde que la app
  despertó).
- `conteos` por estado. `PENDIENTE` alto y creciendo = el worker no corre o el proveedor falla.
- `pendienteMasAntiguo`: si su `nextRunAt` quedó muy atrás, la cola está atascada.
- `fallidosRecientes`: los últimos 10 `FALLIDO` con su error.

En el log de arranque debe aparecer `[Outbox] Worker iniciado (cada 5000 ms, concurrencia 5)`.

### Variables de entorno (opcionales)

| Variable | Por defecto | Uso |
|---|---|---|
| `OUTBOX_INTERVAL_MS` | 5000 | Intervalo del worker |
| `OUTBOX_BATCH` | 20 | Trabajos máximos por tick |
| `OUTBOX_CONCURRENCY` | 5 | Trabajos en paralelo |
| `OUTBOX_MAX_INTENTOS` | 5 | Intentos antes de `FALLIDO` |
| `OUTBOX_LOCK_MS` | 120000 | Tiempo tras el cual un `PROCESANDO` se considera abandonado |
| `OUTBOX_BACKOFF_MS` | 30000 | Base del backoff exponencial |
| `OUTBOX_DISABLED` | — | `true` desactiva el worker (scripts y pruebas) |
