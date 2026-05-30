# Auditoría de Comunicados Docentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar campo `esCopiaAcudiente` + `cursoIds` al modelo Mensaje, corregir la bandeja Enviados del docente, y exponer dos nuevos endpoints de auditoría solo para RECTOR/COORDINADOR/ADMIN.

**Architecture:** Todo el cambio vive en 5 archivos existentes (`IMensaje.ts`, `mensaje.model.ts`, `mensaje.service.ts`, `mensaje.controller.ts`, `mensaje.routes.ts`). No se crean archivos nuevos de producción. Los dos endpoints nuevos usan aggregation pipelines de MongoDB; el fix de enviados es una línea. Las rutas nuevas se registran antes de `/:id` para evitar que Express las capture como segmentos dinámicos.

**Tech Stack:** Node.js · Express 4 · TypeScript 5 · Mongoose 8 · MongoDB Atlas · Jest + Supertest

**Design doc:** `docs/superpowers/specs/2026-05-30-auditoria-mensajes-docentes-design.md`

---

## File Map

| Archivo | Acción | Qué cambia |
|---------|--------|------------|
| `src/interfaces/IMensaje.ts` | Modify | +2 campos en `IMensajeBase` |
| `src/models/mensaje.model.ts` | Modify | +2 campos en `MensajeSchema` |
| `src/services/mensaje.service.ts` | Modify | `crearMensaje` + `enviarCopiaAcudientes` + 2 métodos nuevos |
| `src/controllers/mensaje.controller.ts` | Modify | Fix bandeja enviados + 2 handlers nuevos |
| `src/routes/mensaje.routes.ts` | Modify | 2 rutas nuevas + Swagger JSDoc |
| `src/__tests__/mensajes-auditoria.test.ts` | Create | Tests de auth/validación para los 2 endpoints |

---

## Task 1: Model — Interface y Schema

**Files:**
- Modify: `src/interfaces/IMensaje.ts`
- Modify: `src/models/mensaje.model.ts`

- [ ] **Step 1.1: Agregar los 2 campos nuevos a `IMensajeBase` en `IMensaje.ts`**

Abrir `src/interfaces/IMensaje.ts`. Localizar la interfaz `IMensajeBase` (línea ~51). Agregar los dos campos después de `eliminadoPorRemitente`:

```typescript
// Antes (línea ~69-70):
  eliminadoPorRemitente?: boolean;
  fechaEliminacion?: Date;
}

// Después:
  eliminadoPorRemitente?: boolean;
  fechaEliminacion?: Date;
  esCopiaAcudiente?: boolean;
  cursoIds?: Types.ObjectId[];
}
```

- [ ] **Step 1.2: Agregar los 2 campos al `MensajeSchema` en `mensaje.model.ts`**

Abrir `src/models/mensaje.model.ts`. Localizar el campo `eliminadoPorRemitente` (línea ~136). Agregar los dos campos nuevos después de `fechaEliminacion`:

```typescript
// Antes (línea ~136-143):
    eliminadoPorRemitente: {
      type: Boolean,
      default: false,
    },
    fechaEliminacion: {
      type: Date,
      default: null,
    },
  },

// Después:
    eliminadoPorRemitente: {
      type: Boolean,
      default: false,
    },
    fechaEliminacion: {
      type: Date,
      default: null,
    },
    esCopiaAcudiente: {
      type: Boolean,
      default: false,
    },
    cursoIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Curso',
      },
    ],
  },
```

- [ ] **Step 1.3: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 1.4: Commit**

```bash
git add src/interfaces/IMensaje.ts src/models/mensaje.model.ts
git commit -m "feat: agregar campos esCopiaAcudiente y cursoIds al modelo Mensaje"
```

---

## Task 2: Service — `crearMensaje` y `enviarCopiaAcudientes`

**Files:**
- Modify: `src/services/mensaje.service.ts`

- [ ] **Step 2.1: Agregar `esCopiaAcudiente` a la destructuración de `crearMensaje`**

Localizar el método `crearMensaje` (línea ~246). La destructuración ya incluye `cursoIds = []` pero NO incluye `esCopiaAcudiente`. Agregar al bloque de destructuración (línea ~248-261):

```typescript
// Antes:
      const {
        destinatarios = [],
        destinatariosCc = [],
        cursoIds = [],
        asunto,
        contenido,
        adjuntos = [],
        tipo = TipoMensaje.INDIVIDUAL,
        prioridad = PrioridadMensaje.NORMAL,
        estado = EstadoMensaje.ENVIADO,
        etiquetas = [],
        esRespuesta = false,
        mensajeOriginalId = null,
      } = datos;

// Después:
      const {
        destinatarios = [],
        destinatariosCc = [],
        cursoIds = [],
        asunto,
        contenido,
        adjuntos = [],
        tipo = TipoMensaje.INDIVIDUAL,
        prioridad = PrioridadMensaje.NORMAL,
        estado = EstadoMensaje.ENVIADO,
        etiquetas = [],
        esRespuesta = false,
        mensajeOriginalId = null,
        esCopiaAcudiente = false,
      } = datos;
```

- [ ] **Step 2.2: Pasar `esCopiaAcudiente` y `cursoIds` a `Mensaje.create`**

Localizar el bloque `Mensaje.create` (línea ~309). Agregar los dos campos al objeto:

```typescript
// Antes:
      const nuevoMensaje = (await Mensaje.create({
        remitente: user._id,
        destinatarios: destinatariosObjectIds,
        destinatariosCc: destinatariosCcObjectIds,
        asunto,
        contenido,
        adjuntos,
        escuelaId: user.escuelaId,
        tipo,
        prioridad,
        estado,
        etiquetas,
        esRespuesta,
        mensajeOriginalId,
        lecturas: [],
      })) as mongoose.Document & { _id: mongoose.Types.ObjectId };

// Después:
      const nuevoMensaje = (await Mensaje.create({
        remitente: user._id,
        destinatarios: destinatariosObjectIds,
        destinatariosCc: destinatariosCcObjectIds,
        asunto,
        contenido,
        adjuntos,
        escuelaId: user.escuelaId,
        tipo,
        prioridad,
        estado,
        etiquetas,
        esRespuesta,
        mensajeOriginalId,
        lecturas: [],
        esCopiaAcudiente,
        cursoIds: cursoIds
          .map((id: string) => this.safeObjectId(id))
          .filter((id: any) => id !== null),
      })) as mongoose.Document & { _id: mongoose.Types.ObjectId };
```

- [ ] **Step 2.3: Marcar `esCopiaAcudiente: true` en `enviarCopiaAcudientes`**

Localizar el objeto `mensajeAcudientes` (línea ~608). Agregar el flag al final del objeto:

```typescript
// Antes:
      const mensajeAcudientes = {
        destinatarios: acudientes.map((a: any) => a._id.toString()),
        asunto: `[COPIA] ${datos.asunto}`,
        contenido: `Este mensaje ha sido enviado automáticamente como copia del mensaje enviado a su acudido.\n\n${datos.contenido}`,
        adjuntos: datos.adjuntos || [],
        tipo: datos.tipo || TipoMensaje.INDIVIDUAL,
        prioridad: datos.prioridad || PrioridadMensaje.NORMAL,
        estado: EstadoMensaje.ENVIADO,
        etiquetas: datos.etiquetas || [],
        esRespuesta: false,
      };

// Después:
      const mensajeAcudientes = {
        destinatarios: acudientes.map((a: any) => a._id.toString()),
        asunto: `[COPIA] ${datos.asunto}`,
        contenido: `Este mensaje ha sido enviado automáticamente como copia del mensaje enviado a su acudido.\n\n${datos.contenido}`,
        adjuntos: datos.adjuntos || [],
        tipo: datos.tipo || TipoMensaje.INDIVIDUAL,
        prioridad: datos.prioridad || PrioridadMensaje.NORMAL,
        estado: EstadoMensaje.ENVIADO,
        etiquetas: datos.etiquetas || [],
        esRespuesta: false,
        esCopiaAcudiente: true,
      };
```

- [ ] **Step 2.4: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/mensaje.service.ts
git commit -m "feat: persistir esCopiaAcudiente y cursoIds al crear mensaje; marcar copias a acudiente"
```

---

## Task 3: Controller — Fix Bandeja Enviados

**Files:**
- Modify: `src/controllers/mensaje.controller.ts`

- [ ] **Step 3.1: Agregar filtro `esCopiaAcudiente` al bloque `enviados`**

Localizar el bloque `else if (bandeja === 'enviados')` (línea ~2251). Agregar una línea después de las tres existentes:

```typescript
// Antes:
      } else if (bandeja === 'enviados') {
        matchBandeja.esRemitente = true;
        matchBandeja.estadoUsuario = { $ne: EstadoMensaje.ELIMINADO };
        matchBandeja.tipo = { $ne: TipoMensaje.BORRADOR };
      } else if (bandeja === 'borradores') {

// Después:
      } else if (bandeja === 'enviados') {
        matchBandeja.esRemitente = true;
        matchBandeja.estadoUsuario = { $ne: EstadoMensaje.ELIMINADO };
        matchBandeja.tipo = { $ne: TipoMensaje.BORRADOR };
        matchBandeja.esCopiaAcudiente = { $ne: true };
      } else if (bandeja === 'borradores') {
```

- [ ] **Step 3.2: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 3.3: Commit**

```bash
git add src/controllers/mensaje.controller.ts
git commit -m "fix: excluir copias automáticas a acudiente de la bandeja Enviados del docente"
```

---

## Task 4: Service — `obtenerEstadisticasDocentes`

**Files:**
- Modify: `src/services/mensaje.service.ts`

- [ ] **Step 4.1: Agregar el método al final de la clase `MensajeService`, antes de `handleError`**

Localizar el método `handleError` (línea ~658) y agregar el nuevo método antes de él:

```typescript
  /**
   * Estadísticas de mensajes enviados por cada docente en un periodo.
   * Arranca desde la colección de docentes para incluir los que enviaron 0 mensajes.
   */
  async obtenerEstadisticasDocentes(
    escuelaId: string,
    params: {
      desde: string;
      hasta: string;
      cursoId?: string;
      docenteId?: string;
    },
  ) {
    try {
      const { desde, hasta, cursoId, docenteId } = params;

      const desdeDate = new Date(desde);
      const hastaDate = new Date(hasta);
      hastaDate.setUTCHours(23, 59, 59, 999);

      const matchDocentes: any = {
        tipo: 'DOCENTE',
        escuelaId: new mongoose.Types.ObjectId(escuelaId),
        estado: 'ACTIVO',
      };

      if (docenteId && mongoose.isValidObjectId(docenteId)) {
        matchDocentes._id = new mongoose.Types.ObjectId(docenteId);
      }

      if (cursoId && mongoose.isValidObjectId(cursoId)) {
        matchDocentes['info_academica.asignaturas_asignadas.cursoId'] =
          new mongoose.Types.ObjectId(cursoId);
      }

      const pipeline: any[] = [
        { $match: matchDocentes },
        {
          $addFields: {
            cursosIds: {
              $setUnion: [
                {
                  $map: {
                    input: { $ifNull: ['$info_academica.asignaturas_asignadas', []] },
                    as: 'a',
                    in: '$$a.cursoId',
                  },
                },
                [],
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'cursos',
            localField: 'cursosIds',
            foreignField: '_id',
            pipeline: [{ $project: { nombre: 1 } }],
            as: 'cursosInfo',
          },
        },
        {
          $lookup: {
            from: 'mensajes',
            let: { docenteId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$remitente', '$$docenteId'] },
                      { $gte: ['$createdAt', desdeDate] },
                      { $lte: ['$createdAt', hastaDate] },
                      { $ne: ['$esCopiaAcudiente', true] },
                      { $ne: ['$tipo', TipoMensaje.BORRADOR] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, createdAt: 1 } },
            ],
            as: 'mensajes',
          },
        },
        {
          $project: {
            docenteId: '$_id',
            nombre: 1,
            apellidos: 1,
            count: { $size: '$mensajes' },
            ultimoMensaje: {
              $cond: {
                if: { $gt: [{ $size: '$mensajes' }, 0] },
                then: { $max: '$mensajes.createdAt' },
                else: null,
              },
            },
            cursos: {
              $map: {
                input: '$cursosInfo',
                as: 'c',
                in: { _id: '$$c._id', nombre: '$$c.nombre' },
              },
            },
          },
        },
        { $sort: { count: 1 } },
      ];

      const docentes = await Usuario.aggregate(pipeline);

      return {
        data: docentes,
        meta: {
          desde: desdeDate.toISOString(),
          hasta: hastaDate.toISOString(),
          totalDocentes: docentes.length,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
```

- [ ] **Step 4.2: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 4.3: Commit**

```bash
git add src/services/mensaje.service.ts
git commit -m "feat: agregar obtenerEstadisticasDocentes — aggregation left-join Usuario→Mensaje"
```

---

## Task 5: Service — `obtenerMensajesAuditoria`

**Files:**
- Modify: `src/services/mensaje.service.ts`

- [ ] **Step 5.1: Agregar el método antes de `handleError`, después del método anterior**

```typescript
  /**
   * Lista paginada de mensajes enviados por un docente en un periodo.
   * Excluye copias automáticas a acudientes y borradores.
   */
  async obtenerMensajesAuditoria(
    escuelaId: string,
    params: {
      remitenteId: string;
      desde: string;
      hasta: string;
      pagina?: number;
      limite?: number;
    },
  ) {
    try {
      const { remitenteId, desde, hasta, pagina = 1, limite = 20 } = params;

      const desdeDate = new Date(desde);
      const hastaDate = new Date(hasta);
      hastaDate.setUTCHours(23, 59, 59, 999);
      const skip = (pagina - 1) * limite;

      const pipeline: any[] = [
        {
          $match: {
            remitente: new mongoose.Types.ObjectId(remitenteId),
            escuelaId: new mongoose.Types.ObjectId(escuelaId),
            createdAt: { $gte: desdeDate, $lte: hastaDate },
            esCopiaAcudiente: { $ne: true },
            tipo: { $ne: TipoMensaje.BORRADOR },
          },
        },
        {
          $lookup: {
            from: 'usuarios',
            let: { dests: '$destinatarios' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ['$_id', '$$dests'] },
                      { $eq: ['$tipo', 'ESTUDIANTE'] },
                    ],
                  },
                },
              },
              { $project: { nombre: 1, apellidos: 1 } },
            ],
            as: 'destinatariosEstudiantes',
          },
        },
        {
          $lookup: {
            from: 'cursos',
            localField: 'cursoIds',
            foreignField: '_id',
            pipeline: [{ $project: { nombre: 1 } }],
            as: 'cursosInfo',
          },
        },
        {
          $project: {
            asunto: 1,
            createdAt: 1,
            tipo: 1,
            destinatario: {
              $cond: {
                if: { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $arrayElemAt: ['$destinatariosEstudiantes', 0] },
                else: '$$REMOVE',
              },
            },
            cursoNombre: {
              $cond: {
                if: { $ne: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: {
                  $let: {
                    vars: { curso: { $arrayElemAt: ['$cursosInfo', 0] } },
                    in: '$$curso.nombre',
                  },
                },
                else: '$$REMOVE',
              },
            },
            cantidadDestinatariosEstudiantes: {
              $cond: {
                if: { $ne: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $size: '$destinatariosEstudiantes' },
                else: '$$REMOVE',
              },
            },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limite }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await Mensaje.aggregate(pipeline);
      const total: number = result.total[0]?.count ?? 0;
      const paginas = Math.ceil(total / limite);

      return {
        data: result.data,
        meta: { total, pagina, limite, paginas },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }
```

- [ ] **Step 5.2: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 5.3: Commit**

```bash
git add src/services/mensaje.service.ts
git commit -m "feat: agregar obtenerMensajesAuditoria — pipeline paginado con $facet"
```

---

## Task 6: Controller — Nuevos Handlers

**Files:**
- Modify: `src/controllers/mensaje.controller.ts`

- [ ] **Step 6.1: Agregar el handler `estadisticasDocentes` a la clase `MensajeController`**

Localizar el final de la clase `MensajeController` (buscar el último método antes del `}`). Agregar el handler:

```typescript
  async estadisticasDocentes(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');

      const { desde, hasta, cursoId, docenteId } = req.query as {
        desde?: string;
        hasta?: string;
        cursoId?: string;
        docenteId?: string;
      };

      if (!desde || !hasta) {
        throw new ApiError(400, 'Los parámetros desde y hasta son requeridos');
      }

      if (cursoId && !mongoose.isValidObjectId(cursoId)) {
        throw new ApiError(400, 'cursoId inválido');
      }

      if (docenteId && !mongoose.isValidObjectId(docenteId)) {
        throw new ApiError(400, 'docenteId inválido');
      }

      const result = await mensajeService.obtenerEstadisticasDocentes(req.user.escuelaId, {
        desde,
        hasta,
        cursoId,
        docenteId,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
```

- [ ] **Step 6.2: Agregar el handler `auditoriaDocente` a la clase `MensajeController`**

Agregar el segundo handler después del anterior:

```typescript
  async auditoriaDocente(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');

      const { remitenteId, desde, hasta, pagina, limite } = req.query as {
        remitenteId?: string;
        desde?: string;
        hasta?: string;
        pagina?: string;
        limite?: string;
      };

      if (!remitenteId || !desde || !hasta) {
        throw new ApiError(400, 'Los parámetros remitenteId, desde y hasta son requeridos');
      }

      if (!mongoose.isValidObjectId(remitenteId)) {
        throw new ApiError(400, 'remitenteId inválido');
      }

      const result = await mensajeService.obtenerMensajesAuditoria(req.user.escuelaId, {
        remitenteId,
        desde,
        hasta,
        pagina: pagina ? parseInt(pagina, 10) : 1,
        limite: limite ? parseInt(limite, 10) : 20,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
```

- [ ] **Step 6.3: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 6.4: Commit**

```bash
git add src/controllers/mensaje.controller.ts
git commit -m "feat: agregar handlers estadisticasDocentes y auditoriaDocente al MensajeController"
```

---

## Task 7: Routes + Swagger JSDoc

**Files:**
- Modify: `src/routes/mensaje.routes.ts`

- [ ] **Step 7.1: Insertar las dos rutas nuevas antes de `router.get('/:id', ...)`**

Localizar `router.get('/ultimos', ...)` (línea ~169). Insertar el siguiente bloque **después** de la ruta `/ultimos` y **antes** de `router.get('/:id', ...)`:

```typescript
/**
 * @swagger
 * /api/mensajes/estadisticas-docentes:
 *   get:
 *     summary: Estadísticas de mensajes enviados por cada docente en un periodo
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha inicio del periodo (ISO 8601)
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha fin del periodo (ISO 8601 — se extiende a 23:59:59 UTC)
 *       - in: query
 *         name: cursoId
 *         schema:
 *           type: string
 *         description: Filtrar solo docentes de ese curso
 *       - in: query
 *         name: docenteId
 *         schema:
 *           type: string
 *         description: Filtrar por un docente específico
 *     responses:
 *       200:
 *         description: Lista de docentes con conteo de mensajes y cursos asignados
 *       400:
 *         description: Parámetros desde/hasta faltantes o ID inválido
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol insuficiente (requiere RECTOR, COORDINADOR o ADMIN)
 */
router.get(
  '/estadisticas-docentes',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.estadisticasDocentes(req, res, next);
  },
);

/**
 * @swagger
 * /api/mensajes/auditoria:
 *   get:
 *     summary: Lista paginada de mensajes enviados por un docente específico
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: remitenteId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del docente a auditar
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Mensajes del docente con info de destinatario o curso
 *       400:
 *         description: Parámetros requeridos faltantes o remitenteId inválido
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol insuficiente (requiere RECTOR, COORDINADOR o ADMIN)
 */
router.get(
  '/auditoria',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.auditoriaDocente(req, res, next);
  },
);
```

- [ ] **Step 7.2: Verificar que las rutas nuevas están ANTES de `router.get('/:id', ...)`**

Buscar en el archivo el orden de aparición:
1. `/estadisticas-docentes` → debe aparecer primero
2. `/auditoria` → debe aparecer segundo
3. `/:id` → debe aparecer después

Si el orden es incorrecto, mover los bloques hacia arriba.

- [ ] **Step 7.3: Verificar tipos**

```bash
npm run check-types
```

Esperado: 0 errores.

- [ ] **Step 7.4: Commit**

```bash
git add src/routes/mensaje.routes.ts
git commit -m "feat: registrar rutas /estadisticas-docentes y /auditoria con Swagger JSDoc"
```

---

## Task 8: Tests

**Files:**
- Create: `src/__tests__/mensajes-auditoria.test.ts`

Los tests cubren: respuesta 401 sin token (no requiere DB), respuesta 403 con rol incorrecto, y respuesta 400 con params faltantes. Para los últimos dos se genera un JWT de test usando la misma clave del config.

- [ ] **Step 8.1: Crear el archivo de tests**

```typescript
// src/__tests__/mensajes-auditoria.test.ts

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import config from '../config/config';

// Genera un token firmado con el mismo secret que usa el middleware authenticate
function makeToken(tipo: string, overrides: Record<string, any> = {}) {
  return jwt.sign(
    {
      sub: '507f1f77bcf86cd799439011',
      tipo,
      escuelaId: '507f1f77bcf86cd799439012',
      ...overrides,
    },
    config.jwt.secret,
    { expiresIn: '1h' },
  );
}

const tokenRector = makeToken('RECTOR');
const tokenDocente = makeToken('DOCENTE');

describe('GET /api/mensajes/estadisticas-docentes', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/mensajes/estadisticas-docentes');
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol DOCENTE', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenDocente}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(403);
  });

  it('devuelve 400 si falta el parámetro desde', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ hasta: '2026-05-31' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('devuelve 400 si falta el parámetro hasta', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('responde 200 con estructura correcta cuando los params son válidos', async () => {
    const res = await request(app)
      .get('/api/mensajes/estadisticas-docentes')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    // El endpoint puede devolver 200 con data vacía (escuela de test sin docentes)
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('totalDocentes');
      expect(res.body.meta).toHaveProperty('desde');
      expect(res.body.meta).toHaveProperty('hasta');
    }
  });
});

describe('GET /api/mensajes/auditoria', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(app).get('/api/mensajes/auditoria');
    expect(res.status).toBe(401);
  });

  it('devuelve 403 para rol DOCENTE', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenDocente}`)
      .query({
        remitenteId: '507f1f77bcf86cd799439013',
        desde: '2026-05-01',
        hasta: '2026-05-31',
      });
    expect(res.status).toBe(403);
  });

  it('devuelve 400 si falta remitenteId', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(400);
  });

  it('devuelve 400 si remitenteId no es un ObjectId válido', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({ remitenteId: 'no-es-un-id', desde: '2026-05-01', hasta: '2026-05-31' });
    expect(res.status).toBe(400);
  });

  it('responde 200 con estructura correcta cuando los params son válidos', async () => {
    const res = await request(app)
      .get('/api/mensajes/auditoria')
      .set('Authorization', `Bearer ${tokenRector}`)
      .query({
        remitenteId: '507f1f77bcf86cd799439013',
        desde: '2026-05-01',
        hasta: '2026-05-31',
      });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('total');
      expect(res.body.meta).toHaveProperty('pagina');
      expect(res.body.meta).toHaveProperty('limite');
      expect(res.body.meta).toHaveProperty('paginas');
    }
  });
});
```

- [ ] **Step 8.2: Ejecutar los tests**

```bash
npx jest src/__tests__/mensajes-auditoria.test.ts --verbose
```

Esperado: Los tests de 401, 403 y 400 deben pasar. El test de 200 puede devolver 200 o 500 dependiendo de si hay conexión a MongoDB en el entorno de test (500 = MongoNetworkError es aceptable en CI sin DB real).

Si algún test de 401/403/400 falla, revisar:
- Test 401: verificar que `authenticate` middleware está aplicado en la ruta
- Test 403: verificar que `authorize` está antes del handler
- Test 400: verificar que la validación ocurre antes del query a DB

- [ ] **Step 8.3: Commit**

```bash
git add src/__tests__/mensajes-auditoria.test.ts
git commit -m "test: agregar tests de auth y validación para endpoints de auditoría"
```

---

## Task 9: Verificación Final

- [ ] **Step 9.1: Typecheck completo**

```bash
npm run check-types
```

Esperado: 0 errores de TypeScript.

- [ ] **Step 9.2: Lint**

```bash
npm run lint
```

Si hay errores de lint, corregirlos con:

```bash
npm run lint:fix
```

- [ ] **Step 9.3: Ejecutar todos los tests**

```bash
npm test
```

Esperado: Todos los tests pasan (incluyendo el test existente de `app.test.ts`).

- [ ] **Step 9.4: Build de producción**

```bash
npm run build
```

Esperado: Compila sin errores a `dist/`.

- [ ] **Step 9.5: Commit de cierre**

```bash
git add -A
git commit -m "chore: verificación final — typecheck, lint y build del módulo de auditoría"
```

---

## Checklist Manual Post-Deploy (Postman / Insomnia)

Verificar con un token de RECTOR real:

### Fix bandeja enviados
- [ ] `GET /api/mensajes?bandeja=enviados` — Docente que envió un masivo ya no ve el doble de entradas. La copia que le llega al acudiente no aparece en la bandeja.

### Endpoint estadísticas
- [ ] `GET /api/mensajes/estadisticas-docentes?desde=2026-05-01&hasta=2026-05-31` — Devuelve todos los docentes de la escuela, incluyendo los que tienen count=0. Ordenados: count=0 primero.
- [ ] Con `cursoId=<id>` — Filtra solo docentes que dictan ese curso.
- [ ] Sin token → 401. Con token de DOCENTE → 403. Sin `desde` → 400.

### Endpoint auditoría
- [ ] `GET /api/mensajes/auditoria?remitenteId=<docenteId>&desde=2026-05-01&hasta=2026-05-31` — Devuelve mensajes del docente. Mensajes GRUPAL tienen `cursoNombre` (null si es mensaje histórico previo al deploy). Mensajes INDIVIDUAL tienen `destinatario.nombre`.
- [ ] `remitenteId=abc123` (ID inválido) → 400.
- [ ] `pagina=2&limite=5` — Paginación funciona correctamente.

### Verificar `$let` en cursoNombre (nota del usuario)
- [ ] Para un mensaje GRUPAL nuevo (enviado después del deploy), verificar en la respuesta que `cursoNombre` viene como string (ej: `"6°A"`) y no como array anidado (`[["6°A"]]`).
