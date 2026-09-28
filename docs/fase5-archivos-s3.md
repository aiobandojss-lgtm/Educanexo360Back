# Fase 5 — Archivos fuera de Mongo (S3 compatible) y dependencias

Contexto: Atlas M0 tiene 512 MB y los adjuntos en GridFS (`uploads.chunks` ≈ 324 MB sin comprimir, más
`anuncios_adjuntos`) la iban a llenar. Los archivos pasan a un almacén S3 compatible — objetivo **Backblaze B2**
(gratis, sin tarjeta) — con el mismo código para **Cloudflare R2** o **AWS S3** cambiando solo variables.

## 5.1 Capa de almacenamiento (`src/services/storage`)

Interfaz `ArchivoStorage { guardar, leer, eliminar, existe }` con tres implementaciones:

| Almacén | Uso |
|---|---|
| `s3` | B2 / R2 / AWS S3 (`@aws-sdk/client-s3`). Sin checksums CRC32 por defecto (B2/R2 no los soportan bien). |
| `gridfs` | El de siempre: lectura del legado y transición. |
| `local` | Carpeta en disco, **solo pruebas** (`STORAGE_LOCAL_DIR`). |

- **Clave** de cada archivo: `<bucket>/<fileId>` con los mismos nombres de bucket de GridFS: `uploads` (mensajes y
  calendario), `tareas_referencias`, `tareas_entregas`, `anuncios_adjuntos`.
- **Referencia** en los documentos (compatible con lo anterior):
  - legado: `{ fileId, nombre, tipo, tamaño }` → GridFS del bucket del flujo;
  - nuevo o migrado: además `{ almacen: 'gridfs'|'s3', clave, sha256 }`.
  - `fileId` **siempre existe** (los clientes lo usan en las URLs de descarga); en S3 es un ObjectId nuevo.
- **Subidas** → almacén de `STORAGE_PROVIDER` (`gridfs` por defecto: desplegar sin configurar S3 deja todo igual).
  **Lecturas y borrados** → los decide la referencia (un archivo viejo de GridFS se sigue leyendo con `s3` activo).
- Las **descargas** siguen por las MISMAS rutas: el backend autoriza y hace stream (no redirige a URL firmada), con
  las mismas cabeceras de siempre en cada ruta.
- Credenciales solo por entorno; se enmascaran en los mensajes de error.

## 5.2 Flujos por la capa

Mensajes (crear, borradores, copias a acudientes que comparten el archivo), tareas (referencia del docente y entregas
del estudiante), anuncios y calendario. Además:
- Rollback (criterio 3.O/3.X) en todos: si el documento no se guarda, lo recién subido se borra.
- Temporales de multer (3.Q) limpiados en todas las rutas de subida (`limpiarTemporales`).
- Reemplazos en orden seguro (subir el nuevo → guardar → borrar el anterior) en borradores, archivos de tareas y
  adjunto de eventos.

## 5.4 Validación de archivos

Lista blanca por **extensión y magic bytes** (`src/utils/tipoArchivo.ts`, middleware `validarArchivos`): pdf,
doc/docx, xls/xlsx, ppt/pptx, txt, csv, jpg/jpeg, png, gif, webp, zip, heic/heif. 400 con mensaje en español. El
Content-Type guardado y servido es el canónico de la extensión (nunca el del cliente). Límites de tamaño sin cambios
(5 MB mensajes/calendario, 10 MB tareas/anuncios, 15 MB total por mensaje).

## 5.5 Huérfanos

- Eliminar un anuncio o una tarea, y reenviar una entrega **no calificada**, borra sus archivos — solo si ningún otro
  documento los referencia (`src/utils/referenciasArchivos.ts`).
- Reenviar una entrega **ya CALIFICADA** (decisión de Aymer, 5.C9) no borra nada: la entrega anterior pasa a
  `entrega.historial[]` (`archivos`, `calificacion`, `comentarioDocente`, `fechaEntrega`, `fechaCalificacion`,
  `intento`, `fechaReemplazo`) y la nueva queda como la vigente. El historial es `select: false`: solo lo devuelven
  `GET /tareas/:id` y `GET /tareas/:id/entregas` al docente de la tarea y a los administrativos, que también pueden
  descargar esos archivos. Estudiante, acudiente, listados y otros docentes del curso ven lo mismo que antes.
- `src/scripts/barrer-archivos-huerfanos.js`: GridFS (4 buckets + chunks sin archivo) y S3. Simulación por defecto;
  `--aplicar` borra; solo archivos con más de `--min-horas` (24), también los chunks sin archivo (por la fecha del
  ObjectId de su `files_id`: una subida en curso tiene chunks antes que su documento `.files`). Cuenta como
  referenciados los archivos del historial de entregas.

## 5.8 Autorización de descargas

Regla: se descarga un archivo **si y solo si** se puede ver la entidad por el detalle/listado que usa el cliente.
- Calendario: ESTUDIANTE/PADRE/ACUDIENTE solo adjuntos de eventos ACTIVOS (como el detalle).
- Mensajes: colegio del usuario Y participante (como el detalle).
- Anuncios (decisión de Aymer, "solo publicación"): ESTUDIANTE/ACUDIENTE/PADRE solo ven anuncios publicados en
  listado, detalle y descarga. La audiencia (`paraEstudiantes`/`paraPadres`/`paraDocentes`) no se filtra.

## Respuestas de la API

`almacen`, `clave` y `sha256` son internos: la API no los devuelve (5.C6). Filtro único como `json replacer` de
Express (`src/utils/filtroRespuesta.ts`): solo en respuestas JSON, solo en objetos que tienen `fileId`, sin mutar el
objeto original (documento, caché en memoria). Los clientes usan `fileId` como siempre.

## Descargas

- Si el cliente corta la descarga se destruye el stream de origen (libera el socket de S3); un error a mitad corta la
  respuesta. Cliente S3 con `connectionTimeout` 5 s, `requestTimeout` 60 s y hasta 50 sockets (5.C1).
- Las cabeceras de adjunto (`Content-Type`/`Content-Disposition`) se fijan después de abrir el archivo: si abrir
  falla, el error sale como JSON y no como un "archivo" (5.C5).
- Referencias viejas (sin `almacen`) cuyo archivo ya no está en GridFS se buscan en S3 con la misma clave
  `<bucket>/<fileId>` si `S3_BUCKET` está configurado (5.C3): cubre p. ej. copias a acudientes que quedaron en cola
  con la referencia vieja.

## Variables de entorno nuevas

| Variable | Por defecto | Uso |
|---|---|---|
| `STORAGE_PROVIDER` | `gridfs` | Dónde van las subidas nuevas: `gridfs` \| `s3` (\| `local` solo pruebas) |
| `S3_ENDPOINT` | — | B2: `https://s3.<región>.backblazeb2.com`; R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; vacío en AWS |
| `S3_REGION` | `us-east-1` | B2: la región del bucket (p. ej. `us-west-004`); R2: `auto`; AWS: la del bucket |
| `S3_BUCKET` | — | Nombre del bucket (privado) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | — | Clave de aplicación con acceso SOLO a ese bucket |
| `S3_FORCE_PATH_STYLE` | — | Solo servidores S3 locales de prueba (`true`); B2/R2/AWS no lo necesitan |

Solo pruebas: `STORAGE_LOCAL_DIR`.

## Crear el bucket y la clave

### Backblaze B2 (objetivo)

1. Cuenta en backblaze.com → **B2 Cloud Storage** (10 GB gratis).
2. **Buckets → Create a Bucket**: nombre único (p. ej. `educanexo360-archivos`), **Files in Bucket: Private**,
   Object Lock desactivado. Anotar el **Endpoint** que muestra el bucket (`s3.<región>.backblazeb2.com`); la región
   es la parte del medio (p. ej. `us-west-004`).
3. **Lifecycle Settings** del bucket: **"Keep only the last version of the file"**. Sin esto B2 guarda versiones
   ocultas de lo que se borra y siguen ocupando espacio.
4. **Application Keys → Add a New Application Key**: acceso solo a ese bucket, tipo **Read and Write**. Copiar
   `keyID` → `S3_ACCESS_KEY_ID` y `applicationKey` → `S3_SECRET_ACCESS_KEY` (la clave se muestra UNA vez).
5. **Caps & Alerts**: revisar los topes diarios de transacciones gratuitas. Cada descarga hace un GET (y un HEAD previo en
   mensajes y calendario): transacciones clase B. Sin medio de pago, al llegar al tope B2 bloquea esas operaciones hasta el día siguiente.

### Cloudflare R2 (alternativa)

1. Panel de Cloudflare → **R2** → activar el plan gratuito (Cloudflare puede pedir un medio de pago para activarlo).
2. **Create bucket** (privado). **Manage R2 API Tokens → Create API token**: permiso **Object Read & Write**
   limitado a ese bucket → `Access Key ID` y `Secret Access Key`.
3. Variables: `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`, claves.

## 5.3 Migración GridFS → S3 (`src/scripts/migrar-archivos-s3.js`)

- Sin flags: **simulación** (archivos y MB por bucket, migrados, pendientes, sin referencia).
- `--aplicar --bucket=<S3_BUCKET>` (`--lote=N`): primero prueba las credenciales (escribe, lee y borra un objeto
  `_prueba-migracion/...`; si falla no copia nada). Copia; si el objeto ya está en S3 con el mismo tamaño **y el mismo
  sha256** no lo re-sube (reanudar), y si el sha256 difiere lo vuelve a subir; verifica cada copia **descargándola**
  (tamaño y sha256, y md5 si GridFS lo tenía); solo entonces actualiza **todas** las referencias (copias a acudientes,
  entregas —con filtro por entrega— e historial de entregas). Fallos registrados sin detener el resto.
- `--borrar-gridfs --bucket=<S3_BUCKET>`: corrida **aparte**; se niega si hay trabajos `copias-acudientes` PENDIENTE o
  PROCESANDO en la cola (llevan la referencia vieja); borra de GridFS solo lo que tiene todas sus referencias en S3 y
  el objeto con el mismo tamaño. Reporta MB liberados y `dataSize`/`storageSize` antes → después.
- `--bucket` es obligatorio en los dos modos que escriben y debe ser igual a `S3_BUCKET` (confirmación contra una
  variable vieja en la terminal). **El servidor debe tener exactamente las mismas `S3_*` que la corrida**: las
  referencias migradas apuntan a ese bucket.

**Espacio en M0**: al borrar de GridFS, `dataSize` (tamaño lógico, lo que Atlas muestra como *Data Size*) baja de
inmediato; `storageSize` (disco) puede no bajar porque WiredTiger reutiliza el espacio liberado, y M0 no permite
`compact`. Medido en local: dataSize 877,5 → 517,4 MB al borrar 360 MB; storageSize se quedó en 342 MB. Confirmar
en la consola de Atlas (Metrics → Data Size) después de `--borrar-gridfs`.

## 5.7 Medición (local, seed de escala)

| | GridFS | S3 local (SeaweedFS) |
|---|---|---|
| Subida de 4 MB por la API | 128 ms | 178 ms |
| Descarga de 4 MB | 47 ms | 82 ms |
| Pico de memoria al subir / bajar | +44 / +11 MB | +39 / +16 MB |

Migración de 165 archivos (360 MB): `--aplicar` 16,9 s sin fallos; `--borrar-gridfs` 1,9 s.
Con B2 real la latencia será mayor (red); todo va en stream, la memoria no crece con el tamaño del archivo.

## Dependencias (5.A)

- Quitadas (sin uso): gridfs-stream, multer-gridfs-storage, express-fileupload, node-fetch, pug, yup.
- `axios` pasa a `dependencies` (lo usa código de producción).
- multer 2.x (con `defParamCharset: 'utf8'`), mongoose 8.24, express-validator 7.3 / validator 13.15, nodemailer 10,
  protobufjs / fast-xml-parser (override) / websocket-driver / form-data corregidos, `npm audit fix` sin `--force`
  (express 4.22, jws). `npm audit`: 70 (4 críticas, 25 altas) → 9 moderadas (cadena interna de firebase-admin).
- Aviso: las versiones del AWS SDK v3 publicadas desde enero de 2027 exigirán **Node ≥ 22**.
- **Override de `fast-xml-parser` (`^4.5.5` en `package.json`)**. Por qué se agregó (5.A3): `@google-cloud/storage`
  7.17 (dentro de firebase-admin) y `@aws-sdk/core` 3.750 (credenciales AWS opcionales del driver de mongodb)
  fijaban la 4.4.1, con una vulnerabilidad crítica y varias altas; el override llevó todo a 4.5.7 sin cambiar de
  versión mayor. Estado actual: tras `npm audit fix`, `@google-cloud/storage` subió a 7.22, que declara
  `^5.3.4`, y `@aws-sdk/core` ya no lo usa; el override hoy **fuerza 4.5.7 sobre un paquete que pide 5.x**. No afecta
  en ejecución (el backend no usa Firebase Storage, solo FCM), pero ya no es necesario: se recomienda quitarlo en una
  corrida aparte (instalaría 5.x, que además cierra el moderado de XMLBuilder) — pendiente de aprobación. Mientras
  exista, el servidor debe instalar con `npm ci` para respetar el lockfile y el override.

## Brechas conocidas

- Anuncios: sin filtro por audiencia (un estudiante ve anuncios publicados no dirigidos a él).
- Descarga de tareas sin `?tipo=` responde 400 (Flutter no lo envía): bug previo, fuera de esta fase.
- Los archivos subidos por Flutter en `POST/PUT /anuncios` no los recibe el backend (bug previo del cliente/API).
- El script de huérfanos y `REFERENCIAS_POR_BUCKET` deben actualizarse si se agrega un flujo con archivos.

## Plan de deploy

1. `mongodump` de Atlas.
2. Crear el bucket y la clave en B2 (ver arriba), con la regla de ciclo de vida "Keep only the last version".
3. FTP de `dist/`, `package.json` y `package-lock.json`, y en el servidor (terminal de la app de cPanel, con la app
   detenida): **`npm ci --omit=dev --ignore-scripts`** (cambian dependencias: multer 2, mongoose 8.24, nodemailer 10,
   `@aws-sdk/client-s3`, `@smithy/node-http-handler`; `axios` ahora en `dependencies`).
   - `npm ci` instala **exactamente** el `package-lock.json` (con el override) y falla si no coincide con
     `package.json`; `npm install` puede resolver otras versiones.
   - `--omit=dev`: sin TypeScript, Jest, ESLint (el `dist/` ya va compilado).
   - `--ignore-scripts`: el `postinstall` del proyecto corre `npm run build` (tsc), que sin devDependencies
     falla. Las dependencias de producción con scripts de instalación no los necesitan: `@firebase/util` (config
     del SDK web, trae una por defecto), `@scarf/scarf` (telemetría) y `protobufjs` (aviso de versiones).
   - `npm ci` borra `node_modules` antes de instalar: hacerlo con la app detenida y reiniciarla después. **Primero con `STORAGE_PROVIDER` sin definir** (gridfs):
   reinicio y pruebas de humo (subir y bajar un adjunto de mensaje; un archivo .exe renombrado debe dar 400).
4. Variables S3 en cPanel + `STORAGE_PROVIDER=s3`; reinicio. Subir un adjunto nuevo y descargarlo; bajar también un
   adjunto viejo (debe seguir saliendo de GridFS).
5. Migración (desde el repo local, con `MONGODB_URI` de Atlas y las `S3_*`, como los scripts de la Fase 4):
   `node src/scripts/migrar-archivos-s3.js` (simulación) → revisar → `--aplicar --bucket=<S3_BUCKET>` → volver a
   correr la simulación (pendientes 0, fallidos revisados) y descargar algunos adjuntos viejos desde la app.
6. `mongodump` de nuevo y `--borrar-gridfs --bucket=<S3_BUCKET>` (si responde que hay copias a acudientes en cola,
   esperar a que terminen y repetir); revisar *Data Size* en Atlas.
7. `node src/scripts/barrer-archivos-huerfanos.js` en simulación y pasar la salida al orquestador antes de `--aplicar`.
