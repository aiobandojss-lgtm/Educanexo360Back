"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crearAlmacenLocal = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const promises_1 = require("stream/promises");
const raiz = () => path_1.default.resolve(process.env.STORAGE_LOCAL_DIR || path_1.default.join('uploads', 'almacen-local'));
const rutaDe = (clave) => {
    if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(clave))
        throw new Error(`Clave local inválida: ${clave}`);
    return path_1.default.join(raiz(), ...clave.split('/'));
};
const crearAlmacenLocal = () => ({
    nombre: 'local',
    async guardar(origen, clave, _meta) {
        const destino = rutaDe(clave);
        fs_1.default.mkdirSync(path_1.default.dirname(destino), { recursive: true });
        const hash = crypto_1.default.createHash('sha256');
        let tamaño = 0;
        origen.on('data', (trozo) => {
            hash.update(trozo);
            tamaño += trozo.length;
        });
        try {
            await (0, promises_1.pipeline)(origen, fs_1.default.createWriteStream(destino));
        }
        catch (error) {
            await fs_1.default.promises.rm(destino, { force: true }).catch(() => undefined);
            throw error;
        }
        return { clave, tamaño, sha256: hash.digest('hex') };
    },
    async leer(clave) {
        const ruta = rutaDe(clave);
        await fs_1.default.promises.access(ruta);
        return fs_1.default.createReadStream(ruta);
    },
    async eliminar(clave) {
        await fs_1.default.promises.rm(rutaDe(clave), { force: true });
    },
    async existe(clave) {
        try {
            await fs_1.default.promises.access(rutaDe(clave));
            return true;
        }
        catch {
            return false;
        }
    },
});
exports.crearAlmacenLocal = crearAlmacenLocal;
//# sourceMappingURL=local.js.map