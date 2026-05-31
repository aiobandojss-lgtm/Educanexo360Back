"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheConfig = exports.cache = void 0;
exports.cacheMiddleware = cacheMiddleware;
exports.invalidateRelatedCache = invalidateRelatedCache;
exports.invalidateCache = invalidateCache;
exports.invalidateDashboardCache = invalidateDashboardCache;
exports.getCacheStats = getCacheStats;
exports.clearExpiredCache = clearExpiredCache;
const node_cache_1 = __importDefault(require("node-cache"));
const cache = new node_cache_1.default({
    stdTTL: 300,
    checkperiod: 60,
    useClones: false,
    maxKeys: 500,
});
exports.cache = cache;
const cacheConfig = {
    dashboard: { ttl: 180, desc: 'Dashboard - 3 min' },
    mensajes: { ttl: 120, desc: 'Lista mensajes - 2 min' },
    anuncios: { ttl: 300, desc: 'Anuncios - 5 min' },
    notificaciones: { ttl: 60, desc: 'Notificaciones - 1 min' },
    calificaciones: { ttl: 240, desc: 'Calificaciones - 4 min' },
    cursos: { ttl: 600, desc: 'Lista cursos - 10 min' },
    usuarios: { ttl: 900, desc: 'Lista usuarios - 15 min' },
    dashboard_rol: { ttl: 300, desc: 'Resumen por rol - 5 min' },
    dashboard_completo: { ttl: 180, desc: 'Dashboard completo - 3 min' },
    eventos_hoy: { ttl: 600, desc: 'Eventos del día - 10 min' },
    metricas_avanzadas: { ttl: 900, desc: 'Métricas avanzadas - 15 min' },
    promedio_periodo: { ttl: 300, desc: 'Promedio periodo - 5 min' },
    promedio_asignatura: { ttl: 600, desc: 'Promedio asignatura - 10 min' },
    estadisticas_grupo: { ttl: 180, desc: 'Estadísticas grupo - 3 min' },
    destinatarios: { ttl: 120, desc: 'Posibles destinatarios - 2 min' },
    cursos_destinatarios: { ttl: 600, desc: 'Cursos para mensajes - 10 min' },
    acudientes: { ttl: 300, desc: 'Acudientes estudiante - 5 min' },
    lista_mensajes: { ttl: 120, desc: 'Lista mensajes - 2 min' },
    asistencia: { ttl: 240, desc: 'Asistencia - 4 min' },
    escuela: { ttl: 1800, desc: 'Info escuela - 30 min' },
    logros: { ttl: 900, desc: 'Logros - 15 min' },
};
exports.cacheConfig = cacheConfig;
function cacheMiddleware(cacheType) {
    const config = cacheConfig[cacheType] || { ttl: 300, desc: 'Default' };
    return (req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }
        const userKey = req.user ? `${req.user._id}_${req.user.escuelaId}` : 'public';
        const queryKey = JSON.stringify(req.query);
        const cacheKey = `${cacheType}_${userKey}_${queryKey}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log(`📋 CACHE HIT: ${cacheType} (${config.desc})`);
            return res.json(cached);
        }
        const originalJson = res.json;
        res.json = function (data) {
            if (res.statusCode === 200 && data) {
                cache.set(cacheKey, data, config.ttl);
                console.log(`💾 CACHE SET: ${cacheType} (${config.ttl}s) - Key: ${cacheKey}`);
            }
            originalJson.call(this, data);
        };
        next();
    };
}
function invalidateRelatedCache(primaryType, userId, escuelaId, relatedTypes = []) {
    const typesToInvalidate = [primaryType, ...relatedTypes];
    typesToInvalidate.forEach((cacheType) => {
        invalidateCache(cacheType, userId, escuelaId);
    });
}
function invalidateCache(cacheType, userId, escuelaId) {
    const userKey = `${userId}_${escuelaId}`;
    const pattern = `${cacheType}_${userKey}`;
    const keys = cache.keys().filter((key) => key.startsWith(pattern));
    keys.forEach((key) => {
        cache.del(key);
        console.log(`🗑️ CACHE INVALIDATED: ${key}`);
    });
    console.log(`🔄 Cache invalidado para ${cacheType} - Usuario: ${userId}`);
}
function invalidateDashboardCache(userId, escuelaId) {
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
function getCacheStats() {
    const stats = cache.getStats();
    const allKeys = cache.keys();
    const typeStats = {};
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
function clearExpiredCache() {
    const beforeCount = cache.keys().length;
    cache.flushAll();
    const afterCount = cache.keys().length;
    console.log(`🧹 Cache limpio: ${beforeCount - afterCount} keys eliminadas`);
}
//# sourceMappingURL=simpleCache.js.map