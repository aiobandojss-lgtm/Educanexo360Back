"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const simpleCache_1 = require("../cache/simpleCache");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/estadisticas', (0, simpleCache_1.cacheMiddleware)('dashboard'), dashboard_controller_1.obtenerEstadisticasDashboard);
router.get('/resumen-rol', (0, simpleCache_1.cacheMiddleware)('dashboard_rol'), dashboard_controller_1.obtenerResumenPorRol);
router.get('/resumen', (0, simpleCache_1.cacheMiddleware)('dashboard_completo'), dashboard_controller_1.obtenerResumenCompleto);
router.get('/eventos-hoy', (0, simpleCache_1.cacheMiddleware)('eventos_hoy'), dashboard_controller_1.obtenerEventosHoy);
router.get('/metricas', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (0, simpleCache_1.cacheMiddleware)('metricas_avanzadas'), dashboard_controller_1.obtenerMetricasAvanzadas);
router.get('/cache/stats', (0, auth_middleware_1.authorize)('ADMIN'), (req, res) => {
    const stats = (0, simpleCache_1.getCacheStats)();
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
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map