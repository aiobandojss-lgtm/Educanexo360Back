"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removerEstudiantesValidation = exports.agregarEstudiantesValidation = exports.actualizarCursoValidation = exports.crearCursoValidation = void 0;
const express_validator_1 = require("express-validator");
const mongoose_1 = __importDefault(require("mongoose"));
exports.crearCursoValidation = [
    (0, express_validator_1.body)('nombre')
        .trim()
        .notEmpty()
        .withMessage('El nombre del curso es requerido')
        .isLength({ max: 50 })
        .withMessage('El nombre no puede exceder los 50 caracteres'),
    (0, express_validator_1.body)('nivel').trim().notEmpty().withMessage('El nivel es requerido'),
    (0, express_validator_1.body)('año_academico')
        .trim()
        .notEmpty()
        .withMessage('El año académico es requerido')
        .matches(/^\d{4}$/)
        .withMessage('El año académico debe tener formato YYYY'),
    (0, express_validator_1.body)('director_grupo')
        .notEmpty()
        .withMessage('El director de grupo es requerido')
        .custom((value) => {
        return (mongoose_1.default.Types.ObjectId.isValid(value) || new Error('ID de director de grupo inválido'));
    }),
];
exports.actualizarCursoValidation = [
    (0, express_validator_1.body)('nombre')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('El nombre no puede estar vacío')
        .isLength({ max: 50 })
        .withMessage('El nombre no puede exceder los 50 caracteres'),
    (0, express_validator_1.body)('nivel').optional().trim().notEmpty().withMessage('El nivel no puede estar vacío'),
    (0, express_validator_1.body)('año_academico')
        .optional()
        .trim()
        .matches(/^\d{4}$/)
        .withMessage('El año académico debe tener formato YYYY'),
    (0, express_validator_1.body)('director_grupo')
        .optional()
        .custom((value) => {
        return (mongoose_1.default.Types.ObjectId.isValid(value) || new Error('ID de director de grupo inválido'));
    }),
];
exports.agregarEstudiantesValidation = [
    (0, express_validator_1.body)('estudiantes')
        .isArray()
        .withMessage('Estudiantes debe ser un array')
        .notEmpty()
        .withMessage('Debe proporcionar al menos un estudiante')
        .custom((estudiantes) => {
        const todosValidos = estudiantes.every((id) => mongoose_1.default.Types.ObjectId.isValid(id));
        if (!todosValidos) {
            throw new Error('Uno o más IDs de estudiantes son inválidos');
        }
        return true;
    }),
];
exports.removerEstudiantesValidation = [
    (0, express_validator_1.body)('estudiantes')
        .isArray()
        .withMessage('Estudiantes debe ser un array')
        .notEmpty()
        .withMessage('Debe proporcionar al menos un estudiante')
        .custom((estudiantes) => {
        const todosValidos = estudiantes.every((id) => mongoose_1.default.Types.ObjectId.isValid(id));
        if (!todosValidos) {
            throw new Error('Uno o más IDs de estudiantes son inválidos');
        }
        return true;
    }),
];
//# sourceMappingURL=curso.validation.js.map