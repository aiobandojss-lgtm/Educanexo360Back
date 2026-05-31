import { Document, Types } from 'mongoose';
import { Permission } from '../constants/permissions';

export interface IPerfilRolBase {
  nombre: string;
  descripcion?: string;
  rolBase: 'DOCENTE' | 'COORDINADOR' | 'RECTOR' | 'ADMINISTRATIVO' | 'ACUDIENTE' | 'ESTUDIANTE';
  permisos: Permission[];
  escuelaId: Types.ObjectId;
  activo: boolean;
  creadoPor: Types.ObjectId;
}

export interface IPerfilRol extends IPerfilRolBase, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IPerfilRolLean = IPerfilRolBase & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
