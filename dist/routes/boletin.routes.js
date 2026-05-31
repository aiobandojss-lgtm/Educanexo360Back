"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const boletin_controller_1 = __importDefault(require("../controllers/boletin.controller"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/periodo', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), boletin_controller_1.default.generarBoletinPeriodo);
router.get('/final', (0, auth_middleware_1.authorize)('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE'), boletin_controller_1.default.generarBoletinFinal);
exports.default = router;
//# sourceMappingURL=boletin.routes.js.map