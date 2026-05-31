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
const public_controller_1 = __importDefault(require("../controllers/public.controller"));
const registroController = __importStar(require("../controllers/registro.controller"));
const validate_middleware_1 = require("../middleware/validate.middleware");
const public_validation_1 = require("../validations/public.validation");
const router = express_1.default.Router();
router.post('/invitaciones/validar', (0, validate_middleware_1.validate)(public_validation_1.validarCodigoInvitacionValidation), public_controller_1.default.validarCodigoInvitacion);
router.get('/cursos/:cursoId/invitacion/:codigoInvitacion', public_controller_1.default.obtenerInfoCurso);
router.get('/cursos/invitacion/:codigoInvitacion', public_controller_1.default.obtenerCursosDisponibles);
router.get('/cursos/:cursoId/info', public_controller_1.default.obtenerInfoCursoPublica);
router.get('/estudiantes/buscar/:codigoInvitacion', public_controller_1.default.buscarEstudiantesConInvitacion);
router.get('/estudiantes/:estudianteId/invitacion/:codigoInvitacion', public_controller_1.default.obtenerEstudianteConInvitacion);
router.post('/registro/solicitudes', (0, validate_middleware_1.validate)(public_validation_1.crearSolicitudRegistroValidation), registroController.crearSolicitud);
exports.default = router;
//# sourceMappingURL=public.routes.js.map