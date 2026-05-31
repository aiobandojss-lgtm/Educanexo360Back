// src/middleware/dashboardCacheInvalidation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { invalidateCache } from '../cache/simpleCache';

interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
  };
}

// 🚀 Middleware para invalidar cache del dashboard cuando se modifiquen datos
export const invalidateDashboardCache = () => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Interceptar la respuesta para invalidar cache si la operación fue exitosa
    const originalJson = res.json;

    res.json = function (data: any) {
      // Si la operación fue exitosa y hay usuario autenticado
      if (data.success && req.user) {
        const { _id: usuarioId, escuelaId } = req.user;

        try {
          // Log para debugging
          console.log(
            `🔄 Invalidando cache dashboard - Usuario: ${usuarioId}, Escuela: ${escuelaId}`,
          );

          // Invalidar cache dashboard del usuario específico
          invalidateCache('dashboard', usuarioId, escuelaId);

          // Si es admin, invalidar también mensajes y notificaciones que podrían afectar dashboard
          if (['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo)) {
            console.log(`🔄 Usuario admin - Invalidando caches adicionales`);
            invalidateCache('mensajes', usuarioId, escuelaId);
            invalidateCache('notificaciones', usuarioId, escuelaId);
          }
        } catch (error) {
          console.error('Error invalidando cache dashboard:', error);
          // No fallar la request por error de cache
        }
      }

      // Llamar al método original
      return originalJson.call(this, data);
    };

    next();
  };
};

// 🚀 Middlewares específicos para cada entidad
export const invalidateOnMensaje = invalidateDashboardCache();
export const invalidateOnAnuncio = invalidateDashboardCache();
export const invalidateOnCalendario = invalidateDashboardCache();

// 🚀 Función para invalidar cache manualmente (útil para debugging)
export const invalidarCacheManual = (req: AuthenticatedRequest, res: Response): void => {
  if (req.user?.tipo !== 'ADMIN') {
    res.status(403).json({
      success: false,
      message: 'Solo administradores pueden invalidar cache manualmente',
    });
    return;
  }

  const { type, usuarioId, escuelaId } = req.body;

  try {
    if (type === 'dashboard' && usuarioId && escuelaId) {
      invalidateCache('dashboard', usuarioId, escuelaId);
      console.log(`✅ Cache dashboard invalidado para usuario ${usuarioId}`);
    } else if (type === 'all' && escuelaId) {
      // Invalidar múltiples tipos de cache para la escuela
      invalidateCache('dashboard', req.user._id, escuelaId);
      invalidateCache('mensajes', req.user._id, escuelaId);
      invalidateCache('anuncios', req.user._id, escuelaId);
      invalidateCache('notificaciones', req.user._id, escuelaId);
      console.log(`✅ Múltiples caches invalidados para escuela ${escuelaId}`);
    } else {
      res.status(400).json({
        success: false,
        message:
          'Parámetros inválidos. Use type: "dashboard" con usuarioId y escuelaId, o type: "all" con escuelaId',
      });
      return;
    }

    res.json({
      success: true,
      message: `Cache ${type} invalidado correctamente`,
      data: {
        type,
        usuarioId: usuarioId || req.user._id,
        escuelaId,
      },
    });
  } catch (error) {
    console.error('Error en invalidación manual:', error);
    res.status(500).json({
      success: false,
      message: 'Error invalidando cache',
    });
  }
};
