import { Router, Request, Response } from 'express';
import { getCacheStats, cache } from '../cache/simpleCache';
import { authenticate, authorize } from '../middleware/auth.middleware';

interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
  };
}

const router = Router();

// Ver estadísticas del cache (solo para admins)
router.get(
  '/stats',
  authenticate,
  authorize('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = getCacheStats();
      res.json({
        success: true,
        data: stats,
        totalKeys: cache.keys().length,
        keys: cache.keys(),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

// Limpiar cache manualmente (solo para admins)
router.delete(
  '/clear',
  authenticate,
  authorize('ADMIN'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      cache.flushAll();
      console.log('🗑️ Cache completamente limpiado por:', req.user?.email);
      res.json({ success: true, message: 'Cache limpiado exitosamente' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  },
);

export default router;
