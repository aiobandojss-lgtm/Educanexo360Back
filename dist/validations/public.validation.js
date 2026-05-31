"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearSolicitudRegistroValidation = exports.obtenerCursosDisponiblesValidation = exports.obtenerInfoCursoValidation = exports.validarCodigoInvitacionValidation = void 0;
const express_validator_1 = require("express-validator");
exports.validarCodigoInvitacionValidation = [
    (0, express_validator_1.body)('codigo')
        .notEmpty()
        .withMessage('El código de invitación es obligatorio')
        .trim()
        .isString()
        .withMessage('Formato de código inválido'),
];
exports.obtenerInfoCursoValidation = [
    (0, express_validator_1.param)('cursoId')
        .notEmpty()
        .withMessage('El ID del curso es obligatorio')
        .isMongoId()
        .withMessage('ID de curso inválido'),
    (0, express_validator_1.param)('codigoInvitacion')
        .notEmpty()
        .withMessage('El código de invitación es obligatorio')
        .trim()
        .isString()
        .withMessage('Formato de código inválido'),
];
exports.obtenerCursosDisponiblesValidation = [
    (0, express_validator_1.param)('codigoInvitacion')
        .notEmpty()
        .withMessage('El código de invitación es obligatorio')
        .trim()
        .isString()
        .withMessage('Formato de código inválido'),
];
exports.crearSolicitudRegistroValidation = [
    (0, express_validator_1.body)('invitacionId')
        .notEmpty()
        .withMessage('El ID de invitación es obligatorio')
        .isMongoId()
        .withMessage('ID de invitación inválido'),
    (0, express_validator_1.body)('nombre')
        .notEmpty()
        .withMessage('El nombre es obligatorio')
        .trim()
        .isString()
        .withMessage('Formato de nombre inválido'),
    (0, express_validator_1.body)('apellidos')
        .notEmpty()
        .withMessage('Los apellidos son obligatorios')
        .trim()
        .isString()
        .withMessage('Formato de apellidos inválido'),
    (0, express_validator_1.body)('email')
        .notEmpty()
        .withMessage('El email es obligatorio')
        .trim()
        .isEmail()
        .withMessage('Formato de email inválido')
        .normalizeEmail(),
    (0, express_validator_1.body)('telefono').optional().trim().isString().withMessage('Formato de teléfono inválido'),
    (0, express_validator_1.body)('estudiantes').isArray({ min: 1 }).withMessage('Debe incluir al menos un estudiante'),
    (0, express_validator_1.body)('estudiantes.*.nombre')
        .notEmpty()
        .withMessage('El nombre del estudiante es obligatorio')
        .trim()
        .isString()
        .withMessage('Formato de nombre de estudiante inválido'),
    (0, express_validator_1.body)('estudiantes.*.apellidos')
        .notEmpty()
        .withMessage('Los apellidos del estudiante son obligatorios')
        .trim()
        .isString()
        .withMessage('Formato de apellidos de estudiante inválido'),
    (0, express_validator_1.body)('estudiantes.*.fechaNacimiento')
        .optional()
        .isISO8601()
        .withMessage('Formato de fecha de nacimiento inválido'),
    (0, express_validator_1.body)('estudiantes.*.cursoId')
        .notEmpty()
        .withMessage('El ID del curso es obligatorio')
        .isMongoId()
        .withMessage('ID de curso inválido'),
    (0, express_validator_1.body)('estudiantes.*.email')
        .optional({ checkFalsy: true })
        .trim()
        .isEmail()
        .withMessage('Formato de email de estudiante inválido')
        .normalizeEmail(),
];
//# sourceMappingURL=public.validation.js.map