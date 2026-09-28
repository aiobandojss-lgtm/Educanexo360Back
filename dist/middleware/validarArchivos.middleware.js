"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarArchivos = void 0;
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const tipoArchivo_1 = require("../utils/tipoArchivo");
const validarArchivos = async (req, _res, next) => {
    try {
        const r = req;
        const archivos = [];
        if (r.file)
            archivos.push(r.file);
        if (Array.isArray(r.files))
            archivos.push(...r.files);
        else if (r.files && typeof r.files === 'object')
            Object.values(r.files).forEach((l) => archivos.push(...l));
        for (const archivo of archivos) {
            const v = await (0, tipoArchivo_1.validarArchivo)(archivo.path, archivo.originalname);
            if (!v.valido) {
                next(new ApiError_1.default(400, v.mensaje || 'Archivo no permitido'));
                return;
            }
            archivo.mimetype = v.mime;
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.validarArchivos = validarArchivos;
//# sourceMappingURL=validarArchivos.middleware.js.map