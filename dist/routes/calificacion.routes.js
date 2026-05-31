"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const calificacion_controller_1 = __importDefault(require("../controllers/calificacion.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const calificacion_validation_1 = require("../validations/calificacion.validation");
const simpleCache_1 = require("../cache/simpleCache");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(calificacion_validation_1.crearCalificacionValidation), calificacion_controller_1.default.crear);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), (0, simpleCache_1.cacheMiddleware)('calificaciones'), calificacion_controller_1.default.obtenerTodas);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), calificacion_controller_1.default.obtenerPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(calificacion_validation_1.actualizarCalificacionValidation), calificacion_controller_1.default.actualizar);
router.post('/:id/logros', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(calificacion_validation_1.agregarCalificacionLogroValidation), calificacion_controller_1.default.agregarCalificacionLogro);
router.put('/:id/logros', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(calificacion_validation_1.actualizarCalificacionLogroValidation), calificacion_controller_1.default.actualizarCalificacionLogro);
exports.default = router;
//# sourceMappingURL=calificacion.routes.js.map