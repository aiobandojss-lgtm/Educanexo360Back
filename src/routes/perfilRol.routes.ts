import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import perfilRolController from '../controllers/perfilRol.controller';
import {
  crearPerfilRolValidation,
  actualizarPerfilRolValidation,
  asignarPerfilRolValidation,
  removerPerfilRolValidation,
} from '../validations/perfilRol.validation';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: PerfilesRol
 *   description: Gestión de perfiles de rol personalizados por escuela (RBAC)
 */

// ── Catálogo de permisos (acceso para cualquier admin) ──────────────────────

/**
 * @swagger
 * /api/perfiles-rol/catalogo/permisos:
 *   get:
 *     summary: Lista todos los permisos disponibles en el sistema
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Catálogo de permisos agrupados por módulo
 */
router.get(
  '/catalogo/permisos',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  perfilRolController.obtenerCatalogoPermisos,
);

/**
 * @swagger
 * /api/perfiles-rol/catalogo/sugeridos/{rolBase}:
 *   get:
 *     summary: Devuelve los permisos sugeridos para un rol base
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rolBase
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
  '/catalogo/sugeridos/:rolBase',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  perfilRolController.obtenerPermisosSugeridos,
);

// ── Gestión de perfiles de rol ──────────────────────────────────────────────

/**
 * @swagger
 * /api/perfiles-rol:
 *   get:
 *     summary: Lista los perfiles de rol de la escuela
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Crea un nuevo perfil de rol
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  perfilRolController.listar,
);

router.post(
  '/',
  authorize('ADMIN'),
  validate(crearPerfilRolValidation),
  perfilRolController.crear,
);

/**
 * @swagger
 * /api/perfiles-rol/{id}:
 *   get:
 *     summary: Obtiene un perfil de rol por ID
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 *   put:
 *     summary: Actualiza un perfil de rol
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Elimina un perfil de rol
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  '/:id',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  perfilRolController.obtener,
);

router.put(
  '/:id',
  authorize('ADMIN'),
  validate(actualizarPerfilRolValidation),
  perfilRolController.actualizar,
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  perfilRolController.eliminar,
);

// ── Asignación de perfiles a usuarios ──────────────────────────────────────

/**
 * @swagger
 * /api/perfiles-rol/usuarios/{usuarioId}/asignar:
 *   post:
 *     summary: Asigna un perfil de rol a un usuario
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  '/usuarios/:usuarioId/asignar',
  authorize('ADMIN'),
  validate(asignarPerfilRolValidation),
  perfilRolController.asignarAUsuario,
);

/**
 * @swagger
 * /api/perfiles-rol/usuarios/{usuarioId}/perfil:
 *   delete:
 *     summary: Remueve el perfil personalizado de un usuario
 *     tags: [PerfilesRol]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
  '/usuarios/:usuarioId/perfil',
  authorize('ADMIN'),
  validate(removerPerfilRolValidation),
  perfilRolController.removerDeUsuario,
);

export default router;
