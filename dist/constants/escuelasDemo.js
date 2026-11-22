"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incluirDemo = exports.filtroEscuelasSinDemo = exports.esEscuelaSinCorreo = exports.ESCUELAS_SIN_CORREO = exports.ID_ESCUELA_REVISORES = exports.CODIGO_ESCUELA_DEMO = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
exports.CODIGO_ESCUELA_DEMO = 'DEMO-EDUCANEXO';
exports.ID_ESCUELA_REVISORES = 'a0a0a0a0a0a0a0a0a0a0a0a0';
exports.ESCUELAS_SIN_CORREO = [exports.ID_ESCUELA_REVISORES];
const esEscuelaSinCorreo = (escuelaId) => escuelaId != null && exports.ESCUELAS_SIN_CORREO.includes(String(escuelaId));
exports.esEscuelaSinCorreo = esEscuelaSinCorreo;
const filtroEscuelasSinDemo = () => ({
    $nor: [{ _id: new mongoose_1.default.Types.ObjectId(exports.ID_ESCUELA_REVISORES) }, { codigo: exports.CODIGO_ESCUELA_DEMO }],
});
exports.filtroEscuelasSinDemo = filtroEscuelasSinDemo;
const incluirDemo = (query) => !!query && typeof query === 'object' && query.incluirDemo === 'true';
exports.incluirDemo = incluirDemo;
//# sourceMappingURL=escuelasDemo.js.map