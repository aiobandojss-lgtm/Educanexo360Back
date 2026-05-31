"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const escuela_model_1 = __importDefault(require("../models/escuela.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const router = express_1.default.Router();
const esSuperAdmin = (req, res, next) => {
    if (req.user && req.user.tipo === 'SUPER_ADMIN') {
        next();
    }
    else {
        res.status(403).json({ success: false, message: 'Acceso denegado' });
    }
};
router.use(auth_middleware_1.authenticate);
router.use(esSuperAdmin);
router.get('/status', (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Super Admin API funcionando correctamente',
            user: req.user ? `${req.user.nombre} ${req.user.apellidos}` : 'Unknown',
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.get('/escuelas', async (req, res) => {
    try {
        const escuelas = await escuela_model_1.default.find();
        res.json({ success: true, data: escuelas });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
router.post('/escuelas', async (req, res) => {
    try {
        const { escuela: escuelaData, administrador: adminData } = req.body;
        const nuevaEscuela = new escuela_model_1.default(escuelaData);
        await nuevaEscuela.save();
        const nuevoAdmin = new usuario_model_1.default({
            ...adminData,
            escuelaId: nuevaEscuela._id,
            tipo: 'ADMIN',
        });
        await nuevoAdmin.save();
        res.status(201).json({
            success: true,
            data: {
                escuela: nuevaEscuela,
                administrador: {
                    _id: nuevoAdmin._id,
                    nombre: nuevoAdmin.nombre,
                    apellidos: nuevoAdmin.apellidos,
                    email: nuevoAdmin.email,
                },
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=superadmin.routes.js.map