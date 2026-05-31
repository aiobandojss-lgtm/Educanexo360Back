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
const usuario_controller_1 = __importDefault(require("../controllers/usuario.controller"));
const authMiddleware = __importStar(require("../middleware/auth.middleware"));
const validate_middleware_1 = require("../middleware/validate.middleware");
const usuario_validation_1 = require("../validations/usuario.validation");
const simpleCache_1 = require("../cache/simpleCache");
const router = express_1.default.Router();
router.use(authMiddleware.authenticate);
router.get('/', authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR'), (0, simpleCache_1.cacheMiddleware)('usuarios'), usuario_controller_1.default.obtenerUsuarios);
router.get('/buscar', authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), usuario_controller_1.default.buscarUsuarios);
router.get('/estudiantes', authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, simpleCache_1.cacheMiddleware)('usuarios-estudiantes'), (req, _res, next) => { req.query.tipo = 'ESTUDIANTE'; next(); }, usuario_controller_1.default.obtenerUsuarios);
router.get('/docentes', authMiddleware.authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, simpleCache_1.cacheMiddleware)('usuarios-docentes'), (req, _res, next) => { req.query.tipo = 'DOCENTE'; next(); }, usuario_controller_1.default.obtenerUsuarios);
router.get('/:id', usuario_controller_1.default.obtenerUsuario);
router.put('/:id', (0, validate_middleware_1.validate)(usuario_validation_1.actualizarUsuarioValidation), usuario_controller_1.default.actualizarUsuario);
router.delete('/:id', authMiddleware.authorize('ADMIN', 'RECTOR', 'COORDINADOR'), usuario_controller_1.default.eliminarUsuario);
router.post('/:id/cambiar-password', (0, validate_middleware_1.validate)(usuario_validation_1.cambiarPasswordValidation), usuario_controller_1.default.cambiarPassword);
router.get('/:id/estudiantes-asociados', authMiddleware.authorize('ADMIN', 'DOCENTE', 'ACUDIENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), usuario_controller_1.default.obtenerEstudiantesAsociados);
router.post('/:id/estudiantes-asociados', authMiddleware.authorize('ADMIN', 'ACUDIENTE', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'), (0, validate_middleware_1.validate)(usuario_validation_1.asociarEstudianteValidation), usuario_controller_1.default.asociarEstudiante);
router.delete('/:id/estudiantes-asociados/:estudianteId', authMiddleware.authorize('ADMIN', 'ACUDIENTE', 'RECTOR', 'COORDINADOR'), usuario_controller_1.default.eliminarAsociacionEstudiante);
exports.default = router;
//# sourceMappingURL=usuario.routes.js.map