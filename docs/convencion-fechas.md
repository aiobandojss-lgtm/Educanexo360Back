# Convención de fechas (todos los clientes)

Zona de referencia: **Colombia, `America/Bogota`, UTC−5 sin horario de verano**. La base guarda instantes en UTC.
Es la convención que ya usa la web (EducaNexo360React); Flutter la adopta desde el commit `5438c8e` de la app.

| Dato | Qué envía el cliente | Qué se guarda (ejemplo: 20/10/2026) |
|---|---|---|
| Evento **todo el día** | inicio = 00:00 de Colombia y fin = 23:59 de Colombia, en UTC (`toISOString()`) | `fechaInicio 2026-10-20T05:00:00.000Z`, `fechaFin 2026-10-21T04:59:00.000Z` |
| Evento **con hora** | hora local convertida a UTC (`toISOString()`) | 08:00 de Colombia → `2026-10-20T13:00:00.000Z` |
| **Fecha límite** de tarea | hora local convertida a UTC (`toISOString()`) | 23:59 de Colombia → `2026-10-21T04:59:00.000Z` |
| **Asistencia** (solo día) | solo la fecha `YYYY-MM-DD` | `2026-10-20T00:00:00.000Z` (medianoche UTC; informes y unicidad dependen de esto) |
| Periodos académicos | solo la fecha `YYYY-MM-DD` | medianoche UTC |
| `fechaEntrega`, `fechaPublicacion`, `createdAt` | nada (los pone el servidor) | instante del servidor en UTC |

## Fechas sin zona horaria

Una fecha **con hora pero sin zona** (`"2026-10-20T00:00:00.000"`, lo que mandaba el APK 1.0.0 con
`toIso8601String()` de una fecha local) es ambigua. El servidor la interpreta **siempre como hora de Colombia**, no con
la zona del servidor (`src/utils/fechas.ts` → `parsearFechaCliente`; middleware `normalizarFechasCliente` en body y
query, solo en claves de fecha: `fecha*`, `inicio`, `fin`, `desde`, `hasta`). Las fechas con `Z` u offset y las de solo
día no cambian. Antes de esto, en producción (servidor en UTC) lo creado desde el APK 1.0.0 quedó **corrido 5 horas**:

- eventos de todo el día guardados de `00:00Z` a `23:59Z` (la web los pinta el día anterior y ese día);
- fechas límite de tareas 5 h antes (entregas marcadas como atrasadas antes de tiempo).

El script `src/scripts/detectar-fechas-corridas.js` (simulación) lista esos documentos para evaluar corregirlos.

## Mostrar fechas

Los textos que arma el servidor (notificaciones, correos) usan `America/Bogota` explícitamente
(`fechaLegibleColombia`), nunca la zona del servidor.
