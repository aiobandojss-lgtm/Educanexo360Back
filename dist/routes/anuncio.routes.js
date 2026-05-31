"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const anuncio_controller_1 = __importDefault(require("../controllers/anuncio.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const anuncio_validation_1 = __importDefault(require("../validations/anuncio.validation"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sanitizeFilename_1 = require("../utils/sanitizeFilename");
const simpleCache_1 = require("../cache/simpleCache");
const dashboardCacheInvalidation_middleware_1 = require("../middleware/dashboardCacheInvalidation.middleware");
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
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), dashboardCacheInvalidation_middleware_1.invalidateOnAnuncio, (0, validate_middleware_1.validate)(anuncio_validation_1.default.crear), anuncio_controller_1.default.crear);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), dashboardCacheInvalidation_middleware_1.invalidateOnAnuncio, (0, validate_middleware_1.validate)(anuncio_validation_1.default.actualizar), anuncio_controller_1.default.actualizar);
router.patch('/:id/publicar', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), dashboardCacheInvalidation_middleware_1.invalidateOnAnuncio, anuncio_controller_1.default.publicar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), anuncio_controller_1.default.eliminar);
router.post('/:id/adjuntos', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), upload.array('archivos', 5), anuncio_controller_1.default.agregarAdjuntos);
router.delete('/:id/adjuntos/:archivoId', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'), anuncio_controller_1.default.eliminarAdjunto);
router.get('/', (0, simpleCache_1.cacheMiddleware)('anuncios'), anuncio_controller_1.default.obtenerTodos);
router.get('/:id', anuncio_controller_1.default.obtenerPorId);
router.get('/:id/adjunto/:archivoId', auth_middleware_1.authenticate, anuncio_controller_1.default.obtenerAdjunto);
exports.default = router;
//# sourceMappingURL=anuncio.routes.js.map