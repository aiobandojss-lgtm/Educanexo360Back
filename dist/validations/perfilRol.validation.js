"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removerPerfilRolValidation = exports.asignarPerfilRolValidation = exports.actualizarPerfilRolValidation = exports.crearPerfilRolValidation = void 0;
const express_validator_1 = require("express-validator");
const mongoose_1 = __importDefault(require("mongoose"));
const permissions_1 = require("../constants/permissions");
const ROLES_BASE_VALIDOS = ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'];
exports.crearPerfilRolValidation = [
    (0, express_validator_1.body)('nombre')
        .trim()
        .notEmpty()
        .withMessage('El nombre del perfil es requerido')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede exceder 100 caracteres'),
    (0, express_validator_1.body)('descripcion')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres'),
    (0, express_validator_1.body)('rolBase')
        .notEmpty()
        .withMessage('El rol base es requerido')
        .isIn(ROLES_BASE_VALIDOS)
        .withMessage(`El rol base debe ser uno de: ${ROLES_BASE_VALIDOS.join(', ')}`),
    (0, express_validator_1.body)('permisos')
        .isArray()
        .withMessage('Los permisos deben ser un array')
        .custom((permisos) => {
        const invalidos = permisos.filter((p) => !permissions_1.ALL_PERMISSIONS.includes(p));
        if (invalidos.length > 0) {
            throw new Error(`Permisos no válidos: ${invalidos.join(', ')}`);
        }
        return true;
    }),
];
exports.actualizarPerfilRolValidation = [
    (0, express_validator_1.body)('nombre')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('El nombre no puede estar vacío')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede exceder 100 caracteres'),
    (0, express_validator_1.body)('descripcion')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres'),
    (0, express_validator_1.body)('permisos')
        .optional()
        .isArray()
        .withMessage('Los permisos deben ser un array')
        .custom((permisos) => {
        const invalidos = permisos.filter((p) => !permissions_1.ALL_PERMISSIONS.includes(p));
        if (invalidos.length > 0) {
            throw new Error(`Permisos no válidos: ${invalidos.join(', ')}`);
        }
        return true;
    }),
    (0, express_validator_1.body)('activo')
        .optional()
        .isBoolean()
        .withMessage('activo debe ser un booleano'),
];
exports.asignarPerfilRolValidation = [
    (0, express_validator_1.param)('usuarioId')
        .custom((value) => {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new Error('ID de usuario inválido');
        }
        return true;
    }),
    (0, express_validator_1.body)('perfilRolId')
        .notEmpty()
        .withMessage('El perfilRolId es requerido')
        .custom((value) => {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new Error('ID de perfil de rol inválido');
        }
        return true;
    }),
];
exports.removerPerfilRolValidation = [
    (0, express_validator_1.param)('usuarioId')
        .custom((value) => {
        if (!mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new Error('ID de usuario inválido');
        }
        return true;
    }),
];
//# sourceMappingURL=perfilRol.validation.js.map