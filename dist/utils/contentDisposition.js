"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentDispositionAdjunto = void 0;
const contentDispositionAdjunto = (nombre) => {
    const nombreArchivo = String(nombre || 'archivo');
    const nombreAscii = nombreArchivo.replace(/[^\x20-\x7E]|["\\]/g, '_');
    const codificado = encodeURIComponent(nombreArchivo).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    return `attachment; filename="${nombreAscii}"; filename*=UTF-8''${codificado}`;
};
exports.contentDispositionAdjunto = contentDispositionAdjunto;
//# sourceMappingURL=contentDisposition.js.map