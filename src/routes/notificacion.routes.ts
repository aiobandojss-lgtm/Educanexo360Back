import express, { Request, Response, NextFunction } from 'express';
import notificacionController from '../controllers/notificacion.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
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

/**
 * @swagger
 * /api/notificaciones/register-token:
 *   post:
 *     summary: Registra el dispositivo (token FCM) del usuario
 *     description: >
 *       Fase 4.3: AGREGA el token al arreglo de dispositivos del usuario (máx. 5; al pasar de 5 sale el más
 *       viejo). Un token pertenece a un solo usuario: se quita de cualquier otra cuenta. fcmToken null
 *       desvincula TODOS los dispositivos del usuario (INTENCIONAL, auditoría 4.Q: así cierran sesión las APK
 *       1.0.0 y sin token no se sabe cuál dispositivo cerró sesión; sus otros dispositivos dejan de recibir push
 *       hasta que vuelvan a abrir la app). platform opcional (android).
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken: { type: string, nullable: true }
 *               platform: { type: string, enum: [ios, android] }
 *               deviceInfo: { type: object }
 *     responses:
 *       200:
 *         description: '{ success: true, data: { userId, platform, tokenRegistered: true } }'
 */
router.post('/register-token', ...registrarToken);

/**
 * @swagger
 * /api/notificaciones/fcm-token:
 *   post:
 *     summary: Alias de /api/notificaciones/register-token (APKs anteriores al 2026-06-10)
 *     description: Mismo handler, autenticación y validaciones que register-token (agrega el dispositivo).
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
 *     description: >
 *       Idempotente (responde 200 aunque no coincida). Con fcmToken quita SOLO ese dispositivo. Sin
 *       fcmToken desvincula TODOS los dispositivos del usuario: INTENCIONAL (auditoría 4.Q), por compatibilidad
 *       con las APK 1.0.0, que cierran sesión sin enviar el token; los otros dispositivos vuelven a registrarse
 *       al abrir la app. La app nueva debe enviar siempre su fcmToken.
 *     tags: [Notificaciones]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fcmToken: { type: string }
 *     responses:
 *       200:
 *         description: '{ success: true, message: "Dispositivo desvinculado", data: { tokenRemoved: boolean } }'
 *       400:
 *         description: fcmToken con formato inválido
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
  // Sin caché: por usuario; quedaba obsoleta para los destinatarios de nuevas notificaciones
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