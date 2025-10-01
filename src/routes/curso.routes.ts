import express from 'express';
import cursoController from '../controllers/curso.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  crearCursoValidation,
  actualizarCursoValidation,
  agregarEstudiantesValidation,
  removerEstudiantesValidation,
} from '../validations/curso.validation';
import { cacheMiddleware } from '../cache/simpleCache';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para administradores y personal administrativo
router.post('/', authorize('ADMIN'), validate(crearCursoValidation), cursoController.crear);

router.put(
  '/:id',
  authorize('ADMIN'),
  validate(actualizarCursoValidation),
  cursoController.actualizar,
);

router.delete('/:id', authorize('ADMIN'), cursoController.eliminar);

// Rutas para administrar estudiantes
router.post(
  '/:id/estudiantes',
  authorize('ADMIN'),
  validate(agregarEstudiantesValidation),
  cursoController.agregarEstudiantes,
);

router.delete(
  '/:id/estudiantes',
  authorize('ADMIN'),
  validate(removerEstudiantesValidation),
  cursoController.removerEstudiantes,
);

// Nueva ruta para obtener estudiantes de un curso
router.get(
  '/:id/estudiantes',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  cursoController.obtenerEstudiantes,
);

// Rutas de consulta (accesibles para ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO y DOCENTE)
router.get(
  '/',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  cacheMiddleware('cursos'),
  cursoController.obtenerTodos,
);

router.get(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  cursoController.obtenerPorId,
);

export default router;
