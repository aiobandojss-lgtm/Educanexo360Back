"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asociarEstudianteValidation = exports.cambiarPasswordValidation = exports.actualizarUsuarioValidation = void 0;
const express_validator_1 = require("express-validator");
exports.actualizarUsuarioValidation = [
    (0, express_validator_1.body)('nombre').optional().isString().withMessage('El nombre debe ser un texto'),
    (0, express_validator_1.body)('apellidos').optional().isString().withMessage('Los apellidos deben ser un texto'),
    (0, express_validator_1.body)('tipo')
        .optional()
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
    (0, express_validator_1.body)('estado').optional().isIn(['ACTIVO', 'INACTIVO']).withMessage('Estado no válido'),
    (0, express_validator_1.body)('perfil.telefono').optional().isString().withMessage('El teléfono debe ser un texto'),
    (0, express_validator_1.body)('perfil.direccion').optional().isString().withMessage('La dirección debe ser un texto'),
    (0, express_validator_1.body)('info_academica.grado').optional().isString().withMessage('El grado debe ser un texto'),
    (0, express_validator_1.body)('info_academica.grupo').optional().isString().withMessage('El grupo debe ser un texto'),
    (0, express_validator_1.body)('info_academica.codigo_estudiante')
        .optional()
        .isString()
        .withMessage('El código de estudiante debe ser un texto'),
    (0, express_validator_1.body)('info_academica.estudiantes_asociados')
        .optional()
        .isArray()
        .withMessage('Los estudiantes asociados deben ser un array'),
];
exports.cambiarPasswordValidation = [
    (0, express_validator_1.body)('passwordActual').notEmpty().withMessage('La contraseña actual es requerida'),
    (0, express_validator_1.body)('nuevaPassword')
        .notEmpty()
        .withMessage('La nueva contraseña es requerida')
        .isLength({ min: 6 })
        .withMessage('La nueva contraseña debe tener al menos 6 caracteres'),
];
exports.asociarEstudianteValidation = [
    (0, express_validator_1.body)('estudianteId')
        .notEmpty()
        .withMessage('El ID del estudiante es requerido')
        .isMongoId()
        .withMessage('ID de estudiante no válido'),
];
//# sourceMappingURL=usuario.validation.js.map