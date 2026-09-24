"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const calificacion_model_1 = __importDefault(require("../models/calificacion.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const asignatura_model_1 = __importDefault(require("../models/asignatura.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const accesoAcademico_1 = require("../utils/accesoAcademico");
const filtroLecturaPorRol = async (user) => {
    if ((0, accesoAcademico_1.esRolAdministrativo)(user.tipo))
        return {};
    if (user.tipo === 'ESTUDIANTE')
        return { estudianteId: user._id };
    if (user.tipo === 'ACUDIENTE') {
        const hijos = await (0, accesoAcademico_1.obtenerHijosIds)(user);
        return { estudianteId: { $in: hijos } };
    }
    if (user.tipo === 'DOCENTE') {
        const [asignaturas, dirigidos] = await Promise.all([
            (0, accesoAcademico_1.obtenerAsignaturasDocente)(user._id, user.escuelaId),
            curso_model_1.default.find({ escuelaId: user.escuelaId, director_grupo: user._id }).select('_id').lean(),
        ]);
        return {
            $or: [
                { asignaturaId: { $in: asignaturas } },
                { cursoId: { $in: dirigidos.map((c) => c._id) } },
            ],
        };
    }
    return null;
};
const filtroEscrituraPorRol = async (user) => {
    if (user.tipo === 'DOCENTE') {
        const asignaturas = await (0, accesoAcademico_1.obtenerAsignaturasDocente)(user._id, user.escuelaId);
        return { asignaturaId: { $in: asignaturas } };
    }
    return {};
};
class CalificacionController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId, asignaturaId, cursoId, periodo, año_academico, calificaciones_logros, observaciones, } = req.body;
            const asignatura = await asignatura_model_1.default.findOne({
                _id: asignaturaId,
                escuelaId: req.user.escuelaId,
                cursoId,
            }).select('docenteId');
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada en este curso');
            }
            if (req.user.tipo === 'DOCENTE' && String(asignatura.docenteId) !== String(req.user._id)) {
                throw new ApiError_1.default(403, 'Solo puede calificar en sus asignaturas');
            }
            const enCurso = await curso_model_1.default.exists({
                _id: cursoId,
                escuelaId: req.user.escuelaId,
                estudiantes: estudianteId,
            });
            if (!enCurso) {
                throw new ApiError_1.default(400, 'El estudiante no pertenece a este curso');
            }
            const calificacionData = {
                estudianteId,
                asignaturaId,
                cursoId,
                periodo,
                año_academico,
                calificaciones_logros,
                observaciones,
                escuelaId: req.user.escuelaId,
            };
            const calificacion = await calificacion_model_1.default.create(calificacionData);
            await calificacion.populate(['estudianteId', 'asignaturaId', 'cursoId']);
            res.status(201).json({
                success: true,
                data: calificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerTodas(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const estudianteId = (0, accesoAcademico_1.queryString)(req.query.estudianteId);
            const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
            const periodo = (0, accesoAcademico_1.queryString)(req.query.periodo);
            const año_academico = (0, accesoAcademico_1.queryString)(req.query.año_academico);
            const filtroRol = await filtroLecturaPorRol(req.user);
            if (!filtroRol) {
                throw new ApiError_1.default(403, 'No tiene acceso a las calificaciones');
            }
            if (req.user.tipo === 'ACUDIENTE' && estudianteId) {
                const hijos = await (0, accesoAcademico_1.obtenerHijosIds)(req.user);
                if (!hijos.includes(estudianteId)) {
                    throw new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante');
                }
            }
            const query = { escuelaId: req.user.escuelaId };
            if (estudianteId)
                query.estudianteId = estudianteId;
            if (asignaturaId)
                query.asignaturaId = asignaturaId;
            if (cursoId)
                query.cursoId = cursoId;
            if (periodo)
                query.periodo = periodo;
            if (año_academico)
                query.año_academico = año_academico;
            const calificaciones = await calificacion_model_1.default.find({ $and: [query, filtroRol] })
                .populate(['estudianteId', 'asignaturaId', 'cursoId'])
                .sort({ createdAt: -1 });
            res.json({
                success: true,
                data: calificaciones,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerPorId(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const filtroRol = await filtroLecturaPorRol(req.user);
            if (!filtroRol) {
                throw new ApiError_1.default(403, 'No tiene acceso a las calificaciones');
            }
            const calificacion = await calificacion_model_1.default.findOne({
                $and: [{ _id: req.params.id, escuelaId: req.user.escuelaId }, filtroRol],
            }).populate(['estudianteId', 'asignaturaId', 'cursoId']);
            if (!calificacion) {
                throw new ApiError_1.default(404, 'Calificación no encontrada');
            }
            res.json({
                success: true,
                data: calificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { calificaciones_logros, observaciones, periodo, año_academico } = req.body;
            const datos = {};
            if (calificaciones_logros !== undefined)
                datos.calificaciones_logros = calificaciones_logros;
            if (observaciones !== undefined)
                datos.observaciones = observaciones;
            if (periodo !== undefined)
                datos.periodo = periodo;
            if (año_academico !== undefined)
                datos.año_academico = año_academico;
            const calificacion = await calificacion_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                ...(await filtroEscrituraPorRol(req.user)),
            }, datos, { new: true, runValidators: true }).populate(['estudianteId', 'asignaturaId', 'cursoId']);
            if (!calificacion) {
                throw new ApiError_1.default(404, 'Calificación no encontrada');
            }
            res.json({
                success: true,
                data: calificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async agregarCalificacionLogro(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { logroId, calificacion: valorCalificacion, observacion } = req.body;
            const calificacion = await calificacion_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                ...(await filtroEscrituraPorRol(req.user)),
            }, {
                $push: {
                    calificaciones_logros: {
                        logroId,
                        calificacion: valorCalificacion,
                        observacion,
                        fecha_calificacion: new Date(),
                    },
                },
            }, { new: true, runValidators: true }).populate(['estudianteId', 'asignaturaId', 'cursoId']);
            if (!calificacion) {
                throw new ApiError_1.default(404, 'Calificación no encontrada');
            }
            res.json({
                success: true,
                data: calificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarCalificacionLogro(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { logroId, calificacion: valorCalificacion, observacion } = req.body;
            const calificacion = await calificacion_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                'calificaciones_logros.logroId': logroId,
                ...(await filtroEscrituraPorRol(req.user)),
            }, {
                $set: {
                    'calificaciones_logros.$.calificacion': valorCalificacion,
                    'calificaciones_logros.$.observacion': observacion,
                },
            }, { new: true, runValidators: true }).populate(['estudianteId', 'asignaturaId', 'cursoId']);
            if (!calificacion) {
                throw new ApiError_1.default(404, 'Calificación o logro no encontrado');
            }
            res.json({
                success: true,
                data: calificacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new CalificacionController();
//# sourceMappingURL=calificacion.controller.js.map