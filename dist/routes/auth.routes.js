"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_controller_1 = require("../controllers/auth.controller");
const validate_middleware_1 = require("../middleware/validate.middleware");
const auth_validation_1 = require("../validations/auth.validation");
const auth_middleware_1 = require("../middleware/auth.middleware");
const performance_middleware_1 = require("../middleware/performance.middleware");
const router = express_1.default.Router();
const ipDe = (req) => req.ip || req.socket.remoteAddress || 'unknown';
const limiteLoginPorEmail = (0, performance_middleware_1.rateLimiter)(60000, 10, (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${ipDe(req)}|${email}`;
});
const limiteLoginPorIp = (0, performance_middleware_1.rateLimiter)(60000, 300);
const limiteSesion = (0, performance_middleware_1.rateLimiter)(60000, 120);
const limiteGeneral = (0, performance_middleware_1.rateLimiter)(60000, 60);
router.post('/login', limiteLoginPorIp, limiteLoginPorEmail, (0, validate_middleware_1.validate)(auth_validation_1.loginValidation), auth_controller_1.authController.login);
router.post('/register', limiteGeneral, auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'SUPER_ADMIN'), (0, validate_middleware_1.validate)(auth_validation_1.registerValidation), auth_controller_1.authController.register);
router.post('/refresh-token', limiteSesion, (0, validate_middleware_1.validate)(auth_validation_1.refreshTokenValidation), auth_controller_1.authController.refreshToken);
router.post('/logout', limiteGeneral, auth_controller_1.authController.logout);
router.post('/forgot-password', limiteGeneral, (0, validate_middleware_1.validate)(auth_validation_1.forgotPasswordValidation), auth_controller_1.authController.forgotPassword);
router.post('/reset-password', limiteGeneral, (0, validate_middleware_1.validate)(auth_validation_1.resetPasswordValidation), auth_controller_1.authController.resetPassword);
router.get('/verify-token', limiteSesion, auth_middleware_1.authenticate, auth_controller_1.authController.verifyToken);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map