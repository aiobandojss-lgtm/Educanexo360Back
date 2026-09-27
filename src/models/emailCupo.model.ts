import mongoose, { Schema } from 'mongoose';

/**
 * Cupo diario de correo (Fase 4.4): un documento por día calendario de Colombia (_id 'YYYY-MM-DD') con el
 * total enviado. Lo usa services/email/cupo.ts. Los días viejos se borran solos (TTL de 60 días).
 */
export interface ICupoCorreo {
  _id: string;
  enviados: number;
  altaEnviados: number;
  expireAt: Date;
}

const CupoSchema = new Schema<ICupoCorreo>(
  {
    _id: { type: String },
    enviados: { type: Number, default: 0 },
    altaEnviados: { type: Number, default: 0 },
    expireAt: { type: Date },
  },
  { collection: 'email_cupo', versionKey: false },
);
CupoSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.CupoCorreo || mongoose.model<ICupoCorreo>('CupoCorreo', CupoSchema);
