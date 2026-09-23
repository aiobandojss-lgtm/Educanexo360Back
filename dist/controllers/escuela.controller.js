"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const escuela_model_1 = __importDefault(require("../models/escuela.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const verificarAccesoEscuela = (req, escuelaId) => {
    const currentUser = req.user;
    if (!currentUser) {
        throw new ApiError_1.default(401, 'No autorizado');
    }
    if (currentUser.tipo === 'SUPER_ADMIN') {
        return;
    }
    if (!currentUser.escuelaId || String(currentUser.escuelaId) !== String(escuelaId)) {
        throw new ApiError_1.default(403, 'No tienes permiso sobre esta escuela');
    }
};
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
            const currentUser = req.user;
            if (!currentUser) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            let escuelas = [];
            if (currentUser.tipo === 'SUPER_ADMIN') {
                escuelas = await escuela_model_1.default.find();
            }
            else if (currentUser.escuelaId) {
                escuelas = await escuela_model_1.default.find({ _id: currentUser.escuelaId });
            }
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
            if (userEscuelaIdStr !== escuelaIdStr && currentUser.tipo !== 'SUPER_ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para ver esta escuela');
                return;
            }
            if (currentUser.tipo === 'ADMIN' || currentUser.tipo === 'SUPER_ADMIN') {
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
            verificarAccesoEscuela(req, req.params.id);
            const esSuperAdmin = req.user?.tipo === 'SUPER_ADMIN';
            const { nombre, direccion, telefono, email, estado, codigo } = req.body;
            const datos = { nombre, direccion, telefono, email };
            if (esSuperAdmin) {
                datos.estado = estado;
                datos.codigo = codigo;
            }
            const escuela = await escuela_model_1.default.findByIdAndUpdate(req.params.id, datos, {
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
            verificarAccesoEscuela(req, req.params.id);
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
            verificarAccesoEscuela(req, req.params.id);
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