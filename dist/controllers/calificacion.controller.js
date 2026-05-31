"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const calificacion_model_1 = __importDefault(require("../models/calificacion.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class CalificacionController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const calificacionData = {
                ...req.body,
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
            const { estudianteId, asignaturaId, cursoId, periodo, año_academico } = req.query;
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
            const calificaciones = await calificacion_model_1.default.find(query)
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
            const calificacion = await calificacion_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
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
            const calificacion = await calificacion_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, req.body, { new: true, runValidators: true }).populate(['estudianteId', 'asignaturaId', 'cursoId']);
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