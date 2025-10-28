// src/models/tarea.model.ts
import mongoose, { Schema } from 'mongoose';
import { ITarea } from '../interfaces/ITarea';

// Schema para archivos
const ArchivoSchema = new Schema({
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
  fechaSubida: {
    type: Date,
    default: Date.now,
  },
});

// Schema para vistas
const VistaSchema = new Schema({
  estudianteId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  fechaVista: {
    type: Date,
    default: Date.now,
  },
});

// Schema para entregas
const EntregaSchema = new Schema({
  estudianteId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  fechaEntrega: {
    type: Date,
  },
  estado: {
    type: String,
    enum: ['PENDIENTE', 'VISTA', 'ENTREGADA', 'ATRASADA', 'CALIFICADA'],
    default: 'PENDIENTE',
  },
  archivos: [ArchivoSchema],
  comentarioEstudiante: {
    type: String,
    trim: true,
  },
  calificacion: {
    type: Number,
    min: 0,
  },
  comentarioDocente: {
    type: String,
    trim: true,
  },
  fechaCalificacion: {
    type: Date,
  },
  intentos: {
    type: Number,
    default: 0,
  },
});

// Schema principal de Tarea
const TareaSchema = new Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    docenteId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },
    asignaturaId: {
      type: Schema.Types.ObjectId,
      ref: 'Asignatura',
      required: true,
      index: true,
    },
    cursoId: {
      type: Schema.Types.ObjectId,
      ref: 'Curso',
      required: true,
      index: true,
    },
    estudiantesIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Usuario',
      },
    ],
    fechaAsignacion: {
      type: Date,
      default: Date.now,
    },
    fechaLimite: {
      type: Date,
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      enum: ['INDIVIDUAL', 'GRUPAL'],
      default: 'INDIVIDUAL',
    },
    prioridad: {
      type: String,
      enum: ['ALTA', 'MEDIA', 'BAJA'],
      default: 'MEDIA',
    },
    permiteTardias: {
      type: Boolean,
      default: true,
    },
    calificacionMaxima: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    pesoEvaluacion: {
      type: Number,
      min: 0,
      max: 100,
    },
    archivosReferencia: [ArchivoSchema],
    vistas: [VistaSchema],
    entregas: [EntregaSchema],
    estado: {
      type: String,
      enum: ['ACTIVA', 'CERRADA', 'CANCELADA'],
      default: 'ACTIVA',
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices compuestos para optimizar consultas
TareaSchema.index({ escuelaId: 1, estado: 1, fechaLimite: -1 });
TareaSchema.index({ docenteId: 1, estado: 1 });
TareaSchema.index({ cursoId: 1, fechaLimite: -1 });
TareaSchema.index({ 'entregas.estudianteId': 1 });

// Método para actualizar estados de entregas automáticamente
TareaSchema.methods.actualizarEstadosEntregas = function () {
  const ahora = new Date();
  const fechaLimite = this.fechaLimite;

  this.entregas.forEach((entrega: any) => {
    // Si ya está calificada, no cambiar el estado
    if (entrega.estado === 'CALIFICADA') {
      return;
    }

    // Si está entregada y pasó la fecha límite
    if (entrega.estado === 'ENTREGADA' && entrega.fechaEntrega && entrega.fechaEntrega > fechaLimite) {
      entrega.estado = 'ATRASADA';
    }

    // Si no está entregada y pasó la fecha límite
    if (
      (entrega.estado === 'PENDIENTE' || entrega.estado === 'VISTA') &&
      ahora > fechaLimite &&
      !entrega.fechaEntrega
    ) {
      entrega.estado = 'ATRASADA';
    }
  });
};

// Método para obtener estadísticas
TareaSchema.methods.obtenerEstadisticas = function () {
  const totalEstudiantes = this.entregas.length;
  const entregadas = this.entregas.filter((e: any) => e.fechaEntrega).length;
  const pendientes = this.entregas.filter((e: any) => e.estado === 'PENDIENTE' || e.estado === 'VISTA').length;
  const atrasadas = this.entregas.filter((e: any) => e.estado === 'ATRASADA').length;
  const calificadas = this.entregas.filter((e: any) => e.estado === 'CALIFICADA').length;

  const calificaciones = this.entregas
    .filter((e: any) => e.calificacion !== undefined && e.calificacion !== null)
    .map((e: any) => e.calificacion);

  const promedioCalificacion =
    calificaciones.length > 0
      ? calificaciones.reduce((a: number, b: number) => a + b, 0) / calificaciones.length
      : undefined;

  return {
    totalEstudiantes,
    entregadas,
    pendientes,
    atrasadas,
    calificadas,
    promedioCalificacion,
    porcentajeEntrega: totalEstudiantes > 0 ? (entregadas / totalEstudiantes) * 100 : 0,
  };
};

export default mongoose.model<ITarea>('Tarea', TareaSchema);