"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const academic_service_1 = __importDefault(require("../services/academic.service"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class AcademicController {
    async obtenerPromedioPeriodo(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId, asignaturaId, periodo, año_academico } = req.query;
            if (!estudianteId || !asignaturaId || !periodo || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            const promedios = await academic_service_1.default.calcularPromedioPeriodo(estudianteId, asignaturaId, Number(periodo), año_academico);
            res.json({
                success: true,
                data: promedios,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerPromedioAsignatura(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId, asignaturaId, año_academico } = req.query;
            if (!estudianteId || !asignaturaId || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            const promedios = await academic_service_1.default.calcularPromedioAsignatura(estudianteId, asignaturaId, año_academico);
            res.json({
                success: true,
                data: promedios,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerEstadisticasGrupo(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { cursoId, asignaturaId, periodo, año_academico } = req.query;
            if (!cursoId || !asignaturaId || !periodo || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            const estadisticas = await academic_service_1.default.obtenerEstadisticasGrupo(cursoId, asignaturaId, Number(periodo), año_academico);
            res.json({
                success: true,
                data: estadisticas,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new AcademicController();
//# sourceMappingURL=academic.controller.js.map