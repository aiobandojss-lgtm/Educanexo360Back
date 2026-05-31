"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const calendario_model_1 = __importDefault(require("../models/calendario.model"));
const anuncio_model_1 = __importDefault(require("../models/anuncio.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const calificacion_model_1 = __importDefault(require("../models/calificacion.model"));
const asistencia_model_1 = __importDefault(require("../models/asistencia.model"));
class DashboardService {
    async obtenerEstadisticas(usuarioId, escuelaId) {
        const usuarioObjectId = new mongoose_1.default.Types.ObjectId(usuarioId);
        const escuelaObjectId = new mongoose_1.default.Types.ObjectId(escuelaId);
        const fechaActual = new Date();
        const fechaLimite = new Date();
        fechaLimite.setDate(fechaActual.getDate() + 30);
        const fechaReciente = new Date();
        fechaReciente.setDate(fechaActual.getDate() - 7);
        console.log(`🔍 Calculando estadísticas dashboard para usuario ${usuarioId}`);
        const [mensajesSinLeer, eventosProximos, anunciosRecientes] = await Promise.all([
            this.contarMensajesSinLeer(usuarioObjectId, escuelaObjectId),
            this.contarEventosProximos(escuelaObjectId, fechaActual, fechaLimite),
            this.contarAnunciosRecientes(escuelaObjectId, fechaReciente),
        ]);
        const estadisticas = {
            mensajesSinLeer,
            eventosProximos,
            anunciosRecientes,
        };
        console.log(`✅ Estadísticas calculadas:`, estadisticas);
        return estadisticas;
    }
    async contarMensajesSinLeer(usuarioId, escuelaId) {
        return await mensaje_model_1.default.countDocuments({
            escuelaId: escuelaId,
            $or: [{ destinatarios: usuarioId }, { destinatariosCc: usuarioId }],
            $and: [
                {
                    'lecturas.usuarioId': { $ne: usuarioId },
                },
                {
                    $or: [
                        { estadosUsuarios: { $exists: false } },
                        {
                            estadosUsuarios: {
                                $not: {
                                    $elemMatch: {
                                        usuarioId: usuarioId,
                                        estado: { $in: ['ELIMINADO', 'ARCHIVADO'] },
                                    },
                                },
                            },
                        },
                    ],
                },
                {
                    tipo: { $ne: 'BORRADOR' },
                },
            ],
        });
    }
    async contarEventosProximos(escuelaId, fechaActual, fechaLimite) {
        return await calendario_model_1.default.countDocuments({
            escuelaId: escuelaId,
            fechaInicio: {
                $gte: fechaActual,
                $lte: fechaLimite,
            },
            estado: { $ne: 'CANCELADO' },
        });
    }
    async contarAnunciosRecientes(escuelaId, fechaReciente) {
        return await anuncio_model_1.default.countDocuments({
            escuelaId: escuelaId,
            estaPublicado: true,
            fechaPublicacion: {
                $gte: fechaReciente,
            },
        });
    }
    async obtenerResumenPorRol(usuarioId, escuelaId, tipoUsuario) {
        const escuelaObjectId = new mongoose_1.default.Types.ObjectId(escuelaId);
        const usuarioObjectId = new mongoose_1.default.Types.ObjectId(usuarioId);
        switch (tipoUsuario) {
            case 'DOCENTE':
                return await this.obtenerResumenDocente(usuarioObjectId, escuelaObjectId);
            case 'ESTUDIANTE':
                return await this.obtenerResumenEstudiante(usuarioObjectId, escuelaObjectId);
            case 'PADRE':
                return await this.obtenerResumenPadre(usuarioObjectId, escuelaObjectId);
            case 'ADMIN':
            case 'RECTOR':
            case 'COORDINADOR':
            case 'ADMINISTRATIVO':
                return await this.obtenerResumenAdministrativo(escuelaObjectId);
            default:
                return {};
        }
    }
    async obtenerResumenDocente(usuarioId, escuelaId) {
        const [cursosInfo, calificacionesPendientes] = await Promise.all([
            curso_model_1.default.aggregate([
                {
                    $match: {
                        escuelaId: escuelaId,
                        $or: [{ director_grupo: usuarioId }, { 'asignaturas.docenteId': usuarioId }],
                    },
                },
                {
                    $group: {
                        _id: null,
                        cursosAsignados: { $sum: 1 },
                        estudiantesTotales: { $sum: { $size: '$estudiantes' } },
                    },
                },
            ]),
            calificacion_model_1.default.countDocuments({
                docenteId: usuarioId,
                escuelaId: escuelaId,
                estado: 'PENDIENTE',
            }),
        ]);
        const resumen = cursosInfo[0] || { cursosAsignados: 0, estudiantesTotales: 0 };
        return {
            cursosAsignados: resumen.cursosAsignados,
            estudiantesTotales: resumen.estudiantesTotales,
            calificacionesPendientes,
        };
    }
    async obtenerResumenEstudiante(usuarioId, escuelaId) {
        const [calificacionesRecientes, asistenciaInfo] = await Promise.all([
            calificacion_model_1.default.countDocuments({
                estudianteId: usuarioId,
                escuelaId: escuelaId,
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            }),
            asistencia_model_1.default.aggregate([
                {
                    $match: {
                        escuelaId: escuelaId,
                        'estudiantes.estudianteId': usuarioId,
                        fecha: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $unwind: '$estudiantes',
                },
                {
                    $match: {
                        'estudiantes.estudianteId': usuarioId,
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalDias: { $sum: 1 },
                        diasPresente: {
                            $sum: {
                                $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0],
                            },
                        },
                    },
                },
                {
                    $project: {
                        asistenciaPromedio: {
                            $cond: [
                                { $gt: ['$totalDias', 0] },
                                { $multiply: [{ $divide: ['$diasPresente', '$totalDias'] }, 100] },
                                0,
                            ],
                        },
                    },
                },
            ]),
        ]);
        const asistencia = asistenciaInfo[0]?.asistenciaPromedio || 0;
        return {
            calificacionesRecientes,
            asistenciaPromedio: Math.round(asistencia),
            tareasPendientes: 0,
        };
    }
    async obtenerResumenPadre(usuarioId, escuelaId) {
        const usuario = await usuario_model_1.default.findById(usuarioId).select('info_academica.estudiantes_asociados');
        const hijosIds = usuario?.info_academica?.estudiantes_asociados || [];
        const [hijosActivos, notificacionesImportantes] = await Promise.all([
            usuario_model_1.default.countDocuments({
                _id: { $in: hijosIds },
                escuelaId: escuelaId,
                estado: 'ACTIVO',
                tipo: 'ESTUDIANTE',
            }),
            mensaje_model_1.default.countDocuments({
                destinatarios: usuarioId,
                escuelaId: escuelaId,
                prioridad: 'ALTA',
                'lecturas.usuarioId': { $ne: usuarioId },
            }),
        ]);
        return {
            hijosEnSistema: hijosActivos,
            citasPendientes: 0,
            notificacionesImportantes,
        };
    }
    async obtenerResumenAdministrativo(escuelaId) {
        const [estadisticas] = await Promise.all([
            usuario_model_1.default.aggregate([
                {
                    $match: {
                        escuelaId: escuelaId,
                        estado: 'ACTIVO',
                    },
                },
                {
                    $group: {
                        _id: '$tipo',
                        count: { $sum: 1 },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalUsuarios: { $sum: '$count' },
                        tipos: {
                            $push: {
                                tipo: '$_id',
                                cantidad: '$count',
                            },
                        },
                    },
                },
            ]),
        ]);
        const [cursos, estudiantes] = await Promise.all([
            curso_model_1.default.countDocuments({ escuelaId: escuelaId }),
            usuario_model_1.default.countDocuments({ escuelaId: escuelaId, tipo: 'ESTUDIANTE', estado: 'ACTIVO' }),
        ]);
        const stats = estadisticas[0] || { totalUsuarios: 0 };
        return {
            totalUsuarios: stats.totalUsuarios,
            totalCursos: cursos,
            totalEstudiantes: estudiantes,
        };
    }
    async obtenerEventosHoy(escuelaId) {
        const hoy = new Date();
        const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
        return await calendario_model_1.default.find({
            escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
            fechaInicio: {
                $gte: inicioDia,
                $lt: finDia,
            },
            estado: { $in: ['PENDIENTE', 'ACTIVO'] },
        })
            .select('titulo descripcion fechaInicio fechaFin lugar tipo')
            .sort({ fechaInicio: 1 })
            .limit(5)
            .lean();
    }
    async obtenerMetricasAvanzadas(escuelaId) {
        const escuelaObjectId = new mongoose_1.default.Types.ObjectId(escuelaId);
        const [actividad, rendimiento] = await Promise.all([
            usuario_model_1.default.aggregate([
                {
                    $match: {
                        escuelaId: escuelaObjectId,
                        ultimoAcceso: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $group: {
                        _id: '$tipo',
                        usuariosActivos: { $sum: 1 },
                    },
                },
            ]),
            calificacion_model_1.default.aggregate([
                {
                    $match: {
                        escuelaId: escuelaObjectId,
                        fecha: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $group: {
                        _id: null,
                        promedioGeneral: { $avg: '$valor' },
                        totalCalificaciones: { $sum: 1 },
                    },
                },
            ]),
        ]);
        return {
            actividadSemanal: actividad,
            rendimiento: rendimiento[0] || { promedioGeneral: 0, totalCalificaciones: 0 },
        };
    }
}
exports.default = new DashboardService();
//# sourceMappingURL=dashboard.service.js.map