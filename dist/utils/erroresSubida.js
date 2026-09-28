"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorDeSubida = void 0;
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