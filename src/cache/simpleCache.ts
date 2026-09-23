import NodeCache from 'node-cache';

// Cache configurado para máximo rendimiento
const cache = new NodeCache({
  stdTTL: 300, // 5 minutos por defecto
  checkperiod: 60, // Verificar expiración cada minuto
  useClones: false, // Mejor performance
  maxKeys: 5000, // Límite de keys en memoria (al llenarse, set() lanza ECACHEFULL)
});

// set() tolerante a fallos: si el caché está lleno (ECACHEFULL) solo se omite el cacheo
export function safeCacheSet(key: string, value: unknown, ttl: number): boolean {
  try {
    return cache.set(key, value, ttl);
  } catch (error) {
    console.warn(`⚠️ CACHE SET falló (${key}):`, (error as Error).message);
    return false;
  }
}

// Configuración de cache por tipo de datos
interface CacheConfig {
  ttl: number;
  desc: string;
}

const cacheConfig: Record<string, CacheConfig> = {
  // 🔥 EXISTENTES (mantenidos)
  dashboard: { ttl: 180, desc: 'Dashboard - 3 min' },
  mensajes: { ttl: 120, desc: 'Lista mensajes - 2 min' },
  anuncios: { ttl: 300, desc: 'Anuncios - 5 min' },
  notificaciones: { ttl: 60, desc: 'Notificaciones - 1 min' },
  calificaciones: { ttl: 240, desc: 'Calificaciones - 4 min' },
  cursos: { ttl: 600, desc: 'Lista cursos - 10 min' },
  usuarios: { ttl: 900, desc: 'Lista usuarios - 15 min' },

  // 🚀 DASHBOARD OPTIMIZADO
  dashboard_rol: { ttl: 300, desc: 'Resumen por rol - 5 min' },
  dashboard_completo: { ttl: 180, desc: 'Dashboard completo - 3 min' },
  eventos_hoy: { ttl: 600, desc: 'Eventos del día - 10 min' },
  metricas_avanzadas: { ttl: 900, desc: 'Métricas avanzadas - 15 min' },

  // 🚀 ACADEMIC SERVICE
  promedio_periodo: { ttl: 300, desc: 'Promedio periodo - 5 min' },
  promedio_asignatura: { ttl: 600, desc: 'Promedio asignatura - 10 min' },
  estadisticas_grupo: { ttl: 180, desc: 'Estadísticas grupo - 3 min' },

  // 🚀 MENSAJE SERVICE OPTIMIZADO (NUEVO)
  destinatarios: { ttl: 120, desc: 'Posibles destinatarios - 2 min' },
  cursos_destinatarios: { ttl: 600, desc: 'Cursos para mensajes - 10 min' },
  acudientes: { ttl: 300, desc: 'Acudientes estudiante - 5 min' },
  lista_mensajes: { ttl: 120, desc: 'Lista mensajes - 2 min' },

  // 🚀 ADICIONALES ÚTILES
  asistencia: { ttl: 240, desc: 'Asistencia - 4 min' },
  escuela: { ttl: 1800, desc: 'Info escuela - 30 min' },
  logros: { ttl: 900, desc: 'Logros - 15 min' },
};

// Interfaces para TypeScript
interface AuthenticatedRequest {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
  };
  method: string;
  query: any;
}

interface CacheResponse {
  json: (data: any) => void;
  statusCode: number;
}

// Middleware de cache inteligente
export function cacheMiddleware(cacheType: string) {
  const config = cacheConfig[cacheType] || { ttl: 300, desc: 'Default' };

  return (req: AuthenticatedRequest, res: CacheResponse, next: () => void) => {
    // Solo cachear GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Crear key único por usuario y escuela
    const userKey = req.user ? `${req.user._id}_${req.user.escuelaId}` : 'public';
    const queryKey = JSON.stringify(req.query);
    const cacheKey = `${cacheType}_${userKey}_${queryKey}`;

    // Buscar en cache
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`📋 CACHE HIT: ${cacheType} (${config.desc})`);
      return res.json(cached);
    }

    // Si no está en cache, interceptar respuesta para cachear
    const originalJson = res.json;
    res.json = function (data: any) {
      if (res.statusCode === 200 && data) {
        // Un fallo del caché (p. ej. ECACHEFULL) nunca debe tumbar la respuesta: solo no se cachea
        if (safeCacheSet(cacheKey, data, config.ttl)) {
          console.log(`💾 CACHE SET: ${cacheType} (${config.ttl}s) - Key: ${cacheKey}`);
        }
      }
      originalJson.call(this, data);
    };

    next();
  };
}

// 🚀 NUEVA FUNCIÓN: Invalidar múltiples tipos relacionados
export function invalidateRelatedCache(
  primaryType: string,
  userId: string,
  escuelaId: string,
  relatedTypes: string[] = [],
): void {
  const typesToInvalidate = [primaryType, ...relatedTypes];

  typesToInvalidate.forEach((cacheType) => {
    invalidateCache(cacheType, userId, escuelaId);
  });
}

// Función para invalidar cache cuando se crean/editan datos
export function invalidateCache(cacheType: string, userId: string, escuelaId: string): void {
  const userKey = `${userId}_${escuelaId}`;
  const pattern = `${cacheType}_${userKey}`;

  // Buscar todas las keys que coincidan con el patrón
  const keys = cache.keys().filter((key) => key.startsWith(pattern));

  keys.forEach((key) => {
    cache.del(key);
    console.log(`🗑️ CACHE INVALIDATED: ${key}`);
  });

  console.log(`🔄 Cache invalidado para ${cacheType} - Usuario: ${userId}`);
}

// 🚀 NUEVA FUNCIÓN: Invalidar cache de dashboard cuando hay cambios académicos
export function invalidateDashboardCache(userId: string, escuelaId: string): void {
  const dashboardTypes = [
    'dashboard',
    'dashboard_rol',
    'dashboard_completo',
    'eventos_hoy',
    'metricas_avanzadas',
  ];

  dashboardTypes.forEach((type) => {
    invalidateCache(type, userId, escuelaId);
  });

  console.log(`🔄 Dashboard cache completamente invalidado para usuario ${userId}`);
}

// Función para ver estadísticas del cache (mejorada)
export function getCacheStats() {
  const stats = cache.getStats();
  const allKeys = cache.keys();

  // Estadísticas por tipo
  const typeStats: Record<string, number> = {};
  allKeys.forEach((key) => {
    const type = key.split('_')[0];
    typeStats[type] = (typeStats[type] || 0) + 1;
  });

  return {
    keys: allKeys.length,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: (stats.hits / (stats.hits + stats.misses)) * 100,
    typeBreakdown: typeStats,
    configuredTypes: Object.keys(cacheConfig),
  };
}

// 🚀 NUEVA FUNCIÓN: Limpiar cache expirado manualmente
export function clearExpiredCache(): void {
  const beforeCount = cache.keys().length;
  cache.flushAll();
  const afterCount = cache.keys().length;
  console.log(`🧹 Cache limpio: ${beforeCount - afterCount} keys eliminadas`);
}

// Exportar cache también
export { cache, cacheConfig };
