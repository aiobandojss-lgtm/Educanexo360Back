"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eliminarSiNoReferenciados = exports.estaReferenciado = exports.REFERENCIAS_POR_BUCKET = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const storage_1 = require("../services/storage");
const logger_1 = require("./logger");
exports.REFERENCIAS_POR_BUCKET = {
    uploads: [
        { coleccion: 'mensajes', campo: 'adjuntos.fileId' },
        { coleccion: 'eventocalendarios', campo: 'archivoAdjunto.fileId' },
    ],
    tareas_referencias: [{ coleccion: 'tareas', campo: 'archivosReferencia.fileId' }],
    tareas_entregas: [
        { coleccion: 'tareas', campo: 'entregas.archivos.fileId' },
        { coleccion: 'tareas', campo: 'entregas.historial.archivos.fileId' },
    ],
    anuncios_adjuntos: [{ coleccion: 'anuncios', campo: 'archivosAdjuntos.fileId' }],
};
const estaReferenciado = async (fileId, bucket) => {
    const db = mongoose_1.default.connection.db;
    if (!db)
        return true;
    try {
        for (const { coleccion, campo } of exports.REFERENCIAS_POR_BUCKET[bucket] || []) {
            if (await db.collection(coleccion).findOne({ [campo]: fileId }, { projection: { _id: 1 } }))
                return true;
        }
        return false;
    }
    catch {
        return true;
    }
};
exports.estaReferenciado = estaReferenciado;
const eliminarSiNoReferenciados = async (refs, bucket) => {
    let borrados = 0;
    for (const ref of refs) {
        if (!ref || !ref.fileId)
            continue;
        if (await (0, exports.estaReferenciado)(ref.fileId, bucket))
            continue;
        try {
            await (0, storage_1.eliminarArchivo)(ref, bucket);
            borrados++;
        }
        catch (error) {
            logger_1.logger.warn(`[Archivos] No se pudo borrar ${bucket}/${ref.fileId}: ${error?.message || error}`);
        }
    }
    return borrados;
};
exports.eliminarSiNoReferenciados = eliminarSiNoReferenciados;
//# sourceMappingURL=referenciasArchivos.js.map