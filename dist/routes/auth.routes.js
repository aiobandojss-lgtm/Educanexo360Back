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
const router = express_1.default.Router();
router.post('/login', (0, validate_middleware_1.validate)(auth_validation_1.loginValidation), auth_controller_1.authController.login);
router.post('/register', (0, validate_middleware_1.validate)(auth_validation_1.registerValidation), auth_controller_1.authController.register);
router.post('/refresh-token', (0, validate_middleware_1.validate)(auth_validation_1.refreshTokenValidation), auth_controller_1.authController.refreshToken);
router.post('/logout', auth_controller_1.authController.logout);
router.post('/forgot-password', (0, validate_middleware_1.validate)(auth_validation_1.forgotPasswordValidation), auth_controller_1.authController.forgotPassword);
router.post('/reset-password', (0, validate_middleware_1.validate)(auth_validation_1.resetPasswordValidation), auth_controller_1.authController.resetPassword);
router.get('/verify-token', auth_middleware_1.authenticate, auth_controller_1.authController.verifyToken);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map