"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.regexBusqueda = exports.patronBusqueda = void 0;
const escapeRegex_1 = require("./escapeRegex");
const VARIANTES = {
    a: 'aáàäâãAÁÀÄÂÃ',
    e: 'eéèëêEÉÈËÊ',
    i: 'iíìïîIÍÌÏÎ',
    o: 'oóòöôõOÓÒÖÔÕ',
    u: 'uúùüûUÚÙÜÛ',
    n: 'nñNÑ',
    c: 'cçCÇ',
};
const patronBusqueda = (texto) => Array.from(String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase())
    .map((ch) => (VARIANTES[ch] ? `[${VARIANTES[ch]}]` : (0, escapeRegex_1.escapeRegex)(ch)))
    .join('');
exports.patronBusqueda = patronBusqueda;
const regexBusqueda = (texto, opciones = {}) => new RegExp(`${opciones.prefijo ? '^' : ''}${(0, exports.patronBusqueda)(texto)}`, 'i');
exports.regexBusqueda = regexBusqueda;
//# sourceMappingURL=regexBusqueda.js.map