// src/validations/asistencia.validation.ts

import { body, query } from 'express-validator';
import { EstadoAsistencia } from '../interfaces/IAsistencia';

export const crearAsistenciaValidation = [
  body('fecha')
    .notEmpty()
    .withMessage('La fecha es requerida')
    .isISO8601()
    .withMessage('La fecha debe tener un formato válido'),

  body('cursoId')
    .notEmpty()
    .withMessage('El ID del curso es requerido')
    .isMongoId()
    .withMessage('ID de curso inválido'),

  body('asignaturaId').optional().isMongoId().withMessage('ID de asignatura inválido'),

  body('tipoSesion')
    .optional()
    .isIn(['CLASE', 'ACTIVIDAD', 'EVENTO', 'OTRO'])
    .withMessage('Tipo de sesión inválido'),

  body('horaInicio')
    .optional()
    .isString()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Formato de hora inválido (HH:MM)'),

  body('horaFin')
    .optional()
    .isString()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Formato de hora inválido (HH:MM)'),

  body('estudiantes').optional().isArray().withMessage('Los estudiantes deben ser un array'),

  body('estudiantes.*.estudianteId')
    .optional()
    .isMongoId()
    .withMessage('ID de estudiante inválido'),

  body('estudiantes.*.estado')
    .optional()
    .isIn(Object.values(EstadoAsistencia))
    .withMessage('Estado de asistencia inválido'),

  body('observacionesGenerales').optional().isString(),
];

export const actualizarAsistenciaValidation = [
  body('estudiantes').optional().isArray().withMessage('Los estudiantes deben ser un array'),

  body('estudiantes.*.estudianteId').isMongoId().withMessage('ID de estudiante inválido'),

  body('estudiantes.*.estado')
    .isIn(Object.values(EstadoAsistencia))
    .withMessage('Estado de asistencia inválido'),

  body('estudiantes.*.justificacion').optional().isString(),

  body('estudiantes.*.observaciones').optional().isString(),

  body('observacionesGenerales').optional().isString(),

  body('horaInicio')
    .optional()
    .isString()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Formato de hora inválido (HH:MM)'),

  body('horaFin')
    .optional()
    .isString()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Formato de hora inválido (HH:MM)'),

  body('tipoSesion')
    .optional()
    .isIn(['CLASE', 'ACTIVIDAD', 'EVENTO', 'OTRO'])
    .withMessage('Tipo de sesión inválido'),
];

export const alertasAsistenciaValidation = [
  query('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
  query('estudianteId').optional().isMongoId().withMessage('ID de estudiante inválido'),
  query('nivel')
    .optional()
    .isIn(['ALERTA', 'CRITICO', 'INMINENTE'])
    .withMessage('Nivel de alerta inválido'),
  query('periodoId').optional().isString().notEmpty().withMessage('ID de período inválido'),
];
