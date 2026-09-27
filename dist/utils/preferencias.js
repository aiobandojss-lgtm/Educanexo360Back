"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferenciaEmail = exports.preferenciaEmailPorDefecto = exports.PREFERENCIAS_EMAIL = void 0;
exports.PREFERENCIAS_EMAIL = ['inmediato', 'resumen', 'ninguno'];
const preferenciaEmailPorDefecto = (tipo) => tipo === 'ACUDIENTE' ? 'resumen' : 'inmediato';
exports.preferenciaEmailPorDefecto = preferenciaEmailPorDefecto;
const preferenciaEmail = (usuario) => {
    const guardada = usuario?.preferencias?.email;
    return guardada && exports.PREFERENCIAS_EMAIL.includes(guardada) ? guardada : (0, exports.preferenciaEmailPorDefecto)(usuario?.tipo);
};
exports.preferenciaEmail = preferenciaEmail;
//# sourceMappingURL=preferencias.js.map