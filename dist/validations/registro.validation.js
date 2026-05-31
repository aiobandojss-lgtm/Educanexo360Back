"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registroValidation = void 0;
const express_validator_1 = require("express-validator");
const validarEmailsEstudiantes = (0, express_validator_1.body)('estudiantes').custom((estudiantes, { req }) => {
    if (!Array.isArray(estudiantes)) {
        throw new Error('Estudiantes debe ser un array');
    }
    const emailsEstudiantes = estudiantes
        .map((est) => est.email)
        .filter((email) => email && email.trim() !== '');
    const emailsUnicos = new Set(emailsEstudiantes.map((email) => email.toLowerCase()));
    if (emailsUnicos.size !== emailsEstudiantes.length) {
        throw new Error('No se pueden registrar múltiples estudiantes con el mismo correo electrónico');
    }
    return true;
});
exports.registroValidation = {
    crearSolicitud: [
        (0, express_validator_1.body)('invitacionId').isMongoId().withMessage('ID de invitación no válido'),
        (0, express_validator_1.body)('nombre').notEmpty().withMessage('El nombre es requerido').trim(),
        (0, express_validator_1.body)('apellidos').notEmpty().withMessage('Los apellidos son requeridos').trim(),
        (0, express_validator_1.body)('email').isEmail().withMessage('Email no válido').normalizeEmail(),
        (0, express_validator_1.body)('estudiantes').isArray({ min: 1 }).withMessage('Debe incluir al menos un estudiante'),
        (0, express_validator_1.body)('estudiantes.*.nombre')
            .notEmpty()
            .withMessage('El nombre del estudiante es requerido')
            .trim(),
        (0, express_validator_1.body)('estudiantes.*.apellidos')
            .notEmpty()
            .withMessage('Los apellidos del estudiante son requeridos')
            .trim(),
        (0, express_validator_1.body)('estudiantes.*.cursoId').isMongoId().withMessage('ID de curso no válido'),
        (0, express_validator_1.body)('estudiantes.*.email')
            .optional()
            .isEmail()
            .withMessage('Email de estudiante no válido')
            .normalizeEmail(),
        (0, express_validator_1.body)('estudiantes.*.codigo_estudiante').optional().trim(),
        validarEmailsEstudiantes,
    ],
    rechazarSolicitud: [
        (0, express_validator_1.body)('motivo').notEmpty().withMessage('El motivo del rechazo es requerido').trim(),
    ],
};
//# sourceMappingURL=registro.validation.js.map