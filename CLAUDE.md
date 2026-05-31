# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos de desarrollo

```bash
# Desarrollo
npm run dev          # nodemon sobre src/app.ts (recarga automática)
npm run build        # Compila TypeScript → dist/
npm run watch-ts     # Compila TypeScript en modo watch
npm start            # Inicia servidor de producción (node app.js)

# Calidad de código
npm run check-types  # tsc --noEmit (verificar tipos sin emitir)
npm run lint         # ESLint sobre src/**/*.ts
npm run lint:fix     # ESLint con auto-fix
npm run format       # Prettier

# Tests
npm test             # Jest (todos los tests)
npm run test:watch   # Jest en modo watch
npm run test:coverage
# Ejecutar un test específico:
npx jest src/__tests__/nombre.test.ts
```

El servidor compila TypeScript a `dist/` antes de ejecutar. El entry point de producción es `app.js` (raíz), que carga `dist/app.js`.

## Arquitectura

### Stack
- **Runtime:** Node.js + Express 4 + TypeScript 5 (target ES2020, module CommonJS)
- **Base de datos:** MongoDB con Mongoose 8 (Atlas), GridFS para archivos
- **Auth:** JWT (access token + refresh token), middleware `authenticate`
- **Notificaciones push:** Firebase Admin (FCM)
- **Email:** Nodemailer + plantillas Pug (Ethereal en dev)
- **Caché:** NodeCache en memoria con TTLs configurables

### Flujo de una petición
```
HTTP → CORS/Helmet/RateLimit → /api/* → authenticate (JWT)
     → validate (express-validator/Yup) → Controller → Service → Model (Mongoose)
```

### Capas y naming conventions
| Capa | Patrón de archivo | Responsabilidad |
|------|-------------------|-----------------|
| Routes | `*.routes.ts` | Mapeo de endpoints a controllers |
| Controllers | `*.controller.ts` | Manejo de req/res, llamada a services |
| Services | `*.service.ts` | Lógica de negocio |
| Models | `*.model.ts` | Schemas Mongoose + métodos |
| Validations | `*.validation.ts` | Schemas de validación (express-validator / Yup) |
| Interfaces | `src/interfaces/` | Tipos TypeScript para los modelos |

Todos los módulos viven en `src/`, el output compilado va a `dist/`.

### Autenticación
- Token JWT en header `Authorization: Bearer <token>`
- Payload: `{ sub: userId, tipo: userType, escuelaId }`
- Dos tokens: access (corto plazo) y refresh (largo plazo)
- El middleware `authenticate` está en `src/middleware/`

### Modelos de datos (MongoDB)
14 colecciones principales: `Usuario`, `Escuela`, `Curso`, `Asignatura`, `Calificacion`, `Asistencia`, `Anuncio`, `Calendario`, `Logro`, `Mensaje`, `Notificacion`, `Invitacion`, `SolicitudRegistro`, `Tarea`.

### Caché
- `src/cache/` contiene las utilidades NodeCache
- TTLs configurables por tipo de dato (180s–1800s)
- Invalidación explícita en operaciones de escritura
- Middleware `cacheMiddleware` para respuestas GET
- `dashboardCacheInvalidation` para invalidar métricas del dashboard

### Manejo de errores
- Clase `ApiError` con `statusCode` para errores operacionales
- Middlewares globales `errorConverter` y `errorHandler` al final del stack

### Subida de archivos
- Multer + multer-gridfs-storage → GridFS en MongoDB
- Carpetas temporales en `/uploads/` (temp, direct, eventos, calendario)
- Límite configurable via `UPLOAD_LIMIT` (default 5MB)

## Variables de entorno relevantes

```
MONGODB_URI          # Conexión MongoDB Atlas
JWT_SECRET           # Secreto access token
REFRESH_TOKEN_SECRET # Secreto refresh token
EMAIL_HOST/USER/PASS # SMTP (Ethereal en dev)
FRONTEND_URL         # URL del frontend (CORS)
ALLOWED_ORIGINS      # Orígenes permitidos CORS
PORT                 # Puerto del servidor (default 3000)
```

## Tests

- Framework: Jest + ts-jest + supertest
- Archivos en `src/__tests__/`
- Setup global en `src/__tests__/setup.ts`
- Patrón de archivos: `**/__tests__/**/*.ts` o `**/*.spec.ts`

## Documentación API

Swagger UI disponible en `/api-docs` (swagger-jsdoc con JSDoc en los archivos de rutas).

## Contexto del proyecto
- EducaNexo360 es una plataforma educativa completa (backend + app movil Flutter + frontend web)
- Este repositorio es el BACKEND (API REST)
- La app movil Flutter consume esta API
- Base de datos: MongoDB Atlas (cluster0.fvqnr.mongodb.net)
- Meta: publicar en produccion (nube) en abril 2026
- El proyecto tiene repos en GitHub

## Reglas importantes para este proyecto
- NUNCA modificar ni leer archivos .env (contienen credenciales reales de MongoDB Atlas y JWT)
- Antes de cualquier cambio, explicar que se va a modificar y por que
- Este proyecto usa CommonJS (require), NO ES Modules - respetar esta decision
- Siempre manejar errores con try/catch en controllers y services
- Cualquier endpoint nuevo debe tener validacion con express-validator o Yup
- Cualquier endpoint nuevo debe documentarse con Swagger JSDoc

## Prioridades actuales
1. Revision de seguridad (JWT, rate limiting, sanitizacion de inputs)
2. Revision de performance (cache, queries, indices MongoDB)
3. Preparar para despliegue en produccion (abril 2026)
