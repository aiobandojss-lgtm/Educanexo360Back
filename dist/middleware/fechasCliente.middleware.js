"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizarFechasCliente = void 0;
const fechas_1 = require("../utils/fechas");
const ES_CLAVE_FECHA = /^(fecha.*|inicio|fin|desde|hasta)$/i;
const PROFUNDIDAD_MAXIMA = 5;
const normalizar = (valor, profundidad) => {
    if (!valor || typeof valor !== 'object' || profundidad > PROFUNDIDAD_MAXIMA)
        return;
    for (const clave of Object.keys(valor)) {
        const v = valor[clave];
        if (typeof v === 'string' && ES_CLAVE_FECHA.test(clave))
            valor[clave] = (0, fechas_1.normalizarFechaCliente)(v);
        else if (v && typeof v === 'object')
            normalizar(v, profundidad + 1);
    }
};
const normalizarFechasCliente = (req, _res, next) => {
    normalizar(req.body, 0);
    normalizar(req.query, 0);
    next();
};
exports.normalizarFechasCliente = normalizarFechasCliente;
//# sourceMappingURL=fechasCliente.middleware.js.map