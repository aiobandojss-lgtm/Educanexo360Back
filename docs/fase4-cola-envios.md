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

## 4.4 Proveedor de correo intercambiable

- `EMAIL_PROVIDER` = `smtp` (por defecto, lo de antes) | `ses` | `brevo` | `simulado` (desarrollo y pruebas:
  guarda en la colección `email_simulado`, nada sale a internet).
- Todo correo sale por la cola (`encolarCorreo`): reintentos, cupo diario y lotes de ~50 destinatarios.
  Los proveedores **lanzan error** si el envío falla; nunca se descarta en silencio.
- **Cupo diario persistido** (colección `email_cupo`, un documento por día de Colombia): reemplaza el tope en
  memoria de 250/día. `EMAIL_DAILY_LIMIT` es el total del día; `EMAIL_RESERVA_ALTA` se reserva para
  prioridad alta (reset de contraseña, alertas, cuentas). Lo que no cabe queda `PENDIENTE` para el día
  siguiente a las 00:05 (hora Colombia), sin gastar intento, y se registra en el log.
- Plantillas en `src/services/email/plantillas.ts`: todo dato de usuario pasa por `escapeHtml` y los enlaces
  por `urlSegura` (solo http/https).
- Reset de contraseña: prioridad alta. Si no se puede encolar → 503 y el token se invalida. El enlace
  (con el token) se borra del trabajo al terminar (`sensible`).

### Variables de entorno

| Variable | Proveedor | Uso |
|---|---|---|
| `EMAIL_PROVIDER` | todos | `smtp` \| `ses` \| `brevo` \| `simulado` |
| `EMAIL_SENDER_NAME`, `EMAIL_SENDER_EMAIL` | todos | Remitente (p. ej. `EducaNexo360` / `no-reply@creativebycode.com`) |
| `EMAIL_DAILY_LIMIT` | todos | Tope diario (por defecto 250). Brevo gratis: 300. SES: según la cuota de la cuenta |
| `EMAIL_RESERVA_ALTA` | todos | Cupo reservado para prioridad alta (por defecto 20) |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SECURE`, `EMAIL_TLS_REJECT_UNAUTHORIZED` | smtp | Como antes |
| `EMAIL_SMTP_MAX_CONNECTIONS` | smtp | Conexiones del pool (por defecto 2) |
| `EMAIL_SMTP_RATE_LIMIT` | smtp | Mensajes por segundo (por defecto 5) |
| `AWS_SES_REGION` (o `AWS_REGION`) | ses | Región de SES (p. ej. `us-east-1`) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | ses | Usuario IAM con permiso `ses:SendEmail` únicamente |
| `AWS_SES_CONFIGURATION_SET` | ses | Opcional: configuration set (rebotes/quejas) |
| `BREVO_API_KEY` | brevo | API key v3 (Brevo → SMTP & API → API Keys) |

### Configurar Brevo

1. Crear la cuenta en brevo.com (plan gratis: 300 correos/día).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain**: `creativebycode.com`.
3. Brevo muestra los registros DNS. Crearlos en el DNS del dominio (cPanel → Zone Editor):
   - **TXT** `brevo-code:...` en `@` (verificación del dominio).
   - **DKIM**: los registros que Brevo indique (CNAME `brevo1._domainkey` y `brevo2._domainkey`, o un TXT
     `mail._domainkey`, según la versión del panel).
   - **SPF**: un solo TXT en `@`. Si ya existe uno, agregar `include:spf.brevo.com` al mismo registro, p. ej.
     `v=spf1 +a +mx include:spf.brevo.com ~all` (nunca dos registros SPF).
   - **DMARC**: TXT en `_dmarc`: `v=DMARC1; p=none; rua=mailto:dmarc@creativebycode.com` (empezar con
     `p=none`, revisar los reportes y subir a `quarantine` cuando todo esté alineado).
4. Esperar a que Brevo marque el dominio como autenticado. Crear el remitente `no-reply@creativebycode.com`.
5. **SMTP & API → API Keys → Generate**: poner la clave en `BREVO_API_KEY` (solo en el entorno de cPanel).
6. `EMAIL_PROVIDER=brevo`, `EMAIL_DAILY_LIMIT=300` (o el tope del plan) y reiniciar la app.

### Configurar Amazon SES

1. Consola AWS → **Amazon SES** en la región elegida (p. ej. `us-east-1`).
2. **Configuration → Identities → Create identity → Domain** `creativebycode.com`, con **Easy DKIM
   (RSA 2048)**. SES da 3 CNAME `xxxx._domainkey.creativebycode.com` → crearlos en el DNS.
3. **Custom MAIL FROM** (recomendado para alinear SPF): p. ej. `mail.creativebycode.com`. Crear el **MX**
   `feedback-smtp.<region>.amazonses.com` (prioridad 10) y el **TXT** `v=spf1 include:amazonses.com ~all` en
   `mail.creativebycode.com`.
4. **SPF del dominio raíz** (si no se usa MAIL FROM propio): agregar `include:amazonses.com` al TXT SPF existente.
5. **DMARC**: TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@creativebycode.com`.
6. **Salir del sandbox** (en sandbox solo se envía a direcciones verificadas y máx. 200/día): **Account
   dashboard → Request production access**. Tipo de correo: *Transactional*; sitio web; descripción del caso
   (plataforma educativa: notificaciones de mensajes, alertas de asistencia, recuperación de contraseña a
   usuarios registrados por su colegio; manejo de rebotes y quejas; los usuarios pueden elegir resumen
   diario o ningún correo). AWS responde en ~24 h con la cuota diaria y la tasa por segundo.
7. **IAM → Users → Create user** (sin consola) con una política que solo permita `ses:SendEmail` y
   `ses:SendRawEmail`. Crear la access key y ponerla en `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
8. `EMAIL_PROVIDER=ses`, `AWS_SES_REGION=<región>`, `EMAIL_DAILY_LIMIT=<cuota diaria de SES>` y reiniciar.
9. Recomendado: un configuration set con destino SNS para rebotes y quejas (`AWS_SES_CONFIGURATION_SET`).

> Nota: el SDK de AWS v3 avisa que sus versiones publicadas desde enero de 2027 exigirán Node ≥ 22. La versión
> instalada funciona con Node 20; al actualizar dependencias, verificar la versión de Node del hosting.

## 4.3 Push masivo y varios dispositivos

- `Usuario.fcmTokens: [{ token, platform, deviceInfo, updatedAt }]`, máximo 5 por usuario: al registrar uno
  nuevo sale el más viejo. `fcmToken`/`platform` (campos antiguos) quedan con el último dispositivo.
- `POST /notificaciones/register-token` (y su alias `fcm-token`) **agregan** el dispositivo. Un token pertenece
  a un solo usuario: se quita de cualquier otra cuenta. `fcmToken: null` desvincula todos (APK 1.0.0).
- `POST /notificaciones/unregister-token` con `fcmToken` quita solo ese dispositivo; **sin** `fcmToken` quita
  todos (antes respondía 400).
- Las APK viejas envían lo mismo que antes y siguen funcionando. Además ahora varios celulares del mismo
  usuario reciben el push (antes el último pisaba al anterior).
- Envío: trabajos `push` en la cola, de ~50 usuarios cada uno. El worker lee sus tokens en una consulta, envía
  con `sendEachForMulticast` en bloques de 500 y limpia los inválidos con un `$pull`. Los datos que recibe la
  app (`tipo`, `mensajeId`, `tareaId`, `anuncioId`, `eventoId`, `estudianteId`) no cambian.
- Pasan por la cola: anuncios, calendario (una sola vez por evento, 3.Y), tareas, ausencias y alertas de
  asistencia. Las alertas **ahora también envían push** (antes estaba pendiente); abren el mensaje de la alerta.
- `PUSH_PROVIDER=simulado` (solo pruebas): no llama a Firebase.

### Migración de tokens e índice único (en el deploy)

El índice único `fcmTokens_token_unico` (`{ 'fcmTokens.token': 1 }`, parcial por `$type: 'string'`) está
declarado en el schema con `_autoIndex: false`: **no** se crea al arrancar. Pasos:

1. `mongodump` de Atlas.
2. Deploy del código y reinicio (la migración perezosa empieza sola: cada registro mueve el token antiguo al
   arreglo).
3. Simulación: `MONGODB_URI="..." node src/scripts/migrar-fcm-tokens.js` (informa duplicados y copias; no
   cambia nada). `sync-indexes.js` en simulación muestra el índice como faltante.
4. `MONGODB_URI="..." node src/scripts/migrar-fcm-tokens.js --aplicar`: deduplica (gana el registro más
   reciente), copia `fcmToken → fcmTokens` y **al final** crea el índice único. Se puede volver a correr (es
   idempotente).
