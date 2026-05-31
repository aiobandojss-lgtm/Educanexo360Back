"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_middleware_1 = require("../middleware/validate.middleware");
const perfilRol_controller_1 = __importDefault(require("../controllers/perfilRol.controller"));
const perfilRol_validation_1 = require("../validations/perfilRol.validation");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/catalogo/permisos', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), perfilRol_controller_1.default.obtenerCatalogoPermisos);
router.get('/catalogo/sugeridos/:rolBase', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), perfilRol_controller_1.default.obtenerPermisosSugeridos);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), perfilRol_controller_1.default.listar);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(perfilRol_validation_1.crearPerfilRolValidation), perfilRol_controller_1.default.crear);
router.get('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR'), perfilRol_controller_1.default.obtener);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(perfilRol_validation_1.actualizarPerfilRolValidation), perfilRol_controller_1.default.actualizar);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN'), perfilRol_controller_1.default.eliminar);
router.post('/usuarios/:usuarioId/asignar', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(perfilRol_validation_1.asignarPerfilRolValidation), perfilRol_controller_1.default.asignarAUsuario);
router.delete('/usuarios/:usuarioId/perfil', (0, auth_middleware_1.authorize)('ADMIN'), (0, validate_middleware_1.validate)(perfilRol_validation_1.removerPerfilRolValidation), perfilRol_controller_1.default.removerDeUsuario);
exports.default = router;
//# sourceMappingURL=perfilRol.routes.js.map