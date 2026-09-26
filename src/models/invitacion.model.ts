import mongoose, { Schema, Document } from 'mongoose';
import { Types } from 'mongoose';

// Tipos de invitación
export enum TipoInvitacion {
  CURSO = 'CURSO',
  ESTUDIANTE_ESPECIFICO = 'ESTUDIANTE_ESPECIFICO',
  PERSONAL = 'PERSONAL',
}

// Estados de invitación
export enum EstadoInvitacion {
  ACTIVO = 'ACTIVO',
  UTILIZADO = 'UTILIZADO',
  REVOCADO = 'REVOCADO',
  EXPIRADO = 'EXPIRADO',
}

// Interfaz base para invitación
export interface IInvitacionBase {
  codigo: string;
  tipo: TipoInvitacion;
  escuelaId: Types.ObjectId;
  cursoId?: Types.ObjectId;
  estudianteId?: Types.ObjectId;

  estado: EstadoInvitacion;
  fechaCreacion: Date;
  fechaExpiracion?: Date;
  fechaUtilizacion?: Date;

  creadorId: Types.ObjectId;
  datosAdicionales?: any;

  cantidadUsos: number;
  usosActuales: number;

  registros: Array<{
    usuarioId: Types.ObjectId;
    fechaRegistro: Date;
    tipoCuenta: string;
  }>;
}

// Interfaz del documento para Mongoose
export interface IInvitacion extends IInvitacionBase, Document {}

const InvitacionSchema = new Schema<IInvitacion>(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    tipo: {
      type: String,
      enum: Object.values(TipoInvitacion),
      required: true,
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: true,
    },
    cursoId: {
      type: Schema.Types.ObjectId,
      ref: 'Curso',
    },
    estudianteId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
    },
    estado: {
      type: String,
      enum: Object.values(EstadoInvitacion),
      default: EstadoInvitacion.ACTIVO,
    },
    fechaCreacion: {
      type: Date,
      default: Date.now,
    },
    fechaExpiracion: {
      type: Date,
    },
    fechaUtilizacion: {
      type: Date,
    },
    creadorId: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    datosAdicionales: {
      type: Schema.Types.Mixed,
    },
    cantidadUsos: {
      type: Number,
      default: 1, // Por defecto, uso único
    },
    usosActuales: {
      type: Number,
      default: 0,
    },
    registros: [
      {
        usuarioId: {
          type: Schema.Types.ObjectId,
          ref: 'Usuario',
        },
        fechaRegistro: {
          type: Date,
          default: Date.now,
        },
        tipoCuenta: {
          type: String,
          enum: ['ESTUDIANTE', 'ACUDIENTE'],
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Índices para mejorar las búsquedas
InvitacionSchema.index({ escuelaId: 1, estado: 1 });
InvitacionSchema.index({ cursoId: 1, estado: 1 });
InvitacionSchema.index({ fechaExpiracion: 1 }, { expireAfterSeconds: 0 }); // TTL index para expiración automática

// Exportar el modelo
const Invitacion = mongoose.model<IInvitacion>('Invitacion', InvitacionSchema);
export default Invitacion;
