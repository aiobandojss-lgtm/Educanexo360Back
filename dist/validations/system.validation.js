"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemInitializeValidation = void 0;
const express_validator_1 = require("express-validator");
exports.systemInitializeValidation = [
    (0, express_validator_1.body)('escuela.nombre').notEmpty().withMessage('El nombre de la escuela es requerido'),
    (0, express_validator_1.body)('escuela.codigo').notEmpty().withMessage('El código de la escuela es requerido'),
    (0, express_validator_1.body)('escuela.direccion').notEmpty().withMessage('La dirección es requerida'),
    (0, express_validator_1.body)('escuela.telefono').notEmpty().withMessage('El teléfono es requerido'),
    (0, express_validator_1.body)('escuela.email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('escuela.sitioWeb')
        .optional({ checkFalsy: true })
        .custom((value) => {
        if (!value)
            return true;
        if (!/^https?:\/\//i.test(value)) {
            value = 'http://' + value;
        }
        try {
            new URL(value);
            return true;
        }
        catch (e) {
            return false;
        }
    })
        .withMessage('La URL del sitio web debe tener un formato válido (ej: http://ejemplo.com)'),
    (0, express_validator_1.body)('escuela.configuracion.periodos_academicos')
        .isInt({ min: 1, max: 6 })
        .withMessage('Los periodos académicos deben ser entre 1 y 6'),
    (0, express_validator_1.body)('escuela.configuracion.escala_calificacion.minima')
        .isNumeric()
        .withMessage('La calificación mínima debe ser numérica'),
    (0, express_validator_1.body)('escuela.configuracion.escala_calificacion.maxima')
        .isNumeric()
        .withMessage('La calificación máxima debe ser numérica')
        .custom((value, { req }) => {
        const min = req.body.escuela.configuracion.escala_calificacion.minima;
        return value > min;
    })
        .withMessage('La calificación máxima debe ser mayor que la mínima'),
    (0, express_validator_1.body)('admin.nombre').notEmpty().withMessage('El nombre es requerido'),
    (0, express_validator_1.body)('admin.apellidos').notEmpty().withMessage('Los apellidos son requeridos'),
    (0, express_validator_1.body)('admin.email').isEmail().withMessage('Email inválido'),
    (0, express_validator_1.body)('admin.password')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener al menos 6 caracteres'),
];
//# sourceMappingURL=system.validation.js.map