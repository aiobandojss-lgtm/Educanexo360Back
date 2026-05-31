"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mensaje_controller_1 = __importStar(require("../controllers/mensaje.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const sanitizeFilename_1 = require("../utils/sanitizeFilename");
const simpleCache_1 = require("../cache/simpleCache");
const dashboardCacheInvalidation_middleware_1 = require("../middleware/dashboardCacheInvalidation.middleware");
const router = express_1.default.Router();
const verificarPermisoBorradores = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'No autorizado',
        });
        return;
    }
    if (!mensaje_controller_1.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        res.status(403).json({
            success: false,
            message: 'No tiene permisos para usar borradores',
        });
        return;
    }
    next();
};
const uploadsDir = path_1.default.join(__dirname, '../../uploads/temp');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path_1.default.extname((0, sanitizeFilename_1.sanitizeFilename)(file.originalname)));
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5,
    },
});
router.use(auth_middleware_1.authenticate);
router.post('/borradores', upload.array('adjuntos', 5), verificarPermisoBorradores, (req, res, next) => {
    mensaje_controller_1.default.guardarBorrador(req, res, next);
});
router.post('/borradores/:id', upload.array('adjuntos', 5), verificarPermisoBorradores, (req, res, next) => {
    req.query.id = req.params.id;
    mensaje_controller_1.default.guardarBorrador(req, res, next);
});
router.get('/borradores', verificarPermisoBorradores, (req, res, next) => {
    mensaje_controller_1.default.obtenerBorradores(req, res, next);
});
router.get('/borradores/:id', verificarPermisoBorradores, (req, res, next) => {
    mensaje_controller_1.default.obtenerBorradorPorId(req, res, next);
});
router.post('/borradores/:id/enviar', verificarPermisoBorradores, (req, res, next) => {
    mensaje_controller_1.default.enviarBorrador(req, res, next);
});
router.delete('/borradores/:id', verificarPermisoBorradores, (req, res, next) => {
    mensaje_controller_1.default.eliminarBorrador(req, res, next);
});
router.get('/destinatarios-acudiente', (0, auth_middleware_1.authorize)('ACUDIENTE', 'ESTUDIANTE'), (req, res, next) => {
    mensaje_controller_1.default.getDestinatariosParaAcudiente(req, res, next);
});
router.get('/destinatarios-estudiante', (0, auth_middleware_1.authorize)('ACUDIENTE', 'ESTUDIANTE'), (req, res, next) => {
    mensaje_controller_1.default.getDestinatariosParaAcudiente(req, res, next);
});
router.get('/destinatarios-disponibles', (req, res, next) => {
    mensaje_controller_1.default.getPosiblesDestinatarios(req, res, next);
});
router.get('/cursos-disponibles', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'), (req, res, next) => {
    mensaje_controller_1.default.getCursosPosiblesDestinatarios(req, res, next);
});
router.post('/', upload.array('adjuntos', 5), dashboardCacheInvalidation_middleware_1.invalidateOnMensaje, (req, res, next) => {
    mensaje_controller_1.default.crear(req, res, next);
});
router.get('/', (0, simpleCache_1.cacheMiddleware)('mensajes'), (req, res, next) => {
    mensaje_controller_1.default.obtenerTodos(req, res, next);
});
router.get('/ultimos', (req, res, next) => {
    mensaje_controller_1.default.obtenerUltimos(req, res, next);
});
router.get('/estadisticas-docentes', (0, auth_middleware_1.authorize)('RECTOR', 'COORDINADOR', 'ADMIN'), (req, res, next) => {
    mensaje_controller_1.default.estadisticasDocentes(req, res, next);
});
router.get('/auditoria', (0, auth_middleware_1.authorize)('RECTOR', 'COORDINADOR', 'ADMIN'), (req, res, next) => {
    mensaje_controller_1.default.auditoriaDocente(req, res, next);
});
router.get('/:id', (req, res, next) => {
    mensaje_controller_1.default.obtenerPorId(req, res, next);
});
router.put('/:id/eliminar', (req, res, next) => {
    mensaje_controller_1.default.eliminar(req, res, next);
});
router.put('/:id/restaurar', (req, res, next) => {
    mensaje_controller_1.default.restaurar(req, res, next);
});
router.delete('/:id', (req, res, next) => {
    mensaje_controller_1.default.eliminarPermanentemente(req, res, next);
});
router.put('/:id/archivar', (req, res, next) => {
    mensaje_controller_1.default.archivar(req, res, next);
});
router.put('/:id/desarchivar', (req, res, next) => {
    mensaje_controller_1.default.desarchivar(req, res, next);
});
router.put('/:id/lectura', (req, res, next) => {
    mensaje_controller_1.default.actualizarEstadoLectura(req, res, next);
});
router.put('/:id/leer', (req, res, next) => {
    mensaje_controller_1.default.actualizarEstadoLectura(req, res, next);
});
router.post('/:mensajeId/responder', upload.array('adjuntos', 5), (req, res, next) => {
    mensaje_controller_1.default.responder(req, res, next);
});
router.get('/:mensajeId/adjuntos/:adjuntoId', (req, res, next) => {
    mensaje_controller_1.default.descargarAdjunto(req, res, next);
});
exports.default = router;
//# sourceMappingURL=mensaje.routes.js.map