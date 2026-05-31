"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canViewUserProfiles = exports.requirePermission = exports.authenticateDownload = exports.hasAdminAccess = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const jwt_config_1 = require("../config/jwt.config");
const authenticate = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new ApiError_1.default(401, 'No autorizado - Token no proporcionado');
        }
        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, jwt_config_1.jwtConfig.secret);
        }
        catch (verifyError) {
            console.error('Error al verificar token JWT');
            throw new ApiError_1.default(401, 'No autorizado - Token inválido o expirado');
        }
        const user = (await usuario_model_1.default.findById(decoded.sub).select('-password'));
        if (!user) {
            throw new ApiError_1.default(401, 'No autorizado - Usuario no encontrado');
        }
        if (user.estado !== 'ACTIVO') {
            throw new ApiError_1.default(401, 'No autorizado - Usuario inactivo');
        }
        if (user.tipo === 'SUPER_ADMIN' && !user.escuelaId) {
            req.user = {
                _id: user._id.toString(),
                escuelaId: '',
                tipo: user.tipo,
                email: user.email,
                nombre: user.nombre,
                apellidos: user.apellidos,
                estado: user.estado,
                permisos: user.permisos ?? [],
                perfilRolId: user.perfilRolId?.toString(),
            };
        }
        else {
            req.user = {
                _id: user._id.toString(),
                escuelaId: user.escuelaId ? user.escuelaId.toString() : '',
                tipo: user.tipo,
                email: user.email,
                nombre: user.nombre,
                apellidos: user.apellidos,
                estado: user.estado,
                permisos: user.permisos ?? [],
                perfilRolId: user.perfilRolId?.toString(),
            };
        }
        next();
    }
    catch (error) {
        console.error('Error de autenticación');
        next(new ApiError_1.default(401, 'No autorizado - Token inválido'));
    }
};
exports.authenticate = authenticate;
const ROLES_ADMINISTRATIVOS = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'];
const authorize = (...allowedRoles) => {
    return (req, _res, next) => {
        if (!req.user) {
            throw new ApiError_1.default(401, 'No autorizado - Usuario no autenticado');
        }
        if (allowedRoles.includes('ADMIN') && ROLES_ADMINISTRATIVOS.includes(req.user.tipo)) {
            next();
            return;
        }
        if (!allowedRoles.includes(req.user.tipo)) {
            throw new ApiError_1.default(403, 'Prohibido - No tiene permisos suficientes');
        }
        next();
    };
};
exports.authorize = authorize;
const hasAdminAccess = (userType) => {
    return ROLES_ADMINISTRATIVOS.includes(userType);
};
exports.hasAdminAccess = hasAdminAccess;
const authenticateDownload = async (req, res, next) => {
    try {
        let token = '';
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
        else if (req.query.token) {
            token = req.query.token;
        }
        if (!token) {
            throw new ApiError_1.default(401, 'No autorizado: Token no proporcionado');
        }
        const decoded = jsonwebtoken_1.default.verify(token, jwt_config_1.jwtConfig.secret);
        const user = (await usuario_model_1.default.findById(decoded.sub).select('-password'));
        if (!user) {
            throw new ApiError_1.default(401, 'No autorizado - Usuario no encontrado');
        }
        if (user.estado !== 'ACTIVO') {
            throw new ApiError_1.default(401, 'No autorizado - Usuario inactivo');
        }
        if (user.tipo === 'SUPER_ADMIN' && !user.escuelaId) {
            req.user = {
                _id: user._id.toString(),
                escuelaId: '',
                tipo: user.tipo,
                email: user.email,
                nombre: user.nombre,
                apellidos: user.apellidos,
                estado: user.estado,
                permisos: user.permisos ?? [],
                perfilRolId: user.perfilRolId?.toString(),
            };
        }
        else {
            req.user = {
                _id: user._id.toString(),
                escuelaId: user.escuelaId ? user.escuelaId.toString() : '',
                tipo: user.tipo,
                email: user.email,
                nombre: user.nombre,
                apellidos: user.apellidos,
                estado: user.estado,
                permisos: user.permisos ?? [],
                perfilRolId: user.perfilRolId?.toString(),
            };
        }
        next();
    }
    catch (error) {
        next(new ApiError_1.default(401, 'No autorizado: Token inválido o expirado'));
    }
};
exports.authenticateDownload = authenticateDownload;
const requirePermission = (permiso) => {
    return (req, _res, next) => {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado - Usuario no autenticado'));
        }
        if (!req.user.perfilRolId) {
            return next();
        }
        if (!req.user.permisos.includes(permiso)) {
            return next(new ApiError_1.default(403, `Prohibido - Permiso requerido: ${permiso}`));
        }
        next();
    };
};
exports.requirePermission = requirePermission;
const canViewUserProfiles = (req, _res, next) => {
    if (!req.user) {
        throw new ApiError_1.default(401, 'No autorizado - Usuario no autenticado');
    }
    if (['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo)) {
        next();
        return;
    }
    next();
};
exports.canViewUserProfiles = canViewUserProfiles;
//# sourceMappingURL=auth.middleware.js.map