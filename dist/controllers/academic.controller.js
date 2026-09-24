"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const academic_service_1 = __importDefault(require("../services/academic.service"));
const mongoose_1 = __importDefault(require("mongoose"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const accesoAcademico_1 = require("../utils/accesoAcademico");
const validarIds = (...ids) => {
    if (ids.some((id) => !id || !mongoose_1.default.isValidObjectId(id))) {
        throw new ApiError_1.default(400, 'Parámetros inválidos');
    }
};
class AcademicController {
    async obtenerPromedioPeriodo(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const estudianteId = (0, accesoAcademico_1.queryString)(req.query.estudianteId);
            const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            const periodo = (0, accesoAcademico_1.queryString)(req.query.periodo);
            const año_academico = (0, accesoAcademico_1.queryString)(req.query.año_academico);
            if (!estudianteId || !asignaturaId || !periodo || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            validarIds(estudianteId, asignaturaId);
            if (!(await (0, accesoAcademico_1.puedeVerEstudiante)(req.user, estudianteId))) {
                throw new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante');
            }
            const promedios = await academic_service_1.default.calcularPromedioPeriodo(estudianteId, asignaturaId, Number(periodo), año_academico, req.user.escuelaId);
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
            const estudianteId = (0, accesoAcademico_1.queryString)(req.query.estudianteId);
            const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            const año_academico = (0, accesoAcademico_1.queryString)(req.query.año_academico);
            if (!estudianteId || !asignaturaId || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            validarIds(estudianteId, asignaturaId);
            if (!(await (0, accesoAcademico_1.puedeVerEstudiante)(req.user, estudianteId))) {
                throw new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante');
            }
            const promedios = await academic_service_1.default.calcularPromedioAsignatura(estudianteId, asignaturaId, año_academico, req.user.escuelaId);
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
            const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
            const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            const periodo = (0, accesoAcademico_1.queryString)(req.query.periodo);
            const año_academico = (0, accesoAcademico_1.queryString)(req.query.año_academico);
            if (!cursoId || !asignaturaId || !periodo || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            validarIds(cursoId, asignaturaId);
            if (!(0, accesoAcademico_1.esRolAdministrativo)(req.user.tipo) && !(await (0, accesoAcademico_1.docenteTieneCurso)(req.user, cursoId))) {
                throw new ApiError_1.default(403, 'No tiene acceso a este curso');
            }
            const estadisticas = await academic_service_1.default.obtenerEstadisticasGrupo(cursoId, asignaturaId, Number(periodo), año_academico, req.user.escuelaId);
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