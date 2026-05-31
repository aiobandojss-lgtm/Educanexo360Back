"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmarAsistenciaValidation = exports.actualizarEventoValidation = exports.crearEventoValidation = void 0;
const express_validator_1 = require("express-validator");
const ICalendario_1 = require("../interfaces/ICalendario");
exports.crearEventoValidation = [
    (0, express_validator_1.body)('titulo')
        .notEmpty()
        .withMessage('El título es requerido')
        .isLength({ max: 100 })
        .withMessage('El título no puede exceder los 100 caracteres')
        .trim(),
    (0, express_validator_1.body)('descripcion').notEmpty().withMessage('La descripción es requerida').trim(),
    (0, express_validator_1.body)('fechaInicio')
        .notEmpty()
        .withMessage('La fecha de inicio es requerida')
        .isISO8601()
        .withMessage('La fecha de inicio debe ser válida'),
    (0, express_validator_1.body)('fechaFin')
        .notEmpty()
        .withMessage('La fecha de fin es requerida')
        .isISO8601()
        .withMessage('La fecha de fin debe ser válida')
        .custom((value, { req }) => {
        const fechaInicio = new Date(req.body.fechaInicio);
        const fechaFin = new Date(value);
        if (fechaFin < fechaInicio) {
            throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
        }
        return true;
    }),
    (0, express_validator_1.body)('todoElDia').optional().isBoolean().withMessage('Debe ser un valor booleano'),
    (0, express_validator_1.body)('lugar').optional().trim(),
    (0, express_validator_1.body)('tipo').optional().isIn(Object.values(ICalendario_1.TipoEvento)).withMessage('Tipo de evento no válido'),
    (0, express_validator_1.body)('estado')
        .optional()
        .isIn(Object.values(ICalendario_1.EstadoEvento))
        .withMessage('Estado de evento no válido'),
    (0, express_validator_1.body)('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
    (0, express_validator_1.body)('color')
        .optional()
        .matches(/^#[0-9A-F]{6}$/i)
        .withMessage('El color debe estar en formato hexadecimal (#RRGGBB)'),
    (0, express_validator_1.body)('invitados').optional().isArray().withMessage('Invitados debe ser un array'),
    (0, express_validator_1.body)('invitados.*.usuarioId')
        .optional()
        .isMongoId()
        .withMessage('ID de usuario invitado inválido'),
    (0, express_validator_1.body)('recordatorios').optional().isArray().withMessage('Recordatorios debe ser un array'),
    (0, express_validator_1.body)('recordatorios.*.tiempo')
        .optional()
        .isInt({ min: 0 })
        .withMessage('El tiempo debe ser un número positivo'),
    (0, express_validator_1.body)('recordatorios.*.tipo')
        .optional()
        .isIn(['EMAIL', 'NOTIFICACION', 'AMBOS'])
        .withMessage('Tipo de recordatorio no válido'),
];
exports.actualizarEventoValidation = [
    (0, express_validator_1.body)('titulo')
        .optional()
        .notEmpty()
        .withMessage('El título no puede estar vacío')
        .isLength({ max: 100 })
        .withMessage('El título no puede exceder los 100 caracteres')
        .trim(),
    (0, express_validator_1.body)('descripcion')
        .optional()
        .notEmpty()
        .withMessage('La descripción no puede estar vacía')
        .trim(),
    (0, express_validator_1.body)('fechaInicio').optional().isISO8601().withMessage('La fecha de inicio debe ser válida'),
    (0, express_validator_1.body)('fechaFin')
        .optional()
        .isISO8601()
        .withMessage('La fecha de fin debe ser válida')
        .custom((value, { req }) => {
        if (req.body.fechaInicio) {
            const fechaInicio = new Date(req.body.fechaInicio);
            const fechaFin = new Date(value);
            if (fechaFin < fechaInicio) {
                throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
            }
        }
        return true;
    }),
    (0, express_validator_1.body)('todoElDia').optional().isBoolean().withMessage('Debe ser un valor booleano'),
    (0, express_validator_1.body)('lugar').optional().trim(),
    (0, express_validator_1.body)('tipo').optional().isIn(Object.values(ICalendario_1.TipoEvento)).withMessage('Tipo de evento no válido'),
    (0, express_validator_1.body)('estado')
        .optional()
        .isIn(Object.values(ICalendario_1.EstadoEvento))
        .withMessage('Estado de evento no válido'),
    (0, express_validator_1.body)('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
    (0, express_validator_1.body)('color')
        .optional()
        .matches(/^#[0-9A-F]{6}$/i)
        .withMessage('El color debe estar en formato hexadecimal (#RRGGBB)'),
];
exports.confirmarAsistenciaValidation = [
    (0, express_validator_1.body)('confirmado').isBoolean().withMessage('El estado de confirmación debe ser un booleano'),
];
//# sourceMappingURL=calendario.validation.js.map