"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizarTexto = exports.generarEmailEstudiante = exports.generarCodigoEstudiante = exports.generarCodigoAleatorio = void 0;
const generarCodigoAleatorio = (longitud) => {
    const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let resultado = '';
    for (let i = 0; i < longitud; i++) {
        resultado += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    return resultado;
};
exports.generarCodigoAleatorio = generarCodigoAleatorio;
const generarCodigoEstudiante = (nombre, apellidos) => {
    const inicialesNombre = nombre.charAt(0).toUpperCase();
    const inicialesApellido = apellidos.charAt(0).toUpperCase();
    const numeroAleatorio = Math.floor(100000 + Math.random() * 900000);
    const año = new Date().getFullYear().toString().slice(-2);
    return `EST${inicialesNombre}${inicialesApellido}${año}${numeroAleatorio}`;
};
exports.generarCodigoEstudiante = generarCodigoEstudiante;
const generarEmailEstudiante = (nombre, apellidos, escuelaId) => {
    const nombreNormalizado = nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
    const apellidoNormalizado = apellidos
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '');
    const baseEmail = `${nombreNormalizado}.${apellidoNormalizado}`;
    const sufijo = escuelaId.slice(-4);
    return `${baseEmail}${sufijo}@estudiante.educanexo.com`;
};
exports.generarEmailEstudiante = generarEmailEstudiante;
const normalizarTexto = (texto) => {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
};
exports.normalizarTexto = normalizarTexto;
//# sourceMappingURL=codigoUtils.js.map