import express, { Request, Response, NextFunction } from 'express';
import notificacionController from '../controllers/notificacion.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { cacheMiddleware } from '../cache/simpleCache';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// 🔥 NUEVAS RUTAS PARA PUSH NOTIFICATIONS
router.post('/register-token', (req: any, res: Response, next: NextFunction) => {
  notificacionController.registrarTokenFCM(req, res, next);
});

// ✅ CORREGIDO: AUTHORIZE ACEPTA ARRAYS AHORA
router.post('/test-push', authorize('ADMIN', 'RECTOR', 'COORDINADOR'), (req: any, res: Response, next: NextFunction) => {
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