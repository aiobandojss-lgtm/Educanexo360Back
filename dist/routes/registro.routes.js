"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const registro_controller_1 = require("../controllers/registro.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const registro_validation_1 = require("../validations/registro.validation");
const router = express_1.default.Router();
router.post('/solicitud', (0, validate_middleware_1.validate)(registro_validation_1.registroValidation.crearSolicitud), registro_controller_1.crearSolicitud);
router.get('/solicitudes', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), registro_controller_1.obtenerSolicitudesPendientes);
router.get('/solicitudes/historial', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), registro_controller_1.obtenerHistorialSolicitudes);
router.get('/solicitudes/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), registro_controller_1.obtenerSolicitudPorId);
router.put('/solicitudes/:id/aprobar', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), registro_controller_1.aprobarSolicitud);
router.put('/solicitudes/:id/rechazar', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(registro_validation_1.registroValidation.rechazarSolicitud), registro_controller_1.rechazarSolicitud);
exports.default = router;
//# sourceMappingURL=registro.routes.js.map