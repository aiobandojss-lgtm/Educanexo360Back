import { body } from 'express-validator';

// Validación para actualizar usuario
export const actualizarUsuarioValidation = [
  body('nombre').optional().isString().withMessage('El nombre debe ser un texto'),
  body('apellidos').optional().isString().withMessage('Los apellidos deben ser un texto'),
  body('tipo')
    .optional()
    .isIn([
      'ADMIN',
      'DOCENTE',
      'ACUDIENTE',
      'ESTUDIANTE',
      'COORDINADOR',
      'RECTOR',
      'ADMINISTRATIVO',
    ])
    .withMessage('Tipo de usuario no válido'),
  body('estado').optional().isIn(['ACTIVO', 'INACTIVO']).withMessage('Estado no válido'),
  body('perfil.telefono').optional().isString().withMessage('El teléfono debe ser un texto'),
  body('perfil.direccion').optional().isString().withMessage('La dirección debe ser un texto'),
  body('info_academica.grado').optional().isString().withMessage('El grado debe ser un texto'),
  body('info_academica.grupo').optional().isString().withMessage('El grupo debe ser un texto'),
  body('info_academica.codigo_estudiante')
    .optional()
    .isString()
    .withMessage('El código de estudiante debe ser un texto'),
  body('info_academica.estudiantes_asociados')
    .optional()
    .isArray()
    .withMessage('Los estudiantes asociados deben ser un array'),
];

// Validación para cambiar contraseña
export const cambiarPasswordValidation = [
  body('passwordActual').notEmpty().withMessage('La contraseña actual es requerida'),
  body('nuevaPassword')
    .notEmpty()
    .withMessage('La nueva contraseña es requerida')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
];

// Validación para asociar estudiante
export const asociarEstudianteValidation = [
  body('estudianteId')
    .notEmpty()
    .withMessage('El ID del estudiante es requerido')
    .isMongoId()
    .withMessage('ID de estudiante no válido'),
];

// Fase 4.5: preferencia de correo de mensajes
export const preferenciasValidation = [
  body('email')
    .exists()
    .withMessage('La preferencia de correo es requerida')
    .isIn(['inmediato', 'resumen', 'ninguno'])
    .withMessage('La preferencia de correo debe ser inmediato, resumen o ninguno'),
];
