"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const asignatura_controller_1 = __importDefault(require("../controllers/asignatura.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const asignatura_validation_1 = require("../validations/asignatura.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/curso/:cursoId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), asignatura_controller_1.default.obtenerPorCurso);
router.get('/disponibles/:cursoId', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), asignatura_controller_1.default.obtenerNoAsignadasACurso);
router.get('/no-asignadas/:cursoId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), asignatura_controller_1.default.obtenerNoAsignadasACurso);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(asignatura_validation_1.crearAsignaturaValidation), asignatura_controller_1.default.crear);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, validate_middleware_1.validate)(asignatura_validation_1.actualizarAsignaturaValidation), asignatura_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN'), asignatura_controller_1.default.eliminar);
router.put('/:id/periodos', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(asignatura_validation_1.actualizarPeriodosValidation), asignatura_controller_1.default.actualizarPeriodos);
router.patch('/:id/remover-curso', (0, auth_middleware_1.authorize)('ADMIN'), asignatura_controller_1.default.removerDeCurso);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), asignatura_controller_1.default.obtenerTodas);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), asignatura_controller_1.default.obtenerPorId);
exports.default = router;
//# sourceMappingURL=asignatura.routes.js.map