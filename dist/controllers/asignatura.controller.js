"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const asignatura_model_1 = __importDefault(require("../models/asignatura.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class AsignaturaController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const asignaturaData = {
                ...req.body,
                escuelaId: req.user.escuelaId,
            };
            const asignatura = await asignatura_model_1.default.create(asignaturaData);
            await asignatura.populate(['cursoId', 'docenteId']);
            res.status(201).json({
                success: true,
                data: asignatura,
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
            const { cursoId, docenteId, estado } = req.query;
            const query = { escuelaId: req.user.escuelaId };
            if (cursoId) {
                query.cursoId = cursoId;
            }
            if (docenteId) {
                query.docenteId = docenteId;
            }
            if (estado) {
                query.estado = estado;
            }
            const asignaturas = await asignatura_model_1.default.find(query)
                .populate({
                path: 'docenteId',
                select: 'nombre apellidos email tipo estado',
                model: 'Usuario',
            })
                .populate('cursoId', 'nombre grado grupo nivel jornada año_academico')
                .sort({ nombre: 1 });
            const asignaturasConDocentes = asignaturas.map((asignatura) => {
                const doc = asignatura.toObject();
                return {
                    ...doc,
                    docente: doc.docenteId,
                };
            });
            res.json({
                success: true,
                data: asignaturasConDocentes,
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
            const asignatura = await asignatura_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            })
                .populate({
                path: 'docenteId',
                select: 'nombre apellidos email tipo estado',
                model: 'Usuario',
            })
                .populate('cursoId', 'nombre grado grupo nivel jornada año_academico');
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada');
            }
            const doc = asignatura.toObject();
            res.json({
                success: true,
                data: {
                    ...doc,
                    docente: doc.docenteId,
                },
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
            const updateData = { ...req.body };
            if (updateData.cursoId === '' ||
                updateData.cursoId === null ||
                updateData.cursoId === 'null') {
                console.log(`🔄 Desasignando asignatura ${req.params.id} de su curso`);
                const asignatura = await asignatura_model_1.default.findOneAndUpdate({
                    _id: req.params.id,
                    escuelaId: req.user.escuelaId,
                }, {
                    $unset: { cursoId: 1 },
                    estado: 'ACTIVO',
                }, { new: true, runValidators: false }).populate(['docenteId']);
                if (!asignatura) {
                    throw new ApiError_1.default(404, 'Asignatura no encontrada');
                }
                console.log('✅ Asignatura desasignada del curso exitosamente');
                res.json({
                    success: true,
                    data: asignatura,
                    message: 'Asignatura removida del curso exitosamente',
                });
                return;
            }
            const asignatura = await asignatura_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, updateData, { new: true, runValidators: true }).populate(['cursoId', 'docenteId']);
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada');
            }
            res.json({
                success: true,
                data: asignatura,
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
            const asignatura = await asignatura_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { estado: 'INACTIVO' }, { new: true });
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada');
            }
            res.json({
                success: true,
                message: 'Asignatura desactivada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarPeriodos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { periodos } = req.body;
            const asignatura = await asignatura_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { periodos }, { new: true, runValidators: true }).populate(['cursoId', 'docenteId']);
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada');
            }
            res.json({
                success: true,
                data: asignatura,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerPorCurso(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { cursoId } = req.params;
            const asignaturas = await asignatura_model_1.default.find({
                cursoId,
                escuelaId: req.user.escuelaId,
                estado: 'ACTIVO',
            }).populate({
                path: 'docenteId',
                select: 'nombre apellidos email tipo estado',
                model: 'Usuario',
            });
            const asignaturasFormateadas = asignaturas.map((asignatura) => {
                const doc = asignatura.toObject();
                return {
                    ...doc,
                    docente: doc.docenteId,
                };
            });
            res.json({
                success: true,
                data: asignaturasFormateadas,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerNoAsignadasACurso(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { cursoId } = req.params;
            console.log(`Buscando asignaturas no asignadas al curso ${cursoId}`);
            const asignaturasAsignadas = await asignatura_model_1.default.find({
                cursoId,
                escuelaId: req.user.escuelaId,
            }).select('_id');
            console.log(`Encontradas ${asignaturasAsignadas.length} asignaturas ya asignadas al curso`);
            const idsAsignadas = asignaturasAsignadas.map((a) => a._id.toString());
            const query = {
                escuelaId: req.user.escuelaId,
                estado: 'ACTIVO',
            };
            if (idsAsignadas.length > 0) {
                query._id = { $nin: idsAsignadas };
            }
            console.log('Ejecutando consulta para asignaturas no asignadas:', JSON.stringify(query));
            const asignaturas = await asignatura_model_1.default.find(query)
                .populate({
                path: 'docenteId',
                select: 'nombre apellidos email tipo estado',
                model: 'Usuario',
            })
                .populate('cursoId', 'nombre grado grupo nivel jornada año_academico')
                .sort({ nombre: 1 });
            console.log(`Encontradas ${asignaturas.length} asignaturas no asignadas al curso`);
            const asignaturasFormateadas = asignaturas.map((asignatura) => {
                const doc = asignatura.toObject();
                return {
                    ...doc,
                    docente: doc.docenteId,
                };
            });
            res.json({
                success: true,
                data: asignaturasFormateadas,
            });
        }
        catch (error) {
            console.error('Error en obtenerNoAsignadasACurso:', error);
            next(error);
        }
    }
    async removerDeCurso(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const asignatura = await asignatura_model_1.default.findOneAndUpdate({ _id: req.params.id, escuelaId: req.user.escuelaId }, { $unset: { cursoId: 1 } }, { new: true, runValidators: false });
            if (!asignatura) {
                throw new ApiError_1.default(404, 'Asignatura no encontrada');
            }
            res.json({ success: true, message: 'Asignatura removida del curso' });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new AsignaturaController();
//# sourceMappingURL=asignatura.controller.js.map