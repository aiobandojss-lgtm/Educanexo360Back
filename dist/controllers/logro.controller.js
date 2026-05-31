"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const logro_model_1 = __importDefault(require("../models/logro.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class LogroController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const logroData = {
                ...req.body,
                escuelaId: req.user.escuelaId,
            };
            const logro = await logro_model_1.default.create(logroData);
            await logro.populate(['asignaturaId', 'cursoId']);
            res.status(201).json({
                success: true,
                data: logro,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerTodos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { asignaturaId, periodo, año_academico, estado } = req.query;
            const query = { escuelaId: req.user.escuelaId };
            if (asignaturaId)
                query.asignaturaId = asignaturaId;
            if (periodo)
                query.periodo = periodo;
            if (año_academico)
                query.año_academico = año_academico;
            if (estado)
                query.estado = estado;
            const logros = await logro_model_1.default.find(query)
                .populate(['asignaturaId', 'cursoId'])
                .sort({ createdAt: -1 });
            res.json({
                success: true,
                data: logros,
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
            const logro = await logro_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }).populate(['asignaturaId', 'cursoId']);
            if (!logro) {
                throw new ApiError_1.default(404, 'Logro no encontrado');
            }
            res.json({
                success: true,
                data: logro,
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
            const logro = await logro_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, req.body, { new: true, runValidators: true }).populate(['asignaturaId', 'cursoId']);
            if (!logro) {
                throw new ApiError_1.default(404, 'Logro no encontrado');
            }
            res.json({
                success: true,
                data: logro,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const logro = await logro_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { estado: 'INACTIVO' }, { new: true });
            if (!logro) {
                throw new ApiError_1.default(404, 'Logro no encontrado');
            }
            res.json({
                success: true,
                message: 'Logro desactivado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerLogrosAsignatura(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { asignaturaId } = req.params;
            const { periodo, año_academico } = req.query;
            const logros = await logro_model_1.default.find({
                asignaturaId,
                escuelaId: req.user.escuelaId,
                periodo: periodo || { $exists: true },
                año_academico: año_academico || { $exists: true },
                estado: 'ACTIVO',
            }).populate(['asignaturaId', 'cursoId']);
            res.json({
                success: true,
                data: logros,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new LogroController();
//# sourceMappingURL=logro.controller.js.map