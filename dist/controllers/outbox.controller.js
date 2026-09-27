"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEstadoOutbox = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const outbox_model_1 = __importDefault(require("../models/outbox.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const outbox_1 = require("../queue/outbox");
const obtenerEstadoOutbox = async (req, res, next) => {
    try {
        if (!req.user)
            throw new ApiError_1.default(401, 'No autorizado');
        let filtro = {};
        if (req.user.tipo === 'SUPER_ADMIN') {
            const escuelaId = typeof req.query.escuelaId === 'string' ? req.query.escuelaId : undefined;
            if (escuelaId)
                filtro = { escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId) };
        }
        else if (req.user.tipo === 'ADMIN') {
            if (!mongoose_1.default.isValidObjectId(req.user.escuelaId)) {
                throw new ApiError_1.default(403, 'El usuario no tiene un colegio asociado');
            }
            filtro = { escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId) };
        }
        else {
            throw new ApiError_1.default(403, 'No tienes permiso para ver la cola de envíos');
        }
        const [porEstado, pendienteMasAntiguo, fallidosRecientes] = await Promise.all([
            outbox_model_1.default.aggregate([{ $match: filtro }, { $group: { _id: '$estado', total: { $sum: 1 } } }]),
            outbox_model_1.default.findOne({ ...filtro, estado: 'PENDIENTE' })
                .sort({ nextRunAt: 1 })
                .select('tipo nextRunAt createdAt intentos')
                .lean(),
            outbox_model_1.default.find({ ...filtro, estado: 'FALLIDO' })
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('tipo error intentos updatedAt')
                .lean(),
        ]);
        const conteos = { PENDIENTE: 0, PROCESANDO: 0, HECHO: 0, FALLIDO: 0 };
        porEstado.forEach((e) => {
            conteos[e._id] = e.total;
        });
        res.json({
            success: true,
            data: {
                worker: (0, outbox_1.estadoWorker)(),
                conteos,
                pendienteMasAntiguo,
                fallidosRecientes,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.obtenerEstadoOutbox = obtenerEstadoOutbox;
//# sourceMappingURL=outbox.controller.js.map