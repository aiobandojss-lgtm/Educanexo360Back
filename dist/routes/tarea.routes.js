"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const tarea_controller_1 = __importDefault(require("../controllers/tarea.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const tarea_validation_1 = __importDefault(require("../validations/tarea.validation"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sanitizeFilename_1 = require("../utils/sanitizeFilename");
const router = express_1.default.Router();
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path_1.default.join(__dirname, '../../uploads/temp');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + '-' + (0, sanitizeFilename_1.sanitizeFilename)(file.originalname));
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});
router.use(auth_middleware_1.authenticate);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.crear), tarea_controller_1.default.crear);
router.get('/', (0, validate_middleware_1.validate)(tarea_validation_1.default.listar), tarea_controller_1.default.listar);
router.get('/:id', (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.obtenerPorId);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.actualizar), tarea_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE'), (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.eliminar);
router.patch('/:id/cerrar', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.cerrar);
router.post('/:id/archivos', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), upload.array('archivos', 5), tarea_controller_1.default.subirArchivosReferencia);
router.delete('/:id/archivos/:archivoId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.archivo), tarea_controller_1.default.eliminarArchivoReferencia);
router.get('/:id/archivos/:archivoId', (0, validate_middleware_1.validate)(tarea_validation_1.default.archivo), tarea_controller_1.default.descargarArchivo);
router.patch('/:id/marcar-vista', (0, auth_middleware_1.authorize)('ESTUDIANTE'), (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.marcarVista);
router.post('/:id/entregar', (0, auth_middleware_1.authorize)('ESTUDIANTE'), upload.array('archivos', 5), (0, validate_middleware_1.validate)(tarea_validation_1.default.entregar), tarea_controller_1.default.entregar);
router.get('/:id/mi-entrega', (0, auth_middleware_1.authorize)('ESTUDIANTE'), (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.verMiEntrega);
router.get('/:id/entregas', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.obtenerPorId), tarea_controller_1.default.verEntregas);
router.put('/:id/entregas/:entregaId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.calificar), tarea_controller_1.default.calificarEntrega);
router.post('/:id/entregas/:entregaId/calificar', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), (0, validate_middleware_1.validate)(tarea_validation_1.default.calificar), tarea_controller_1.default.calificarEntrega);
router.get('/especial/mis-tareas', (0, auth_middleware_1.authorize)('ESTUDIANTE'), tarea_controller_1.default.misTareas);
router.get('/especial/estudiante/:estudianteId', (0, auth_middleware_1.authorize)('ACUDIENTE', 'ADMIN', 'COORDINADOR', 'RECTOR'), tarea_controller_1.default.tareasEstudiante);
router.get('/especial/estadisticas', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), tarea_controller_1.default.estadisticas);
router.get('/especial/proximas-vencer', (0, auth_middleware_1.authorize)('DOCENTE', 'ESTUDIANTE', 'ADMIN', 'RECTOR', 'COORDINADOR'), tarea_controller_1.default.proximasVencer);
exports.default = router;
//# sourceMappingURL=tarea.routes.js.map