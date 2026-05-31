"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertasAsistenciaValidation = exports.actualizarAsistenciaValidation = exports.crearAsistenciaValidation = void 0;
const express_validator_1 = require("express-validator");
const IAsistencia_1 = require("../interfaces/IAsistencia");
exports.crearAsistenciaValidation = [
    (0, express_validator_1.body)('fecha')
        .notEmpty()
        .withMessage('La fecha es requerida')
        .isISO8601()
        .withMessage('La fecha debe tener un formato válido'),
    (0, express_validator_1.body)('cursoId')
        .notEmpty()
        .withMessage('El ID del curso es requerido')
        .isMongoId()
        .withMessage('ID de curso inválido'),
    (0, express_validator_1.body)('asignaturaId').optional().isMongoId().withMessage('ID de asignatura inválido'),
    (0, express_validator_1.body)('tipoSesion')
        .optional()
        .isIn(['CLASE', 'ACTIVIDAD', 'EVENTO', 'OTRO'])
        .withMessage('Tipo de sesión inválido'),
    (0, express_validator_1.body)('horaInicio')
        .optional()
        .isString()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Formato de hora inválido (HH:MM)'),
    (0, express_validator_1.body)('horaFin')
        .optional()
        .isString()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Formato de hora inválido (HH:MM)'),
    (0, express_validator_1.body)('estudiantes').optional().isArray().withMessage('Los estudiantes deben ser un array'),
    (0, express_validator_1.body)('estudiantes.*.estudianteId')
        .optional()
        .isMongoId()
        .withMessage('ID de estudiante inválido'),
    (0, express_validator_1.body)('estudiantes.*.estado')
        .optional()
        .isIn(Object.values(IAsistencia_1.EstadoAsistencia))
        .withMessage('Estado de asistencia inválido'),
    (0, express_validator_1.body)('observacionesGenerales').optional().isString(),
];
exports.actualizarAsistenciaValidation = [
    (0, express_validator_1.body)('estudiantes').optional().isArray().withMessage('Los estudiantes deben ser un array'),
    (0, express_validator_1.body)('estudiantes.*.estudianteId').isMongoId().withMessage('ID de estudiante inválido'),
    (0, express_validator_1.body)('estudiantes.*.estado')
        .isIn(Object.values(IAsistencia_1.EstadoAsistencia))
        .withMessage('Estado de asistencia inválido'),
    (0, express_validator_1.body)('estudiantes.*.justificacion').optional().isString(),
    (0, express_validator_1.body)('estudiantes.*.observaciones').optional().isString(),
    (0, express_validator_1.body)('observacionesGenerales').optional().isString(),
    (0, express_validator_1.body)('horaInicio')
        .optional()
        .isString()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Formato de hora inválido (HH:MM)'),
    (0, express_validator_1.body)('horaFin')
        .optional()
        .isString()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
        .withMessage('Formato de hora inválido (HH:MM)'),
    (0, express_validator_1.body)('tipoSesion')
        .optional()
        .isIn(['CLASE', 'ACTIVIDAD', 'EVENTO', 'OTRO'])
        .withMessage('Tipo de sesión inválido'),
];
exports.alertasAsistenciaValidation = [
    (0, express_validator_1.query)('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
    (0, express_validator_1.query)('estudianteId').optional().isMongoId().withMessage('ID de estudiante inválido'),
    (0, express_validator_1.query)('nivel')
        .optional()
        .isIn(['ALERTA', 'CRITICO', 'INMINENTE'])
        .withMessage('Nivel de alerta inválido'),
    (0, express_validator_1.query)('periodoId').optional().isString().notEmpty().withMessage('ID de período inválido'),
];
//# sourceMappingURL=asistencia.validation.js.map