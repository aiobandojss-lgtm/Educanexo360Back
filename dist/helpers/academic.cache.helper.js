"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const academic_service_1 = __importDefault(require("../services/academic.service"));
const simpleCache_1 = require("../cache/simpleCache");
class AcademicCacheHelper {
    static invalidateOnCalificacionChange(estudianteId, asignaturaId, cursoId, escuelaId) {
        console.log(`🔄 Invalidando cache por cambio en calificación - Estudiante: ${estudianteId}`);
        academic_service_1.default.invalidarCacheEstudiante(estudianteId, asignaturaId, escuelaId);
        academic_service_1.default.invalidarCacheCurso(cursoId, escuelaId);
        (0, simpleCache_1.invalidateRelatedCache)('dashboard', estudianteId, escuelaId, [
            'dashboard_rol',
            'dashboard_completo',
            'metricas_avanzadas',
        ]);
    }
    static invalidateOnLogroChange(asignaturaId, cursoId, escuelaId, periodo) {
        console.log(`🔄 Invalidando cache por cambio en logro - Asignatura: ${asignaturaId}`);
        academic_service_1.default.invalidarCacheCurso(cursoId, escuelaId);
        academic_service_1.default.limpiarCacheAcademico();
    }
    static invalidateOnCursoChange(cursoId, escuelaId) {
        console.log(`🔄 Invalidando cache por cambio en curso - Curso: ${cursoId}`);
        academic_service_1.default.invalidarCacheCurso(cursoId, escuelaId);
        (0, simpleCache_1.invalidateRelatedCache)('dashboard', 'all', escuelaId, ['dashboard_rol', 'dashboard_completo']);
    }
    static invalidateOnPeriodoClose(escuelaId, periodo) {
        console.log(`🔄 Invalidando cache por cierre de periodo ${periodo} - Escuela: ${escuelaId}`);
        academic_service_1.default.limpiarCacheAcademico();
        (0, simpleCache_1.invalidateRelatedCache)('dashboard', 'all', escuelaId, [
            'dashboard_rol',
            'dashboard_completo',
            'metricas_avanzadas',
        ]);
    }
    static invalidationMiddleware() {
        return {
            onCalificacionChange: (req, res, next) => {
                const { estudianteId, asignaturaId, cursoId } = req.body;
                const escuelaId = req.user?.escuelaId;
                if (estudianteId && asignaturaId && cursoId && escuelaId) {
                    AcademicCacheHelper.invalidateOnCalificacionChange(estudianteId, asignaturaId, cursoId, escuelaId);
                }
                next();
            },
            onLogroChange: (req, res, next) => {
                const { asignaturaId, cursoId, periodo } = req.body;
                const escuelaId = req.user?.escuelaId;
                if (asignaturaId && cursoId && escuelaId) {
                    AcademicCacheHelper.invalidateOnLogroChange(asignaturaId, cursoId, escuelaId, periodo);
                }
                next();
            },
            onCursoChange: (req, res, next) => {
                const cursoId = req.params.id || req.body.cursoId;
                const escuelaId = req.user?.escuelaId;
                if (cursoId && escuelaId) {
                    AcademicCacheHelper.invalidateOnCursoChange(cursoId, escuelaId);
                }
                next();
            },
        };
    }
}
exports.default = AcademicCacheHelper;
//# sourceMappingURL=academic.cache.helper.js.map