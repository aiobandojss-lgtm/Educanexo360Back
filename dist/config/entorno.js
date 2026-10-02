"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.variablesRecortadas = exports.normalizarEntorno = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const normalizarEntorno = (entorno = process.env) => {
    const recortadas = [];
    for (const [nombre, valor] of Object.entries(entorno)) {
        if (typeof valor !== 'string')
            continue;
        const limpio = valor.trim();
        if (limpio !== valor) {
            entorno[nombre] = limpio;
            recortadas.push(nombre);
        }
    }
    return recortadas;
};
exports.normalizarEntorno = normalizarEntorno;
dotenv_1.default.config();
exports.variablesRecortadas = (0, exports.normalizarEntorno)();
if (exports.variablesRecortadas.length > 0) {
    console.warn(`[Entorno] Se quitaron espacios al inicio/fin de: ${exports.variablesRecortadas.join(', ')}`);
}
//# sourceMappingURL=entorno.js.map