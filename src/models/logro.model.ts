// src/models/logro.model.ts

import mongoose, { Schema } from 'mongoose';
import { ILogro } from '../interfaces/ILogro';

const LogroSchema = new Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre del logro es requerido'],
      trim: true,
    },
    descripcion: {
      type: String,
      required: [true, 'La descripción del logro es requerida'],
      trim: true,
    },
    tipo: {
      type: String,
      enum: ['COGNITIVO', 'PROCEDIMENTAL', 'ACTITUDINAL'],
      required: [true, 'El tipo de logro es requerido'],
    },
    porcentaje: {
      type: Number,
      required: [true, 'El porcentaje del logro es requerido'],
      min: [0, 'El porcentaje no puede ser menor a 0'],
      max: [100, 'El porcentaje no puede ser mayor a 100'],
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
    estado: {
      type: String,
      enum: ['ACTIVO', 'INACTIVO'],
      default: 'ACTIVO',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Middleware para validar que los porcentajes de los logros de un periodo no excedan el 100%
LogroSchema.pre('save', async function (next) {
  try {
    if (this.isModified('porcentaje') || this.isNew) {
      const Model = this.constructor as unknown as mongoose.Model<ILogro>;
      const otrosLogros = await Model.find({
        asignaturaId: this.asignaturaId,
        periodo: this.periodo,
        año_academico: this.año_academico,
        estado: 'ACTIVO',
        _id: { $ne: this._id },
      });

      const sumaPorcentajes =
        otrosLogros.reduce((sum, logro) => sum + logro.porcentaje, 0) + this.porcentaje;

      if (sumaPorcentajes > 100) {
        throw new Error('La suma de los porcentajes de los logros no puede exceder el 100%');
      }
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Índices
LogroSchema.index({ asignaturaId: 1, periodo: 1, año_academico: 1, estado: 1 }); // Fase 3: reemplaza al de 3 campos
LogroSchema.index({ cursoId: 1 });
LogroSchema.index({ escuelaId: 1 });

export default mongoose.model<ILogro>('Logro', LogroSchema);
