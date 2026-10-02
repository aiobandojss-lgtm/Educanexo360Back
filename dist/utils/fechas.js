"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finDelDiaColombia = exports.fechaLegibleColombia = exports.normalizarFechaCliente = exports.parsearFechaCliente = exports.inicioDiaColombia = exports.inicioDiaSiguienteColombia = exports.horaColombia = exports.fechaColombiaISO = exports.inicioMesColombia = void 0;
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const inicioMesColombia = (ahora = new Date()) => {
    const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
    return new Date(Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), 1));
};
exports.inicioMesColombia = inicioMesColombia;
const fechaColombiaISO = (ahora = new Date()) => new Date(ahora.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);
exports.fechaColombiaISO = fechaColombiaISO;
const horaColombia = (ahora = new Date()) => new Date(ahora.getTime() - DESFASE_COLOMBIA_MS).getUTCHours();
exports.horaColombia = horaColombia;
const inicioDiaSiguienteColombia = (ahora = new Date(), minutos = 0) => {
    const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
    return new Date(Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), enColombia.getUTCDate() + 1) +
        DESFASE_COLOMBIA_MS +
        minutos * 60 * 1000);
};
exports.inicioDiaSiguienteColombia = inicioDiaSiguienteColombia;
const inicioDiaColombia = (ahora = new Date()) => {
    const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
    return new Date(Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), enColombia.getUTCDate()) +
        DESFASE_COLOMBIA_MS);
};
exports.inicioDiaColombia = inicioDiaColombia;
const ISO_SIN_ZONA = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;
const parsearFechaCliente = (valor) => {
    if (valor instanceof Date)
        return valor;
    const texto = String(valor ?? '').trim();
    const m = texto.match(ISO_SIN_ZONA);
    if (m) {
        const [, dia, hh, mm, ss = '00', fraccion = ''] = m;
        return new Date(`${dia}T${hh}:${mm}:${ss}.${(fraccion + '000').slice(0, 3)}-05:00`);
    }
    return new Date(texto);
};
exports.parsearFechaCliente = parsearFechaCliente;
const normalizarFechaCliente = (texto) => {
    if (!ISO_SIN_ZONA.test(texto.trim()))
        return texto;
    const fecha = (0, exports.parsearFechaCliente)(texto);
    return Number.isNaN(fecha.getTime()) ? texto : fecha.toISOString();
};
exports.normalizarFechaCliente = normalizarFechaCliente;
const fechaLegibleColombia = (fecha) => new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
exports.fechaLegibleColombia = fechaLegibleColombia;
const finDelDiaColombia = (fecha) => {
    const f = new Date(fecha);
    return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + 1) + DESFASE_COLOMBIA_MS - 1);
};
exports.finDelDiaColombia = finDelDiaColombia;
//# sourceMappingURL=fechas.js.map