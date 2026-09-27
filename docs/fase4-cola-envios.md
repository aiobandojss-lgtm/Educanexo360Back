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

## 4.6 Notificaciones

- Se crean siempre con `insertMany` (las alertas de asistencia creaban una por destinatario; los mensajes pasan
  a `insertMany` en 4.2). Se eliminó `sendMessageNotification` (sin ruta; enviaba y creaba en loop).
- **TTL de 180 días** sobre `createdAt` (índice `ttl_180_dias`): las notificaciones de más de 6 meses se
  borran solas, leídas o no. El índice `{ usuarioId, createdAt: -1 }` no es redundante y se queda.
- En el deploy Mongoose crea el índice al arrancar. La **primera pasada** del monitor TTL borra de golpe todas
  las notificaciones de más de 180 días (en lotes, cada 60 s).

## 4.2 Mensajes sin trabajo pesado en el request

`crearMensaje`, `responder`, `enviarBorrador` y las copias a acudientes: se guarda el mensaje, se hace **un**
`insertMany` de notificaciones y **un** `insertMany` en la cola (correos y push en lotes de ~50), y se responde
de inmediato con la misma forma de siempre.

- Se eliminaron los envíos en loop dentro del request: `enviarNotificacionesEnBatch` (notificación + correo
  por destinatario, en lotes de 20 con pausas) y los bloques de push por destinatario de `crear` y `responder`.
- **Copias a acudientes** por la cola (trabajo `copias-acudientes`, ~50 estudiantes por trabajo). Aparecen unos
  segundos después del mensaje. Son idempotentes: campo `copiaDe { mensajeId, estudianteId }` con índice único
  parcial, así un reintento no duplica copias.
- `enviarBorrador` **ahora notifica** a los destinatarios (campanita, correo y push); antes no avisaba a nadie.
- Un mensaje creado como `BORRADOR` por `POST /mensajes` ya no genera copias a acudientes (antes sí).
- Push: prioridad ALTA o asunto con "urgente"/"emergencia" → `tipo: 'urgente'` con sonido `emergency`; si no,
  `tipo: 'mensaje'` (los mismos datos que antes). Solo se encolan push para usuarios con algún dispositivo.
- Medición (seed de escala, mensaje a los 60 cursos = 4.600 destinatarios, local): **respuesta 201 en ~680 ms**
  (antes: minutos, con envíos en el request); el worker completa 184 trabajos (4.600 correos simulados y 92
  llamadas a FCM con 4.467 tokens) en ~5,6 s a velocidad máxima. En producción, con el intervalo de 5 s y 20
  trabajos por tick, son ~10 ticks (~50 s).

## 4.5 Resumen diario para acudientes

- `Usuario.preferencias.email`: `inmediato` | `resumen` | `ninguno` (sin default en el schema). Si no la ha
  elegido: **ACUDIENTE → `resumen`**, los demás roles → `inmediato`.
- `GET /api/usuarios/me/preferencias` y `PUT /api/usuarios/me/preferencias` (`{ "email": "resumen" }`),
  autenticados. La pantalla web/app es de una fase posterior.
- Siempre salen de inmediato: mensajes de **prioridad ALTA**, **alertas** de asistencia y correos de cuenta
  (reset, credenciales, registro). `ninguno` solo suprime los correos de mensajes normales.
- Con `resumen`, el correo inmediato del mensaje se **omite** y la notificación queda marcada
  (`metadata.resumen`). A las **18:00 hora Colombia** (`RESUMEN_HORA`) el worker encola una vez el trabajo
  `resumen-diario` del día (`claveUnica resumen:YYYY-MM-DD`, idempotente aunque el proceso se reinicie), que manda
  un correo por usuario con **solo** esos mensajes y solo los que **siguen sin leer**. Nunca un resumen vacío.
- Por **marcas**, no por día (auditoría 4.B): el resumen toma todo lo marcado de las últimas 48 h y, al encolar el
  correo del usuario, quita la marca y guarda `metadata.resumenEnviadoEn`. Lo que llega después de las 18:00 va en
  el resumen siguiente.
- Recuperación (auditoría 4.C): antes de las 18:00 cada tick encola el resumen de **ayer** si no salió (proceso
  dormido a la hora); la `claveUnica` evita duplicarlo.
- El enlace para cambiar la preferencia usa `EMAIL_PREFERENCIAS_URL` (opcional). Si no está, el correo dice
  "desde tu perfil".
- ⚠️ Si el proceso duerme a las 18:00, el resumen sale en cuanto despierte (al día siguiente como tarde); con el
  cron de ping sale a su hora.

## 4.7 Credenciales por correo

- Al aprobar una solicitud de registro ya **no** se envían contraseñas en texto plano. Para el acudiente y cada
  estudiante nuevo se genera un token aleatorio de 32 bytes **al enviar el correo** (auditoría 4.E: nunca queda un
  token en claro en `outbox`). Solo se guarda su **hash** sha256 en `resetPasswordToken`, vence en **72 h** y es de
  **un solo uso**.
- Los correos de cuenta (reset 1 h, bienvenida y reenvío 72 h) van con prioridad **crítica** (`correo-cuenta`),
  con reserva de cupo propia (`EMAIL_RESERVA_CRITICA`) y `caducaEn`: si no pueden salir antes de que venza el
  enlace, el trabajo queda `FALLIDO` registrado en vez de llegar tarde.
- El correo de bienvenida (plantilla `credenciales`) lleva los enlaces
  `FRONTEND_URL/reset-password/<token>`, que abren la **página existente del React** (`/reset-password/:token`,
  `pages/auth/ResetPassword.tsx`). Esa página llama a `POST /api/auth/reset-password { token, password }`, el
  mismo flujo del reset. El acudiente recibe su enlace y uno por cada estudiante nuevo (los estudiantes tienen
  correo generado por el sistema). Los estudiantes que ya tenían cuenta solo aparecen como asociados.
- Si el enlace del acudiente vence, usa "¿Olvidaste tu contraseña?". El estudiante no recibe correos: el colegio
  reenvía su enlace con `POST /api/usuarios/:id/reenviar-enlace-password` (auditoría 4.P; roles administrativos,
  mismo colegio y rango inferior). El enlace nuevo va a sus acudientes e invalida los anteriores. Se quitó el dominio fijo
  (`educanexo360-web.vercel.app`): todo sale de `FRONTEND_URL`.
- Para verificarlo en la web: aprobar una solicitud de prueba, abrir el enlace del correo
  (`https://<FRONTEND_URL>/reset-password/<token>`), definir la contraseña e iniciar sesión.

## Correcciones de la auditoría (4.A–4.Q)

| Ítem | Qué cambió |
|---|---|
| 4.A | Seguridad: token, platform y deviceInfo del usuario van como `$literal` en los pipelines FCM (un token `"$$ROOT"` copiaba el documento del usuario, con el hash de la contraseña). Validación del formato del token, deviceInfo acotado. El script de migración quita tokens no string. |
| 4.B / 4.C | Resumen por marcas y recuperación del resumen de ayer (ver 4.5). |
| 4.D | Crear/enviar mensaje encola UN trabajo `despachar-mensaje` idempotente (campanita + correo + push con reintentos). La campanita llega a los pocos segundos, no dentro del request. |
| 4.E | Correos de cuenta con prioridad crítica, reserva propia y token creado al enviar (ver 4.7). |
| 4.F | Cerrar un trabajo (HECHO/reintento) se reintenta 3 veces con filtro por lock; un error al marcarlo no reenvía. |
| 4.G | Timeouts: proveedor de correo (`EMAIL_TIMEOUT_MS`) y por trabajo (`OUTBOX_TIMEOUT_TRABAJO_MS`; ver 4.S para el cálculo actual). |
| 4.H | Rechazos permanentes (dirección inexistente) no se reintentan; correos enmascarados (`j***@x.com`) en logs y en `outbox.error`. |
| 4.I | Push: los dispositivos con error transitorio de FCM se reintentan solos (máx. 3, backoff `PUSH_REINTENTO_BASE_MS`). |
| 4.J | Si falla marcar un correo ya enviado no se reenvía ni se libera cupo. |
| 4.K | El cupo se libera en el día en que se reservó (fallos cerca de medianoche). |
| 4.L | El mensaje FCM ya no lleva `android.data` (reemplazaba a `data` en Android y se perdía `timestamp`). Mismos campos para la app. |
| 4.M | Dos ADMIN eliminando su cuenta a la vez: se revierte y responde 409 (nadie deja al colegio sin ADMIN). |
| 4.N | Las copias a acudientes siempre quedan con su despacho encolado. |
| 4.O | Enviar un borrador masivo por curso no genera copias a acudientes (igual que al crearlo). |
| 4.P | `POST /api/usuarios/:id/reenviar-enlace-password` (ver 4.7). |
| 4.Q | Documentado: desvincular sin token (`unregister-token` sin `fcmToken`, `fcmToken: null`) quita **todos** los dispositivos del usuario, a propósito (APK 1.0.0). |

## Correcciones de la segunda auditoría (4.R–4.AE)

| Ítem | Qué cambió |
|---|---|
| 4.R | SMTP: permanente **solo** RCPT TO con 550–554. MAIL FROM rechazado, DATA, 4xx (greylisting 451, "exceeded max emails per hour" de cPanel) se reintentan. |
| 4.T | SES (SESv2) y Brevo: permanente solo el rechazo de la **dirección** del destinatario. Remitente/dominio sin verificar, sandbox, remitente inactivo = configuración: se reintenta y termina `FALLIDO` registrado. |
| 4.W | Todo error que el worker guarda en `outbox.error` o registra en el log pasa por `enmascararEmailsEnTexto`. |
| 4.S | Timeout de trabajo con **cancelación cooperativa** (`ctx.signal`, revisado antes de cada envío). Al vencer, el trabajo queda `PROCESANDO` hasta que vence su lock y se retoma desde `enviados`: sin duplicados ni doble cupo. Timeout por defecto = `OUTBOX_LOCK_MS − EMAIL_TIMEOUT_MS − margen` (85 s con los valores por defecto); si la configuración lo excede, se registra error y se usa el seguro. |
| 4.AA | Los trabajos previos al deploy sin `orden` se completan en el primer tick (no se adelantan a los críticos). |
| 4.Z | Si falta cupo para un destinatario del reenvío, las reservas previas se devuelven. |
| 4.V | Reenvío y reset: el enlace vigente **no se invalida** hasta entregar el nuevo; un rebote de un destinatario no corta a los demás (FALLIDO solo si no se llegó a nadie). |
| 4.U | Un correo de cuenta por usuario y ventana (reset 10 min, definir 5 min, `claveUnica`); reenviar-enlace → 429 "Ya se envió un enlace hace menos de 5 minutos" y máx. 20 por hora por actor. `encolar` espera a que exista el índice único de `claveUnica` (primer arranque). |
| 4.X | `migrar-fcm-tokens`: el paso 0 encuentra con `$elemMatch` a quien tiene tokens válidos e inválidos; con `--aplicar` el `$pull` corre siempre. |
| 4.Y | Índice único parcial `mensaje_usuario_unico` `{ entidadId, usuarioId }` (`entidadTipo: 'Mensaje'`): campanita idempotente en la base. Ver el paso de duplicados del deploy. |
| 4.AB | El reintento de push re-verifica que cada token siga siendo de los usuarios originales (teléfono compartido). |
| 4.AC | Claves de lote = hash de los ids del lote (despacho y resumen), usuarios ordenados por `_id`. |
| 4.AD | `despachar-mensaje` siempre con prioridad `alta`. |

## Correcciones de la tercera auditoría (4.AF–4.AO)

| Ítem | Qué cambió |
|---|---|
| 4.AF | SMTP: RCPT 550–554 es permanente **solo** con código 5.1.1/5.1.2/5.1.10 o texto claro de destinatario inexistente. 5.7.x o texto de policy/spam/blacklist/blocked/rate/exceeded/sender/relay = transitorio (también en Brevo y SES). **Cortocircuito**: ≥ 5 "permanentes" a dominios distintos en 10 min → transitorios durante 30 min. |
| 4.AH | Timeout TOTAL por envío también en SMTP (cola del pool, tarpit). |
| 4.AI | Si el handler termina durante la espera tras el abort, el trabajo se cierra con su resultado (no se reejecuta). |
| 4.AJ | `despachar-mensaje` y `resumen-diario` respetan la cancelación entre pasos. |
| 4.AL | Bienvenida: los hashes se guardan después de entregar; reenvío: se liberan reservas si falla guardar el enlace. |
| 4.AK | Despacho: marcas por usuario `metadata.emailEncolado` / `pushEncolado` en la campanita; el reintento excluye a quien ya lo tiene. |
| 4.AG | Correos: 8 intentos (`OUTBOX_MAX_INTENTOS_CORREO`), backoff con tope 30 min (`OUTBOX_BACKOFF_MAX_MS`), sin pasar de `caducaEn`. **Detector** de episodios (≥ 10 FALLIDO de correo o ≥ 20 fallos seguidos del proveedor en 15 min) → campanita + push a SUPER_ADMIN y ADMIN de los colegios afectados, una vez por episodio (cierra con un envío exitoso o 60 min sin fallos). `POST /api/system/outbox/reintentar-fallidos` (SUPER_ADMIN). `GET /api/system/outbox` muestra `pendientesConError` y, para SUPER_ADMIN, `correo` (episodio y cortocircuito). |
| 4.AM | El script de duplicados conserva ARCHIVADA > LEIDA > PENDIENTE (no des-archiva). |
| 4.AN | `POST /api/notificaciones` y `/masiva` rechazan `entidadTipo: 'Mensaje'` (400). |
| 4.AO | Brechas documentadas abajo y en el plan de deploy. |

### Brechas conocidas (documentadas, auditorías 4.S, 4.AE y 4.AO)

- **Despacho sin encolar (4.AE):** si `encolarDespacho` falla dos veces fuera de un trabajo (al crear o enviar un
  mensaje, p. ej. Atlas caído en ese instante), el mensaje queda guardado **sin campanita, correo ni push**; solo
  queda un `console.error` con el id del mensaje. No hay reconciliación automática. Dentro de un trabajo
  (copias a acudientes) el error sí se propaga y el trabajo se reintenta.
- **Duplicado residual del timeout (4.S):** si el proveedor ya aceptó un correo pero su respuesta llega después de
  `EMAIL_TIMEOUT_MS`, el envío cuenta como error, no queda en `enviados` y el reintento lo manda otra vez.
- **Reenvío con fallo temporal (4.V):** si un envío del reenvío falla de forma temporal después de haber entregado
  a otro destinatario, el reintento genera un token nuevo y reenvía a todos (el último enlace es el que vale).
- **Límite por actor en memoria (4.U/4.AO):** el tope de 20 reenvíos por hora vive en el proceso; un reinicio lo
  pone en cero (la ventana por usuario sí está en la base).
- **Ventanas fijas (4.U/4.AO):** las ventanas de 10 min (reset) y 5 min (reenvío) son bloques fijos del reloj, no
  deslizantes: "hace menos de 5 minutos" es aproximado (dos solicitudes a ambos lados del borde de un bloque pueden
  generar dos correos con pocos segundos de diferencia).
- **Reintentos de push anteriores a d47c9e2 (4.AO):** los trabajos de reintento de tokens (`payload.tokens`) creados
  antes de la 4.AB no traen `usuarioIds` y se descartan sin enviar. Solo afecta a trabajos creados con código de
  pruebas: esa versión nunca se desplegó.
- **Detector y cortocircuito en memoria (4.AG/4.AF):** un reinicio en medio de un episodio puede avisar de nuevo;
  el cortocircuito se reinicia con el proceso.
- **Push del aviso de episodio:** usa `data.tipo: 'sistema'` (nuevo); conviene verificar en la app qué hace al
  tocarlo (sin navegación específica).

## 4.8 Pruebas y medición (seed de escala, MongoDB local, proveedores simulados)

Colegio de escala: 2.000 estudiantes, 2.600 acudientes, 90 docentes, 60 cursos, 50.000 mensajes previos.

| Escenario | Resultado |
|---|---|
| Mensaje a todo el colegio (60 cursos, 4.600 destinatarios) | 201 en ~0,55–0,93 s (caché caliente / recién sembrado). Servicio: ~550 ms con 4.600 y ~410 ms con 3.252 destinatarios |
| Trabajos generados | 40 de correo (2.000 inmediatos: estudiantes; los acudientes van al resumen) + 92 de push (4.467 tokens) + 1 resumen diario → 52 trabajos (2.600 correos, uno por acudiente) |
| Tiempo del worker a velocidad máxima | ~6,5 s para todo el mensaje (en producción con 5 s/20 trabajos por tick: ~1 minuto) |
| Caída del proceso a mitad de lote (kill sin apagado limpio, 3.000 correos) | El segundo proceso retoma al vencer el lock: 60/60 trabajos HECHO, 3.000/3.000 destinatarios, **4 duplicados** (el correo en vuelo de cada trabajo al morir) |
| Proveedor de correo caído | 40/40 trabajos → FALLIDO tras 5 intentos con el error registrado; 0 correos; cupo devuelto; el push no se afecta |
| Tope diario 1.000 con reserva alta 100 | 900 normales salen, el resto queda PENDIENTE para mañana 00:05 sin gastar intentos; 50 de prioridad alta salen de la reserva; al llegar a 1.000 también la alta se aplaza (no se pierde) |

**Tamaño en el M0** tras un mensaje a todo el colegio y su resumen del día: `outbox` 185 documentos, ~1,5 MB de datos
(~260 KB comprimidos en disco) + ~128 KB de índices; se borran solos a los 7 días. `email_cupo`: 1 documento por día
(~75 B; 20 KB mínimos de asignación en disco) + índices ~40 KB; TTL de 60 días. Total: **< 0,5 MB en disco por
mensaje masivo**, dentro de la semana de retención.

## Variables de entorno nuevas (resumen)

| Variable | Por defecto | Uso |
|---|---|---|
| `EMAIL_PROVIDER` | `smtp` | `smtp` \| `ses` \| `brevo` (\| `simulado` solo pruebas) |
| `EMAIL_DAILY_LIMIT` | 250 | Tope diario de correos |
| `EMAIL_RESERVA_ALTA` | 20 | Cupo reservado para prioridad alta |
| `EMAIL_RESERVA_CRITICA` | 20 | Cupo reservado para correos de cuenta (reset, bienvenida, reenvío de enlace) |
| `EMAIL_TIMEOUT_MS` | 30000 | Tiempo máximo por envío al proveedor de correo |
| `OUTBOX_TIMEOUT_TRABAJO_MS` | lock − EMAIL_TIMEOUT − margen (85000) | Tiempo máximo por trabajo. Si se define mayor que ese máximo seguro, se registra error y se usa el seguro (4.S) |
| `OUTBOX_MAX_INTENTOS_CORREO` | 8 | Intentos de `email` y `correo-cuenta` antes de FALLIDO (4.AG) |
| `OUTBOX_BACKOFF_MAX_MS` | 1800000 | Tope del backoff exponencial (30 min, 4.AG) |
| `PUSH_REINTENTO_BASE_MS` | 60000 | Base del backoff para reintentar dispositivos con error transitorio de FCM (x2, máx. 3) |
| `EMAIL_SMTP_MAX_CONNECTIONS` / `EMAIL_SMTP_RATE_LIMIT` | 2 / 5 | Pool SMTP |
| `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_CONFIGURATION_SET` | — | Amazon SES |
| `BREVO_API_KEY` | — | Brevo |
| `EMAIL_PREFERENCIAS_URL` | — | Enlace "cambiar preferencia" en el resumen (opcional) |
| `RESUMEN_HORA` | 18 | Hora (Colombia) del resumen diario |
| `OUTBOX_INTERVAL_MS`, `OUTBOX_BATCH`, `OUTBOX_CONCURRENCY`, `OUTBOX_MAX_INTENTOS`, `OUTBOX_LOCK_MS`, `OUTBOX_BACKOFF_MS` | 5000, 20, 5, 5, 120000, 30000 | Worker de la cola |
| `FRONTEND_URL` | (ya existía) | Base de todos los enlaces de correo (mensajes, reset, definir contraseña) |

Solo para pruebas o mantenimiento (no definir en producción): `OUTBOX_DISABLED`, `PUSH_PROVIDER=simulado`,
`EMAIL_SIMULADO_FALLA`, `EMAIL_SIMULADO_DEMORA_MS`, `RESUMEN_DIARIO_DESACTIVADO`, `BREVO_API_URL` (apunta Brevo a un
servidor local en las pruebas).

## Plan de deploy de la Fase 4

Decisión de Aymer y el orquestador: el deploy va con **`EMAIL_PROVIDER=brevo`**. El SMTP de cPanel (con MagicSpam)
queda como alternativa.

1. **Brevo (OBLIGATORIO, antes del FTP)** — ver "Configurar Brevo":
   1. Cuenta en brevo.com (plan gratis: 300 correos/día).
   2. Dominio `creativebycode.com` en Brevo (Senders, Domains & Dedicated IPs → Domains).
   3. En **cPanel → Zone Editor**: TXT `brevo-code`, DKIM (los CNAME/TXT que indique Brevo), **SPF** (un solo TXT en
      `@` con `include:spf.brevo.com`, sin duplicar registros SPF) y **DMARC** (`_dmarc`: `v=DMARC1; p=none; rua=...`).
   4. Esperar a que Brevo marque el dominio como autenticado y crear el remitente `no-reply@creativebycode.com`.
   5. Generar la API key (SMTP & API → API Keys). En las variables de cPanel: `BREVO_API_KEY=<clave>`,
      `EMAIL_PROVIDER=brevo`, `EMAIL_DAILY_LIMIT=300`, `EMAIL_SENDER_EMAIL=no-reply@creativebycode.com`,
      `EMAIL_SENDER_NAME=EducaNexo360`.
2. `mongodump` de Atlas (M0 sin backups). **Obligatorio**: al arrancar, Mongoose crea el índice TTL de 180 días de
   `notificacions` y MongoDB **borra de inmediato y sin vuelta atrás** todas las notificaciones con más de 180 días.
   El dump es la única forma de recuperarlas.
3. Resto de variables en cPanel (las nuevas tienen valores por defecto; no hace falta definirlas). Configurar
   **PassengerMinInstances 1** o el **cron de ping** cada 5 minutos a `/api/health` (sin esto la cola y el resumen de
   las 18:00 se detienen cuando la app duerme).
4. FTP de `dist/` **sin reiniciar todavía**.
5. **Duplicados de campanitas (4.Y/4.AM), INMEDIATAMENTE antes del reinicio:**
   `MONGODB_URI="..." node src/scripts/verificar-notificaciones-duplicadas.js` (simulación). Si reporta duplicados:
   con el dump del paso 2 hecho, `--aplicar` (conserva ARCHIVADA > LEIDA > la más antigua).
6. Reinicio. En el log: `[Outbox] Worker iniciado ...`, `[Email] Proveedor de correo: brevo` y **ningún** error de
   `OUTBOX_TIMEOUT_TRABAJO_MS` ni de índices de `outbox`/`notificacions`.
7. Verificar que el índice `mensaje_usuario_unico` existe (sync-indexes en simulación, paso 10, o
   `db.notificacions.getIndexes()`). Si no existe: volver a correr el paso 5 y reiniciar.
8. Verificar `GET /api/system/outbox` (SUPER_ADMIN): `worker.activo = true`, `ultimoTick` reciente,
   `pendientesConError.total = 0` y `correo.episodioAbierto = null`.
9. Migración de tokens, en este orden: `node src/scripts/migrar-fcm-tokens.js` (simulación) → **revisar la salida**
   (tokens no string, conflictos entre cuentas) → `--aplicar` (crea el índice único al final).
10. Índices: `MONGODB_URI="..." node src/scripts/sync-indexes.js` (simulación) y **pasarle la salida al orquestador**
    antes de cualquier `--aplicar`. Esperado: los de `outbox` (`estado_1_orden_1_nextRunAt_1` reemplaza al de
    prioridad), `email_cupo`, `notificacions` (TTL 180 días, `resumen_diario` y `mensaje_usuario_unico`) y
    `mensajes` (`copiaDe`, `adjuntos.fileId`) los crea Mongoose al arrancar; el de `outbox` por prioridad puede
    aparecer como sobrante.
11. Pruebas de humo: enviar un mensaje a un curso (respuesta inmediata; campanita, correos y push en segundos),
    recuperar contraseña, registrar un token desde la app, aprobar una solicitud de prueba y abrir su enlace de
    contraseña, y reenviar el enlace de un estudiante (un segundo reenvío inmediato debe responder 429). Revisar en
    Brevo (Transactional → Logs) que los correos salen autenticados (SPF/DKIM "pass").
12. Opcional, con aprobación de Aymer: `node src/scripts/marcar-eventos-notificados.js --aplicar`.
13. Si hay que volver al SMTP de cPanel: `EMAIL_PROVIDER=smtp` con las variables `EMAIL_HOST/PORT/USER/PASS`,
    `EMAIL_DAILY_LIMIT` al límite del hosting, y reiniciar.

Brechas conocidas a tener presentes en la operación: ver "Brechas conocidas" (despacho sin encolar, ventanas fijas,
limitador y detector en memoria, reintentos de push previos a d47c9e2).
