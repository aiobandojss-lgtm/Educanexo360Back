"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subirArchivo = exports.eliminarArchivo = exports.existeArchivo = exports.abrirArchivo = exports.ubicacion = exports.proveedorSubidas = exports.reiniciarAlmacenes = exports.almacen = void 0;
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const s3_1 = require("./s3");
const gridfs_1 = require("./gridfs");
const local_1 = require("./local");
__exportStar(require("./tipos"), exports);
const almacenes = new Map();
const almacen = (nombre) => {
    let a = almacenes.get(nombre);
    if (!a) {
        if (nombre === 's3')
            a = (0, s3_1.crearAlmacenS3)();
        else if (nombre === 'gridfs')
            a = (0, gridfs_1.crearAlmacenGridFS)();
        else if (nombre === 'local')
            a = (0, local_1.crearAlmacenLocal)();
        else
            throw new Error(`Almacén desconocido: ${nombre}`);
        almacenes.set(nombre, a);
    }
    return a;
};
exports.almacen = almacen;
const reiniciarAlmacenes = () => almacenes.clear();
exports.reiniciarAlmacenes = reiniciarAlmacenes;
const proveedorSubidas = () => {
    const p = (process.env.STORAGE_PROVIDER || 'gridfs').toLowerCase();
    if (p === 's3' || p === 'gridfs' || p === 'local')
        return p;
    throw new Error(`STORAGE_PROVIDER desconocido: '${p}' (use gridfs, s3 o local)`);
};
exports.proveedorSubidas = proveedorSubidas;
const ubicacion = (ref, bucketLegado) => {
    if (ref.almacen && ref.clave)
        return { almacen: (0, exports.almacen)(ref.almacen), clave: ref.clave };
    if (!ref.fileId)
        throw new Error('Referencia de archivo sin fileId');
    return { almacen: (0, exports.almacen)('gridfs'), clave: `${bucketLegado}/${String(ref.fileId)}` };
};
exports.ubicacion = ubicacion;
const abrirArchivo = async (ref, bucketLegado) => {
    const { almacen: a, clave } = (0, exports.ubicacion)(ref, bucketLegado);
    return a.leer(clave);
};
exports.abrirArchivo = abrirArchivo;
const existeArchivo = async (ref, bucketLegado) => {
    const { almacen: a, clave } = (0, exports.ubicacion)(ref, bucketLegado);
    return a.existe(clave);
};
exports.existeArchivo = existeArchivo;
const eliminarArchivo = async (ref, bucketLegado) => {
    const { almacen: a, clave } = (0, exports.ubicacion)(ref, bucketLegado);
    await a.eliminar(clave);
};
exports.eliminarArchivo = eliminarArchivo;
const subirArchivo = async (archivo, bucket, extra) => {
    const fileId = new mongoose_1.default.Types.ObjectId();
    const clave = `${bucket}/${fileId}`;
    const a = (0, exports.almacen)((0, exports.proveedorSubidas)());
    const r = await a.guardar(fs_1.default.createReadStream(archivo.path), clave, {
        nombre: archivo.originalname,
        tipo: archivo.mimetype,
        tamaño: archivo.size,
        extra,
    });
    return { fileId, nombre: archivo.originalname, tipo: archivo.mimetype, tamaño: r.tamaño, almacen: a.nombre, clave, sha256: r.sha256 };
};
exports.subirArchivo = subirArchivo;
//# sourceMappingURL=index.js.map