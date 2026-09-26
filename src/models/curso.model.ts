import mongoose, { Schema, Document } from 'mongoose';

export interface ICurso extends Document {
  nombre: string;
  nivel: string;
  grado: string;
  grupo: string;
  jornada: string;
  año_academico: string;
  escuelaId: mongoose.Types.ObjectId;
  director_grupo: mongoose.Types.ObjectId;
  estudiantes: mongoose.Types.ObjectId[];
  estado: 'ACTIVO' | 'INACTIVO';
  createdAt: Date;
  updatedAt: Date;
}

const CursoSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del curso es requerido'],
      trim: true,
    },
    nivel: {
      type: String,
      required: [true, 'El nivel es requerido'],
      trim: true,
      enum: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    },
    grado: {
      type: String,
      required: [true, 'El grado es requerido'],
      trim: true,
    },
    grupo: {
      type: String,
      required: [true, 'El grupo es requerido'],
      trim: true,
    },
    jornada: {
      type: String,
      enum: ['MATUTINA', 'VESPERTINA', 'NOCTURNA', 'COMPLETA'],
      default: 'MATUTINA',
      required: [true, 'La jornada es requerida'],
    },
    año_academico: {
      type: String,
      required: [true, 'El año académico es requerido'],
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: [true, 'La escuela es requerida'],
    },
    director_grupo: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: [true, 'El director de grupo es requerido'],
    },
    estudiantes: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Usuario',
      },
    ],
    estado: {
      type: String,
      enum: ['ACTIVO', 'INACTIVO'],
      default: 'ACTIVO',
    },
  },
  {
    timestamps: true,
  },
);

// Índices actualizados
CursoSchema.index({ escuelaId: 1, año_academico: 1 });
CursoSchema.index({ director_grupo: 1 });
CursoSchema.index({ escuelaId: 1, estudiantes: 1 }); // Fase 3: curso de un estudiante (boletín, alertas)
CursoSchema.index({ nombre: 1, escuelaId: 1, grado: 1, grupo: 1, jornada: 1 }, { unique: true });

const Curso = mongoose.model<ICurso>('Curso', CursoSchema);

export default Curso;
