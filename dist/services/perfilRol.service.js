"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const perfilRol_model_1 = __importDefault(require("../models/perfilRol.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const permissions_1 = require("../constants/permissions");
const perfilRolService = {
    async crear(dto) {
        const existente = await perfilRol_model_1.default.findOne({
            escuelaId: dto.escuelaId,
            nombre: { $regex: new RegExp(`^${dto.nombre}$`, 'i') },
        });
        if (existente) {
            throw new ApiError_1.default(409, `Ya existe un perfil de rol con el nombre "${dto.nombre}" en esta escuela`);
        }
        const perfil = new perfilRol_model_1.default({
            nombre: dto.nombre,
            descripcion: dto.descripcion,
            rolBase: dto.rolBase,
            permisos: dto.permisos,
            escuelaId: new mongoose_1.default.Types.ObjectId(dto.escuelaId),
            creadoPor: new mongoose_1.default.Types.ObjectId(dto.creadoPor),
            activo: true,
        });
        await perfil.save();
        return perfil.toObject();
    },
    async listarPorEscuela(escuelaId) {
        const perfiles = await perfilRol_model_1.default.find({ escuelaId, activo: true })
            .populate('creadoPor', 'nombre apellidos')
            .sort({ rolBase: 1, nombre: 1 })
            .lean();
        return perfiles;
    },
    async obtenerPorId(perfilId, escuelaId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(perfilId)) {
            throw new ApiError_1.default(400, 'ID de perfil de rol inválido');
        }
        const perfil = await perfilRol_model_1.default.findOne({ _id: perfilId, escuelaId }).lean();
        if (!perfil) {
            throw new ApiError_1.default(404, 'Perfil de rol no encontrado');
        }
        return perfil;
    },
    async actualizar(perfilId, escuelaId, dto) {
        if (!mongoose_1.default.Types.ObjectId.isValid(perfilId)) {
            throw new ApiError_1.default(400, 'ID de perfil de rol inválido');
        }
        if (dto.nombre) {
            const existente = await perfilRol_model_1.default.findOne({
                escuelaId,
                nombre: { $regex: new RegExp(`^${dto.nombre}$`, 'i') },
                _id: { $ne: perfilId },
            });
            if (existente) {
                throw new ApiError_1.default(409, `Ya existe un perfil de rol con el nombre "${dto.nombre}" en esta escuela`);
            }
        }
        const perfil = await perfilRol_model_1.default.findOneAndUpdate({ _id: perfilId, escuelaId }, { $set: dto }, { new: true, runValidators: true }).lean();
        if (!perfil) {
            throw new ApiError_1.default(404, 'Perfil de rol no encontrado');
        }
        if (dto.permisos !== undefined) {
            await usuario_model_1.default.updateMany({ perfilRolId: new mongoose_1.default.Types.ObjectId(perfilId) }, { $set: { permisos: perfil.permisos } });
        }
        return perfil;
    },
    async eliminar(perfilId, escuelaId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(perfilId)) {
            throw new ApiError_1.default(400, 'ID de perfil de rol inválido');
        }
        const perfil = await perfilRol_model_1.default.findOne({ _id: perfilId, escuelaId });
        if (!perfil) {
            throw new ApiError_1.default(404, 'Perfil de rol no encontrado');
        }
        await usuario_model_1.default.updateMany({ perfilRolId: perfilId, escuelaId }, { $unset: { perfilRolId: 1 }, $set: { permisos: [] } });
        await perfil.deleteOne();
    },
    async asignarAUsuario(usuarioId, perfilRolId, escuelaId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(usuarioId) || !mongoose_1.default.Types.ObjectId.isValid(perfilRolId)) {
            throw new ApiError_1.default(400, 'IDs inválidos');
        }
        const [usuario, perfil] = await Promise.all([
            usuario_model_1.default.findOne({ _id: usuarioId, escuelaId }),
            perfilRol_model_1.default.findOne({ _id: perfilRolId, escuelaId, activo: true }),
        ]);
        if (!usuario)
            throw new ApiError_1.default(404, 'Usuario no encontrado en esta escuela');
        if (!perfil)
            throw new ApiError_1.default(404, 'Perfil de rol no encontrado o inactivo');
        if (usuario.tipo !== perfil.rolBase) {
            throw new ApiError_1.default(400, `Este perfil es para usuarios de tipo "${perfil.rolBase}", pero el usuario es "${usuario.tipo}"`);
        }
        await usuario_model_1.default.updateOne({ _id: usuarioId }, {
            $set: {
                perfilRolId: new mongoose_1.default.Types.ObjectId(perfilRolId),
                rolBase: perfil.rolBase,
                permisos: perfil.permisos,
            },
        });
    },
    async removerDeUsuario(usuarioId, escuelaId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(usuarioId)) {
            throw new ApiError_1.default(400, 'ID de usuario inválido');
        }
        const usuario = await usuario_model_1.default.findOne({ _id: usuarioId, escuelaId });
        if (!usuario)
            throw new ApiError_1.default(404, 'Usuario no encontrado en esta escuela');
        await usuario_model_1.default.updateOne({ _id: usuarioId }, { $unset: { perfilRolId: 1, rolBase: 1 }, $set: { permisos: [] } });
    },
    obtenerCatalogoPermisos() {
        return permissions_1.ALL_PERMISSIONS.map((p) => {
            const [modulo, accion] = p.split('.');
            return { permiso: p, modulo, accion };
        });
    },
    obtenerPermisosSugeridos(rolBase) {
        return permissions_1.DEFAULT_PERMISSIONS_BY_ROLE[rolBase] ?? [];
    },
};
exports.default = perfilRolService;
//# sourceMappingURL=perfilRol.service.js.map