import { body, param } from 'express-validator';
import mongoose from 'mongoose';
import { ALL_PERMISSIONS } from '../constants/permissions';

const ROLES_BASE_VALIDOS = ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'];

export const crearPerfilRolValidation = [
  body('nombre')
    .trim()
    .notEmpty()
    .withMessage('El nombre del perfil es requerido')
    .isLength({ max: 100 })
    .withMessage('El nombre no puede exceder 100 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),

  body('rolBase')
    .notEmpty()
    .withMessage('El rol base es requerido')
    .isIn(ROLES_BASE_VALIDOS)
    .withMessage(`El rol base debe ser uno de: ${ROLES_BASE_VALIDOS.join(', ')}`),

  body('permisos')
    .isArray()
    .withMessage('Los permisos deben ser un array')
    .custom((permisos: string[]) => {
      const invalidos = permisos.filter((p) => !ALL_PERMISSIONS.includes(p as any));
      if (invalidos.length > 0) {
        throw new Error(`Permisos no válidos: ${invalidos.join(', ')}`);
      }
      return true;
    }),
];

export const actualizarPerfilRolValidation = [
  body('nombre')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('El nombre no puede estar vacío')
    .isLength({ max: 100 })
    .withMessage('El nombre no puede exceder 100 caracteres'),

  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),

  body('permisos')
    .optional()
    .isArray()
    .withMessage('Los permisos deben ser un array')
    .custom((permisos: string[]) => {
      const invalidos = permisos.filter((p) => !ALL_PERMISSIONS.includes(p as any));
      if (invalidos.length > 0) {
        throw new Error(`Permisos no válidos: ${invalidos.join(', ')}`);
      }
      return true;
    }),

  body('activo')
    .optional()
    .isBoolean()
    .withMessage('activo debe ser un booleano'),
];

export const asignarPerfilRolValidation = [
  param('usuarioId')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('ID de usuario inválido');
      }
      return true;
    }),

  body('perfilRolId')
    .notEmpty()
    .withMessage('El perfilRolId es requerido')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('ID de perfil de rol inválido');
      }
      return true;
    }),
];

export const removerPerfilRolValidation = [
  param('usuarioId')
    .custom((value) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('ID de usuario inválido');
      }
      return true;
    }),
];
