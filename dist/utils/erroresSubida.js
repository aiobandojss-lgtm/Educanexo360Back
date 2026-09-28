"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorDeSubida = exports.subidaConLimites = exports.errorDeSubidaConLimites = exports.bytesMaximos = exports.LIMITES_SUBIDA = void 0;
const multer_1 = __importDefault(require("multer"));
const ApiError_1 = __importDefault(require("./ApiError"));
const MENSAJES_MULTER = {
    LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido',
    LIMIT_FILE_COUNT: 'Se enviaron más archivos de los permitidos',
    LIMIT_UNEXPECTED_FILE: 'Se envió un archivo en un campo no esperado o más archivos de los permitidos',
    LIMIT_PART_COUNT: 'La solicitud tiene demasiadas partes',
    LIMIT_FIELD_KEY: 'Un nombre de campo es demasiado largo',
    LIMIT_FIELD_VALUE: 'Un campo del formulario es demasiado largo',
    LIMIT_FIELD_COUNT: 'La solicitud tiene demasiados campos',
};
const MULTIPART_MAL_FORMADO = /Malformed part header|Unexpected end of form|Multipart: Boundary not found|Malformed urlencoded form|Unexpected end of multipart/i;
exports.LIMITES_SUBIDA = {
    anuncios: { campo: 'archivos', maxArchivos: 5, maxMB: 10 },
    tareas: { campo: 'archivos', maxArchivos: 5, maxMB: 10 },
    mensajes: { campo: 'adjuntos', maxArchivos: 5, maxMB: 5 },
    calendario: { campo: 'archivo', maxArchivos: 1, maxMB: 5 },
};
const bytesMaximos = (l) => l.maxMB * 1024 * 1024;
exports.bytesMaximos = bytesMaximos;
const mensajeCantidad = (l) => l.maxArchivos === 1 ? 'Solo se permite 1 archivo' : `Máximo ${l.maxArchivos} archivos`;
const errorDeSubidaConLimites = (err, l) => {
    if (err instanceof multer_1.default.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            const sujeto = l.maxArchivos === 1 ? 'El archivo' : 'Cada archivo';
            return new ApiError_1.default(400, `${sujeto} puede pesar máximo ${l.maxMB} MB`, true);
        }
        if (err.code === 'LIMIT_FILE_COUNT')
            return new ApiError_1.default(400, mensajeCantidad(l), true);
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            if (err.field === l.campo)
                return new ApiError_1.default(400, mensajeCantidad(l), true);
            return new ApiError_1.default(400, `Campo de archivo no esperado: '${err.field}' (use '${l.campo}')`, true);
        }
    }
    return (0, exports.errorDeSubida)(err) || err;
};
exports.errorDeSubidaConLimites = errorDeSubidaConLimites;
const subidaConLimites = (l, middleware) => (req, res, next) => middleware(req, res, (err) => (err ? next((0, exports.errorDeSubidaConLimites)(err, l)) : next()));
exports.subidaConLimites = subidaConLimites;
const errorDeSubida = (err) => {
    if (err instanceof multer_1.default.MulterError) {
        return new ApiError_1.default(400, MENSAJES_MULTER[err.code] || 'La subida de archivos no es válida', true);
    }
    if (MULTIPART_MAL_FORMADO.test(String(err?.message || ''))) {
        return new ApiError_1.default(400, 'La solicitud de archivos está mal formada', true);
    }
    return null;
};
exports.errorDeSubida = errorDeSubida;
//# sourceMappingURL=erroresSubida.js.map