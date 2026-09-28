import crypto from 'crypto';
import mongoose from 'mongoose';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ArchivoStorage, MetaArchivo, ResultadoGuardar } from './tipos';

/**
 * Almacén GridFS (Fase 5.1): el de siempre. La clave es '<bucket>/<fileId>' (buckets en uso: uploads,
 * tareas_referencias, tareas_entregas, anuncios_adjuntos). Sirve para leer el legado y durante la transición.
 * Metadata igual que antes: { originalName, contentType, size, ...extra }.
 */
const partir = (clave: string): { bucket: string; id: mongoose.Types.ObjectId } => {
  const i = clave.lastIndexOf('/');
  const bucket = clave.slice(0, i);
  const id = clave.slice(i + 1);
  if (!bucket || !mongoose.isValidObjectId(id)) throw new Error(`Clave GridFS inválida: ${clave}`);
  return { bucket, id: new mongoose.Types.ObjectId(id) };
};

const bucketDe = (nombre: string): GridFSBucket => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('GridFS: sin conexión a MongoDB');
  return new GridFSBucket(db as any, { bucketName: nombre });
};

export const crearAlmacenGridFS = (): ArchivoStorage => ({
  nombre: 'gridfs',
  async guardar(origen: Readable, clave: string, meta: MetaArchivo): Promise<ResultadoGuardar> {
    const { bucket, id } = partir(clave);
    const hash = crypto.createHash('sha256');
    let tamaño = 0;
    origen.on('data', (trozo: Buffer) => {
      hash.update(trozo);
      tamaño += trozo.length;
    });
    const b = bucketDe(bucket);
    const subida = b.openUploadStreamWithId(id, meta.nombre, {
      metadata: { originalName: meta.nombre, contentType: meta.tipo, size: meta.tamaño, ...(meta.extra || {}) },
    });
    try {
      await pipeline(origen, subida);
    } catch (error) {
      // Parcial: se borran sus chunks (auditoría 3.S; "File not found" es esperable si aún no había documento)
      await b.delete(id).catch(() => undefined);
      throw error;
    }
    return { clave, tamaño, sha256: hash.digest('hex') };
  },
  async leer(clave: string): Promise<Readable> {
    const { bucket, id } = partir(clave);
    return bucketDe(bucket).openDownloadStream(id);
  },
  async eliminar(clave: string): Promise<void> {
    const { bucket, id } = partir(clave);
    try {
      await bucketDe(bucket).delete(id);
    } catch (error: any) {
      // Ya no existe: eliminar es idempotente
      if (!/FileNotFound|File not found/i.test(String(error?.message || ''))) throw error;
    }
  },
  async existe(clave: string): Promise<boolean> {
    const { bucket, id } = partir(clave);
    const r = await bucketDe(bucket).find({ _id: id }).limit(1).toArray();
    return r.length > 0;
  },
});
