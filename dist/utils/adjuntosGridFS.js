"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subirAdjuntosGridFS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const subirAdjuntosGridFS = async (files, bucket, usuarioId) => {
    const subidos = [];
    let enCurso = null;
    try {
        for (const file of files) {
            const filename = file.filename || path_1.default.basename(file.path);
            const uploadStream = bucket.openUploadStream(filename, {
                metadata: {
                    originalName: file.originalname,
                    contentType: file.mimetype,
                    size: file.size,
                    uploadedBy: usuarioId,
                },
            });
            enCurso = uploadStream.id;
            await (0, promises_1.pipeline)(fs_1.default.createReadStream(file.path), uploadStream);
            enCurso = null;
            subidos.push({
                nombre: file.originalname,
                tipo: file.mimetype,
                tamaño: file.size,
                fileId: uploadStream.id,
                fechaSubida: new Date(),
            });
        }
        return subidos;
    }
    catch (error) {
        const aBorrar = [...subidos.map((a) => a.fileId), ...(enCurso ? [enCurso] : [])];
        await Promise.all(aBorrar.map((id) => bucket.delete(id).catch(() => undefined)));
        throw error;
    }
    finally {
        await Promise.all(files.map((f) => fs_1.default.promises.unlink(f.path).catch(() => undefined)));
    }
};
exports.subirAdjuntosGridFS = subirAdjuntosGridFS;
//# sourceMappingURL=adjuntosGridFS.js.map