"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numeroLimite = exports.numeroPagina = exports.LIMITE_MAXIMO = void 0;
exports.LIMITE_MAXIMO = 100;
const numeroPagina = (valor, porDefecto = 1) => Math.max(parseInt(String(valor), 10) || porDefecto, 1);
exports.numeroPagina = numeroPagina;
const numeroLimite = (valor, porDefecto, maximo = exports.LIMITE_MAXIMO) => Math.min(Math.max(parseInt(String(valor), 10) || porDefecto, 1), maximo);
exports.numeroLimite = numeroLimite;
//# sourceMappingURL=paginacion.js.map