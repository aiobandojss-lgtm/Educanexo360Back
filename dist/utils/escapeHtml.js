"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlSegura = exports.escapeHtml = void 0;
const MAPA = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};
const escapeHtml = (valor) => String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);
exports.escapeHtml = escapeHtml;
const urlSegura = (valor) => {
    try {
        const url = new URL(String(valor ?? ''));
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return '#';
        return (0, exports.escapeHtml)(url.toString());
    }
    catch {
        return '#';
    }
};
exports.urlSegura = urlSegura;
//# sourceMappingURL=escapeHtml.js.map