"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificacion_controller_1 = __importDefault(require("../controllers/notificacion.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const simpleCache_1 = require("../cache/simpleCache");
const validate_middleware_1 = require("../middleware/validate.middleware");
const notificacion_validation_1 = require("../validations/notificacion.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
const registrarToken = [
    (0, validate_middleware_1.validate)(notificacion_validation_1.registrarTokenValidation),
    (req, res, next) => {
        notificacion_controller_1.default.registrarTokenFCM(req, res, next);
    },
];
router.post('/register-token', ...registrarToken);
router.post('/fcm-token', ...registrarToken);
router.post('/unregister-token', (0, validate_middleware_1.validate)(notificacion_validation_1.desregistrarTokenValidation), (req, res, next) => {
    notificacion_controller_1.default.desregistrarTokenFCM(req, res, next);
});
router.post('/test-push', (0, auth_middleware_1.authorize)('SUPER_ADMIN', 'ADMIN'), (req, res, next) => {
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