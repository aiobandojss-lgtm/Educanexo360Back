"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificacionController = void 0;
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const notificacion_service_1 = __importDefault(require("../services/notificacion.service"));
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const INotificacion_1 = require("../interfaces/INotificacion");
class NotificacionController {
    async registrarTokenFCM(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { fcmToken, platform, deviceInfo } = req.body;
            if (!fcmToken) {
                throw new ApiError_1.default(400, 'Token FCM es requerido');
            }
            if (!platform || !['ios', 'android'].includes(platform)) {
                throw new ApiError_1.default(400, 'Platform debe ser "ios" o "android"');
            }
            console.log(`📱 Registrando token FCM para usuario: ${req.user._id}`);
            const usuarioActualizado = await usuario_model_1.default.findByIdAndUpdate(req.user._id, {
                $set: {
                    fcmToken: fcmToken,
                    platform: platform,
                    deviceInfo: deviceInfo || {},
                    fcmTokenUpdatedAt: new Date(),
                },
            }, { new: true }).select('_id nombre apellidos fcmToken platform');
            if (!usuarioActualizado) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            console.log(`✅ Token FCM registrado para: ${usuarioActualizado.nombre} ${usuarioActualizado.apellidos}`);
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
    async enviarNotificacionPrueba(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para enviar notificaciones de prueba');
            }
            const { titulo, mensaje, usuarioId, prioridad = 'NORMAL' } = req.body;
            if (!titulo || !mensaje) {
                throw new ApiError_1.default(400, 'Título y mensaje son requeridos');
            }
            let targetUser;
            if (usuarioId) {
                targetUser = await usuario_model_1.default.findById(usuarioId).select('_id nombre apellidos fcmToken');
                if (!targetUser) {
                    throw new ApiError_1.default(404, 'Usuario objetivo no encontrado');
                }
            }
            else {
                targetUser = await usuario_model_1.default.findById(req.user._id).select('_id nombre apellidos fcmToken');
            }
            if (!targetUser?.fcmToken) {
                throw new ApiError_1.default(400, 'El usuario no tiene token FCM registrado');
            }
            console.log(`🧪 Enviando notificación de prueba a: ${targetUser.nombre} ${targetUser.apellidos}`);
            const resultado = await pushNotification_service_1.default.enviarNotificacion({
                token: targetUser.fcmToken,
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
    async sendMessageNotification(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { recipientIds, messageId, title, body, priority = 'NORMAL', hasAttachments = false, } = req.body;
            console.log('📤 Enviando notificaciones de mensaje:', {
                recipientIds: recipientIds?.length,
                messageId,
                priority,
            });
            const recipients = await usuario_model_1.default.find({
                _id: { $in: recipientIds },
                fcmToken: { $exists: true, $ne: null },
                estado: 'ACTIVO',
            }).select('_id fcmToken tipo nombre apellidos');
            if (recipients.length === 0) {
                res.json({
                    success: true,
                    message: 'No hay destinatarios con tokens válidos',
                    sent: 0,
                });
                return;
            }
            let successCount = 0;
            let failureCount = 0;
            for (const recipient of recipients) {
                try {
                    const resultado = await pushNotification_service_1.default.enviarNotificacion({
                        token: recipient.fcmToken,
                        titulo: title,
                        mensaje: body,
                        data: {
                            type: 'message',
                            messageId,
                            senderId: req.user._id,
                            senderName: `${req.user.nombre} ${req.user.apellidos}`,
                            senderRole: req.user.tipo,
                            recipientRole: recipient.tipo,
                            priority,
                            hasAttachments: hasAttachments.toString(),
                            timestamp: Date.now().toString(),
                        },
                    });
                    if (resultado.success) {
                        successCount++;
                    }
                    else {
                        failureCount++;
                    }
                    await notificacion_service_1.default.crearNotificacion({
                        usuarioId: String(recipient._id),
                        titulo: title,
                        mensaje: body,
                        tipo: INotificacion_1.TipoNotificacion.MENSAJE,
                        escuelaId: req.user.escuelaId,
                        entidadId: messageId,
                        entidadTipo: 'Mensaje',
                        metadata: {
                            senderName: `${req.user.nombre} ${req.user.apellidos}`,
                            senderRole: req.user.tipo,
                            priority,
                            hasAttachments,
                        },
                        enviarEmail: false,
                    });
                }
                catch (error) {
                    console.error(`Error enviando a ${recipient.nombre}:`, error);
                    failureCount++;
                }
            }
            res.json({
                success: true,
                sent: successCount,
                failed: failureCount,
                total: recipients.length,
            });
        }
        catch (error) {
            console.error('❌ Error enviando notificaciones de mensaje:', error);
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
                pagina: parseInt(pagina, 10),
                limite: parseInt(limite, 10),
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