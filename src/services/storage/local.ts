import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ArchivoStorage, MetaArchivo, ResultadoGuardar } from './tipos';

/**
 * Almacén en carpeta local (Fase 5.1). SOLO PARA PRUEBAS: STORAGE_LOCAL_DIR (por defecto uploads/almacen-local).
 * La clave se valida para que nunca salga de la carpeta.
 */
const raiz = (): string => path.resolve(process.env.STORAGE_LOCAL_DIR || path.join('uploads', 'almacen-local'));

const rutaDe = (clave: string): string => {
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(clave)) throw new Error(`Clave local inválida: ${clave}`);
  return path.join(raiz(), ...clave.split('/'));
};

export const crearAlmacenLocal = (): ArchivoStorage => ({
  nombre: 'local',
  async guardar(origen: Readable, clave: string, _meta: MetaArchivo): Promise<ResultadoGuardar> {
    const destino = rutaDe(clave);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const hash = crypto.createHash('sha256');
    let tamaño = 0;
    origen.on('data', (trozo: Buffer) => {
      hash.update(trozo);
      tamaño += trozo.length;
    });
    try {
      await pipeline(origen, fs.createWriteStream(destino));
    } catch (error) {
      await fs.promises.rm(destino, { force: true }).catch(() => undefined);
      throw error;
    }
    return { clave, tamaño, sha256: hash.digest('hex') };
  },
  async leer(clave: string): Promise<Readable> {
    const ruta = rutaDe(clave);
    await fs.promises.access(ruta);
    return fs.createReadStream(ruta);
  },
  async eliminar(clave: string): Promise<void> {
    await fs.promises.rm(rutaDe(clave), { force: true });
  },
  async existe(clave: string): Promise<boolean> {
    try {
      await fs.promises.access(rutaDe(clave));
      return true;
    } catch {
      return false;
    }
  },
});
