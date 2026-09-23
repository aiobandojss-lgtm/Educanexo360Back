"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordValidation = exports.forgotPasswordValidation = exports.refreshTokenValidation = exports.registerValidation = exports.loginValidation = void 0;
const express_validator_1 = require("express-validator");
exports.loginValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Debe proporcionar un email válido'),
    (0, express_validator_1.body)('password').notEmpty().withMessage('La contraseña es requerida'),
];
exports.registerValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Debe proporcionar un email válido'),
    (0, express_validator_1.body)('password')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener al menos 6 caracteres'),
    (0, express_validator_1.body)('nombre').notEmpty().withMessage('El nombre es requerido'),
    (0, express_validator_1.body)('apellidos').notEmpty().withMessage('Los apellidos son requeridos'),
    (0, express_validator_1.body)('tipo')
        .isIn([
        'SUPER_ADMIN',
        'ADMIN',
        'DOCENTE',
        'ACUDIENTE',
        'ESTUDIANTE',
        'COORDINADOR',
        'RECTOR',
        'ADMINISTRATIVO',
    ])
        .withMessage('Tipo de usuario no válido'),
    (0, express_validator_1.body)('escuelaId').optional({ values: 'falsy' }).isMongoId().withMessage('Escuela no válida'),
    (0, express_validator_1.body)('estado').optional().isIn(['ACTIVO', 'INACTIVO']).withMessage('Estado no válido'),
];
exports.refreshTokenValidation = [
    (0, express_validator_1.body)('refreshToken').notEmpty().withMessage('El token de refresco es requerido'),
];
exports.forgotPasswordValidation = [
    (0, express_validator_1.body)('email')
        .isEmail()
        .withMessage('Debe proporcionar un correo electrónico válido')
        .normalizeEmail()
        .trim()
        .escape(),
];
exports.resetPasswordValidation = [
    (0, express_validator_1.body)('token')
        .isString()
        .withMessage('Token es requerido')
        .trim()
        .isLength({ min: 32, max: 64 })
        .withMessage('El token no tiene el formato correcto'),
    (0, express_validator_1.body)('password')
        .isString()
        .withMessage('La contraseña es requerida')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener al menos 6 caracteres')
        .matches(/\d/)
        .withMessage('La contraseña debe contener al menos un número')
        .trim(),
];
//# sourceMappingURL=auth.validation.js.map