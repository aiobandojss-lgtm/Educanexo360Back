# Design: Auditoría de Comunicados Docentes + Fix Enviados Duplicados

**Fecha:** 2026-05-30
**Estado:** Aprobado — pendiente implementación
**Scope:** Backend únicamente (el frontend se diseña después de que el backend esté desplegado)
**Roles beneficiados:** RECTOR, COORDINADOR, ADMIN

---

## Contexto

El rector, coordinador y admin necesitan verificar que los docentes estén enviando comunicados a los estudiantes. Hoy no existe forma de hacer ese seguimiento sin revisar mensaje por mensaje.

Problema adicional: cuando un docente envía un mensaje a un estudiante, el sistema genera automáticamente una copia al acudiente. Ambas aparecen en la bandeja "Enviados" del docente, generando ruido visual duplicado. Se corrige con un flag en el modelo.

---

## Cambios de Modelo

### `IMensaje.ts` — `IMensajeBase`

Dos nuevos campos opcionales:

```typescript
esCopiaAcudiente?: boolean;    // default false — identifica copias automáticas al acudiente
cursoIds?: Types.ObjectId[];   // cursos destino en mensajes GRUPAL/INSTITUCIONAL
```

### `mensaje.model.ts` — `MensajeSchema`

```typescript
esCopiaAcudiente: { type: Boolean, default: false }
cursoIds: [{ type: Schema.Types.ObjectId, ref: 'Curso' }]
```

**Sin índices adicionales** para estos campos en esta fase:
- `esCopiaAcudiente` se usa como `$ne: true` (baja selectividad, no justifica índice)
- `cursoIds` solo se usa en queries de auditoría de baja frecuencia

**Retrocompatibilidad:** Mensajes históricos quedan con `esCopiaAcudiente: false` (default) y `cursoIds: []`. Para mensajes GRUPAL históricos, el endpoint `/auditoria` devolverá `cursoNombre: null` — el frontend mostrará "Curso N/A" como fallback.

---

## Cambios en el Servicio (`mensaje.service.ts`)

### 1. `crearMensaje` — persistir campos nuevos

Extraer de `datos`:
- `esCopiaAcudiente = false`
- `cursoIds = []`

Pasarlos a `Mensaje.create({ ..., esCopiaAcudiente, cursoIds })`.

### 2. `enviarCopiaAcudientes` — marcar la copia

En el objeto `mensajeAcudientes`, agregar `esCopiaAcudiente: true`. No pasar `cursoIds` (el mensaje al acudiente no necesita esa información).

### 3. Nuevo método: `obtenerEstadisticasDocentes(escuelaId, params)`

**Params:** `{ desde, hasta, cursoId?, docenteId? }`

**Aggregation pipeline sobre `Usuario`:**

```
Stage 1 — $match
  tipo: 'DOCENTE'
  escuelaId: escuelaId
  estado: 'ACTIVO'
  [si docenteId] _id: docenteId
  [si cursoId]   'info_academica.asignaturas_asignadas.cursoId': cursoId

Stage 2 — $addFields
  cursosIds: $setUnion de info_academica.asignaturas_asignadas[].cursoId
  (deduplicar cursos del docente)

Stage 3 — $lookup a Curso
  localField: cursosIds
  foreignField: _id
  pipeline: [{ $project: { nombre: 1 } }]
  as: cursosInfo

Stage 4 — $lookup a Mensaje (left join)
  let: { docenteId: '$_id' }
  pipeline interna:
    $match: $expr = remitente==$$docenteId
                  + createdAt entre desde y hasta
                  + esCopiaAcudiente != true
                  + tipo != 'BORRADOR'
    $project: { _id: 1, createdAt: 1 }
  as: mensajes

Stage 5 — $project
  docenteId: '$_id'
  nombre, apellidos
  count: { $size: '$mensajes' }
  ultimoMensaje: { $max: '$mensajes.createdAt' }   → null si count=0
  cursos: map de cursosInfo → [{ _id, nombre }]

Stage 6 — $sort { count: 1 }
  (0 primero naturalmente, luego ascendente)
```

**Respuesta:**
```json
{
  "success": true,
  "data": [ { "docenteId", "nombre", "apellidos", "count", "ultimoMensaje", "cursos" } ],
  "meta": { "desde", "hasta", "totalDocentes" }
}
```
`totalDocentes` = total de docentes encontrados (incluye los de count=0).

### 4. Nuevo método: `obtenerMensajesAuditoria(escuelaId, params)`

**Params:** `{ remitenteId, desde, hasta, pagina=1, limite=20 }`

**Aggregation pipeline sobre `Mensaje`:**

```
Stage 1 — $match
  remitente: remitenteId
  escuelaId: escuelaId     ← evita cross-school data leaks
  createdAt: { $gte: desde, $lte: hasta }
  esCopiaAcudiente: { $ne: true }
  tipo: { $ne: 'BORRADOR' }

Stage 2 — $lookup a Usuario (destinatarios estudiantes)
  let: { dests: '$destinatarios' }
  pipeline: $match tipo=='ESTUDIANTE' + $in _id en $$dests
  as: destinatariosEstudiantes

Stage 3 — $lookup a Curso
  localField: cursoIds
  foreignField: _id
  pipeline: [{ $project: { nombre: 1 } }]
  as: cursosInfo

Stage 4 — $project
  asunto, createdAt, tipo
  destinatario:                    si tipo==INDIVIDUAL → arrayElemAt(destinatariosEstudiantes, 0)
  cursoNombre:                     si tipo!=INDIVIDUAL → arrayElemAt(cursosInfo.nombre, 0)
  cantidadDestinatariosEstudiantes: si tipo!=INDIVIDUAL → $size(destinatariosEstudiantes)

Stage 5 — $sort { createdAt: -1 }

Stage 6 — $facet
  data:  [{ $skip: (pagina-1)*limite }, { $limit: limite }]
  total: [{ $count: 'count' }]
  (paginación en una sola query — evita N+1)
```

**Respuesta:**
```json
{
  "success": true,
  "data": [ { "_id", "asunto", "createdAt", "tipo", "destinatario | cursoNombre + cantidadDestinatariosEstudiantes" } ],
  "meta": { "total", "pagina", "limite", "paginas" }
}
```

---

## Cambios en el Controller (`mensaje.controller.ts`)

### 1. Fix bandeja enviados

En `obtenerTodos`, dentro del bloque `if (bandeja === 'enviados')`, agregar al objeto `matchBandeja`:
```javascript
matchBandeja.esCopiaAcudiente = { $ne: true };
```
Sin cambios en el frontend — el cliente simplemente recibe menos resultados.

### 2. Nuevo handler `estadisticasDocentes`

- Valida `req.user`, extrae query params (`desde`, `hasta`, `cursoId?`, `docenteId?`)
- `desde` y `hasta` son **requeridos** → `ApiError(400)` si faltan
- Llama `mensajeService.obtenerEstadisticasDocentes(req.user.escuelaId, params)`
- Devuelve `{ success, data, meta }`

### 3. Nuevo handler `auditoriaDocente`

- Valida `req.user`, extrae query params (`remitenteId`, `desde`, `hasta`, `pagina?`, `limite?`)
- `remitenteId`, `desde`, `hasta` son **requeridos** → `ApiError(400)` si faltan
- Valida que `remitenteId` sea un ObjectId válido (`mongoose.isValidObjectId`)
- Llama `mensajeService.obtenerMensajesAuditoria(req.user.escuelaId, params)`
- Devuelve `{ success, data, meta }`

---

## Cambios en las Rutas (`mensaje.routes.ts`)

Dos nuevas rutas **antes** de `router.get('/:id', ...)` (crítico: evitar captura por el segmento dinámico):

```typescript
router.get(
  '/estadisticas-docentes',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.estadisticasDocentes(req, res, next);
  }
);

router.get(
  '/auditoria',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.auditoriaDocente(req, res, next);
  }
);
```

Ambas incluirán Swagger JSDoc `@swagger` (requerimiento del proyecto).

---

## Archivos a Modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/interfaces/IMensaje.ts` | Agregar 2 campos a `IMensajeBase` |
| `src/models/mensaje.model.ts` | Agregar 2 campos a `MensajeSchema` |
| `src/services/mensaje.service.ts` | Modificar `crearMensaje` + `enviarCopiaAcudientes` + 2 métodos nuevos |
| `src/controllers/mensaje.controller.ts` | Fix bandeja enviados + 2 handlers nuevos |
| `src/routes/mensaje.routes.ts` | 2 rutas nuevas (antes de `/:id`) + Swagger JSDoc |

No se crean archivos nuevos — todo se extiende sobre los módulos existentes.

---

## Fuera de Scope (esta iteración)

- Cambios en el frontend (se diseñan después del backend)
- Exportar auditoría a Excel/PDF
- Notificación automática si docente lleva X días sin enviar
- Umbral configurable para badges de color (hoy: hardcodeado en 3)
- Migración de datos históricos para poblar `cursoIds` retroactivamente
