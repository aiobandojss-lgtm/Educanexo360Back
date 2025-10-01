// src/routes/dashboard.routes.ts - ACTUALIZADO CON NUEVOS ENDPOINTS
import express, { RequestHandler } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { cacheMiddleware, getCacheStats } from '../cache/simpleCache';
import {
  obtenerEstadisticasDashboard,
  obtenerResumenPorRol,
  obtenerResumenCompleto,
  obtenerEventosHoy,
  obtenerMetricasAvanzadas,
} from '../controllers/dashboard.controller';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

/**
 * @route GET /api/dashboard/estadisticas
 * @desc Obtener estadísticas generales del dashboard (CON CACHE)
 * @access Private
 * @cache 3 minutos por usuario
 */
router.get(
  '/estadisticas',
  cacheMiddleware('dashboard'), // 🚀 USANDO TU CACHE - 180 segundos
  obtenerEstadisticasDashboard as RequestHandler,
);

/**
 * @route GET /api/dashboard/resumen-rol
 * @desc Obtener resumen específico según el rol del usuario (CON CACHE)
 * @access Private
 * @cache TTL definido en simpleCache
 */
router.get(
  '/resumen-rol',
  cacheMiddleware('dashboard_rol'), // ✅ Solo 1 argumento
  obtenerResumenPorRol as RequestHandler,
);

/**
 * @route GET /api/dashboard/resumen
 * @desc Obtener resumen completo (estadísticas + rol + usuario) en UNA sola llamada
 * @access Private
 * @cache TTL definido en simpleCache
 */
router.get(
  '/resumen',
  cacheMiddleware('dashboard_completo'), // ✅ Solo 1 argumento
  obtenerResumenCompleto as RequestHandler,
);

/**
 * @route GET /api/dashboard/eventos-hoy
 * @desc Obtener eventos del día actual
 * @access Private
 * @cache TTL definido en simpleCache
 */
router.get(
  '/eventos-hoy',
  cacheMiddleware('eventos_hoy'), // ✅ Solo 1 argumento
  obtenerEventosHoy as RequestHandler,
);

/**
 * @route GET /api/dashboard/metricas
 * @desc Obtener métricas avanzadas (solo admin/rector/coordinador)
 * @access Admin, Rector, Coordinador
 * @cache TTL definido en simpleCache
 */
router.get(
  '/metricas',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR'),
  cacheMiddleware('metricas_avanzadas'), // ✅ Solo 1 argumento
  obtenerMetricasAvanzadas as RequestHandler,
);

/**
 * @route GET /api/dashboard/cache/stats
 * @desc Obtener estadísticas del cache (solo admin)
 * @access Admin only
 */
router.get('/cache/stats', authorize('ADMIN'), (req, res) => {
  const stats = getCacheStats();
  res.json({
    success: true,
    data: {
      totalKeys: stats.keys,
      cacheHits: stats.hits,
      cacheMisses: stats.misses,
      hitRate: `${stats.hitRate.toFixed(2)}%`,
      mensaje: `Cache con ${stats.keys} entradas activas, hit rate: ${stats.hitRate.toFixed(1)}%`,
      timestamp: new Date().toISOString(),
    },
  });
});

export default router;
