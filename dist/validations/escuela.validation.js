"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualizarPeriodosValidation = exports.actualizarConfiguracionValidation = exports.actualizarEscuelaValidation = exports.crearEscuelaValidation = void 0;
const express_validator_1 = require("express-validator");
exports.crearEscuelaValidation = [
    (0, express_validator_1.body)('nombre').notEmpty().withMessage('El nombre es requerido').trim(),
    (0, express_validator_1.body)('direccion').notEmpty().withMessage('La dirección es requerida').trim(),
    (0, express_validator_1.body)('telefono').notEmpty().withMessage('El teléfono es requerido').trim(),
    (0, express_validator_1.body)('email')
        .notEmpty()
        .withMessage('El email es requerido')
        .isEmail()
        .withMessage('Email inválido')
        .trim()
        .toLowerCase(),
    (0, express_validator_1.body)('configuracion.periodos_academicos')
        .optional()
        .isInt({ min: 1 })
        .withMessage('El número de períodos debe ser al menos 1'),
    (0, express_validator_1.body)('configuracion.escala_calificacion.minima')
        .optional()
        .isFloat()
        .withMessage('La calificación mínima debe ser un número'),
    (0, express_validator_1.body)('configuracion.escala_calificacion.maxima')
        .optional()
        .isFloat()
        .withMessage('La calificación máxima debe ser un número')
        .custom((value, { req }) => {
        if (value <= req.body.configuracion?.escala_calificacion?.minima) {
            throw new Error('La calificación máxima debe ser mayor que la mínima');
        }
        return true;
    }),
    (0, express_validator_1.body)('configuracion.logros_por_periodo')
        .optional()
        .isInt({ min: 1 })
        .withMessage('El número de logros debe ser al menos 1'),
];
exports.actualizarEscuelaValidation = [
    (0, express_validator_1.body)('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío').trim(),
    (0, express_validator_1.body)('direccion').optional().notEmpty().withMessage('La dirección no puede estar vacía').trim(),
    (0, express_validator_1.body)('telefono').optional().notEmpty().withMessage('El teléfono no puede estar vacío').trim(),
    (0, express_validator_1.body)('email').optional().isEmail().withMessage('Email inválido').trim().toLowerCase(),
];
exports.actualizarConfiguracionValidation = [
    (0, express_validator_1.body)('periodos_academicos')
        .optional()
        .isInt({ min: 1 })
        .withMessage('El número de períodos debe ser al menos 1'),
    (0, express_validator_1.body)('escala_calificacion.minima')
        .optional()
        .isFloat()
        .withMessage('La calificación mínima debe ser un número'),
    (0, express_validator_1.body)('escala_calificacion.maxima')
        .optional()
        .isFloat()
        .withMessage('La calificación máxima debe ser un número')
        .custom((value, { req }) => {
        if (value <= req.body.escala_calificacion?.minima) {
            throw new Error('La calificación máxima debe ser mayor que la mínima');
        }
        return true;
    }),
    (0, express_validator_1.body)('logros_por_periodo')
        .optional()
        .isInt({ min: 1 })
        .withMessage('El número de logros debe ser al menos 1'),
];
exports.actualizarPeriodosValidation = [
    (0, express_validator_1.body)('periodos_academicos')
        .isArray()
        .withMessage('Los periodos académicos deben ser un array')
        .notEmpty()
        .withMessage('Debe incluir al menos un periodo'),
    (0, express_validator_1.body)('periodos_academicos.*.numero')
        .isInt({ min: 1 })
        .withMessage('El número de periodo debe ser positivo'),
    (0, express_validator_1.body)('periodos_academicos.*.nombre').notEmpty().withMessage('El nombre del periodo es requerido'),
    (0, express_validator_1.body)('periodos_academicos.*.fecha_inicio').isISO8601().withMessage('Fecha de inicio inválida'),
    (0, express_validator_1.body)('periodos_academicos.*.fecha_fin')
        .isISO8601()
        .withMessage('Fecha de fin inválida')
        .custom((value, { req }) => {
        const fechaInicio = new Date(req.body.fecha_inicio);
        const fechaFin = new Date(value);
        if (fechaFin <= fechaInicio) {
            throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
        }
        return true;
    }),
];
//# sourceMappingURL=escuela.validation.js.map