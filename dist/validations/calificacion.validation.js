"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualizarCalificacionLogroValidation = exports.agregarCalificacionLogroValidation = exports.actualizarCalificacionValidation = exports.crearCalificacionValidation = void 0;
const express_validator_1 = require("express-validator");
exports.crearCalificacionValidation = [
    (0, express_validator_1.body)('estudianteId')
        .notEmpty()
        .withMessage('El estudiante es requerido')
        .isMongoId()
        .withMessage('ID de estudiante inválido'),
    (0, express_validator_1.body)('asignaturaId')
        .notEmpty()
        .withMessage('La asignatura es requerida')
        .isMongoId()
        .withMessage('ID de asignatura inválido'),
    (0, express_validator_1.body)('cursoId')
        .notEmpty()
        .withMessage('El curso es requerido')
        .isMongoId()
        .withMessage('ID de curso inválido'),
    (0, express_validator_1.body)('periodo')
        .notEmpty()
        .withMessage('El periodo es requerido')
        .isInt({ min: 1 })
        .withMessage('El periodo debe ser un número positivo'),
    (0, express_validator_1.body)('año_academico')
        .notEmpty()
        .withMessage('El año académico es requerido')
        .matches(/^\d{4}$/)
        .withMessage('Formato de año académico inválido'),
    (0, express_validator_1.body)('calificaciones_logros')
        .optional()
        .isArray()
        .withMessage('Las calificaciones deben ser un array'),
    (0, express_validator_1.body)('calificaciones_logros.*.logroId')
        .optional()
        .isMongoId()
        .withMessage('ID de logro inválido'),
    (0, express_validator_1.body)('calificaciones_logros.*.calificacion')
        .optional()
        .isFloat({ min: 0, max: 5 })
        .withMessage('La calificación debe estar entre 0 y 5'),
    (0, express_validator_1.body)('observaciones').optional().isString().withMessage('Las observaciones deben ser texto'),
];
exports.actualizarCalificacionValidation = [
    (0, express_validator_1.body)('calificaciones_logros')
        .optional()
        .isArray()
        .withMessage('Las calificaciones deben ser un array'),
    (0, express_validator_1.body)('calificaciones_logros.*.logroId')
        .optional()
        .isMongoId()
        .withMessage('ID de logro inválido'),
    (0, express_validator_1.body)('calificaciones_logros.*.calificacion')
        .optional()
        .isFloat({ min: 0, max: 5 })
        .withMessage('La calificación debe estar entre 0 y 5'),
    (0, express_validator_1.body)('observaciones').optional().isString().withMessage('Las observaciones deben ser texto'),
];
exports.agregarCalificacionLogroValidation = [
    (0, express_validator_1.body)('logroId')
        .notEmpty()
        .withMessage('El logro es requerido')
        .isMongoId()
        .withMessage('ID de logro inválido'),
    (0, express_validator_1.body)('calificacion')
        .notEmpty()
        .withMessage('La calificación es requerida')
        .isFloat({ min: 0, max: 5 })
        .withMessage('La calificación debe estar entre 0 y 5'),
    (0, express_validator_1.body)('observacion').optional().isString().withMessage('La observación debe ser texto'),
];
exports.actualizarCalificacionLogroValidation = [
    (0, express_validator_1.body)('logroId')
        .notEmpty()
        .withMessage('El logro es requerido')
        .isMongoId()
        .withMessage('ID de logro inválido'),
    (0, express_validator_1.body)('calificacion')
        .notEmpty()
        .withMessage('La calificación es requerida')
        .isFloat({ min: 0, max: 5 })
        .withMessage('La calificación debe estar entre 0 y 5'),
    (0, express_validator_1.body)('observacion').optional().isString().withMessage('La observación debe ser texto'),
];
//# sourceMappingURL=calificacion.validation.js.map