import mongoose, { Schema } from 'mongoose';
import { IPerfilRol } from '../interfaces/IPerfilRol';
import { ALL_PERMISSIONS } from '../constants/permissions';

const PerfilRolSchema = new Schema(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    descripcion: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    rolBase: {
      type: String,
      enum: ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'],
      required: true,
    },
    permisos: {
      type: [String],
      enum: ALL_PERMISSIONS,
      default: [],
    },
    escuelaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Escuela',
      required: true,
      index: true,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
  },
  { timestamps: true },
);

// Índice compuesto: nombre único por escuela
PerfilRolSchema.index({ escuelaId: 1, nombre: 1 }, { unique: true });

const PerfilRol = mongoose.model<IPerfilRol>('PerfilRol', PerfilRolSchema);

export default PerfilRol;
