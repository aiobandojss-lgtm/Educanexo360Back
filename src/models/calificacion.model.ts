import mongoose, { Schema } from 'mongoose';
import { ICalificacionDocument, ICalificacionLogro } from '../interfaces/ICalificacion';

const CalificacionLogroSchema = new Schema({
  logroId: {
    type: Schema.Types.ObjectId,
    ref: 'Logro',
    required: [true, 'El logro es requerido'],
  },
  calificacion: {
    type: Number,
    required: [true, 'La calificación es requerida'],
    min: [0, 'La calificación no puede ser menor a 0'],
    max: [5, 'La calificación no puede ser mayor a 5'],
  },
  observacion: {
    type: String,
  },
  fecha_calificacion: {
    type: Date,
    default: Date.now,
  },
});

const CalificacionSchema = new Schema(
  {
    estudianteId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El estudiante es requerido'],
    },
    asignaturaId: {
      type: Schema.Types.ObjectId,
      ref: 'Asignatura',
      required: [true, 'La asignatura es requerida'],
    },
    cursoId: {
      type: Schema.Types.ObjectId,
      ref: 'Curso',
      required: [true, 'El curso es requerido'],
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: [true, 'La escuela es requerida'],
    },
    periodo: {
      type: Number,
      required: [true, 'El periodo es requerido'],
    },
    año_academico: {
      type: String,
      required: [true, 'El año académico es requerido'],
    },
    calificaciones_logros: [CalificacionLogroSchema],
    promedio_periodo: {
      type: Number,
      default: 0,
    },
    observaciones: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Middleware para calcular el promedio antes de guardar
CalificacionSchema.pre('save', async function (next) {
  try {
    const calificacion = this as unknown as ICalificacionDocument; // unknown: tipos más estrictos de mongoose 8.24 (versionKey:false)

    if (
      Array.isArray(calificacion.calificaciones_logros) &&
      calificacion.calificaciones_logros.length > 0
    ) {
      // Obtener todos los logros referenciados
      const Logro = mongoose.model('Logro');
      const logrosIds = calificacion.calificaciones_logros.map((cal) => cal.logroId);

      const logros = await Logro.find({
        _id: { $in: logrosIds },
        asignaturaId: calificacion.asignaturaId,
        periodo: calificacion.periodo,
        año_academico: calificacion.año_academico,
      });

      if (logros.length === 0) {
        throw new Error('No se encontraron logros válidos para esta calificación');
      }

      let sumaPonderada = 0;
      let pesoTotal = 0;

      calificacion.calificaciones_logros.forEach((calificacionLogro) => {
        const logro = logros.find((l) => l._id.toString() === calificacionLogro.logroId.toString());

        if (logro) {
          sumaPonderada += calificacionLogro.calificacion * (logro.porcentaje / 100);
          pesoTotal += logro.porcentaje;
        }
      });

      if (pesoTotal > 0) {
        calificacion.promedio_periodo = Number(((sumaPonderada * 100) / pesoTotal).toFixed(2));
      }
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Índices
CalificacionSchema.index(
  { estudianteId: 1, asignaturaId: 1, periodo: 1, año_academico: 1 },
  { unique: true },
);
CalificacionSchema.index({ cursoId: 1, periodo: 1 });
CalificacionSchema.index({ escuelaId: 1 });

export default mongoose.model<ICalificacionDocument>('Calificacion', CalificacionSchema);
