// src/interfaces/IMensaje.ts

import { Document, Types } from 'mongoose';

// Tipos de mensaje
export enum TipoMensaje {
  INDIVIDUAL = 'INDIVIDUAL',
  GRUPAL = 'GRUPAL',
  INSTITUCIONAL = 'INSTITUCIONAL',
  BORRADOR = 'BORRADOR',
}

// Estados de mensaje
export enum EstadoMensaje {
  ENVIADO = 'ENVIADO',
  BORRADOR = 'BORRADOR',
  ARCHIVADO = 'ARCHIVADO',
  ELIMINADO = 'ELIMINADO', // Estado para mensajes eliminados
}

// Prioridades de mensaje
export enum PrioridadMensaje {
  ALTA = 'ALTA',
  NORMAL = 'NORMAL',
  BAJA = 'BAJA',
}

// Interfaz para adjuntos de mensaje
export interface IAdjunto {
  nombre: string;
  tipo: string;
  tamaño: number;
  fileId: Types.ObjectId;
  fechaSubida: Date;
}

// Interfaz para lecturas de mensaje
export interface ILectura {
  usuarioId: Types.ObjectId;
  fechaLectura: Date;
}

// Nueva interfaz para estados por usuario
export interface IEstadoUsuario {
  usuarioId: Types.ObjectId;
  estado: EstadoMensaje;
  fechaAccion: Date;
}

// Interfaz base de mensaje
export interface IMensajeBase {
  remitente: Types.ObjectId;
  destinatarios: Types.ObjectId[];
  destinatariosCc?: Types.ObjectId[];
  asunto: string;
  contenido: string;
  tipo: TipoMensaje;
  prioridad: PrioridadMensaje;
  estado: EstadoMensaje; // Estado global (para compatibilidad)
  estadoActual?: EstadoMensaje; // Estado actual para mensajes migrados
  estadosUsuarios?: IEstadoUsuario[]; // Estados por usuario
  fechaAccion?: Date; // Fecha de la última acción
  etiquetas?: string[];
  adjuntos?: IAdjunto[];
  escuelaId: Types.ObjectId;
  esRespuesta?: boolean;
  mensajeOriginalId?: Types.ObjectId;
  lecturas?: ILectura[];
  eliminadoPorRemitente?: boolean;
  fechaEliminacion?: Date; // Fecha de eliminación (para compatibilidad)
  esCopiaAcudiente?: boolean;
  cursoIds?: Types.ObjectId[];
}

// Interfaz para documentos de Mongoose
export interface IMensaje extends IMensajeBase, Document {
  createdAt: Date;
  updatedAt: Date;
}

// Interfaz plana para uso en respuestas o fuera de Mongoose
export type IMensajeLean = IMensajeBase & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
