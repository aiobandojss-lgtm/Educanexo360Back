"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearAlmacenGridFS = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_1 = require("mongodb");
const promises_1 = require("stream/promises");
const partir = (clave) => {
    const i = clave.lastIndexOf('/');
    const bucket = clave.slice(0, i);
    const id = clave.slice(i + 1);
    if (!bucket || !mongoose_1.default.isValidObjectId(id))
        throw new Error(`Clave GridFS inválida: ${clave}`);
    return { bucket, id: new mongoose_1.default.Types.ObjectId(id) };
};
const bucketDe = (nombre) => {
    const db = mongoose_1.default.connection.db;
    if (!db)
        throw new Error('GridFS: sin conexión a MongoDB');
    return new mongodb_1.GridFSBucket(db, { bucketName: nombre });
};
const crearAlmacenGridFS = () => ({
    nombre: 'gridfs',
    async guardar(origen, clave, meta) {
        const { bucket, id } = partir(clave);
        const hash = crypto_1.default.createHash('sha256');
        let tamaño = 0;
        origen.on('data', (trozo) => {
            hash.update(trozo);
            tamaño += trozo.length;
        });
        const b = bucketDe(bucket);
        const subida = b.openUploadStreamWithId(id, meta.nombre, {
            metadata: { originalName: meta.nombre, contentType: meta.tipo, size: meta.tamaño, ...(meta.extra || {}) },
        });
        try {
            await (0, promises_1.pipeline)(origen, subida);
        }
        catch (error) {
            await b.delete(id).catch(() => undefined);
            throw error;
        }
        return { clave, tamaño, sha256: hash.digest('hex') };
    },
    async leer(clave) {
        const { bucket, id } = partir(clave);
        return bucketDe(bucket).openDownloadStream(id);
    },
    async eliminar(clave) {
        const { bucket, id } = partir(clave);
        try {
            await bucketDe(bucket).delete(id);
        }
        catch (error) {
            if (!/FileNotFound|File not found/i.test(String(error?.message || '')))
                throw error;
        }
    },
    async existe(clave) {
        const { bucket, id } = partir(clave);
        const r = await bucketDe(bucket).find({ _id: id }).limit(1).toArray();
        return r.length > 0;
    },
});
exports.crearAlmacenGridFS = crearAlmacenGridFS;
//# sourceMappingURL=gridfs.js.map