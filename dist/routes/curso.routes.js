"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const curso_controller_1 = __importDefault(require("../controllers/curso.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const curso_validation_1 = require("../validations/curso.validation");
const simpleCache_1 = require("../cache/simpleCache");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(curso_validation_1.crearCursoValidation), curso_controller_1.default.crear);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(curso_validation_1.actualizarCursoValidation), curso_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN'), curso_controller_1.default.eliminar);
router.post('/:id/estudiantes', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(curso_validation_1.agregarEstudiantesValidation), curso_controller_1.default.agregarEstudiantes);
router.delete('/:id/estudiantes', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(curso_validation_1.removerEstudiantesValidation), curso_controller_1.default.removerEstudiantes);
router.get('/:id/estudiantes', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), curso_controller_1.default.obtenerEstudiantes);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, simpleCache_1.cacheMiddleware)('cursos'), curso_controller_1.default.obtenerTodos);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), curso_controller_1.default.obtenerPorId);
exports.default = router;
//# sourceMappingURL=curso.routes.js.map