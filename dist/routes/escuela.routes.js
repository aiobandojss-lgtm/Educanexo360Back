"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const escuela_controller_1 = __importDefault(require("../controllers/escuela.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const escuela_validation_1 = require("../validations/escuela.validation");
const router = express_1.default.Router();
const obtenerEscuelaPorId = (req, res, next) => {
    escuela_controller_1.default.obtenerPorId(req, res, next);
};
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(escuela_validation_1.crearEscuelaValidation), escuela_controller_1.default.crear);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), escuela_controller_1.default.obtener);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), obtenerEscuelaPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR'), (0, validate_middleware_1.validate)(escuela_validation_1.actualizarEscuelaValidation), escuela_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN'), escuela_controller_1.default.eliminar);
router.put('/:id/configuracion', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR'), (0, validate_middleware_1.validate)(escuela_validation_1.actualizarConfiguracionValidation), escuela_controller_1.default.actualizarConfiguracion);
router.put('/:id/periodos', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(escuela_validation_1.actualizarPeriodosValidation), escuela_controller_1.default.actualizarPeriodosAcademicos);
exports.default = router;
//# sourceMappingURL=escuela.routes.js.map