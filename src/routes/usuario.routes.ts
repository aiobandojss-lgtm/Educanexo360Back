import express from 'express';
import usuarioController from '../controllers/usuario.controller';
import * as authMiddleware from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  actualizarUsuarioValidation,
  cambiarPasswordValidation,
  asociarEstudianteValidation,
} from '../validations/usuario.validation';
import { cacheMiddleware } from '../cache/simpleCache';

const router = express.Router();

// Rutas protegidas - requieren autenticación
router.use(authMiddleware.authenticate);

// Rutas para administradores y roles administrativos (RECTOR y COORDINADOR incluidos)
router.get(
  '/',
  // Solo permitimos listar usuarios a roles administrativos con permisos completos
  authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  cacheMiddleware('usuarios'),
  usuarioController.obtenerUsuarios,
);

router.get(
  '/buscar',
  authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  usuarioController.buscarUsuarios,
);

// Para obtener un usuario específico, no usamos authorize sino el controlador,
// que ya verifica si es el propio perfil o si tiene rol administrativo
router.get('/:id', usuarioController.obtenerUsuario);

router.put('/:id', validate(actualizarUsuarioValidation), usuarioController.actualizarUsuario);

// Solo ADMIN, RECTOR y COORDINADOR pueden eliminar usuarios
router.delete(
  '/:id',
  authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  usuarioController.eliminarUsuario,
);

// Ruta para cambiar contraseña (el usuario solo puede cambiar su propia contraseña)
router.post(
  '/:id/cambiar-password',
  validate(cambiarPasswordValidation),
  usuarioController.cambiarPassword,
);

// Rutas para gestión de estudiantes asociados
router.get(
  '/:id/estudiantes-asociados',
  authMiddleware.authorize(
    'ADMIN',
    'DOCENTE',
    'ACUDIENTE',
    'RECTOR',
    'COORDINADOR',
    'ADMINISTRATIVO',
  ),
  usuarioController.obtenerEstudiantesAsociados,
);

router.post(
  '/:id/estudiantes-asociados',
  authMiddleware.authorize('ADMIN', 'ACUDIENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(asociarEstudianteValidation),
  usuarioController.asociarEstudiante,
);

router.delete(
  '/:id/estudiantes-asociados/:estudianteId',
  authMiddleware.authorize('ADMIN', 'ACUDIENTE', 'RECTOR', 'COORDINADOR'),
  usuarioController.eliminarAsociacionEstudiante,
);

export default router;
