"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenTypes = exports.jwtConfig = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const jwtSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
if (!jwtSecret || !refreshSecret) {
    throw new Error('FATAL: Las variables JWT_SECRET y REFRESH_TOKEN_SECRET son obligatorias. El servidor no puede arrancar sin ellas.');
}
exports.jwtConfig = {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshSecret: refreshSecret,
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
};
exports.tokenTypes = {
    ACCESS: 'ACCESS',
    REFRESH: 'REFRESH',
};
//# sourceMappingURL=jwt.config.js.map