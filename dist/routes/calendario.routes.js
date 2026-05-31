"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const calendario_controller_1 = __importDefault(require("../controllers/calendario.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const calendario_validation_1 = require("../validations/calendario.validation");
const gridfs_1 = __importDefault(require("../config/gridfs"));
const dashboardCacheInvalidation_middleware_1 = require("../middleware/dashboardCacheInvalidation.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), dashboardCacheInvalidation_middleware_1.invalidateOnCalendario, gridfs_1.default.getUpload()?.single('archivo') || [], (0, validate_middleware_1.validate)(calendario_validation_1.crearEventoValidation), calendario_controller_1.default.crearEvento);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), calendario_controller_1.default.obtenerEventos);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), calendario_controller_1.default.obtenerEventoPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), dashboardCacheInvalidation_middleware_1.invalidateOnCalendario, gridfs_1.default.getUpload()?.single('archivo') || [], (0, validate_middleware_1.validate)(calendario_validation_1.actualizarEventoValidation), calendario_controller_1.default.actualizarEvento);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), dashboardCacheInvalidation_middleware_1.invalidateOnCalendario, calendario_controller_1.default.eliminarEvento);
router.post('/:id/confirmar', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), (0, validate_middleware_1.validate)(calendario_validation_1.confirmarAsistenciaValidation), calendario_controller_1.default.confirmarAsistencia);
router.get('/:id/adjunto', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), calendario_controller_1.default.descargarAdjunto);
router.patch('/:id/estado', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), calendario_controller_1.default.cambiarEstadoEvento);
exports.default = router;
//# sourceMappingURL=calendario.routes.js.map