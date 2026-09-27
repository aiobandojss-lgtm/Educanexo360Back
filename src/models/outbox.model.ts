import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Cola de envíos (outbox) en MongoDB (Fase 4.1). Sin Redis: un solo proceso Passenger y Atlas M0.
 *
 * Cada documento es un TRABAJO (un correo, un lote de ~50 destinatarios de push/correo, las copias a
 * acudientes de un mensaje, el resumen diario...). El worker (src/queue/outbox.ts) los toma con un
 * findOneAndUpdate atómico PENDIENTE → PROCESANDO + lockedUntil.
 */
export type EstadoTrabajo = 'PENDIENTE' | 'PROCESANDO' | 'HECHO' | 'FALLIDO';
export type PrioridadTrabajo = 'alta' | 'normal';

export interface IOutbox extends Document {
  tipo: string;
  prioridad: PrioridadTrabajo;
  payload: Record<string, any>;
  estado: EstadoTrabajo;
  intentos: number;
  nextRunAt: Date;
  lockedUntil?: Date;
  error?: string;
  escuelaId?: Types.ObjectId;
  // Idempotencia: un trabajo con la misma clave no se encola dos veces (p. ej. 'resumen:2026-09-26')
  claveUnica?: string;
  // Ids ya atendidos dentro del trabajo (lotes): si el lote falla a medias, el reintento no los repite
  enviados: string[];
  // Solo en HECHO/FALLIDO: el TTL borra el documento 7 días después (los PENDIENTE nunca expiran)
  expireAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OutboxSchema = new Schema<IOutbox>(
  {
    tipo: { type: String, required: true },
    // 'alta' < 'normal' en orden alfabético: ordenar ascendente toma primero la prioridad alta
    prioridad: { type: String, enum: ['alta', 'normal'], default: 'normal' },
    payload: { type: Schema.Types.Mixed, default: {} },
    estado: {
      type: String,
      enum: ['PENDIENTE', 'PROCESANDO', 'HECHO', 'FALLIDO'],
      default: 'PENDIENTE',
    },
    intentos: { type: Number, default: 0 },
    nextRunAt: { type: Date, default: Date.now },
    lockedUntil: { type: Date },
    error: { type: String },
    escuelaId: { type: Schema.Types.ObjectId, ref: 'Escuela' },
    claveUnica: { type: String },
    enviados: { type: [String], default: [] },
    expireAt: { type: Date },
  },
  { timestamps: true, collection: 'outbox', minimize: false },
);

// Worker: siguiente trabajo PENDIENTE por prioridad y fecha; también sirve para retomar PROCESANDO vencidos
OutboxSchema.index({ estado: 1, prioridad: 1, nextRunAt: 1 });
// TTL: HECHO/FALLIDO se borran 7 días después para no llenar el M0 (expireAt solo se llena al terminar)
OutboxSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
// Idempotencia: solo los trabajos que traen clave (sin partial, todos los null chocarían entre sí)
OutboxSchema.index(
  { claveUnica: 1 },
  { unique: true, partialFilterExpression: { claveUnica: { $type: 'string' } } },
);

export default mongoose.model<IOutbox>('Outbox', OutboxSchema);
