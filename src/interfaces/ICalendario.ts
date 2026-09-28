// src/interfaces/ICalendario.ts

import { Document, Types } from 'mongoose';

export enum TipoEvento {
  ACADEMICO = 'ACADEMICO',
  INSTITUCIONAL = 'INSTITUCIONAL',
  CULTURAL = 'CULTURAL',
  DEPORTIVO = 'DEPORTIVO',
  OTRO = 'OTRO',
}

export enum EstadoEvento {
  PENDIENTE = 'PENDIENTE',
  ACTIVO = 'ACTIVO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO',
}

export interface IInvitado {
  usuarioId: Types.ObjectId;
  confirmado: boolean;
  fechaConfirmacion?: Date;
}

// Interfaz base para evento del calendario
export interface IEventoCalendarioBase {
  titulo: string;
  descripcion: string;
  fechaInicio: Date;
  fechaFin: Date;
  todoElDia: boolean;
  lugar?: string;
  tipo: TipoEvento;
  estado: EstadoEvento;
  creadorId: Types.ObjectId;
  cursoId?: Types.ObjectId; // Opcional, solo si es para un curso específico
  escuelaId: Types.ObjectId;
  color?: string; // Color para el evento en el calendario
  invitados?: IInvitado[];
  recordatorios?: {
    tiempo: number; // minutos antes del evento
    tipo: 'EMAIL' | 'NOTIFICACION' | 'AMBOS';
  }[];
  archivoAdjunto?: {
    fileId: Types.ObjectId;
    nombre: string;
    tipo: string;
    tamaño: number;
    // Fase 5.2: referencia en la capa de almacenamiento (opcional en lo antiguo)
    almacen?: 'gridfs' | 's3' | 'local';
    clave?: string;
    sha256?: string;
  };
  notificadoEn?: Date; // push de publicación ya enviado (auditoría 3.Y)
}

// Interfaz para el documento MongoDB
export interface IEventoCalendario extends IEventoCalendarioBase, Document {
  createdAt: Date;
  updatedAt: Date;
}
