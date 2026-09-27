"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const email_service_1 = require("./email.service");
const INotificacion_1 = require("../interfaces/INotificacion");
const config_1 = __importDefault(require("../config/config"));
class NotificacionService {
    async crearNotificacion(data) {
        try {
            const notificacion = await notificacion_model_1.default.create({
                usuarioId: data.usuarioId,
                titulo: data.titulo,
                mensaje: data.mensaje,
                tipo: data.tipo,
                estado: INotificacion_1.EstadoNotificacion.PENDIENTE,
                entidadId: data.entidadId,
                entidadTipo: data.entidadTipo,
                escuelaId: data.escuelaId,
                metadata: data.metadata || {},
            });
            if (data.enviarEmail) {
                await this.encolarEmailNotificacion([data.usuarioId], data);
            }
            return notificacion;
        }
        catch (error) {
            console.error('Error al crear notificación:', error);
            throw error;
        }
    }
    async crearNotificacionMasiva(data) {
        try {
            const notificaciones = [];
            const notificacionesDocs = data.usuarioIds.map((usuarioId) => ({
                usuarioId,
                titulo: data.titulo,
                mensaje: data.mensaje,
                tipo: data.tipo,
                estado: INotificacion_1.EstadoNotificacion.PENDIENTE,
                entidadId: data.entidadId,
                entidadTipo: data.entidadTipo,
                escuelaId: data.escuelaId,
                metadata: data.metadata || {},
            }));
            if (notificacionesDocs.length > 0) {
                notificaciones.push(...(await notificacion_model_1.default.insertMany(notificacionesDocs)));
            }
            if (data.enviarEmail) {
                await this.encolarEmailNotificacion(data.usuarioIds, data);
            }
            return notificaciones;
        }
        catch (error) {
            console.error('Error al crear notificaciones masivas:', error);
            throw error;
        }
    }
    async marcarComoLeida(notificacionId, usuarioId) {
        try {
            const notificacion = await notificacion_model_1.default.findOneAndUpdate({ _id: notificacionId, usuarioId }, {
                estado: INotificacion_1.EstadoNotificacion.LEIDA,
                fechaLectura: new Date(),
            }, { new: true });
            return notificacion;
        }
        catch (error) {
            console.error('Error al marcar notificación como leída:', error);
            throw error;
        }
    }
    async marcarTodasComoLeidas(usuarioId) {
        try {
            const resultado = await notificacion_model_1.default.updateMany({ usuarioId, estado: INotificacion_1.EstadoNotificacion.PENDIENTE }, {
                estado: INotificacion_1.EstadoNotificacion.LEIDA,
                fechaLectura: new Date(),
            });
            return resultado.modifiedCount;
        }
        catch (error) {
            console.error('Error al marcar todas las notificaciones como leídas:', error);
            throw error;
        }
    }
    async archivarNotificacion(notificacionId, usuarioId) {
        try {
            const notificacion = await notificacion_model_1.default.findOneAndUpdate({ _id: notificacionId, usuarioId }, { estado: INotificacion_1.EstadoNotificacion.ARCHIVADA }, { new: true });
            return notificacion;
        }
        catch (error) {
            console.error('Error al archivar notificación:', error);
            throw error;
        }
    }
    async encolarEmailNotificacion(usuarioIds, data) {
        const usuarios = await usuario_model_1.default.find({ _id: { $in: usuarioIds } })
            .select('_id email nombre')
            .lean();
        let url = `${config_1.default.frontendUrl}/notificaciones`;
        let tipoTexto = 'Notificación del sistema';
        switch (data.tipo) {
            case INotificacion_1.TipoNotificacion.MENSAJE:
                url = data.metadata?.url || `${config_1.default.frontendUrl}/mensajes/${data.metadata?.mensajeId || ''}`;
                tipoTexto = 'Nuevo mensaje';
                break;
            case INotificacion_1.TipoNotificacion.CALIFICACION:
                url = `${config_1.default.frontendUrl}/calificaciones`;
                tipoTexto = 'Nueva calificación';
                break;
            case INotificacion_1.TipoNotificacion.EVENTO:
                url = `${config_1.default.frontendUrl}/eventos`;
                tipoTexto = 'Evento escolar';
                break;
        }
        await (0, email_service_1.encolarCorreo)({
            destinatarios: usuarios
                .filter((u) => u.email)
                .map((u) => ({ email: u.email, nombre: u.nombre, usuarioId: String(u._id) })),
            plantilla: 'notificacion',
            datos: { titulo: data.titulo, mensaje: data.mensaje, tipoTexto, url },
            escuelaId: data.escuelaId,
        });
    }
}
exports.default = new NotificacionService();
//# sourceMappingURL=notificacion.service.js.map