"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eliminarAdjuntos = exports.subirAdjuntos = void 0;
const storage_1 = require("../services/storage");
const subirAdjuntos = async (files, bucket, usuarioId, extra) => {
    const subidos = [];
    try {
        for (const file of files) {
            const ref = await (0, storage_1.subirArchivo)(file, bucket, { ...(usuarioId && { uploadedBy: String(usuarioId) }), ...(extra || {}) });
            subidos.push({ ...ref, fileId: ref.fileId, fechaSubida: new Date() });
        }
        return subidos;
    }
    catch (error) {
        await (0, exports.eliminarAdjuntos)(subidos, bucket);
        throw error;
    }
};
exports.subirAdjuntos = subirAdjuntos;
const eliminarAdjuntos = async (refs, bucket) => {
    await Promise.all(refs.map((r) => (0, storage_1.eliminarArchivo)(r, bucket).catch(() => undefined)));
};
exports.eliminarAdjuntos = eliminarAdjuntos;
//# sourceMappingURL=adjuntos.js.map