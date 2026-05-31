"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const invitacion_controller_1 = require("../controllers/invitacion.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const invitacion_validation_1 = require("../validations/invitacion.validation");
const router = express_1.default.Router();
router.post('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(invitacion_validation_1.invitacionValidation.crearInvitacion), invitacion_controller_1.crearInvitacion);
router.get('/', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), invitacion_controller_1.obtenerInvitacionesEscuela);
router.get('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), invitacion_controller_1.obtenerInvitacionPorId);
router.delete('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), invitacion_controller_1.revocarInvitacion);
router.get('/curso/:cursoId', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), invitacion_controller_1.obtenerInvitacionesPorCurso);
router.post('/validar', (0, validate_middleware_1.validate)(invitacion_validation_1.invitacionValidation.validarCodigo), invitacion_controller_1.validarCodigo);
exports.default = router;
//# sourceMappingURL=invitacion.routes.js.map