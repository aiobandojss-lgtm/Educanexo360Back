"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidarCacheManual = exports.invalidateOnCalendario = exports.invalidateOnAnuncio = exports.invalidateOnMensaje = exports.invalidateDashboardCache = void 0;
const simpleCache_1 = require("../cache/simpleCache");
const invalidateDashboardCache = () => {
    return (req, res, next) => {
        const originalJson = res.json;
        res.json = function (data) {
            if (data.success && req.user) {
                const { _id: usuarioId, escuelaId } = req.user;
                try {
                    console.log(`🔄 Invalidando cache dashboard - Usuario: ${usuarioId}, Escuela: ${escuelaId}`);
                    (0, simpleCache_1.invalidateCache)('dashboard', usuarioId, escuelaId);
                    if (['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo)) {
                        console.log(`🔄 Usuario admin - Invalidando caches adicionales`);
                        (0, simpleCache_1.invalidateCache)('mensajes', usuarioId, escuelaId);
                        (0, simpleCache_1.invalidateCache)('notificaciones', usuarioId, escuelaId);
                    }
                }
                catch (error) {
                    console.error('Error invalidando cache dashboard:', error);
                }
            }
            return originalJson.call(this, data);
        };
        next();
    };
};
exports.invalidateDashboardCache = invalidateDashboardCache;
exports.invalidateOnMensaje = (0, exports.invalidateDashboardCache)();
exports.invalidateOnAnuncio = (0, exports.invalidateDashboardCache)();
exports.invalidateOnCalendario = (0, exports.invalidateDashboardCache)();
const invalidarCacheManual = (req, res) => {
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
            (0, simpleCache_1.invalidateCache)('dashboard', usuarioId, escuelaId);
            console.log(`✅ Cache dashboard invalidado para usuario ${usuarioId}`);
        }
        else if (type === 'all' && escuelaId) {
            (0, simpleCache_1.invalidateCache)('dashboard', req.user._id, escuelaId);
            (0, simpleCache_1.invalidateCache)('mensajes', req.user._id, escuelaId);
            (0, simpleCache_1.invalidateCache)('anuncios', req.user._id, escuelaId);
            (0, simpleCache_1.invalidateCache)('notificaciones', req.user._id, escuelaId);
            console.log(`✅ Múltiples caches invalidados para escuela ${escuelaId}`);
        }
        else {
            res.status(400).json({
                success: false,
                message: 'Parámetros inválidos. Use type: "dashboard" con usuarioId y escuelaId, o type: "all" con escuelaId',
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
    }
    catch (error) {
        console.error('Error en invalidación manual:', error);
        res.status(500).json({
            success: false,
            message: 'Error invalidando cache',
        });
    }
};
exports.invalidarCacheManual = invalidarCacheManual;
//# sourceMappingURL=dashboardCacheInvalidation.middleware.js.map