import express from 'express';
import escuelaController from '../controllers/escuela.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  crearEscuelaValidation,
  actualizarEscuelaValidation,
  actualizarConfiguracionValidation,
  actualizarPeriodosValidation,
} from '../validations/escuela.validation';
import { RequestHandler } from 'express-serve-static-core';

const router = express.Router();

// Crear un middleware personalizado que permita a todos los roles
const obtenerEscuelaPorId: RequestHandler = (req, res, next) => {
  escuelaController.obtenerPorId(req, res, next);
};

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas básicas CRUD
// Crear escuelas: solo SUPER_ADMIN
router.post('/', authorize('SUPER_ADMIN'), validate(crearEscuelaValidation), escuelaController.crear);

// Listar escuelas: SUPER_ADMIN ve todas; los roles administrativos solo reciben la suya
router.get(
  '/',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'SUPER_ADMIN'),
  escuelaController.obtener,
);

// Permitir acceso a todos los roles para obtener una escuela específica
router.get(
  '/:id',
  authorize(
    'ADMIN',
    'DOCENTE',
    'ESTUDIANTE',
    'PADRE',
    'ACUDIENTE',
    'RECTOR',
    'COORDINADOR',
    'ADMINISTRATIVO',
    'SUPER_ADMIN',
  ),
  obtenerEscuelaPorId,
);

// Actualizar: el controlador verifica que sea la escuela del usuario (o SUPER_ADMIN)
router.put(
  '/:id',
  authorize('ADMIN', 'RECTOR', 'SUPER_ADMIN'),
  validate(actualizarEscuelaValidation),
  escuelaController.actualizar,
);

// Desactivar escuelas: solo SUPER_ADMIN
router.delete('/:id', authorize('SUPER_ADMIN'), escuelaController.eliminar);

// Rutas para configuración y períodos (solo sobre la escuela propia, o SUPER_ADMIN)
router.put(
  '/:id/configuracion',
  authorize('ADMIN', 'RECTOR', 'SUPER_ADMIN'),
  validate(actualizarConfiguracionValidation),
  escuelaController.actualizarConfiguracion,
);

router.put(
  '/:id/periodos',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'SUPER_ADMIN'),
  validate(actualizarPeriodosValidation),
  escuelaController.actualizarPeriodosAcademicos,
);

export default router;
