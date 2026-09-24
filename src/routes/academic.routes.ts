// src/routes/academic.routes.ts

import express from 'express';
import academicController from '../controllers/academic.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para cálculo de promedios
router.get(
  '/promedio-periodo',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  academicController.obtenerPromedioPeriodo,
);

router.get(
  '/promedio-asignatura',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  academicController.obtenerPromedioAsignatura,
);

router.get(
  '/estadisticas-grupo',
  authorize('ADMIN', 'DOCENTE'),
  academicController.obtenerEstadisticasGrupo,
);

export default router;
