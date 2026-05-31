"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const perfilRol_service_1 = __importDefault(require("../services/perfilRol.service"));
const perfilRolController = {
    async listar(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            const perfiles = await perfilRol_service_1.default.listarPorEscuela(escuelaId);
            res.json({
                success: true,
                data: perfiles,
                total: perfiles.length,
            });
        }
        catch (error) {
            next(error);
        }
    },
    async obtener(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            const perfil = await perfilRol_service_1.default.obtenerPorId(req.params.id, escuelaId);
            res.json({ success: true, data: perfil });
        }
        catch (error) {
            next(error);
        }
    },
    async crear(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            const creadoPor = req.user._id;
            const perfil = await perfilRol_service_1.default.crear({
                nombre: req.body.nombre,
                descripcion: req.body.descripcion,
                rolBase: req.body.rolBase,
                permisos: req.body.permisos,
                escuelaId,
                creadoPor,
            });
            res.status(201).json({ success: true, data: perfil });
        }
        catch (error) {
            next(error);
        }
    },
    async actualizar(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            const perfil = await perfilRol_service_1.default.actualizar(req.params.id, escuelaId, {
                nombre: req.body.nombre,
                descripcion: req.body.descripcion,
                permisos: req.body.permisos,
                activo: req.body.activo,
            });
            res.json({ success: true, data: perfil });
        }
        catch (error) {
            next(error);
        }
    },
    async eliminar(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            await perfilRol_service_1.default.eliminar(req.params.id, escuelaId);
            res.json({
                success: true,
                message: 'Perfil de rol eliminado. Los usuarios afectados conservan su tipo base.',
            });
        }
        catch (error) {
            next(error);
        }
    },
    async asignarAUsuario(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            await perfilRol_service_1.default.asignarAUsuario(req.params.usuarioId, req.body.perfilRolId, escuelaId);
            res.json({ success: true, message: 'Perfil de rol asignado correctamente' });
        }
        catch (error) {
            next(error);
        }
    },
    async removerDeUsuario(req, res, next) {
        try {
            const escuelaId = req.user.escuelaId;
            await perfilRol_service_1.default.removerDeUsuario(req.params.usuarioId, escuelaId);
            res.json({ success: true, message: 'Perfil de rol removido. El usuario conserva su tipo base.' });
        }
        catch (error) {
            next(error);
        }
    },
    async obtenerCatalogoPermisos(_req, res, next) {
        try {
            const catalogo = perfilRol_service_1.default.obtenerCatalogoPermisos();
            res.json({ success: true, data: catalogo });
        }
        catch (error) {
            next(error);
        }
    },
    async obtenerPermisosSugeridos(req, res, next) {
        try {
            const { rolBase } = req.params;
            const permisos = perfilRol_service_1.default.obtenerPermisosSugeridos(rolBase);
            res.json({ success: true, data: permisos });
        }
        catch (error) {
            next(error);
        }
    },
};
exports.default = perfilRolController;
//# sourceMappingURL=perfilRol.controller.js.map