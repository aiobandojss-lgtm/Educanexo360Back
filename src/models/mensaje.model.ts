// src/models/mensaje.model.ts

import mongoose, { Schema } from 'mongoose';
import { IMensaje, TipoMensaje, EstadoMensaje, PrioridadMensaje } from '../interfaces/IMensaje';

const AdjuntoSchema = new Schema({
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
  fileId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  fechaSubida: {
    type: Date,
    default: Date.now,
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

// Nuevo schema para estados por usuario
const EstadoUsuarioSchema = new Schema({
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true,
  },
  estado: {
    type: String,
    enum: Object.values(EstadoMensaje),
    default: EstadoMensaje.ENVIADO,
  },
  fechaAccion: {
    type: Date,
    default: Date.now,
  },
});

const MensajeSchema = new Schema(
  {
    remitente: {
      type: Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    destinatarios: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Usuario',
        //required: true,
      },
    ],
    destinatariosCc: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Usuario',
      },
    ],
    asunto: {
      type: String,
      required: true,
      trim: true,
    },
    contenido: {
      type: String,
      required: true,
    },
    tipo: {
      type: String,
      enum: Object.values(TipoMensaje),
      default: TipoMensaje.INDIVIDUAL,
    },
    prioridad: {
      type: String,
      enum: Object.values(PrioridadMensaje),
      default: PrioridadMensaje.NORMAL,
    },
    // Mantenemos el estado global para compatibilidad
    estado: {
      type: String,
      enum: Object.values(EstadoMensaje),
      default: EstadoMensaje.ENVIADO,
    },
    // Nuevo campo para estado actual (usado en mensajes migrados)
    estadoActual: {
      type: String,
      enum: Object.values(EstadoMensaje),
    },
    // Nuevo array para estados por usuario
    estadosUsuarios: [EstadoUsuarioSchema],
    // Fecha de la última acción
    fechaAccion: {
      type: Date,
    },
    etiquetas: [
      {
        type: String,
        trim: true,
      },
    ],
    adjuntos: [AdjuntoSchema],
    escuelaId: {
      type: Schema.Types.ObjectId,
      ref: 'Escuela',
      required: true,
    },
    esRespuesta: {
      type: Boolean,
      default: false,
    },
    mensajeOriginalId: {
      type: Schema.Types.ObjectId,
      ref: 'Mensaje',
    },
    lecturas: [LecturaSchema],
    eliminadoPorRemitente: {
      type: Boolean,
      default: false,
    },
    fechaEliminacion: {
      type: Date,
      default: null,
    },
    esCopiaAcudiente: {
      type: Boolean,
      default: false,
    },
    cursoIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Curso',
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Método para obtener el estado para un usuario específico
MensajeSchema.methods.getEstadoParaUsuario = function (usuarioId: string): EstadoMensaje {
  if (!this.estadosUsuarios || this.estadosUsuarios.length === 0) {
    return this.estado; // Usar estado global como fallback
  }

  const estadoUsuario = this.estadosUsuarios.find(
    (eu: any) => eu.usuarioId.toString() === usuarioId.toString(),
  );

  return estadoUsuario ? estadoUsuario.estado : EstadoMensaje.ENVIADO;
};

// Método para actualizar el estado para un usuario específico
MensajeSchema.methods.actualizarEstadoUsuario = function (
  usuarioId: string,
  nuevoEstado: EstadoMensaje,
): void {
  const ahora = new Date();

  const indice = this.estadosUsuarios
    ? this.estadosUsuarios.findIndex((eu: any) => eu.usuarioId.toString() === usuarioId.toString())
    : -1;

  if (indice !== -1 && this.estadosUsuarios) {
    // Si existe, actualizar solo ese item
    this.estadosUsuarios[indice].estado = nuevoEstado;
    this.estadosUsuarios[indice].fechaAccion = ahora;
  } else {
    // Si no existe, usar $set para la actualización
    const nuevoEstadoUsuario = {
      usuarioId: new mongoose.Types.ObjectId(usuarioId),
      estado: nuevoEstado,
      fechaAccion: ahora,
    };

    // Usar $set para evitar problemas con DocumentArray
    this.$set(
      'estadosUsuarios',
      this.estadosUsuarios ? [...this.estadosUsuarios, nuevoEstadoUsuario] : [nuevoEstadoUsuario],
    );
  }

  // Actualizar también el campo de fecha de acción global
  this.fechaAccion = ahora;
};

// Hook pre-save modificado para evitar problemas de tipado
MensajeSchema.pre('save', function (next) {
  // Solo ejecutar para nuevos documentos
  if (!this.isNew) {
    return next();
  }

  try {
    const usuarios = new Set<string>();
    const ahora = new Date();

    // Añadir remitente
    if (this.remitente) {
      usuarios.add(this.remitente.toString());
    }

    // Añadir destinatarios
    if (this.destinatarios && Array.isArray(this.destinatarios)) {
      this.destinatarios.forEach((dest: any) => {
        const destId = dest._id ? dest._id.toString() : dest.toString();
        usuarios.add(destId);
      });
    }

    // Añadir destinatarios en copia
    if (this.destinatariosCc && Array.isArray(this.destinatariosCc)) {
      this.destinatariosCc.forEach((dest: any) => {
        const destId = dest._id ? dest._id.toString() : dest.toString();
        usuarios.add(destId);
      });
    }

    // Inicializar estados para todos los usuarios
    const estadosUsuariosArray = Array.from(usuarios).map((userId) => ({
      usuarioId: new mongoose.Types.ObjectId(userId),
      estado: this.estado || EstadoMensaje.ENVIADO,
      fechaAccion: ahora,
    }));

    // Usar $set para inicializar el documento correctamente
    // Esto evita el error de tipo ya que $set es un método nativo de Mongoose
    this.$set('estadosUsuarios', estadosUsuariosArray);

    // Establecer fecha de acción global
    this.fechaAccion = ahora;

    next();
  } catch (error) {
    next(error as Error);
  }
});

// Índices para mejorar el rendimiento
MensajeSchema.index({ remitente: 1 });
MensajeSchema.index({ destinatarios: 1 });
MensajeSchema.index({ escuelaId: 1 });
MensajeSchema.index({ estado: 1 });
MensajeSchema.index({ createdAt: -1 });
MensajeSchema.index({ asunto: 'text', contenido: 'text' });
// Nuevos índices para estadosUsuarios
MensajeSchema.index({ 'estadosUsuarios.usuarioId': 1 });
MensajeSchema.index({ 'estadosUsuarios.estado': 1 });
MensajeSchema.index({ 'estadosUsuarios.usuarioId': 1, 'estadosUsuarios.estado': 1 });

const Mensaje = mongoose.model<IMensaje>('Mensaje', MensajeSchema);

export default Mensaje;
