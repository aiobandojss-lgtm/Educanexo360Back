import mongoose, { Schema, Document } from 'mongoose';
import { IAlertaAsistencia } from '../interfaces/IAlertaAsistencia';

export interface IAlertaAsistenciaDocument extends IAlertaAsistencia, Document {}

const AlertaAsistenciaSchema = new Schema<IAlertaAsistenciaDocument>(
  {
    estudianteId: { type: Schema.Types.ObjectId, ref: 'Usuario', required: true },
    cursoId: { type: Schema.Types.ObjectId, ref: 'Curso', required: true },
    escuelaId: { type: Schema.Types.ObjectId, ref: 'Escuela', required: true },
    nivel: { type: String, enum: ['ALERTA', 'CRITICO', 'INMINENTE'], required: true },
    porcentajeAusencias: { type: Number, required: true },
    periodoId: { type: String, required: true },
    fechaEnvio: { type: Date, default: Date.now },
    notificadosIds: [{ type: Schema.Types.ObjectId, ref: 'Usuario', default: [] }],
  },
  { timestamps: true },
);

// Índice único compuesto — garantiza deduplicación en BD
AlertaAsistenciaSchema.index({ estudianteId: 1, nivel: 1, periodoId: 1 }, { unique: true });

export default mongoose.model<IAlertaAsistenciaDocument>(
  'AlertaAsistencia',
  AlertaAsistenciaSchema,
);
