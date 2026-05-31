"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const estudiante_controller_1 = require("../controllers/estudiante.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.get('/buscar', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (req, res, next) => {
    (0, estudiante_controller_1.buscarEstudiantesParaAsociacion)(req, res).catch(next);
});
router.get('/:id', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (req, res, next) => {
    (0, estudiante_controller_1.obtenerEstudiantePorId)(req, res).catch(next);
});
router.post('/:estudianteId/verificar-asociacion', auth_middleware_1.authenticate, (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), (req, res, next) => {
    (0, estudiante_controller_1.verificarAsociacionEstudiante)(req, res).catch(next);
});
exports.default = router;
//# sourceMappingURL=estudiante.routes.js.map