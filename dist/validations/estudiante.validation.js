"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estudianteValidation = void 0;
const express_validator_1 = require("express-validator");
exports.estudianteValidation = {
    buscarEstudiantes: [
        (0, express_validator_1.query)('escuelaId')
            .notEmpty()
            .withMessage('El ID de la escuela es obligatorio')
            .isMongoId()
            .withMessage('ID de escuela inválido'),
        (0, express_validator_1.query)('nombre')
            .optional()
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
        (0, express_validator_1.query)('apellidos')
            .optional()
            .trim()
            .isLength({ min: 2, max: 50 })
            .withMessage('Los apellidos deben tener entre 2 y 50 caracteres'),
        (0, express_validator_1.query)('email')
            .optional()
            .trim()
            .isEmail()
            .withMessage('Formato de email inválido')
            .normalizeEmail(),
        (0, express_validator_1.query)('codigo_estudiante')
            .optional()
            .trim()
            .isLength({ min: 3, max: 20 })
            .withMessage('El código de estudiante debe tener entre 3 y 20 caracteres'),
        (0, express_validator_1.query)('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
    ],
    obtenerEstudiantePorId: [
        (0, express_validator_1.param)('id')
            .notEmpty()
            .withMessage('El ID del estudiante es obligatorio')
            .isMongoId()
            .withMessage('ID de estudiante inválido'),
        (0, express_validator_1.query)('escuelaId')
            .notEmpty()
            .withMessage('El ID de la escuela es obligatorio')
            .isMongoId()
            .withMessage('ID de escuela inválido'),
    ],
    verificarAsociacion: [
        (0, express_validator_1.param)('estudianteId')
            .notEmpty()
            .withMessage('El ID del estudiante es obligatorio')
            .isMongoId()
            .withMessage('ID de estudiante inválido'),
        (0, express_validator_1.body)('acudienteEmail')
            .notEmpty()
            .withMessage('El email del acudiente es obligatorio')
            .isEmail()
            .withMessage('Formato de email inválido')
            .normalizeEmail(),
        (0, express_validator_1.body)('escuelaId')
            .notEmpty()
            .withMessage('El ID de la escuela es obligatorio')
            .isMongoId()
            .withMessage('ID de escuela inválido'),
    ],
};
//# sourceMappingURL=estudiante.validation.js.map