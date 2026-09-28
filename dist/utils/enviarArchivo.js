"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarArchivo = void 0;
const ApiError_1 = __importDefault(require("./ApiError"));
const enviarArchivo = (origen, res, next, mensajeError = 'Error al descargar el archivo') => {
    let terminado = false;
    res.on('finish', () => {
        terminado = true;
    });
    res.on('close', () => {
        if (!terminado)
            origen.destroy();
    });
    origen.on('error', (error) => {
        console.error('Error en stream de descarga:', error);
        if (!res.headersSent)
            next(new ApiError_1.default(500, mensajeError));
        else
            res.destroy();
    });
    origen.pipe(res);
};
exports.enviarArchivo = enviarArchivo;
//# sourceMappingURL=enviarArchivo.js.map