"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cupoDeHoy = exports.liberarCupo = exports.reservarCupo = exports.topeCupo = exports.limitesCupo = exports.CupoCorreo = void 0;
const emailCupo_model_1 = __importDefault(require("../../models/emailCupo.model"));
const fechas_1 = require("../../utils/fechas");
exports.CupoCorreo = emailCupo_model_1.default;
const num = (clave, d) => {
    const v = parseInt(process.env[clave] || '', 10);
    return Number.isFinite(v) && v >= 0 ? v : d;
};
const limitesCupo = () => {
    const limite = num('EMAIL_DAILY_LIMIT', 250);
    const reservaCritica = Math.min(num('EMAIL_RESERVA_CRITICA', 20), limite);
    const reservaAlta = Math.min(num('EMAIL_RESERVA_ALTA', 20), limite - reservaCritica);
    return { limite, reservaAlta, reservaCritica };
};
exports.limitesCupo = limitesCupo;
const topeCupo = (prioridad) => {
    const { limite, reservaAlta, reservaCritica } = (0, exports.limitesCupo)();
    if (prioridad === 'critica')
        return limite;
    if (prioridad === 'alta')
        return limite - reservaCritica;
    return limite - reservaCritica - reservaAlta;
};
exports.topeCupo = topeCupo;
const reservarCupo = async (prioridad, cantidad = 1) => {
    const tope = (0, exports.topeCupo)(prioridad);
    if (cantidad > tope)
        return null;
    const dia = (0, fechas_1.fechaColombiaISO)();
    const filtro = { _id: dia, enviados: { $lte: tope - cantidad } };
    const inc = { $inc: { enviados: cantidad, ...(prioridad !== 'normal' && { [`${prioridad}Enviados`]: cantidad }) } };
    try {
        await exports.CupoCorreo.findOneAndUpdate(filtro, { ...inc, $setOnInsert: { expireAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) } }, { upsert: true, new: true });
        return dia;
    }
    catch (error) {
        if (error?.code !== 11000)
            throw error;
        const r = await exports.CupoCorreo.findOneAndUpdate(filtro, inc, { new: true });
        return r ? dia : null;
    }
};
exports.reservarCupo = reservarCupo;
const liberarCupo = async (prioridad, cantidad, dia) => {
    await exports.CupoCorreo.updateOne({ _id: dia }, { $inc: { enviados: -cantidad, ...(prioridad !== 'normal' && { [`${prioridad}Enviados`]: -cantidad }) } });
};
exports.liberarCupo = liberarCupo;
const cupoDeHoy = async () => {
    const doc = await exports.CupoCorreo.findById((0, fechas_1.fechaColombiaISO)()).lean();
    return {
        dia: (0, fechas_1.fechaColombiaISO)(),
        enviados: doc?.enviados || 0,
        altaEnviados: doc?.altaEnviados || 0,
        criticaEnviados: doc?.criticaEnviados || 0,
        ...(0, exports.limitesCupo)(),
    };
};
exports.cupoDeHoy = cupoDeHoy;
//# sourceMappingURL=cupo.js.map