"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualizarLogroValidation = exports.crearLogroValidation = void 0;
const express_validator_1 = require("express-validator");
exports.crearLogroValidation = [
    (0, express_validator_1.body)('nombre').notEmpty().withMessage('El nombre es requerido').trim(),
    (0, express_validator_1.body)('descripcion').notEmpty().withMessage('La descripción es requerida').trim(),
    (0, express_validator_1.body)('tipo')
        .notEmpty()
        .withMessage('El tipo es requerido')
        .isIn(['COGNITIVO', 'PROCEDIMENTAL', 'ACTITUDINAL'])
        .withMessage('Tipo de logro inválido'),
    (0, express_validator_1.body)('porcentaje')
        .notEmpty()
        .withMessage('El porcentaje es requerido')
        .isFloat({ min: 0, max: 100 })
        .withMessage('El porcentaje debe estar entre 0 y 100'),
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
        .withMessage('El periodo debe ser mayor a 0'),
    (0, express_validator_1.body)('año_academico')
        .notEmpty()
        .withMessage('El año académico es requerido')
        .matches(/^\d{4}$/)
        .withMessage('Formato de año académico inválido'),
];
exports.actualizarLogroValidation = [
    (0, express_validator_1.body)('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío').trim(),
    (0, express_validator_1.body)('descripcion')
        .optional()
        .notEmpty()
        .withMessage('La descripción no puede estar vacía')
        .trim(),
    (0, express_validator_1.body)('tipo')
        .optional()
        .isIn(['COGNITIVO', 'PROCEDIMENTAL', 'ACTITUDINAL'])
        .withMessage('Tipo de logro inválido'),
    (0, express_validator_1.body)('porcentaje')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('El porcentaje debe estar entre 0 y 100'),
    (0, express_validator_1.body)('estado').optional().isIn(['ACTIVO', 'INACTIVO']).withMessage('Estado inválido'),
];
//# sourceMappingURL=logro.validation.js.map