// src/services/notificacion.service.ts

import Notificacion from '../models/notificacion.model';
import Usuario from '../models/usuario.model';
import { encolarCorreo } from './email.service';
import { TipoNotificacion, EstadoNotificacion } from '../interfaces/INotificacion';
import config from '../config/config';

class NotificacionService {
  /**
   * Crear una nueva notificación
   */
  async crearNotificacion(data: {
    usuarioId: string;
    titulo: string;
    mensaje: string;
    tipo: TipoNotificacion;
    escuelaId: string;
    entidadId?: string;
    entidadTipo?: string;
    metadata?: Record<string, any>;
    enviarEmail?: boolean;
  }) {
    try {
      // Crear la notificación
      const notificacion = await Notificacion.create({
        usuarioId: data.usuarioId,
        titulo: data.titulo,
        mensaje: data.mensaje,
        tipo: data.tipo,
        estado: EstadoNotificacion.PENDIENTE,
        entidadId: data.entidadId,
        entidadTipo: data.entidadTipo,
        escuelaId: data.escuelaId,
        metadata: data.metadata || {},
      });

      // Si se solicita envío de email: por la cola (Fase 4.4), con la plantilla escapada
      if (data.enviarEmail) {
        await this.encolarEmailNotificacion([data.usuarioId], data);
      }

      return notificacion;
    } catch (error) {
      console.error('Error al crear notificación:', error);
      throw error;
    }
  }

  /**
   * Crear notificaciones para múltiples usuarios
   */
  async crearNotificacionMasiva(data: {
    usuarioIds: string[];
    titulo: string;
    mensaje: string;
    tipo: TipoNotificacion;
    escuelaId: string;
    entidadId?: string;
    entidadTipo?: string;
    metadata?: Record<string, any>;
    enviarEmail?: boolean;
  }) {
    try {
      const notificaciones = [];

      // Crear documentos de notificación para todos los usuarios
      const notificacionesDocs = data.usuarioIds.map((usuarioId) => ({
        usuarioId,
        titulo: data.titulo,
        mensaje: data.mensaje,
        tipo: data.tipo,
        estado: EstadoNotificacion.PENDIENTE,
        entidadId: data.entidadId,
        entidadTipo: data.entidadTipo,
        escuelaId: data.escuelaId,
        metadata: data.metadata || {},
      }));

      // Insertar todas las notificaciones
      if (notificacionesDocs.length > 0) {
        notificaciones.push(...(await Notificacion.insertMany(notificacionesDocs)));
      }

      // Si se solicita envío de email: una consulta y lotes de ~50 en la cola (antes: un envío en loop)
      if (data.enviarEmail) {
        await this.encolarEmailNotificacion(data.usuarioIds, data);
      }

      return notificaciones;
    } catch (error) {
      console.error('Error al crear notificaciones masivas:', error);
      throw error;
    }
  }

  /**
   * Marcar una notificación como leída
   */
  async marcarComoLeida(notificacionId: string, usuarioId: string) {
    try {
      const notificacion = await Notificacion.findOneAndUpdate(
        { _id: notificacionId, usuarioId },
        {
          estado: EstadoNotificacion.LEIDA,
          fechaLectura: new Date(),
        },
        { new: true },
      );

      return notificacion;
    } catch (error) {
      console.error('Error al marcar notificación como leída:', error);
      throw error;
    }
  }

  /**
   * Marcar todas las notificaciones como leídas
   */
  async marcarTodasComoLeidas(usuarioId: string) {
    try {
      const resultado = await Notificacion.updateMany(
        { usuarioId, estado: EstadoNotificacion.PENDIENTE },
        {
          estado: EstadoNotificacion.LEIDA,
          fechaLectura: new Date(),
        },
      );

      return resultado.modifiedCount;
    } catch (error) {
      console.error('Error al marcar todas las notificaciones como leídas:', error);
      throw error;
    }
  }

  /**
   * Archivar una notificación
   */
  async archivarNotificacion(notificacionId: string, usuarioId: string) {
    try {
      const notificacion = await Notificacion.findOneAndUpdate(
        { _id: notificacionId, usuarioId },
        { estado: EstadoNotificacion.ARCHIVADA },
        { new: true },
      );

      return notificacion;
    } catch (error) {
      console.error('Error al archivar notificación:', error);
      throw error;
    }
  }

  /**
   * Encola el correo de una notificación para los usuarios dados (Fase 4.4). Los datos se escapan en la
   * plantilla 'notificacion'; el envío lo hace el worker con reintentos y cupo diario.
   */
  private async encolarEmailNotificacion(
    usuarioIds: string[],
    data: {
      titulo: string;
      mensaje: string;
      tipo: TipoNotificacion;
      escuelaId: string;
      metadata?: Record<string, any>;
    },
  ) {
    const usuarios = await Usuario.find({ _id: { $in: usuarioIds } })
      .select('_id email nombre')
      .lean();

    // Personalizar según el tipo
    let url = `${config.frontendUrl}/notificaciones`;
    let tipoTexto = 'Notificación del sistema';
    switch (data.tipo) {
      case TipoNotificacion.MENSAJE:
        url = data.metadata?.url || `${config.frontendUrl}/mensajes/${data.metadata?.mensajeId || ''}`;
        tipoTexto = 'Nuevo mensaje';
        break;
      case TipoNotificacion.CALIFICACION:
        url = `${config.frontendUrl}/calificaciones`;
        tipoTexto = 'Nueva calificación';
        break;
      case TipoNotificacion.EVENTO:
        url = `${config.frontendUrl}/eventos`;
        tipoTexto = 'Evento escolar';
        break;
    }

    await encolarCorreo({
      destinatarios: usuarios
        .filter((u: any) => u.email)
        .map((u: any) => ({ email: u.email, nombre: u.nombre, usuarioId: String(u._id) })),
      plantilla: 'notificacion',
      datos: { titulo: data.titulo, mensaje: data.mensaje, tipoTexto, url },
      escuelaId: data.escuelaId,
    });
  }
}

export default new NotificacionService();
