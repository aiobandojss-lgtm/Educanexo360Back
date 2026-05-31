"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const asistencia_validation_1 = require("../validations/asistencia.validation");
const asistencia_controller_1 = require("../controllers/asistencia.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/dia', asistencia_controller_1.obtenerAsistenciaDia);
router.get('/alertas', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, validate_middleware_1.validate)(asistencia_validation_1.alertasAsistenciaValidation), asistencia_controller_1.getAlertasAsistencia);
router.get('/estadisticas/curso/:cursoId', asistencia_controller_1.obtenerEstadisticasCurso);
router.get('/estadisticas/estudiante/:estudianteId', asistencia_controller_1.obtenerEstadisticasEstudiante);
router.get('/resumen', asistencia_controller_1.obtenerResumen);
router.get('/resumen/periodo/:periodoId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), asistencia_controller_1.obtenerResumenPeriodo);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, validate_middleware_1.validate)(asistencia_validation_1.crearAsistenciaValidation), asistencia_controller_1.crearAsistencia);
router.get('/', asistencia_controller_1.obtenerAsistencias);
router.get('/:id', asistencia_controller_1.obtenerAsistenciaPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, validate_middleware_1.validate)(asistencia_validation_1.actualizarAsistenciaValidation), asistencia_controller_1.actualizarAsistencia);
router.patch('/:id/finalizar', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), asistencia_controller_1.finalizarAsistencia);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), asistencia_controller_1.eliminarAsistencia);
exports.default = router;
//# sourceMappingURL=asistencia.routes.js.map