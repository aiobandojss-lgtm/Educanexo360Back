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

// Roles del personal: administrativos (authorize('ADMIN') los incluye) y DOCENTE (filtrado a sus cursos en el controlador)
const personal = authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO');

// Rutas para estadísticas y consultas especiales (deben ir antes de las rutas con :id)
router.get('/dia', personal, obtenerAsistenciaDia as RequestHandler);
router.get(
  '/alertas',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(alertasAsistenciaValidation),
  getAlertasAsistencia as RequestHandler,
);
router.get('/estadisticas/curso/:cursoId', personal, obtenerEstadisticasCurso as RequestHandler);
// Todos los roles; el controlador aplica puedeVerEstudiante (ESTUDIANTE él mismo, ACUDIENTE sus hijos)
router.get(
  '/estadisticas/estudiante/:estudianteId',
  obtenerEstadisticasEstudiante as RequestHandler,
);

// Resumen: todos los roles; ESTUDIANTE/ACUDIENTE quedan filtrados a su estudiante en el controlador
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

// Listado y detalle: solo personal (ESTUDIANTE/ACUDIENTE usan /resumen y /estadisticas/estudiante)
router.get('/', personal, obtenerAsistencias as RequestHandler);
router.get('/:id', personal, obtenerAsistenciaPorId as RequestHandler);

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
