"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enmascararEmailsEnTexto = exports.enmascararEmail = void 0;
const enmascararEmail = (email) => {
    const texto = String(email ?? '');
    const arroba = texto.lastIndexOf('@');
    if (arroba <= 0)
        return '***';
    return `${texto[0]}***${texto.slice(arroba)}`;
};
exports.enmascararEmail = enmascararEmail;
const enmascararEmailsEnTexto = (texto) => String(texto ?? '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => (0, exports.enmascararEmail)(m));
exports.enmascararEmailsEnTexto = enmascararEmailsEnTexto;
//# sourceMappingURL=enmascarar.js.map