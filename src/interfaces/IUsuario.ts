import { Document, Types } from 'mongoose';

// Definición de tipos de usuario
export type TipoUsuario =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'DOCENTE'
  | 'ACUDIENTE' // Cambiado de PADRE a ACUDIENTE
  | 'ESTUDIANTE'
  | 'COORDINADOR' // Nuevo rol
  | 'RECTOR' // Nuevo rol
  | 'ADMINISTRATIVO'; // Nuevo rol

// Definición de estados de usuario
export type EstadoUsuario = 'ACTIVO' | 'INACTIVO';

export interface IUsuarioBase {
  email: string;
  password: string;
  nombre: string;
  apellidos: string;
  tipo: TipoUsuario;
  estado: EstadoUsuario;
  escuelaId: Types.ObjectId;
  permisos: string[];
  perfil: {
    telefono?: string;
    direccion?: string;
    foto?: string;
  };
  info_academica?: {
    grado?: string;
    grupo?: string;
    codigo_estudiante?: string;
    estudiantes_asociados?: Types.ObjectId[]; // Para acudientes
    asignaturas_asignadas?: {
      // Para docentes
      asignaturaId: Types.ObjectId;
      cursoId: Types.ObjectId;
    }[];
  };
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  
  // 🔥 CAMPOS FCM AGREGADOS AQUÍ
  fcmToken?: string;
  platform?: 'ios' | 'android';
  deviceInfo?: {
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
  };
  fcmTokenUpdatedAt?: Date;
}

export interface IUsuario extends IUsuarioBase, Document {
  compararPassword(candidatePassword: string): Promise<boolean>;
}

export type IUsuarioLean = IUsuarioBase & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};