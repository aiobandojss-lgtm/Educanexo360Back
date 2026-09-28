"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reemplazoRespuestaJson = reemplazoRespuestaJson;
const CAMPOS_INTERNOS = new Set(['almacen', 'clave', 'sha256']);
function reemplazoRespuestaJson(campo, valor) {
    if (CAMPOS_INTERNOS.has(campo) && this && typeof this === 'object' && this.fileId != null)
        return undefined;
    return valor;
}
//# sourceMappingURL=filtroRespuesta.js.map