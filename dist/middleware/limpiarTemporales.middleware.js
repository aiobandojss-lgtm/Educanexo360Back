"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.limpiarTemporales = void 0;
const fs_1 = __importDefault(require("fs"));
const limpiarTemporales = (req, res, next) => {
    let limpiado = false;
    const limpiar = () => {
        if (limpiado)
            return;
        limpiado = true;
        const archivos = [];
        if (req.file)
            archivos.push(req.file);
        const files = req.files;
        if (Array.isArray(files))
            archivos.push(...files);
        else if (files && typeof files === 'object')
            Object.values(files).forEach((l) => archivos.push(...l));
        archivos
            .filter((f) => f && typeof f.path === 'string')
            .forEach((f) => fs_1.default.promises.unlink(f.path).catch(() => undefined));
    };
    res.on('finish', limpiar);
    res.on('close', limpiar);
    next();
};
exports.limpiarTemporales = limpiarTemporales;
//# sourceMappingURL=limpiarTemporales.middleware.js.map