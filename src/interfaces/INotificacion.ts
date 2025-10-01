import { Document, Types } from 'mongoose';

export enum TipoNotificacion {
  MENSAJE = 'MENSAJE', // Nuevo mensaje
  CALIFICACION = 'CALIFICACION', // Nueva calificación
  SISTEMA = 'SISTEMA', // Notificación del sistema - ✅ AGREGADO
  EVENTO = 'EVENTO', // Evento escolar
}

export enum EstadoNotificacion {
  PENDIENTE = 'PENDIENTE',
  LEIDA = 'LEIDA',
  ARCHIVADA = 'ARCHIVADA',
}

export interface INotificacionBase {
  usuarioId: Types.ObjectId; // Usuario destinatario
  titulo: string;
  mensaje: string;
  tipo: TipoNotificacion;
  estado: EstadoNotificacion;
  entidadId?: Types.ObjectId; // ID opcional de la entidad relacionada (mensaje, calificación, etc.)
  entidadTipo?: string; // Tipo de entidad relacionada
  escuelaId: Types.ObjectId;
  metadata?: Record<string, any>; // Datos adicionales específicos del tipo
  fechaLectura?: Date;
}

export interface INotificacion extends INotificacionBase, Document {
  createdAt: Date;
  updatedAt: Date;
}