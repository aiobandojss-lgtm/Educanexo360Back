"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finDelDiaColombia = exports.inicioMesColombia = void 0;
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const inicioMesColombia = (ahora = new Date()) => {
    const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
    return new Date(Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), 1));
};
exports.inicioMesColombia = inicioMesColombia;
const finDelDiaColombia = (fecha) => {
    const f = new Date(fecha);
    return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + 1) + DESFASE_COLOMBIA_MS - 1);
};
exports.finDelDiaColombia = finDelDiaColombia;
//# sourceMappingURL=fechas.js.map