// src/models/notificacion.model.ts

import mongoose, { Schema } from 'mongoose';
import { INotificacion, TipoNotificacion, EstadoNotificacion } from '../interfaces/INotificacion';

const NotificacionSchema = new Schema(
  {
    usuarioId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El usuario destinatario es requerido'],
    },
    titulo: {
      type: String,
      required: [true, 'El título es requerido'],
      trim: true,
    },
    mensaje: {
      type: String,
      required: [true, 'El mensaje es requerido'],
      trim: true,
    },
    tipo: {
      type: String,
      enum: Object.values(TipoNotificacion),
      required: [true, 'El tipo de notificación es requerido'],
    },
    estado: {
      type: String,
      enum: Object.values(EstadoNotificacion),
      default: EstadoNotificacion.PENDIENTE,
    },
    entidadId: {
      type: Schema.Types.ObjectId,
      refPath: 'entidadTipo',
    },
    entidadTipo: {
      type: String,
      enum: [
        'Mensaje',
        'Calificacion',
        'Curso',
        'Asignatura',
        'Usuario',
        'EventoCalendario',
        'Anuncio',
      ],
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: [true, 'La escuela es requerida'],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    fechaLectura: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Índices para mejorar el rendimiento
// Fase 3: listado por usuario ordenado por fecha; {tipo} y {createdAt} sueltos quitados (sin consultas que los usen)
NotificacionSchema.index({ usuarioId: 1, createdAt: -1 });
NotificacionSchema.index({ usuarioId: 1, estado: 1 });
NotificacionSchema.index({ escuelaId: 1 });

export default mongoose.model<INotificacion>('Notificacion', NotificacionSchema);
