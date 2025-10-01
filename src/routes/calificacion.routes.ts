// src/routes/calificacion.routes.ts

import express from 'express';
import calificacionController from '../controllers/calificacion.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  crearCalificacionValidation,
  actualizarCalificacionValidation,
  agregarCalificacionLogroValidation,
  actualizarCalificacionLogroValidation,
} from '../validations/calificacion.validation';
import { cacheMiddleware } from '../cache/simpleCache';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para administradores y docentes
router.post(
  '/',
  authorize('ADMIN', 'DOCENTE'),
  validate(crearCalificacionValidation),
  calificacionController.crear,
);

router.get(
  '/',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'),
  cacheMiddleware('calificaciones'),
  calificacionController.obtenerTodas,
);

router.get(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'),
  calificacionController.obtenerPorId,
);

router.put(
  '/:id',
  authorize('ADMIN', 'DOCENTE'),
  validate(actualizarCalificacionValidation),
  calificacionController.actualizar,
);

// Rutas específicas para gestión de calificaciones por logro
router.post(
  '/:id/logros',
  authorize('ADMIN', 'DOCENTE'),
  validate(agregarCalificacionLogroValidation),
  calificacionController.agregarCalificacionLogro,
);

router.put(
  '/:id/logros',
  authorize('ADMIN', 'DOCENTE'),
  validate(actualizarCalificacionLogroValidation),
  calificacionController.actualizarCalificacionLogro,
);

export default router;
