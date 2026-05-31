"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidarCacheDashboard = exports.obtenerMetricasAvanzadas = exports.obtenerEventosHoy = exports.obtenerResumenCompleto = exports.obtenerResumenPorRol = exports.obtenerEstadisticasDashboard = void 0;
const dashboard_service_1 = __importDefault(require("../services/dashboard.service"));
const simpleCache_1 = require("../cache/simpleCache");
const obtenerEstadisticasDashboard = async (req, res) => {
    try {
        const usuario = req.user;
        const escuelaId = usuario?.escuelaId;
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'Usuario no tiene escuela asignada',
            });
            return;
        }
        const estadisticas = await dashboard_service_1.default.obtenerEstadisticas(usuario._id, escuelaId);
        res.status(200).json({
            success: true,
            data: estadisticas,
        });
    }
    catch (error) {
        console.error('Error obteniendo estadísticas del dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error : {},
        });
    }
};
exports.obtenerEstadisticasDashboard = obtenerEstadisticasDashboard;
const obtenerResumenPorRol = async (req, res) => {
    try {
        const usuario = req.user;
        const escuelaId = usuario?.escuelaId;
        if (!escuelaId || !usuario) {
            res.status(400).json({
                success: false,
                message: 'Usuario no tiene escuela asignada',
            });
            return;
        }
        const resumen = await dashboard_service_1.default.obtenerResumenPorRol(usuario._id, escuelaId, usuario.tipo);
        res.status(200).json({
            success: true,
            data: resumen,
        });
    }
    catch (error) {
        console.error('Error obteniendo resumen por rol:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error : {},
        });
    }
};
exports.obtenerResumenPorRol = obtenerResumenPorRol;
const obtenerResumenCompleto = async (req, res) => {
    try {
        const usuario = req.user;
        const escuelaId = usuario?.escuelaId;
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'Usuario no tiene escuela asignada',
            });
            return;
        }
        const [estadisticas, resumenRol] = await Promise.all([
            dashboard_service_1.default.obtenerEstadisticas(usuario._id, escuelaId),
            dashboard_service_1.default.obtenerResumenPorRol(usuario._id, escuelaId, usuario.tipo),
        ]);
        res.status(200).json({
            success: true,
            data: {
                estadisticas,
                resumenRol,
                usuario: {
                    nombre: usuario.nombre,
                    apellidos: usuario.apellidos,
                    tipo: usuario.tipo,
                    email: usuario.email,
                },
            },
            message: 'Resumen completo obtenido exitosamente',
        });
    }
    catch (error) {
        console.error('Error obteniendo resumen completo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error : {},
        });
    }
};
exports.obtenerResumenCompleto = obtenerResumenCompleto;
const obtenerEventosHoy = async (req, res) => {
    try {
        const usuario = req.user;
        const escuelaId = usuario?.escuelaId;
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'Usuario no tiene escuela asignada',
            });
            return;
        }
        const eventos = await dashboard_service_1.default.obtenerEventosHoy(escuelaId);
        res.status(200).json({
            success: true,
            data: eventos,
            message: 'Eventos del día obtenidos exitosamente',
        });
    }
    catch (error) {
        console.error('Error obteniendo eventos del día:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error : {},
        });
    }
};
exports.obtenerEventosHoy = obtenerEventosHoy;
const obtenerMetricasAvanzadas = async (req, res) => {
    try {
        const usuario = req.user;
        const escuelaId = usuario?.escuelaId;
        if (!usuario || !['ADMIN', 'RECTOR', 'COORDINADOR'].includes(usuario.tipo)) {
            res.status(403).json({
                success: false,
                message: 'No tienes permisos para ver métricas avanzadas',
            });
            return;
        }
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'Usuario no tiene escuela asignada',
            });
            return;
        }
        const metricas = await dashboard_service_1.default.obtenerMetricasAvanzadas(escuelaId);
        res.status(200).json({
            success: true,
            data: metricas,
            message: 'Métricas avanzadas obtenidas exitosamente',
        });
    }
    catch (error) {
        console.error('Error obteniendo métricas avanzadas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error : {},
        });
    }
};
exports.obtenerMetricasAvanzadas = obtenerMetricasAvanzadas;
const invalidarCacheDashboard = (usuarioId, escuelaId) => {
    console.log(`🔄 Invalidando cache dashboard para usuario ${usuarioId} en escuela ${escuelaId}`);
    (0, simpleCache_1.invalidateCache)('dashboard', usuarioId, escuelaId);
};
exports.invalidarCacheDashboard = invalidarCacheDashboard;
//# sourceMappingURL=dashboard.controller.js.map