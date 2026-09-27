"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reintentarFallidos = exports.obtenerEstadoOutbox = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const outbox_model_1 = __importDefault(require("../models/outbox.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const outbox_1 = require("../queue/outbox");
const monitorEnvios_1 = require("../queue/monitorEnvios");
const proveedores_1 = require("../services/email/proveedores");
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
        const [porEstado, pendienteMasAntiguo, fallidosRecientes, conErrorPorTipo, conErrorRecientes] = await Promise.all([
            outbox_model_1.default.aggregate([{ $match: filtro }, { $group: { _id: '$estado', total: { $sum: 1 } } }]),
            outbox_model_1.default.findOne({ ...filtro, estado: 'PENDIENTE' })
                .sort({ nextRunAt: 1 })
                .select('tipo nextRunAt createdAt intentos')
                .lean(),
            outbox_model_1.default.find({ ...filtro, estado: 'FALLIDO' })
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('tipo error intentos updatedAt definitivo')
                .lean(),
            outbox_model_1.default.aggregate([
                { $match: { ...filtro, estado: 'PENDIENTE', error: { $exists: true, $ne: null } } },
                { $group: { _id: '$tipo', total: { $sum: 1 }, maxIntentosLlevados: { $max: '$intentos' } } },
            ]),
            outbox_model_1.default.find({ ...filtro, estado: 'PENDIENTE', error: { $exists: true, $ne: null } })
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('tipo error intentos nextRunAt updatedAt')
                .lean(),
        ]);
        const cfg = (0, outbox_1.configuracionWorker)();
        const pendientesConError = {
            total: conErrorPorTipo.reduce((t, g) => t + g.total, 0),
            porTipo: conErrorPorTipo.map((g) => ({
                tipo: g._id,
                total: g.total,
                maxIntentosLlevados: g.maxIntentosLlevados,
                intentosPermitidos: outbox_1.TIPOS_CORREO.includes(g._id) ? cfg.maxIntentosCorreo : cfg.maxIntentos,
            })),
            recientes: conErrorRecientes,
        };
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
                pendientesConError,
                ...(req.user.tipo === 'SUPER_ADMIN' && { correo: { ...(0, monitorEnvios_1.estadoMonitor)(), cortocircuito: (0, proveedores_1.estadoCortocircuito)() } }),
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.obtenerEstadoOutbox = obtenerEstadoOutbox;
const reintentarFallidos = async (req, res, next) => {
    try {
        if (!req.user)
            throw new ApiError_1.default(401, 'No autorizado');
        if (req.user.tipo !== 'SUPER_ADMIN')
            throw new ApiError_1.default(403, 'Solo SUPER_ADMIN puede reintentar la cola de envíos');
        const { desde, hasta, tipo } = req.body || {};
        const ahora = new Date();
        const filtro = {
            estado: 'FALLIDO',
            definitivo: { $ne: true },
            'payload.redactado': { $ne: true },
            $or: [{ 'payload.caducaEn': { $exists: false } }, { 'payload.caducaEn': { $gt: ahora } }],
        };
        if (tipo)
            filtro.tipo = tipo;
        if (desde || hasta) {
            filtro.updatedAt = { ...(desde && { $gte: new Date(desde) }), ...(hasta && { $lte: new Date(hasta) }) };
        }
        const r = await outbox_model_1.default.updateMany(filtro, {
            $set: { estado: 'PENDIENTE', intentos: 0, nextRunAt: ahora, error: `Reintento manual (${ahora.toISOString()})` },
            $unset: { expireAt: 1, lockedUntil: 1 },
        });
        res.json({
            success: true,
            data: { reintentados: r.modifiedCount },
            message: `${r.modifiedCount} trabajo(s) devueltos a la cola`,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.reintentarFallidos = reintentarFallidos;
//# sourceMappingURL=outbox.controller.js.map