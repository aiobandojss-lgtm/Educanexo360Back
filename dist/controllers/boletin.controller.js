"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const calificacion_model_1 = __importDefault(require("../models/calificacion.model"));
const logro_model_1 = __importDefault(require("../models/logro.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const asignatura_model_1 = __importDefault(require("../models/asignatura.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const accesoAcademico_1 = require("../utils/accesoAcademico");
class BoletinController {
    async generarBoletinPeriodo(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId, periodo, año_academico } = req.query;
            if (!estudianteId || !periodo || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            if (!(await (0, accesoAcademico_1.puedeVerEstudiante)(req.user, estudianteId))) {
                throw new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante');
            }
            const escuelaId = req.user.escuelaId;
            const estudiante = await usuario_model_1.default.findOne({ _id: estudianteId, escuelaId });
            if (!estudiante) {
                throw new ApiError_1.default(404, 'Estudiante no encontrado');
            }
            if (estudiante.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(400, 'El ID proporcionado no corresponde a un estudiante');
            }
            const curso = await curso_model_1.default.findOne({
                escuelaId,
                estudiantes: { $in: [estudianteId] },
            });
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado para el estudiante');
            }
            const asignaturas = await asignatura_model_1.default.find({
                cursoId: curso._id,
                escuelaId,
                estado: 'ACTIVO',
            }).populate('docenteId', 'nombre apellidos');
            const idsAsignaturas = asignaturas.map((a) => a._id);
            const [calificacionesPeriodo, logrosPeriodo] = await Promise.all([
                calificacion_model_1.default.find({
                    estudianteId,
                    asignaturaId: { $in: idsAsignaturas },
                    escuelaId,
                    periodo: Number(periodo),
                    año_academico: String(año_academico),
                }),
                logro_model_1.default.find({
                    asignaturaId: { $in: idsAsignaturas },
                    escuelaId,
                    periodo: Number(periodo),
                    año_academico: String(año_academico),
                    estado: 'ACTIVO',
                }).lean(),
            ]);
            const calificacionPorAsignatura = new Map(calificacionesPeriodo.map((c) => [String(c.asignaturaId), c]));
            const asignaturasData = [];
            for (const asignatura of asignaturas) {
                const calificacion = calificacionPorAsignatura.get(String(asignatura._id)) || null;
                const logros = logrosPeriodo.filter((l) => String(l.asignaturaId) === String(asignatura._id));
                const logrosData = [];
                let calificadosCount = 0;
                let totalPorcentajeCalificado = 0;
                for (const logro of logros) {
                    let calificacionData = null;
                    if (calificacion &&
                        calificacion.calificaciones_logros &&
                        calificacion.calificaciones_logros.length > 0) {
                        const calLogroItem = calificacion.calificaciones_logros.find((cl) => cl.logroId && cl.logroId.toString() === logro._id.toString());
                        if (calLogroItem) {
                            calificacionData = {
                                valor: calLogroItem.calificacion,
                                observacion: calLogroItem.observacion || '',
                                fecha: calLogroItem.fecha_calificacion,
                            };
                            calificadosCount++;
                            totalPorcentajeCalificado += logro.porcentaje || 0;
                        }
                    }
                    logrosData.push({
                        logro: {
                            _id: logro._id,
                            nombre: logro.nombre || '',
                            descripcion: logro.descripcion || '',
                            tipo: logro.tipo || '',
                            porcentaje: logro.porcentaje || 0,
                        },
                        calificacion: calificacionData,
                    });
                }
                const promedio = calificacion ? calificacion.promedio_periodo : 0;
                const docenteInfo = asignatura.docenteId;
                const nombreDocente = docenteInfo
                    ? `${docenteInfo.nombre || ''} ${docenteInfo.apellidos || ''}`.trim()
                    : 'No asignado';
                asignaturasData.push({
                    asignatura: {
                        _id: asignatura._id,
                        nombre: asignatura.nombre,
                        docente: nombreDocente,
                    },
                    logros: logrosData,
                    promedio: promedio,
                    observaciones: calificacion ? calificacion.observaciones : '',
                    progreso: {
                        logros_calificados: calificadosCount,
                        total_logros: logros.length,
                        porcentaje_completado: logros.length > 0 ? Math.round((calificadosCount / logros.length) * 100) : 0,
                    },
                });
            }
            const promedioGeneral = asignaturasData.length > 0
                ? asignaturasData.reduce((sum, asignatura) => sum + asignatura.promedio, 0) /
                    asignaturasData.length
                : 0;
            const estadisticas = {
                asignaturas_total: asignaturasData.length,
                asignaturas_aprobadas: asignaturasData.filter((a) => a.promedio >= 3).length,
                asignaturas_reprobadas: asignaturasData.filter((a) => a.promedio < 3 && a.promedio > 0)
                    .length,
                asignaturas_sin_calificar: asignaturasData.filter((a) => a.promedio === 0).length,
                promedio_general: Number(promedioGeneral.toFixed(2)),
            };
            const boletin = {
                estudiante: {
                    _id: estudiante._id,
                    nombre: `${estudiante.nombre} ${estudiante.apellidos}`,
                    curso: curso.nombre,
                },
                periodo: Number(periodo),
                año_academico,
                fecha_generacion: new Date(),
                asignaturas: asignaturasData,
                estadisticas,
            };
            res.json({
                success: true,
                data: boletin,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async generarBoletinFinal(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId, año_academico } = req.query;
            if (!estudianteId || !año_academico) {
                throw new ApiError_1.default(400, 'Faltan parámetros requeridos');
            }
            if (!(await (0, accesoAcademico_1.puedeVerEstudiante)(req.user, estudianteId))) {
                throw new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante');
            }
            const escuelaId = req.user.escuelaId;
            const estudiante = await usuario_model_1.default.findOne({ _id: estudianteId, escuelaId });
            if (!estudiante) {
                throw new ApiError_1.default(404, 'Estudiante no encontrado');
            }
            if (estudiante.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(400, 'El ID proporcionado no corresponde a un estudiante');
            }
            const curso = await curso_model_1.default.findOne({
                escuelaId,
                estudiantes: { $in: [estudianteId] },
            });
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado para el estudiante');
            }
            const asignaturas = await asignatura_model_1.default.find({
                cursoId: curso._id,
                escuelaId,
                estado: 'ACTIVO',
            }).populate('docenteId', 'nombre apellidos');
            const periodos = [1, 2, 3, 4];
            const calificacionesAño = await calificacion_model_1.default.find({
                estudianteId,
                asignaturaId: { $in: asignaturas.map((a) => a._id) },
                escuelaId,
                periodo: { $in: periodos },
                año_academico: String(año_academico),
            });
            const calificacionPorClave = new Map(calificacionesAño.map((c) => [`${c.asignaturaId}|${c.periodo}`, c]));
            const idsLogros = calificacionesAño.flatMap((c) => (c.calificaciones_logros || []).map((cl) => cl.logroId));
            const logrosCalificadosDocs = await logro_model_1.default.find({ _id: { $in: idsLogros }, escuelaId });
            const logroPorId = new Map(logrosCalificadosDocs.map((l) => [String(l._id), l]));
            const asignaturasData = [];
            for (const asignatura of asignaturas) {
                const periodosData = [];
                let sumaPeriodos = 0;
                let periodosCalificados = 0;
                for (const periodo of periodos) {
                    const calificacion = calificacionPorClave.get(`${asignatura._id}|${periodo}`) || null;
                    const logrosCalificados = [];
                    if (calificacion &&
                        calificacion.calificaciones_logros &&
                        calificacion.calificaciones_logros.length > 0) {
                        for (const calLogro of calificacion.calificaciones_logros) {
                            const logro = logroPorId.get(String(calLogro.logroId));
                            if (logro) {
                                logrosCalificados.push({
                                    logro: {
                                        _id: logro._id,
                                        nombre: logro.nombre,
                                        descripcion: logro.descripcion,
                                        tipo: logro.tipo,
                                        porcentaje: logro.porcentaje,
                                    },
                                    calificacion: calLogro.calificacion,
                                    observacion: calLogro.observacion || '',
                                });
                            }
                        }
                    }
                    if (calificacion && calificacion.promedio_periodo > 0) {
                        sumaPeriodos += calificacion.promedio_periodo;
                        periodosCalificados++;
                    }
                    periodosData.push({
                        periodo,
                        promedio: calificacion ? calificacion.promedio_periodo : 0,
                        observaciones: calificacion ? calificacion.observaciones : '',
                        logros_calificados: logrosCalificados,
                        total_logros_calificados: logrosCalificados.length,
                    });
                }
                const promedioFinal = periodosCalificados > 0 ? Number((sumaPeriodos / periodosCalificados).toFixed(2)) : 0;
                const docenteInfo = asignatura.docenteId;
                const nombreDocente = docenteInfo
                    ? `${docenteInfo.nombre || ''} ${docenteInfo.apellidos || ''}`.trim()
                    : 'No asignado';
                asignaturasData.push({
                    asignatura: {
                        _id: asignatura._id,
                        nombre: asignatura.nombre,
                        docente: nombreDocente,
                    },
                    periodos: periodosData,
                    promedio_final: promedioFinal,
                    estado: promedioFinal >= 3 ? 'APROBADA' : 'REPROBADA',
                });
            }
            const promedioGeneral = asignaturasData.length > 0
                ? asignaturasData.reduce((sum, asignatura) => sum + asignatura.promedio_final, 0) /
                    asignaturasData.length
                : 0;
            const estadisticas = {
                asignaturas_total: asignaturasData.length,
                asignaturas_aprobadas: asignaturasData.filter((a) => a.promedio_final >= 3).length,
                asignaturas_reprobadas: asignaturasData.filter((a) => a.promedio_final < 3 && a.promedio_final > 0).length,
                asignaturas_sin_calificar: asignaturasData.filter((a) => a.promedio_final === 0).length,
                promedio_general: Number(promedioGeneral.toFixed(2)),
                resultado_final: promedioGeneral >= 3 ? 'APROBADO' : 'REPROBADO',
            };
            const boletinFinal = {
                estudiante: {
                    _id: estudiante._id,
                    nombre: `${estudiante.nombre} ${estudiante.apellidos}`,
                    curso: curso.nombre,
                },
                año_academico,
                fecha_generacion: new Date(),
                asignaturas: asignaturasData,
                estadisticas,
            };
            res.json({
                success: true,
                data: boletinFinal,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new BoletinController();
//# sourceMappingURL=boletin.controller.js.map