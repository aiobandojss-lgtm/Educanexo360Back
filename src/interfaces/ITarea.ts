// src/interfaces/ITarea.ts
import { Document, Types } from 'mongoose';

// Tipos de tarea
export type TipoTarea = 'INDIVIDUAL' | 'GRUPAL';

// Prioridades
export type PrioridadTarea = 'ALTA' | 'MEDIA' | 'BAJA';

// Estados de tarea
export type EstadoTarea = 'ACTIVA' | 'CERRADA' | 'CANCELADA';

// Estados de entrega
export type EstadoEntrega = 'PENDIENTE' | 'VISTA' | 'ENTREGADA' | 'ATRASADA' | 'CALIFICADA';

// Interface para archivos adjuntos
export interface IArchivoTarea {
  fileId: Types.ObjectId;
  nombre: string;
  tipo: string;
  tamaño: number;
  fechaSubida: Date;
  // Fase 5.2: referencia en la capa de almacenamiento (opcional en lo antiguo)
  almacen?: 'gridfs' | 's3' | 'local';
  clave?: string;
  sha256?: string;
}

// Interface para tracking de vistas
export interface IVistaTarea {
  estudianteId: Types.ObjectId;
  fechaVista: Date;
}

// Interface para entregas de tarea
export interface IEntregaTarea {
  _id?: Types.ObjectId;
  estudianteId: Types.ObjectId;
  fechaEntrega?: Date;
  estado: EstadoEntrega;
  archivos: IArchivoTarea[];
  comentarioEstudiante?: string;
  calificacion?: number;
  comentarioDocente?: string;
  fechaCalificacion?: Date;
  intentos: number;
}

// Interface base para la tarea
export interface ITareaBase {
  titulo: string;
  descripcion: string;
  docenteId: Types.ObjectId;
  asignaturaId: Types.ObjectId;
  cursoId: Types.ObjectId;
  estudiantesIds: Types.ObjectId[];
  fechaAsignacion: Date;
  fechaLimite: Date;
  tipo: TipoTarea;
  prioridad: PrioridadTarea;
  permiteTardias: boolean;
  calificacionMaxima: number;
  pesoEvaluacion?: number;
  archivosReferencia: IArchivoTarea[];
  vistas: IVistaTarea[];
  entregas: IEntregaTarea[];
  estado: EstadoTarea;
  escuelaId: Types.ObjectId;
}

// Interface para estadísticas
export interface IEstadisticasTarea {
  totalEstudiantes: number;
  entregadas: number;
  pendientes: number;
  atrasadas: number;
  calificadas: number;
  promedioCalificacion?: number;
  porcentajeEntrega: number;
}

// Interface principal del documento CON MÉTODOS
export interface ITarea extends ITareaBase, Document {
  createdAt: Date;
  updatedAt: Date;
  
  // 🔥 MÉTODOS DEL MODELO
  actualizarEstadosEntregas(): void;
  obtenerEstadisticas(): IEstadisticasTarea;
}

// Interface para input de creación
export interface ITareaInput {
  titulo: string;
  descripcion: string;
  asignaturaId: string;
  cursoId: string;
  estudiantesIds?: string[];
  fechaLimite: Date;
  tipo?: TipoTarea;
  prioridad?: PrioridadTarea;
  permiteTardias?: boolean;
  calificacionMaxima: number;
  pesoEvaluacion?: number;
}

// Interface para actualización
export interface ITareaUpdate {
  titulo?: string;
  descripcion?: string;
  fechaLimite?: Date;
  prioridad?: PrioridadTarea;
  permiteTardias?: boolean;
  calificacionMaxima?: number;
  pesoEvaluacion?: number;
}

// Interface para entregar tarea
export interface IEntregarTareaInput {
  comentarioEstudiante?: string;
}

// Interface para calificar entrega
export interface ICalificarEntregaInput {
  calificacion: number;
  comentarioDocente?: string;
}