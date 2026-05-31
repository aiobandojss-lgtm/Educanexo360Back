"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.descargarAdjuntoValidation = exports.archivarMensajeValidation = exports.responderMensajeValidation = exports.obtenerMensajeValidation = exports.listarMensajesValidation = exports.crearMensajeValidation = void 0;
const express_validator_1 = require("express-validator");
const mongoose_1 = __importDefault(require("mongoose"));
const IMensaje_1 = require("../interfaces/IMensaje");
exports.crearMensajeValidation = [
    (0, express_validator_1.body)('asunto')
        .notEmpty()
        .withMessage('El asunto es obligatorio')
        .isString()
        .withMessage('El asunto debe ser texto')
        .isLength({ max: 255 })
        .withMessage('El asunto no debe exceder los 255 caracteres'),
    (0, express_validator_1.body)('contenido')
        .notEmpty()
        .withMessage('El contenido es obligatorio')
        .isString()
        .withMessage('El contenido debe ser texto'),
    (0, express_validator_1.body)('destinatarios')
        .optional()
        .custom((value, { req }) => {
        if (!value && !req.body.cursoIds) {
            throw new Error('Debe especificar al menos un destinatario o curso');
        }
        if (value) {
            let destinatariosArray;
            if (typeof value === 'string') {
                try {
                    destinatariosArray = JSON.parse(value);
                }
                catch (error) {
                    destinatariosArray = [value];
                }
            }
            else if (Array.isArray(value)) {
                destinatariosArray = value;
            }
            else {
                throw new Error('Formato de destinatarios inválido');
            }
            destinatariosArray.forEach((id) => {
                if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
                    throw new Error(`ID de destinatario inválido: ${id}`);
                }
            });
        }
        return true;
    }),
    (0, express_validator_1.body)('destinatariosCc')
        .optional()
        .custom((value) => {
        if (value) {
            let destinatariosCcArray;
            if (typeof value === 'string') {
                try {
                    destinatariosCcArray = JSON.parse(value);
                }
                catch (error) {
                    destinatariosCcArray = [value];
                }
            }
            else if (Array.isArray(value)) {
                destinatariosCcArray = value;
            }
            else {
                throw new Error('Formato de destinatarios CC inválido');
            }
            destinatariosCcArray.forEach((id) => {
                if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
                    throw new Error(`ID de destinatario CC inválido: ${id}`);
                }
            });
        }
        return true;
    }),
    (0, express_validator_1.body)('cursoIds')
        .optional()
        .custom((value) => {
        if (value) {
            let cursoIdsArray;
            if (typeof value === 'string') {
                try {
                    cursoIdsArray = JSON.parse(value);
                }
                catch (error) {
                    cursoIdsArray = [value];
                }
            }
            else if (Array.isArray(value)) {
                cursoIdsArray = value;
            }
            else {
                throw new Error('Formato de cursos inválido');
            }
            cursoIdsArray.forEach((id) => {
                if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
                    throw new Error(`ID de curso inválido: ${id}`);
                }
            });
        }
        return true;
    }),
    (0, express_validator_1.body)('tipo').optional().isIn(Object.values(IMensaje_1.TipoMensaje)).withMessage('Tipo de mensaje inválido'),
    (0, express_validator_1.body)('prioridad')
        .optional()
        .isIn(Object.values(IMensaje_1.PrioridadMensaje))
        .withMessage('Prioridad de mensaje inválida'),
    (0, express_validator_1.body)('estado')
        .optional()
        .isIn(Object.values(IMensaje_1.EstadoMensaje))
        .withMessage('Estado de mensaje inválido'),
    (0, express_validator_1.body)('etiquetas').optional().isArray().withMessage('Las etiquetas deben ser un array de strings'),
    (0, express_validator_1.body)('etiquetas.*').optional().isString().withMessage('Cada etiqueta debe ser un string'),
    (0, express_validator_1.body)('esRespuesta').optional().isBoolean().withMessage('esRespuesta debe ser un valor booleano'),
    (0, express_validator_1.body)('mensajeOriginalId')
        .optional()
        .custom((value) => {
        if (value && !mongoose_1.default.Types.ObjectId.isValid(value)) {
            throw new Error('ID del mensaje original inválido');
        }
        return true;
    }),
];
exports.listarMensajesValidation = [
    (0, express_validator_1.query)('bandeja')
        .optional()
        .isIn(['recibidos', 'enviados', 'borradores', 'archivados'])
        .withMessage('Bandeja inválida'),
    (0, express_validator_1.query)('pagina')
        .optional()
        .isInt({ min: 1 })
        .withMessage('La página debe ser un número entero positivo'),
    (0, express_validator_1.query)('limite')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('El límite debe ser un número entero entre 1 y 100'),
    (0, express_validator_1.query)('desde').optional().isISO8601().withMessage('La fecha "desde" debe tener formato ISO 8601'),
    (0, express_validator_1.query)('hasta').optional().isISO8601().withMessage('La fecha "hasta" debe tener formato ISO 8601'),
];
exports.obtenerMensajeValidation = [
    (0, express_validator_1.param)('id').isMongoId().withMessage('ID de mensaje inválido'),
];
exports.responderMensajeValidation = [
    (0, express_validator_1.param)('mensajeId').isMongoId().withMessage('ID de mensaje inválido'),
    (0, express_validator_1.body)('asunto')
        .optional()
        .isString()
        .withMessage('El asunto debe ser texto')
        .isLength({ max: 255 })
        .withMessage('El asunto no debe exceder los 255 caracteres'),
    (0, express_validator_1.body)('contenido')
        .notEmpty()
        .withMessage('El contenido es obligatorio')
        .isString()
        .withMessage('El contenido debe ser texto'),
    (0, express_validator_1.body)('destinatariosCc')
        .optional()
        .custom((value) => {
        if (value) {
            let destinatariosCcArray;
            if (typeof value === 'string') {
                try {
                    destinatariosCcArray = JSON.parse(value);
                }
                catch (error) {
                    destinatariosCcArray = [value];
                }
            }
            else if (Array.isArray(value)) {
                destinatariosCcArray = value;
            }
            else {
                throw new Error('Formato de destinatarios CC inválido');
            }
            destinatariosCcArray.forEach((id) => {
                if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
                    throw new Error(`ID de destinatario CC inválido: ${id}`);
                }
            });
        }
        return true;
    }),
];
exports.archivarMensajeValidation = [
    (0, express_validator_1.param)('id').isMongoId().withMessage('ID de mensaje inválido'),
];
exports.descargarAdjuntoValidation = [
    (0, express_validator_1.param)('mensajeId').isMongoId().withMessage('ID de mensaje inválido'),
    (0, express_validator_1.param)('adjuntoId').isMongoId().withMessage('ID de adjunto inválido'),
];
exports.default = {
    crearMensajeValidation: exports.crearMensajeValidation,
    listarMensajesValidation: exports.listarMensajesValidation,
    obtenerMensajeValidation: exports.obtenerMensajeValidation,
    responderMensajeValidation: exports.responderMensajeValidation,
    archivarMensajeValidation: exports.archivarMensajeValidation,
    descargarAdjuntoValidation: exports.descargarAdjuntoValidation,
};
//# sourceMappingURL=mensaje.validation.js.map