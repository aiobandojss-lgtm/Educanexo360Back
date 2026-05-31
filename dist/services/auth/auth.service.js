"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const usuario_model_1 = __importDefault(require("../../models/usuario.model"));
const ApiError_1 = __importDefault(require("../../utils/ApiError"));
const jsonwebtoken_1 = require("jsonwebtoken");
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../../config/config"));
const crypto_1 = __importDefault(require("crypto"));
const jwt_config_1 = require("../../config/jwt.config");
const apiClient = axios_1.default.create({
    baseURL: config_1.default.frontendUrl || 'http://localhost:3000',
    headers: {
        'Content-Type': 'application/json',
    },
});
class AuthService {
    generateTokens(user) {
        const payload = {
            sub: user._id.toString(),
            tipo: user.tipo,
        };
        if (user.escuelaId) {
            payload.escuelaId = user.escuelaId.toString();
        }
        const defaultAccessExpiry = '1d';
        const defaultRefreshExpiry = '7d';
        return {
            access: {
                token: (0, jsonwebtoken_1.sign)(payload, jwt_config_1.jwtConfig.secret, {
                    expiresIn: process.env.JWT_EXPIRES_IN || defaultAccessExpiry,
                }),
                expires: process.env.JWT_EXPIRES_IN || defaultAccessExpiry,
            },
            refresh: {
                token: (0, jsonwebtoken_1.sign)(payload, jwt_config_1.jwtConfig.refreshSecret, {
                    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || defaultRefreshExpiry,
                }),
                expires: process.env.REFRESH_TOKEN_EXPIRES_IN || defaultRefreshExpiry,
            },
        };
    }
    async login(email, password) {
        const emailLowerCase = email.toLowerCase();
        console.log(`Intentando login con email: ${emailLowerCase}`);
        const user = await usuario_model_1.default.findOne({ email: emailLowerCase });
        if (!user) {
            console.log(`Usuario no encontrado para email: ${emailLowerCase}`);
            throw new ApiError_1.default(401, 'Credenciales inválidas');
        }
        console.log(`Usuario encontrado: ${user._id} (${user.tipo}), estado: ${user.estado}`);
        if (user.estado !== 'ACTIVO') {
            console.log(`Usuario con estado inactivo: ${user.estado}`);
            throw new ApiError_1.default(401, 'Usuario inactivo');
        }
        console.log('Verificando contraseña...');
        try {
            const isPasswordMatch = await user.compararPassword(password);
            if (!isPasswordMatch) {
                console.log('Contraseña incorrecta');
                throw new ApiError_1.default(401, 'Credenciales inválidas');
            }
            console.log('Contraseña correcta, login exitoso');
        }
        catch (error) {
            console.error('Error durante la validación de contraseña:', error);
            throw new ApiError_1.default(401, 'Error en la validación de credenciales');
        }
        console.log('Generando tokens de autenticación');
        const tokens = this.generateTokens(user);
        return {
            user,
            tokens,
        };
    }
    async refreshAuth(refreshToken) {
        try {
            const decoded = (0, jsonwebtoken_1.verify)(refreshToken, jwt_config_1.jwtConfig.refreshSecret);
            const user = await usuario_model_1.default.findById(decoded.sub);
            if (!user) {
                throw new ApiError_1.default(401, 'Usuario no encontrado');
            }
            return this.generateTokens(user);
        }
        catch (error) {
            throw new ApiError_1.default(401, 'Por favor autentíquese nuevamente');
        }
    }
    async register(userData) {
        const existingUser = await usuario_model_1.default.findOne({ email: userData.email });
        if (existingUser) {
            throw new ApiError_1.default(400, 'El email ya está registrado');
        }
        const user = await usuario_model_1.default.create(userData);
        const tokens = this.generateTokens(user);
        return {
            user,
            tokens,
        };
    }
    async requestPasswordReset(email) {
        try {
            const user = await usuario_model_1.default.findOne({ email });
            if (!user) {
                return {
                    success: true,
                    message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña',
                };
            }
            const resetToken = crypto_1.default.randomBytes(32).toString('hex');
            const resetPasswordToken = crypto_1.default.createHash('sha256').update(resetToken).digest('hex');
            const resetPasswordExpires = new Date(Date.now() + 3600000);
            user.resetPasswordToken = resetPasswordToken;
            user.resetPasswordExpires = resetPasswordExpires;
            await user.save();
            return {
                success: true,
                message: 'Se han enviado instrucciones a tu correo electrónico',
                token: resetToken,
            };
        }
        catch (error) {
            console.error('Error en requestPasswordReset:', error);
            throw new ApiError_1.default(500, 'Error al procesar la solicitud');
        }
    }
    async resetPassword(token, password) {
        try {
            const resetPasswordToken = crypto_1.default.createHash('sha256').update(token).digest('hex');
            const user = await usuario_model_1.default.findOne({
                resetPasswordToken,
                resetPasswordExpires: { $gt: Date.now() },
            });
            if (!user) {
                throw new ApiError_1.default(400, 'Token inválido o expirado');
            }
            user.password = password;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save();
            return {
                success: true,
                message: 'Contraseña restablecida exitosamente',
            };
        }
        catch (error) {
            console.error('Error en resetPassword:', error);
            throw error;
        }
    }
}
exports.default = new AuthService();
//# sourceMappingURL=auth.service.js.map