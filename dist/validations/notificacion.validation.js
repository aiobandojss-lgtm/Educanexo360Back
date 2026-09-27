"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearNotificacionValidation = exports.desregistrarTokenValidation = exports.registrarTokenValidation = void 0;
const express_validator_1 = require("express-validator");
exports.registrarTokenValidation = [
    (0, express_validator_1.body)('fcmToken')
        .optional({ values: 'null' })
        .isString()
        .withMessage('Token FCM es requerido')
        .trim()
        .isLength({ min: 1, max: 4096 })
        .withMessage('Token FCM inválido')
        .matches(/^[A-Za-z0-9:_.-]+$/)
        .withMessage('Token FCM inválido'),
    (0, express_validator_1.body)('platform').optional().isIn(['ios', 'android']).withMessage('Platform debe ser "ios" o "android"'),
];
exports.desregistrarTokenValidation = [
    (0, express_validator_1.body)('fcmToken')
        .optional({ values: 'null' })
        .isString()
        .withMessage('Token FCM es requerido')
        .trim()
        .isLength({ min: 1, max: 4096 })
        .withMessage('Token FCM inválido')
        .matches(/^[A-Za-z0-9:_.-]+$/)
        .withMessage('Token FCM inválido'),
];
exports.crearNotificacionValidation = [
    (0, express_validator_1.body)('entidadTipo').optional().not().equals('Mensaje').withMessage("No se pueden crear notificaciones de tipo 'Mensaje'"),
];
//# sourceMappingURL=notificacion.validation.js.map