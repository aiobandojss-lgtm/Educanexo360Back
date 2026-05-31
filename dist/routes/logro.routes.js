"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const logro_controller_1 = __importDefault(require("../controllers/logro.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const logro_validation_1 = require("../validations/logro.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(logro_validation_1.crearLogroValidation), logro_controller_1.default.crear);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), logro_controller_1.default.obtenerTodos);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), logro_controller_1.default.obtenerPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(logro_validation_1.actualizarLogroValidation), logro_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), logro_controller_1.default.eliminar);
router.get('/asignatura/:asignaturaId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), logro_controller_1.default.obtenerLogrosAsignatura);
exports.default = router;
//# sourceMappingURL=logro.routes.js.map