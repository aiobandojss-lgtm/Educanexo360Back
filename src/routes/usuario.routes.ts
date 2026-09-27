import express from 'express';
import usuarioController from '../controllers/usuario.controller';
import * as authMiddleware from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  actualizarUsuarioValidation,
  cambiarPasswordValidation,
  asociarEstudianteValidation,
  preferenciasValidation,
  reenviarEnlacePasswordValidation,
} from '../validations/usuario.validation';
import { cacheMiddleware } from '../cache/simpleCache';

const router = express.Router();

// Rutas protegidas - requieren autenticación
router.use(authMiddleware.authenticate);

// Autoservicio: cualquier usuario autenticado puede solicitar la eliminación
// de su PROPIA cuenta (requisito de Play Store / App Store).
// Debe ir ANTES de las rutas con /:id para no interpretarse como un ID.
router.post('/eliminar-cuenta', usuarioController.solicitarEliminacionCuenta);

/**
 * @swagger
 * /usuarios/me/preferencias:
 *   get:
 *     summary: Preferencia de correo de mensajes del usuario autenticado
 *     description: >
 *       inmediato (un correo por mensaje), resumen (un correo diario a las 18:00 hora Colombia con los
 *       mensajes no leídos) o ninguno. Si nunca la eligió: ACUDIENTE → resumen, resto → inmediato
 *       (porDefecto = true). Prioridad ALTA, alertas y correos de cuenta salen siempre.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: '{ success, data: { email, porDefecto, opciones } }'
 *   put:
 *     summary: Cambia la preferencia de correo de mensajes del usuario autenticado
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, enum: [inmediato, resumen, ninguno] }
 *     responses:
 *       200:
 *         description: '{ success, data: { email, porDefecto: false, opciones }, message }'
 *       400:
 *         description: Valor inválido
 */
// Rutas /me: ANTES de /:id para que Express no interprete "me" como un ID
router.get('/me/preferencias', usuarioController.obtenerPreferencias);
router.put('/me/preferencias', validate(preferenciasValidation), usuarioController.actualizarPreferencias);

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

// Rutas de listado por tipo — deben ir ANTES de /:id para que Express no las interprete como IDs
router.get(
  '/estudiantes',
  authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  cacheMiddleware('usuarios-estudiantes'),
  (req, _res, next) => { req.query.tipo = 'ESTUDIANTE'; next(); },
  usuarioController.obtenerUsuarios,
);

router.get(
  '/docentes',
  authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  cacheMiddleware('usuarios-docentes'),
  (req, _res, next) => { req.query.tipo = 'DOCENTE'; next(); },
  usuarioController.obtenerUsuarios,
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

/**
 * @swagger
 * /usuarios/{id}/reenviar-enlace-password:
 *   post:
 *     summary: Reenvía el enlace para definir la contraseña de un usuario
 *     description: >
 *       Roles administrativos (ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO) y SUPER_ADMIN, sobre usuarios ACTIVOS de
 *       su colegio con rango inferior (misma regla que la gestión de usuarios). Genera un enlace nuevo de un solo uso
 *       (vence en 72 h) e invalida los anteriores. Si el usuario es ESTUDIANTE (su correo es ficticio), el enlace se
 *       envía a sus acudientes activos. El correo sale por la cola con prioridad crítica.
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: '{ success, data: { destinatarios: número de correos encolados }, message }'
 *       400:
 *         description: ID inválido
 *       403:
 *         description: Sin permiso sobre ese rol
 *       404:
 *         description: Usuario no encontrado en el colegio o inactivo
 *       409:
 *         description: No hay a quién enviarlo (sin correo real o estudiante sin acudientes con correo)
 *       503:
 *         description: No se pudo encolar el correo; intentar de nuevo
 */
router.post(
  '/:id/reenviar-enlace-password',
  authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'SUPER_ADMIN'),
  validate(reenviarEnlacePasswordValidation),
  usuarioController.reenviarEnlacePassword,
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
  // Solo roles administrativos (un ACUDIENTE no puede asociarse estudiantes a sí mismo)
  authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'),
  validate(asociarEstudianteValidation),
  usuarioController.asociarEstudiante,
);

router.delete(
  '/:id/estudiantes-asociados/:estudianteId',
  authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  usuarioController.eliminarAsociacionEstudiante,
);

export default router;
