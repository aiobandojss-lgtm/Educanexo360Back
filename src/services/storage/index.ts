import fs from 'fs';
import mongoose from 'mongoose';
import { Readable } from 'stream';
import { ArchivoStorage, NombreAlmacen } from './tipos';
import { crearAlmacenS3 } from './s3';
import { crearAlmacenGridFS } from './gridfs';
import { crearAlmacenLocal } from './local';

export * from './tipos';

/**
 * Fachada de archivos (Fase 5.1).
 *
 * - SUBIDAS: van al almacén de STORAGE_PROVIDER ('gridfs' por defecto: desplegar sin configurar S3 deja todo como
 *   antes; 's3' cuando el bucket esté listo; 'local' solo pruebas).
 * - LECTURAS/BORRADOS: se deciden por la REFERENCIA guardada en el documento, no por STORAGE_PROVIDER: un archivo
 *   viejo de GridFS se sigue leyendo aunque las subidas nuevas vayan a S3.
 *
 * Referencia en los documentos (compatible con lo anterior):
 *   { fileId, nombre, tipo, tamaño, ... }                       ← legado: GridFS, bucket según el flujo
 *   { fileId, nombre, tipo, tamaño, almacen, clave, sha256 }    ← nuevo (y migrado)
 * fileId SIEMPRE existe (los clientes lo usan en las URLs de descarga); en S3 es un ObjectId nuevo.
 */
const almacenes = new Map<NombreAlmacen, ArchivoStorage>();

export const almacen = (nombre: NombreAlmacen): ArchivoStorage => {
  let a = almacenes.get(nombre);
  if (!a) {
    if (nombre === 's3') a = crearAlmacenS3();
    else if (nombre === 'gridfs') a = crearAlmacenGridFS();
    else if (nombre === 'local') a = crearAlmacenLocal();
    else throw new Error(`Almacén desconocido: ${nombre}`);
    almacenes.set(nombre, a);
  }
  return a;
};

/** Solo pruebas: olvida los almacenes creados (p. ej. tras cambiar variables). */
export const reiniciarAlmacenes = (): void => almacenes.clear();

export const proveedorSubidas = (): NombreAlmacen => {
  const p = (process.env.STORAGE_PROVIDER || 'gridfs').toLowerCase();
  if (p === 's3' || p === 'gridfs' || p === 'local') return p;
  throw new Error(`STORAGE_PROVIDER desconocido: '${p}' (use gridfs, s3 o local)`);
};

export interface RefArchivo {
  fileId?: any;
  nombre?: string;
  tipo?: string;
  tamaño?: number;
  almacen?: NombreAlmacen;
  clave?: string;
  sha256?: string;
}

/** Dónde está un archivo según su referencia (bucketLegado: el bucket GridFS del flujo para las referencias viejas). */
export const ubicacion = (ref: RefArchivo, bucketLegado: string): { almacen: ArchivoStorage; clave: string } => {
  if (ref.almacen && ref.clave) return { almacen: almacen(ref.almacen), clave: ref.clave };
  if (!ref.fileId) throw new Error('Referencia de archivo sin fileId');
  return { almacen: almacen('gridfs'), clave: `${bucketLegado}/${String(ref.fileId)}` };
};

/**
 * Como ubicacion(), con respaldo para referencias LEGADO (auditoría 5.C3): si el archivo ya no está en GridFS y hay
 * S3 configurado, se busca en S3 con la misma clave '<bucket>/<fileId>' (la que usa la migración). Cubre referencias
 * viejas que la migración no pudo actualizar: p. ej. copias a acudientes encoladas antes de migrar (el trabajo guarda
 * una copia de los adjuntos) y procesadas después de --borrar-gridfs.
 */
const resolver = async (ref: RefArchivo, bucketLegado: string): Promise<{ almacen: ArchivoStorage; clave: string }> => {
  const u = ubicacion(ref, bucketLegado);
  if ((ref.almacen && ref.clave) || !process.env.S3_BUCKET) return u;
  if (await u.almacen.existe(u.clave)) return u;
  try {
    const s3 = almacen('s3');
    if (await s3.existe(u.clave)) return { almacen: s3, clave: u.clave };
  } catch (error) {
    // S3 mal configurado o caído: se responde como antes (archivo no encontrado en GridFS)
  }
  return u;
};

/** Abre el archivo para enviarlo por stream (lo decide la referencia). */
export const abrirArchivo = async (ref: RefArchivo, bucketLegado: string): Promise<Readable> => {
  const { almacen: a, clave } = await resolver(ref, bucketLegado);
  return a.leer(clave);
};

export const existeArchivo = async (ref: RefArchivo, bucketLegado: string): Promise<boolean> => {
  const { almacen: a, clave } = await resolver(ref, bucketLegado);
  return a.existe(clave);
};

/** Borra el archivo (idempotente: si ya no existe no falla). */
export const eliminarArchivo = async (ref: RefArchivo, bucketLegado: string): Promise<void> => {
  const { almacen: a, clave } = await resolver(ref, bucketLegado);
  await a.eliminar(clave);
};

/**
 * Sube un archivo temporal de multer (ya validado) al almacén de STORAGE_PROVIDER y devuelve la referencia
 * completa para guardar en el documento. No borra el temporal (de eso se encarga limpiarTemporales).
 */
export const subirArchivo = async (
  archivo: { path: string; originalname: string; mimetype: string; size: number },
  bucket: string,
  extra?: Record<string, string>,
): Promise<Required<Pick<RefArchivo, 'fileId' | 'nombre' | 'tipo' | 'tamaño' | 'almacen' | 'clave' | 'sha256'>>> => {
  const fileId = new mongoose.Types.ObjectId();
  const clave = `${bucket}/${fileId}`;
  const a = almacen(proveedorSubidas());
  const r = await a.guardar(fs.createReadStream(archivo.path), clave, {
    nombre: archivo.originalname,
    tipo: archivo.mimetype,
    tamaño: archivo.size,
    extra,
  });
  return { fileId, nombre: archivo.originalname, tipo: archivo.mimetype, tamaño: r.tamaño, almacen: a.nombre, clave, sha256: r.sha256 };
};
