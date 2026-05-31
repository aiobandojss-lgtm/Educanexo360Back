"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerAsignaturasNoAsignadasAlCurso = void 0;
const asignatura_model_1 = __importDefault(require("../models/asignatura.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const obtenerAsignaturasNoAsignadasAlCurso = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new ApiError_1.default(401, 'No autorizado');
        }
        const result = await asignatura_model_1.default.find({ escuelaId: req.user.escuelaId });
        return res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error obteniendo asignaturas disponibles:', error);
        next(error);
        return;
    }
};
exports.obtenerAsignaturasNoAsignadasAlCurso = obtenerAsignaturasNoAsignadasAlCurso;
//# sourceMappingURL=asignaturaCustom.controller.js.map