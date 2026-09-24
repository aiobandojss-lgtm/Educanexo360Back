"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeNoSQL = void 0;
const esClavePeligrosa = (clave) => clave.startsWith('$') || clave.includes('.');
const limpiar = (valor, profundidad = 0) => {
    if (profundidad > 20 || valor === null || typeof valor !== 'object')
        return;
    if (valor instanceof Date || Buffer.isBuffer(valor))
        return;
    if (Array.isArray(valor)) {
        valor.forEach((item) => limpiar(item, profundidad + 1));
        return;
    }
    const objeto = valor;
    Object.keys(objeto).forEach((clave) => {
        if (esClavePeligrosa(clave)) {
            delete objeto[clave];
        }
        else {
            limpiar(objeto[clave], profundidad + 1);
        }
    });
};
const sanitizeNoSQL = (req, _res, next) => {
    limpiar(req.body);
    limpiar(req.query);
    limpiar(req.params);
    next();
};
exports.sanitizeNoSQL = sanitizeNoSQL;
exports.default = exports.sanitizeNoSQL;
//# sourceMappingURL=sanitize.middleware.js.map