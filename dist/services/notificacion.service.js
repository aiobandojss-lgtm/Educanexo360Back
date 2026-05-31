"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const email_service_1 = __importDefault(require("./email.service"));
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
                const usuario = await usuario_model_1.default.findById(data.usuarioId);
                if (usuario && usuario.email) {
                    await this.enviarEmailNotificacion(usuario.email, data.titulo, data.mensaje, data.tipo, data.metadata);
                }
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
                const usuarios = await usuario_model_1.default.find({ _id: { $in: data.usuarioIds } });
                for (const usuario of usuarios) {
                    if (usuario.email) {
                        await this.enviarEmailNotificacion(usuario.email, data.titulo, data.mensaje, data.tipo, data.metadata);
                    }
                }
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
    async enviarEmailNotificacion(email, titulo, mensaje, tipo, metadata) {
        const text = `${titulo}\n\n${mensaje}`;
        let url = `${config_1.default.frontendUrl}/notificaciones`;
        let tipoTexto = 'Notificación del sistema';
        switch (tipo) {
            case INotificacion_1.TipoNotificacion.MENSAJE:
                url = metadata?.url || `${config_1.default.frontendUrl}/mensajes/${metadata?.mensajeId || ''}`;
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
        const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #3f51b5; color: white; padding: 20px; text-align: center;">
          <h1>${tipoTexto}</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
          <h2>${titulo}</h2>
          <p>${mensaje}</p>
          <p><a href="${url}" style="display: inline-block; background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Ver detalles</a></p>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
          <p>Este es un correo automático, por favor no responda a este mensaje.</p>
          <p>&copy; 2024 EducaNexo360. Todos los derechos reservados.</p>
        </div>
      </div>
    `;
        return email_service_1.default.sendEmail({
            to: email,
            subject: titulo,
            text,
            html,
        });
    }
}
exports.default = new NotificacionService();
//# sourceMappingURL=notificacion.service.js.map