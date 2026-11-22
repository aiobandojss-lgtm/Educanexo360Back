"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.conservarIdsPeriodos = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const conservarIdsPeriodos = (existentes, entrantes) => {
    const porId = new Map(existentes.map((p) => [String(p._id), p]));
    const usados = new Set();
    const asignados = new Array(entrantes.length).fill(undefined);
    entrantes.forEach((p, i) => {
        const id = p._id !== undefined && p._id !== null ? String(p._id) : '';
        if (id && porId.has(id) && !usados.has(id)) {
            asignados[i] = id;
            usados.add(id);
        }
    });
    entrantes.forEach((p, i) => {
        if (asignados[i])
            return;
        const existente = existentes.find((e) => Number(e.numero) === Number(p.numero) && !usados.has(String(e._id)));
        if (existente) {
            asignados[i] = String(existente._id);
            usados.add(String(existente._id));
        }
    });
    return entrantes.map((p, i) => ({
        ...(asignados[i] ? { _id: new mongoose_1.default.Types.ObjectId(asignados[i]) } : {}),
        numero: p.numero,
        nombre: p.nombre,
        fecha_inicio: p.fecha_inicio,
        fecha_fin: p.fecha_fin,
    }));
};
exports.conservarIdsPeriodos = conservarIdsPeriodos;
//# sourceMappingURL=periodosAcademicos.js.map