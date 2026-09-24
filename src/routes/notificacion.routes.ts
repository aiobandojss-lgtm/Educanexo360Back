import express, { Request, Response, NextFunction } from 'express';
import notificacionController from '../controllers/notificacion.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { cacheMiddleware } from '../cache/simpleCache';
import { validate } from '../middleware/validate.middleware';
import {
  registrarTokenValidation,
  desregistrarTokenValidation,
} from '../validations/notificacion.validation';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// 🔥 NUEVAS RUTAS PARA PUSH NOTIFICATIONS
const registrarToken = [
  validate(registrarTokenValidation),
  (req: any, res: Response, next: NextFunction) => {
    notificacionController.registrarTokenFCM(req, res, next);
  },
];

router.post('/register-token', ...registrarToken);

/**
 * @swagger
 * /api/notificaciones/fcm-token:
 *   post:
 *     summary: Alias de /api/notificaciones/register-token (APKs anteriores al 2026-06-10)
 *     description: Mismo handler, autenticación y validaciones que register-token.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken, platform]
 *             properties:
 *               fcmToken: { type: string }
 *               platform: { type: string, enum: [ios, android] }
 *               deviceInfo: { type: object }
 *     responses:
 *       200:
 *         description: Token registrado
 */
router.post('/fcm-token', ...registrarToken);

/**
 * @swagger
 * /api/notificaciones/unregister-token:
 *   post:
 *     summary: Desvincula el token FCM del usuario al cerrar sesión
 *     description: Idempotente. Si el token coincide con el del usuario lo pone en null; responde 200 aunque no coincida.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fcmToken]
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200:
 *         description: '{ success: true, message: "Dispositivo desvinculado", data: { tokenRemoved: boolean } }'
 *       400:
 *         description: fcmToken ausente o inválido
 *       401:
 *         description: No autenticado
 */
router.post(
  '/unregister-token',
  validate(desregistrarTokenValidation),
  (req: any, res: Response, next: NextFunction) => {
    notificacionController.desregistrarTokenFCM(req, res, next);
  },
);

// ✅ CORREGIDO: AUTHORIZE ACEPTA ARRAYS AHORA
// Solo SUPER_ADMIN y ADMIN (el controlador rechaza a RECTOR/COORDINADOR/ADMINISTRATIVO que authorize('ADMIN') admite)
router.post('/test-push', authorize('SUPER_ADMIN', 'ADMIN'), (req: any, res: Response, next: NextFunction) => {
  notificacionController.enviarNotificacionPrueba(req, res, next);
});

// Rutas existentes para usuarios normales
router.get(
  '/',
  cacheMiddleware('notificaciones'),
  (req: any, res: Response, next: NextFunction) => {
    notificacionController.obtenerNotificaciones(req, res, next);
  },
);

router.put('/:id/leer', (req: any, res: Response, next: NextFunction) => {
  notificacionController.marcarComoLeida(req, res, next);
});

router.put('/leer-todas', (req: any, res: Response, next: NextFunction) => {
  notificacionController.marcarTodasComoLeidas(req, res, next);
});

router.put('/:id/archivar', (req: any, res: Response, next: NextFunction) => {
  notificacionController.archivarNotificacion(req, res, next);
});

// ✅ CORREGIDO: RUTAS PARA ADMINISTRADORES
router.post('/', authorize('ADMIN'), (req: any, res: Response, next: NextFunction) => {
  notificacionController.crearNotificacion(req, res, next);
});

router.post('/masiva', authorize('ADMIN'), (req: any, res: Response, next: NextFunction) => {
  notificacionController.crearNotificacionMasiva(req, res, next);
});

export default router;