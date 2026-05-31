import { Router, RequestHandler } from 'express';
import { query, param } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  obtenerInformeRiesgo,
  obtenerInformeTendencia,
  obtenerInformeRankingCursos,
  obtenerInformePatronDias,
  obtenerHistorialEstudiante,
} from '../controllers/asistenciaInformes.controller';

const router = Router();

// Todos los endpoints requieren autenticación
router.use(authenticate);

// ── Validadores reutilizables ─────────────────────────────────────────────────
const validarFechaOpcional = (campo: string) =>
  query(campo).optional().isISO8601().withMessage(`${campo} debe ser una fecha válida (YYYY-MM-DD)`);

const validarFechaRequerida = (campo: string) =>
  query(campo).notEmpty().withMessage(`${campo} es requerido`).isISO8601().withMessage(`${campo} debe ser una fecha válida (YYYY-MM-DD)`);

const validarMongoId = (campo: string) =>
  query(campo).optional().isMongoId().withMessage(`${campo} debe ser un ID válido`);

// ── INFORME 1 — Estudiantes en riesgo ────────────────────────────────────────
/**
 * @swagger
 * /asistencia/informes/riesgo:
 *   get:
 *     summary: Estudiantes en riesgo por inasistencia
 *     description: Lista estudiantes cuyo porcentaje de asistencia está por debajo del umbral. Clasifica en CRITICO (<70%) y ALERTA (<umbral%).
 *     tags: [Informes de Asistencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: umbral
 *         schema:
 *           type: integer
 *           default: 80
 *         description: Porcentaje mínimo de asistencia (0-100)
 *       - in: query
 *         name: cursoId
 *         schema:
 *           type: string
 *         description: Filtrar por curso específico
 *       - in: query
 *         name: desde
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de inicio (YYYY-MM-DD)
 *       - in: query
 *         name: hasta
 *         schema:
 *           type: string
 *           format: date
 *         description: Fecha de fin (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Lista de estudiantes en riesgo con nivel de alerta
 */
router.get(
  '/riesgo',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'),
  [
    query('umbral').optional().isInt({ min: 0, max: 100 }).withMessage('umbral debe ser un entero entre 0 y 100'),
    validarFechaOpcional('desde'),
    validarFechaOpcional('hasta'),
    validarMongoId('cursoId'),
  ],
  obtenerInformeRiesgo as RequestHandler,
);

// ── INFORME 2 — Tendencia de asistencia ──────────────────────────────────────
/**
 * @swagger
 * /asistencia/informes/tendencia:
 *   get:
 *     summary: Tendencia de asistencia por período
 *     description: Agrupa la asistencia por semana o mes para visualizar tendencias. Ideal para gráficas de línea.
 *     tags: [Informes de Asistencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: agrupacion
 *         schema:
 *           type: string
 *           enum: [semana, mes]
 *           default: semana
 *       - in: query
 *         name: cursoId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Serie temporal con porcentaje de asistencia por período
 */
router.get(
  '/tendencia',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'),
  [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
    query('agrupacion').optional().isIn(['semana', 'mes']).withMessage('agrupacion debe ser "semana" o "mes"'),
    validarMongoId('cursoId'),
  ],
  obtenerInformeTendencia as RequestHandler,
);

// ── INFORME 3 — Ranking de cursos ────────────────────────────────────────────
/**
 * @swagger
 * /asistencia/informes/ranking-cursos:
 *   get:
 *     summary: Ranking de cursos por porcentaje de asistencia
 *     description: Ordena todos los cursos de la escuela de mayor a menor asistencia en el período.
 *     tags: [Informes de Asistencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Lista ordenada de cursos con métricas de asistencia
 */
router.get(
  '/ranking-cursos',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'),
  [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
  ],
  obtenerInformeRankingCursos as RequestHandler,
);

// ── INFORME 4 — Patrón por día de la semana ──────────────────────────────────
/**
 * @swagger
 * /asistencia/informes/patron-dias:
 *   get:
 *     summary: Patrón de ausencias por día de la semana
 *     description: Muestra qué días tienen mayor ausentismo (lunes a viernes). Útil para detectar patrones sistemáticos.
 *     tags: [Informes de Asistencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: cursoId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ausentismo agrupado por día de la semana
 */
router.get(
  '/patron-dias',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'),
  [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
    validarMongoId('cursoId'),
  ],
  obtenerInformePatronDias as RequestHandler,
);

// ── INFORME 5 — Historial de estudiante ──────────────────────────────────────
/**
 * @swagger
 * /asistencia/informes/historial/{estudianteId}:
 *   get:
 *     summary: Historial de asistencia de un estudiante
 *     description: Detalle clase a clase con justificaciones. Diseñado para informes de reunión con padres.
 *     tags: [Informes de Asistencia]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: estudianteId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Historial completo del estudiante con resumen y detalle por clase
 */
router.get(
  '/historial/:estudianteId',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'),
  [
    param('estudianteId').isMongoId().withMessage('estudianteId debe ser un ID válido'),
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
  ],
  obtenerHistorialEstudiante as RequestHandler,
);

export default router;
