"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const escuela_model_1 = __importDefault(require("../models/escuela.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
class EscuelaController {
    async crear(req, res, next) {
        try {
            const escuela = await escuela_model_1.default.create(req.body);
            res.status(201).json({
                success: true,
                data: escuela,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtener(req, res, next) {
        try {
            const escuelas = await escuela_model_1.default.find();
            res.json({
                success: true,
                data: escuelas,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerPorId(req, res, next) {
        try {
            const userRequest = req;
            const currentUser = userRequest.user;
            if (!currentUser) {
                throw new ApiError_1.default(401, 'No autorizado');
                return;
            }
            const escuela = (await escuela_model_1.default.findById(req.params.id));
            if (!escuela) {
                throw new ApiError_1.default(404, 'Escuela no encontrada');
                return;
            }
            const escuelaIdStr = String(escuela._id);
            const userEscuelaIdStr = String(currentUser.escuelaId);
            if (userEscuelaIdStr !== escuelaIdStr && currentUser.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para ver esta escuela');
                return;
            }
            if (currentUser.tipo === 'ADMIN') {
                res.json({
                    success: true,
                    data: escuela,
                });
                return;
            }
            const informacionPublica = {
                _id: escuela._id,
                nombre: escuela.nombre,
                codigo: escuela.codigo || '',
                direccion: escuela.direccion || '',
                telefono: escuela.telefono || '',
                email: escuela.email || '',
                sitioWeb: escuela.sitioWeb || '',
                logo: escuela.logo || '',
                descripcion: escuela.descripcion || '',
                periodos_academicos: escuela.periodos_academicos || [],
            };
            res.json({
                success: true,
                data: informacionPublica,
            });
            return;
        }
        catch (error) {
            next(error);
            return;
        }
    }
    async actualizar(req, res, next) {
        try {
            const escuela = await escuela_model_1.default.findByIdAndUpdate(req.params.id, req.body, {
                new: true,
                runValidators: true,
            });
            if (!escuela) {
                throw new ApiError_1.default(404, 'Escuela no encontrada');
            }
            res.json({
                success: true,
                data: escuela,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminar(req, res, next) {
        try {
            const escuela = await escuela_model_1.default.findByIdAndUpdate(req.params.id, { estado: 'INACTIVO' }, { new: true });
            if (!escuela) {
                throw new ApiError_1.default(404, 'Escuela no encontrada');
            }
            res.json({
                success: true,
                message: 'Escuela desactivada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarConfiguracion(req, res, next) {
        try {
            const escuela = await escuela_model_1.default.findByIdAndUpdate(req.params.id, { configuracion: req.body }, { new: true, runValidators: true });
            if (!escuela) {
                throw new ApiError_1.default(404, 'Escuela no encontrada');
            }
            res.json({
                success: true,
                data: escuela,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarPeriodosAcademicos(req, res, next) {
        try {
            const escuela = await escuela_model_1.default.findByIdAndUpdate(req.params.id, { periodos_academicos: req.body.periodos_academicos }, { new: true, runValidators: true });
            if (!escuela) {
                throw new ApiError_1.default(404, 'Escuela no encontrada');
            }
            res.json({
                success: true,
                data: escuela,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new EscuelaController();
//# sourceMappingURL=escuela.controller.js.map