"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const auth_service_1 = __importDefault(require("../services/auth/auth.service"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const email_service_1 = __importDefault(require("../services/email.service"));
const crypto_1 = __importDefault(require("crypto"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const config_1 = __importDefault(require("../config/config"));
exports.authController = {
    async login(req, res, next) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                throw new ApiError_1.default(400, 'Email y contraseña son requeridos');
            }
            const result = await auth_service_1.default.login(email, password);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    },
    async register(req, res, next) {
        try {
            const { email, password, nombre, apellidos, tipo, escuelaId } = req.body;
            if (!email || !password || !nombre || !apellidos || !tipo || !escuelaId) {
                throw new ApiError_1.default(400, 'Todos los campos son requeridos');
            }
            const result = await auth_service_1.default.register({
                email,
                password,
                nombre,
                apellidos,
                tipo,
                escuelaId,
            });
            res.status(201).json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            next(error);
        }
    },
    async refreshToken(req, res, next) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                throw new ApiError_1.default(400, 'Token de refresco es requerido');
            }
            const tokens = await auth_service_1.default.refreshAuth(refreshToken);
            res.json({
                success: true,
                data: tokens,
            });
        }
        catch (error) {
            next(error);
        }
    },
    async logout(_req, res) {
        res.json({
            success: true,
            message: 'Sesión cerrada exitosamente',
        });
    },
    async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            const user = await usuario_model_1.default.findOne({ email });
            if (!user) {
                res.json({
                    success: true,
                    message: 'Si el correo electrónico existe, recibirás instrucciones para recuperar tu contraseña',
                });
                return;
            }
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetPasswordToken = crypto_1.default.createHash('sha256').update(resetToken).digest('hex');
            const resetPasswordExpires = new Date(Date.now() + 3600000);
            user.resetPasswordToken = resetPasswordToken;
            user.resetPasswordExpires = resetPasswordExpires;
            await user.save();
            const frontendUrl = config_1.default.frontendUrl || 'http://localhost:3000';
            const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
            await email_service_1.default.sendPasswordResetEmail(user.email, {
                nombre: user.nombre,
                resetUrl,
                expirationTime: '1 hora',
            });
            res.json({
                success: true,
                message: 'Si el correo electrónico existe, recibirás instrucciones para recuperar tu contraseña',
            });
        }
        catch (error) {
            console.error('Error en forgotPassword:', error);
            next(error);
        }
    },
    async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;
            const resetPasswordToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
            const user = await usuario_model_1.default.findOne({
                resetPasswordToken,
                resetPasswordExpires: { $gt: Date.now() },
            });
            if (!user) {
                throw new ApiError_1.default(400, 'El token es inválido o ha expirado');
            }
            user.password = password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            res.json({
                success: true,
                message: 'Contraseña restablecida exitosamente',
            });
        }
        catch (error) {
            console.error('Error en resetPassword:', error);
            next(error);
        }
    },
    async verifyToken(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'Token inválido o expirado');
            }
            const safeUser = {
                _id: req.user._id,
                nombre: req.user.nombre,
                apellidos: req.user.apellidos,
                email: req.user.email,
                tipo: req.user.tipo,
                escuelaId: req.user.escuelaId,
                estado: req.user.estado,
                permisos: req.user.permisos,
                perfilRolId: req.user.perfilRolId,
            };
            console.log(`Token verificado exitosamente para usuario: ${safeUser.email}`);
            res.json({
                success: true,
                data: {
                    user: safeUser,
                },
            });
        }
        catch (error) {
            console.error('Error en verifyToken:', error);
            next(error);
        }
    },
};
exports.default = exports.authController;
//# sourceMappingURL=auth.controller.js.map