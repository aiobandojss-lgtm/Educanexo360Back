"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const system_controller_1 = require("../controllers/system.controller");
const outbox_controller_1 = require("../controllers/outbox.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const system_validation_1 = require("../validations/system.validation");
const router = express_1.default.Router();
router.get('/status', system_controller_1.checkSystemStatus);
router.post('/initialize', (0, validate_middleware_1.validate)(system_validation_1.systemInitializeValidation), system_controller_1.initializeSystem);
router.get('/outbox', auth_middleware_1.authenticate, (0, validate_middleware_1.validate)([(0, express_validator_1.query)('escuelaId').optional().isMongoId().withMessage('ID de escuela inválido')]), outbox_controller_1.obtenerEstadoOutbox);
router.post('/outbox/reintentar-fallidos', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('SUPER_ADMIN'), (0, validate_middleware_1.validate)([
    (0, express_validator_1.body)('desde').optional().isISO8601().withMessage('desde debe ser una fecha ISO 8601'),
    (0, express_validator_1.body)('hasta').optional().isISO8601().withMessage('hasta debe ser una fecha ISO 8601'),
    (0, express_validator_1.body)('tipo')
        .optional()
        .isIn(['email', 'correo-cuenta', 'push', 'despachar-mensaje', 'copias-acudientes', 'resumen-diario'])
        .withMessage('Tipo de trabajo no válido'),
]), outbox_controller_1.reintentarFallidos);
exports.default = router;
//# sourceMappingURL=system.routes.js.map