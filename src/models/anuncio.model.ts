import mongoose, { Schema } from 'mongoose';
import { IAnuncio } from '../interfaces/IAnuncio';

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
});

const ImagenPortadaSchema = new Schema({
  fileId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
});

const LecturaSchema = new Schema({
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  fechaLectura: {
    type: Date,
    default: Date.now,
  },
});

const AnuncioSchema = new Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
    },
    contenido: {
      type: String,
      required: true,
    },
    creador: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: true,
    },
    fechaPublicacion: {
      type: Date,
      default: Date.now,
    },
    estaPublicado: {
      type: Boolean,
      default: false,
    },
    paraEstudiantes: {
      type: Boolean,
      default: true,
    },
    paraDocentes: {
      type: Boolean,
      default: false,
    },
    paraPadres: {
      type: Boolean,
      default: true,
    },
    destacado: {
      type: Boolean,
      default: false,
    },
    archivosAdjuntos: [ArchivoSchema],
    imagenPortada: ImagenPortadaSchema,
    lecturas: [LecturaSchema],
  },
  {
    timestamps: true,
  },
);

// Índices para mejorar el rendimiento de consultas
// Fase 3: listado por escuela/publicado/fecha; {escuelaId,estaPublicado}, {destacado} y {fechaPublicacion} quitados
AnuncioSchema.index({ escuelaId: 1, estaPublicado: 1, fechaPublicacion: -1 });
AnuncioSchema.index({ creador: 1 });

export default mongoose.model<IAnuncio>('Anuncio', AnuncioSchema);
