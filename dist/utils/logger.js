"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const ORDEN = { error: 0, warn: 1, info: 2, debug: 3 };
const nivelActual = () => {
    const configurado = (process.env.LOG_LEVEL || '').toLowerCase();
    if (configurado in ORDEN)
        return ORDEN[configurado];
    return process.env.NODE_ENV === 'production' ? ORDEN.warn : ORDEN.info;
};
exports.logger = {
    error: (...args) => console.error(...args),
    warn: (...args) => {
        if (nivelActual() >= ORDEN.warn)
            console.warn(...args);
    },
    info: (...args) => {
        if (nivelActual() >= ORDEN.info)
            console.log(...args);
    },
    debug: (...args) => {
        if (nivelActual() >= ORDEN.debug)
            console.log(...args);
    },
};
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map