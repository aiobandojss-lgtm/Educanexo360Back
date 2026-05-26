// src/routes/asistencia.routes.ts

import express, { RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  crearAsistenciaValidation,
  actualizarAsistenciaValidation,
  alertasAsistenciaValidation,
} from '../validations/asistencia.validation';
import {
  crearAsistencia,
  obtenerAsistencias,
  obtenerAsistenciaPorId,
  actualizarAsistencia,
  finalizarAsistencia,
  eliminarAsistencia,
  obtenerEstadisticasCurso,
  obtenerEstadisticasEstudiante,
  obtenerAsistenciaDia,
  obtenerResumenPeriodo,
  obtenerResumen,
  getAlertasAsistencia,
} from '../controllers/asistencia.controller';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para estadísticas y consultas especiales (deben ir antes de las rutas con :id)
router.get('/dia', obtenerAsistenciaDia as RequestHandler);
router.get(
  '/alertas',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(alertasAsistenciaValidation),
  getAlertasAsistencia as RequestHandler,
);
router.get('/estadisticas/curso/:cursoId', obtenerEstadisticasCurso as RequestHandler);
router.get(
  '/estadisticas/estudiante/:estudianteId',
  obtenerEstadisticasEstudiante as RequestHandler,
);

// Ruta para obtener resumen general
router.get('/resumen', obtenerResumen as RequestHandler);

router.get(
  '/resumen/periodo/:periodoId',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  obtenerResumenPeriodo as RequestHandler,
);

// Rutas básicas CRUD
router.post(
  '/',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(crearAsistenciaValidation),
  crearAsistencia as RequestHandler,
);

// Permitir acceso a todos los usuarios autenticados para consultar asistencias
router.get('/', obtenerAsistencias as RequestHandler);
router.get('/:id', obtenerAsistenciaPorId as RequestHandler);

router.put(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(actualizarAsistenciaValidation),
  actualizarAsistencia as RequestHandler,
);

router.patch(
  '/:id/finalizar',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  finalizarAsistencia as RequestHandler,
);

router.delete(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  eliminarAsistencia as RequestHandler,
);

export default router;
