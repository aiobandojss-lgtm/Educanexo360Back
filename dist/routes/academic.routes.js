"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const academic_controller_1 = __importDefault(require("../controllers/academic.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/promedio-periodo', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), academic_controller_1.default.obtenerPromedioPeriodo);
router.get('/promedio-asignatura', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), academic_controller_1.default.obtenerPromedioAsignatura);
router.get('/estadisticas-grupo', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), academic_controller_1.default.obtenerEstadisticasGrupo);
exports.default = router;
//# sourceMappingURL=academic.routes.js.map