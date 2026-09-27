// src/models/calendario.model.ts

import mongoose, { Schema } from 'mongoose';
import { IEventoCalendario, TipoEvento, EstadoEvento } from '../interfaces/ICalendario';

const InvitadoSchema = new Schema({
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  confirmado: {
    type: Boolean,
    default: false,
  },
  fechaConfirmacion: {
    type: Date,
  },
});

const RecordatorioSchema = new Schema({
  tiempo: {
    type: Number,
    required: true,
    min: 0,
  },
  tipo: {
    type: String,
    enum: ['EMAIL', 'NOTIFICACION', 'AMBOS'],
    default: 'NOTIFICACION',
  },
});

const ArchivoAdjuntoSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  nombre: {
    type: String,
    required: true,
  },
  tipo: {
    type: String,
    required: true,
  },
  tamaño: {
    type: Number,
    required: true,
  },
});

const EventoCalendarioSchema = new Schema(
  {
    titulo: {
      type: String,
      required: [true, 'El título del evento es requerido'],
      trim: true,
    },
    descripcion: {
      type: String,
      required: [true, 'La descripción del evento es requerida'],
      trim: true,
    },
    fechaInicio: {
      type: Date,
      required: [true, 'La fecha de inicio es requerida'],
    },
    fechaFin: {
      type: Date,
      required: [true, 'La fecha de fin es requerida'],
    },
    todoElDia: {
      type: Boolean,
      default: false,
    },
    lugar: {
      type: String,
      trim: true,
    },
    tipo: {
      type: String,
      enum: Object.values(TipoEvento),
      default: TipoEvento.ACADEMICO,
    },
    estado: {
      type: String,
      enum: Object.values(EstadoEvento),
      default: EstadoEvento.PENDIENTE,
    },
    creadorId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El creador del evento es requerido'],
    },
    cursoId: {
      type: Schema.Types.ObjectId,
      ref: 'Curso',
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: [true, 'La escuela es requerida'],
    },
    color: {
      type: String,
      default: '#3788d8', // Color por defecto (azul)
    },
    invitados: [InvitadoSchema],
    recordatorios: [RecordatorioSchema],
    archivoAdjunto: ArchivoAdjuntoSchema,
    // Cuándo se avisó al colegio por push al publicarse (ACTIVO). Sin default: ausente = aún no se avisó.
    // Evita pushes repetidos si el evento se alterna ACTIVO→PENDIENTE→ACTIVO (auditoría 3.Y)
    notificadoEn: { type: Date },
  },
  {
    timestamps: true,
  },
);

// Middleware para validar fechas
EventoCalendarioSchema.pre('save', function (next) {
  if (this.fechaFin < this.fechaInicio) {
    next(new Error('La fecha de fin no puede ser anterior a la fecha de inicio'));
  }
  next();
});

// Índices para mejorar las consultas
EventoCalendarioSchema.index({ escuelaId: 1, fechaInicio: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, creadorId: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, cursoId: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, estado: 1 });

export default mongoose.model<IEventoCalendario>('EventoCalendario', EventoCalendarioSchema);
