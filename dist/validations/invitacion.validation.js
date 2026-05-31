"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitacionValidation = void 0;
const express_validator_1 = require("express-validator");
const invitacion_model_1 = require("../models/invitacion.model");
exports.invitacionValidation = {
    crearInvitacion: [
        (0, express_validator_1.body)('tipo').isIn(Object.values(invitacion_model_1.TipoInvitacion)).withMessage('Tipo de invitación no válido'),
        (0, express_validator_1.body)('cursoId').optional().isMongoId().withMessage('ID de curso no válido'),
        (0, express_validator_1.body)('estudianteId').optional().isMongoId().withMessage('ID de estudiante no válido'),
        (0, express_validator_1.body)('cantidadUsos')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('La cantidad de usos debe ser un número entre 1 y 100'),
        (0, express_validator_1.body)('fechaExpiracion').optional().isISO8601().withMessage('Fecha de expiración no válida'),
    ],
    validarCodigo: [
        (0, express_validator_1.body)('codigo').notEmpty().withMessage('El código de invitación es requerido').trim(),
    ],
};
//# sourceMappingURL=invitacion.validation.js.map