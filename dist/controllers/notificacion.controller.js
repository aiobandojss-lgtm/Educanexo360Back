"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificacionController = exports.limpiarDeviceInfo = void 0;
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const notificacion_service_1 = __importDefault(require("../services/notificacion.service"));
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const INotificacion_1 = require("../interfaces/INotificacion");
const paginacion_1 = require("../utils/paginacion");
const logger_1 = require("../utils/logger");
const MAX_DISPOSITIVOS = 5;
const ultimoToken = { $arrayElemAt: ['$fcmTokens', -1] };
const sincronizarCamposAntiguos = {
    $set: {
        fcmToken: { $ifNull: [{ $getField: { field: 'token', input: ultimoToken } }, null] },
        platform: { $ifNull: [{ $getField: { field: 'platform', input: ultimoToken } }, '$$REMOVE'] },
        fcmTokenUpdatedAt: '$$NOW',
    },
};
const lit = (valor) => ({ $literal: valor });
const limpiarDeviceInfo = (valor) => {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor))
        return {};
    const limpio = {};
    for (const [clave, v] of Object.entries(valor).slice(0, 10)) {
        if (!/^[A-Za-z0-9_]{1,40}$/.test(clave))
            continue;
        if (typeof v === 'string')
            limpio[clave] = v.slice(0, 200);
        else if (typeof v === 'number' && Number.isFinite(v))
            limpio[clave] = v;
        else if (typeof v === 'boolean')
            limpio[clave] = v;
    }
    return limpio;
};
exports.limpiarDeviceInfo = limpiarDeviceInfo;
const AGREGAR_TOKEN = (token, platform, deviceInfo) => [
    {
        $set: {
            fcmTokens: {
                $slice: [
                    {
                        $concatArrays: [
                            {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: [{ $type: '$fcmToken' }, 'string'] },
                                            { $ne: ['$fcmToken', lit(token)] },
                                            { $not: [{ $in: ['$fcmToken', { $ifNull: ['$fcmTokens.token', []] }] }] },
                                        ],
                                    },
                                    [
                                        {
                                            token: '$fcmToken',
                                            platform: { $ifNull: ['$platform', 'android'] },
                                            updatedAt: { $ifNull: ['$fcmTokenUpdatedAt', '$$NOW'] },
                                        },
                                    ],
                                    [],
                                ],
                            },
                            {
                                $filter: {
                                    input: { $ifNull: ['$fcmTokens', []] },
                                    as: 'd',
                                    cond: { $ne: ['$$d.token', lit(token)] },
                                },
                            },
                            [{ token: lit(token), platform: lit(platform), deviceInfo: lit(deviceInfo), updatedAt: '$$NOW' }],
                        ],
                    },
                    -MAX_DISPOSITIVOS,
                ],
            },
            deviceInfo: lit(deviceInfo),
        },
    },
    sincronizarCamposAntiguos,
];
const QUITAR_TOKEN = (token) => [
    {
        $set: {
            fcmTokens: {
                $filter: { input: { $ifNull: ['$fcmTokens', []] }, as: 'd', cond: { $ne: ['$$d.token', lit(token)] } },
            },
            _resincronizar: {
                $or: [
                    { $eq: ['$fcmToken', lit(token)] },
                    { $in: ['$fcmToken', { $ifNull: ['$fcmTokens.token', []] }] },
                ],
            },
        },
    },
    {
        $set: {
            fcmToken: {
                $cond: [
                    '$_resincronizar',
                    { $ifNull: [{ $getField: { field: 'token', input: ultimoToken } }, null] },
                    '$fcmToken',
                ],
            },
            platform: {
                $cond: [
                    '$_resincronizar',
                    { $ifNull: [{ $getField: { field: 'platform', input: ultimoToken } }, '$$REMOVE'] },
                    { $ifNull: ['$platform', '$$REMOVE'] },
                ],
            },
            fcmTokenUpdatedAt: '$$NOW',
        },
    },
    { $unset: '_resincronizar' },
];
const QUITAR_TODOS_LOS_TOKENS = () => [
    { $set: { fcmTokens: [], fcmToken: null, fcmTokenUpdatedAt: '$$NOW', platform: '$$REMOVE' } },
];
class NotificacionController {
    async registrarTokenFCM(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { fcmToken, deviceInfo } = req.body;
            if (fcmToken === null) {
                await usuario_model_1.default.updateOne({ _id: req.user._id }, QUITAR_TODOS_LOS_TOKENS());
                res.json({ success: true, message: 'Token FCM eliminado', data: { tokenRegistered: false } });
                return;
            }
            if (!fcmToken) {
                throw new ApiError_1.default(400, 'Token FCM es requerido');
            }
            const platform = req.body.platform || 'android';
            if (!['ios', 'android'].includes(platform)) {
                throw new ApiError_1.default(400, 'Platform debe ser "ios" o "android"');
            }
            logger_1.logger.debug(`📱 Registrando token FCM para usuario: ${req.user._id}`);
            const registrar = async () => {
                await usuario_model_1.default.updateMany({ _id: { $ne: req.user._id }, $or: [{ 'fcmTokens.token': fcmToken }, { fcmToken }] }, QUITAR_TOKEN(fcmToken));
                return usuario_model_1.default.findOneAndUpdate({ _id: req.user._id }, AGREGAR_TOKEN(fcmToken, platform, (0, exports.limpiarDeviceInfo)(deviceInfo)), { new: true, projection: { _id: 1, nombre: 1, apellidos: 1 } }).lean();
            };
            let usuarioActualizado;
            try {
                usuarioActualizado = await registrar();
            }
            catch (error) {
                if (error?.code !== 11000)
                    throw error;
                usuarioActualizado = await registrar();
            }
            if (!usuarioActualizado) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            logger_1.logger.debug(`✅ Token FCM registrado para: ${usuarioActualizado.nombre} ${usuarioActualizado.apellidos}`);
            res.json({
                success: true,
                message: 'Token FCM registrado exitosamente',
                data: {
                    userId: String(usuarioActualizado._id),
                    platform: platform,
                    tokenRegistered: true,
                },
            });
        }
        catch (error) {
            console.error('❌ Error registrando token FCM:', error);
            next(error);
        }
    }
    async desregistrarTokenFCM(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { fcmToken } = req.body;
            const resultado = fcmToken
                ? await usuario_model_1.default.updateOne({ _id: req.user._id, $or: [{ 'fcmTokens.token': fcmToken }, { fcmToken }] }, QUITAR_TOKEN(fcmToken))
                : await usuario_model_1.default.updateOne({ _id: req.user._id }, QUITAR_TODOS_LOS_TOKENS());
            res.json({
                success: true,
                message: 'Dispositivo desvinculado',
                data: { tokenRemoved: resultado.modifiedCount > 0 },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async enviarNotificacionPrueba(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para enviar notificaciones de prueba');
            }
            const { titulo, mensaje, usuarioId, prioridad = 'NORMAL' } = req.body;
            if (!titulo || !mensaje) {
                throw new ApiError_1.default(400, 'Título y mensaje son requeridos');
            }
            let targetUser;
            if (usuarioId) {
                const filtroDestino = { _id: usuarioId };
                if (req.user.tipo !== 'SUPER_ADMIN')
                    filtroDestino.escuelaId = req.user.escuelaId;
                targetUser = await usuario_model_1.default.findOne(filtroDestino).select('_id nombre apellidos fcmToken fcmTokens');
                if (!targetUser) {
                    throw new ApiError_1.default(404, 'Usuario objetivo no encontrado');
                }
            }
            else {
                targetUser = await usuario_model_1.default.findById(req.user._id).select('_id nombre apellidos fcmToken fcmTokens');
            }
            const dispositivos = targetUser?.fcmTokens || [];
            const tokenDestino = dispositivos.length > 0 ? dispositivos[dispositivos.length - 1].token : targetUser?.fcmToken || undefined;
            if (!targetUser || !tokenDestino) {
                throw new ApiError_1.default(400, 'El usuario no tiene token FCM registrado');
            }
            logger_1.logger.debug(`🧪 Enviando notificación de prueba a: ${targetUser.nombre} ${targetUser.apellidos}`);
            const resultado = await pushNotification_service_1.default.enviarNotificacion({
                token: tokenDestino,
                titulo,
                mensaje,
                data: {
                    tipo: 'test',
                    prioridad,
                    timestamp: Date.now().toString(),
                },
            });
            await notificacion_service_1.default.crearNotificacion({
                usuarioId: targetUser._id.toString(),
                titulo: `[PRUEBA] ${titulo}`,
                mensaje,
                tipo: INotificacion_1.TipoNotificacion.SISTEMA,
                escuelaId: req.user.escuelaId,
                metadata: {
                    isPrueba: true,
                    enviadoPor: req.user._id,
                    enviado: new Date().toISOString(),
                },
                enviarEmail: false,
            });
            res.json({
                success: true,
                message: 'Notificación de prueba enviada',
                data: {
                    target: `${targetUser.nombre} ${targetUser.apellidos}`,
                    sent: resultado.success,
                    messageId: resultado.messageId,
                },
            });
        }
        catch (error) {
            console.error('❌ Error enviando notificación de prueba:', error);
            next(error);
        }
    }
    async obtenerNotificaciones(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estado = 'todas', pagina = 1, limite = 20, tipo } = req.query;
            const opciones = {
                pagina: (0, paginacion_1.numeroPagina)(pagina),
                limite: (0, paginacion_1.numeroLimite)(limite, 20),
            };
            const filtro = {
                usuarioId: req.user._id,
                escuelaId: req.user.escuelaId,
            };
            if (estado !== 'todas') {
                filtro.estado = estado;
            }
            if (tipo) {
                filtro.tipo = tipo;
            }
            const skip = (opciones.pagina - 1) * opciones.limite;
            const notificaciones = await notificacion_model_1.default.find(filtro)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(opciones.limite)
                .populate('entidadId');
            const total = await notificacion_model_1.default.countDocuments(filtro);
            const pendientes = await notificacion_model_1.default.countDocuments({
                usuarioId: req.user._id,
                estado: INotificacion_1.EstadoNotificacion.PENDIENTE,
            });
            res.json({
                success: true,
                data: notificaciones,
                meta: {
                    total,
                    pendientes,
                    pagina: opciones.pagina,
                    limite: opciones.limite,
                    totalPaginas: Math.ceil(total / opciones.limite),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async marcarComoLeida(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const notificacion = await notificacion_service_1.default.marcarComoLeida(id, req.user._id);
            if (!notificacion) {
                throw new ApiError_1.default(404, 'Notificación no encontrada');
            }
            res.json({
                success: true,
                data: notificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async marcarTodasComoLeidas(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const cantidadActualizada = await notificacion_service_1.default.marcarTodasComoLeidas(req.user._id);
            res.json({
                success: true,
                message: `${cantidadActualizada} notificaciones marcadas como leídas`,
                data: { cantidadActualizada },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async archivarNotificacion(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const notificacion = await notificacion_service_1.default.archivarNotificacion(id, req.user._id);
            if (!notificacion) {
                throw new ApiError_1.default(404, 'Notificación no encontrada');
            }
            res.json({
                success: true,
                data: notificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async crearNotificacion(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tiene permisos para crear notificaciones');
            }
            const { usuarioId, titulo, mensaje, tipo, entidadId, entidadTipo, metadata, enviarEmail = false, } = req.body;
            const notificacion = await notificacion_service_1.default.crearNotificacion({
                usuarioId,
                titulo,
                mensaje,
                tipo,
                escuelaId: req.user.escuelaId,
                entidadId,
                entidadTipo,
                metadata,
                enviarEmail,
            });
            res.status(201).json({
                success: true,
                data: notificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async crearNotificacionMasiva(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tiene permisos para crear notificaciones masivas');
            }
            const { usuarioIds, titulo, mensaje, tipo, entidadId, entidadTipo, metadata, enviarEmail = false, } = req.body;
            if (!usuarioIds || !Array.isArray(usuarioIds) || usuarioIds.length === 0) {
                throw new ApiError_1.default(400, 'Debe especificar al menos un usuario destinatario');
            }
            const notificaciones = await notificacion_service_1.default.crearNotificacionMasiva({
                usuarioIds,
                titulo,
                mensaje,
                tipo,
                escuelaId: req.user.escuelaId,
                entidadId,
                entidadTipo,
                metadata,
                enviarEmail,
            });
            res.status(201).json({
                success: true,
                message: `${notificaciones.length} notificaciones creadas exitosamente`,
                data: { count: notificaciones.length },
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.NotificacionController = NotificacionController;
const notificacionController = new NotificacionController();
exports.default = notificacionController;
//# sourceMappingURL=notificacion.controller.js.map