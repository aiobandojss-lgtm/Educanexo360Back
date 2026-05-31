"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class CursoController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const cursoData = {
                ...req.body,
                escuelaId: req.user.escuelaId,
            };
            const curso = await curso_model_1.default.create(cursoData);
            await curso.populate(['director_grupo', 'estudiantes']);
            res.status(201).json({
                success: true,
                data: curso,
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
            const { año_academico, estado } = req.query;
            const query = { escuelaId: req.user.escuelaId };
            if (año_academico) {
                query.año_academico = año_academico;
            }
            if (estado) {
                query.estado = estado;
            }
            let cursos;
            if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(req.user.tipo)) {
                cursos = await curso_model_1.default.find(query)
                    .populate(['director_grupo', 'estudiantes'])
                    .sort({ nombre: 1 });
            }
            else if (req.user.tipo === 'DOCENTE') {
                const cursosDirigidos = await curso_model_1.default.find({
                    ...query,
                    director_grupo: req.user._id,
                });
                const asignaturas = await mongoose_1.default.model('Asignatura').find({
                    escuelaId: req.user.escuelaId,
                    docenteId: req.user._id,
                    estado: 'ACTIVO',
                });
                const cursosAsignaturas = await curso_model_1.default.find({
                    ...query,
                    _id: { $in: asignaturas.map((a) => a.cursoId) },
                });
                const todosLosCursos = [...cursosDirigidos, ...cursosAsignaturas];
                const cursosIds = new Set(todosLosCursos.map((c) => c._id.toString()));
                cursos = await curso_model_1.default.find({
                    _id: { $in: Array.from(cursosIds) },
                })
                    .populate(['director_grupo', 'estudiantes'])
                    .sort({ nombre: 1 });
            }
            else {
                throw new ApiError_1.default(403, 'No tiene permisos para ver cursos');
            }
            res.json({
                success: true,
                data: cursos,
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
            const curso = await curso_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }).populate(['director_grupo', 'estudiantes']);
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                data: curso,
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
            const curso = await curso_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, req.body, { new: true, runValidators: true }).populate(['director_grupo', 'estudiantes']);
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                data: curso,
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
            const curso = await curso_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { estado: 'INACTIVO' }, { new: true });
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                message: 'Curso desactivado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async agregarEstudiantes(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudiantes } = req.body;
            const curso = await curso_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { $addToSet: { estudiantes: { $each: estudiantes } } }, { new: true }).populate(['director_grupo', 'estudiantes']);
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                data: curso,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async removerEstudiantes(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudiantes } = req.body;
            const curso = await curso_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { $pullAll: { estudiantes } }, { new: true }).populate(['director_grupo', 'estudiantes']);
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                data: curso,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerEstudiantes(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const curso = await curso_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }).populate('estudiantes', 'nombre apellidos email tipo');
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            res.json({
                success: true,
                data: curso.estudiantes,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new CursoController();
//# sourceMappingURL=curso.controller.js.map