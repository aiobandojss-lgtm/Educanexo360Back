"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificacion_controller_1 = __importDefault(require("../controllers/notificacion.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const simpleCache_1 = require("../cache/simpleCache");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/register-token', (req, res, next) => {
    notificacion_controller_1.default.registrarTokenFCM(req, res, next);
});
router.post('/test-push', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (req, res, next) => {
    notificacion_controller_1.default.enviarNotificacionPrueba(req, res, next);
});
router.get('/', (0, simpleCache_1.cacheMiddleware)('notificaciones'), (req, res, next) => {
    notificacion_controller_1.default.obtenerNotificaciones(req, res, next);
});
router.put('/:id/leer', (req, res, next) => {
    notificacion_controller_1.default.marcarComoLeida(req, res, next);
});
router.put('/leer-todas', (req, res, next) => {
    notificacion_controller_1.default.marcarTodasComoLeidas(req, res, next);
});
router.put('/:id/archivar', (req, res, next) => {
    notificacion_controller_1.default.archivarNotificacion(req, res, next);
});
router.post('/', (0, auth_middleware_1.authorize)('ADMIN'), (req, res, next) => {
    notificacion_controller_1.default.crearNotificacion(req, res, next);
});
router.post('/masiva', (0, auth_middleware_1.authorize)('ADMIN'), (req, res, next) => {
    notificacion_controller_1.default.crearNotificacionMasiva(req, res, next);
});
exports.default = router;
//# sourceMappingURL=notificacion.routes.js.map