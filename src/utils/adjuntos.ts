import { Types } from 'mongoose';
import { subirArchivo, eliminarArchivo, RefArchivo, NombreAlmacen } from '../services/storage';

export interface AdjuntoSubido {
  nombre: string;
  tipo: string;
  tamaño: number;
  fileId: Types.ObjectId;
  fechaSubida: Date;
  almacen: NombreAlmacen;
  clave: string;
  sha256: string;
}

/**
 * Sube por la capa de almacenamiento (Fase 5.2) los archivos temporales que dejó multer (ya validados en 5.4).
 * - Los temporales NO se borran aquí: los borra limpiarTemporales al terminar la respuesta (3.Q).
 * - Si una subida falla, borra los ya subidos (el almacén limpia su propio parcial) y relanza: no quedan
 *   huérfanos (3.O/3.S).
 */
export const subirAdjuntos = async (
  files: any[],
  bucket: string,
  usuarioId?: string,
  extra?: Record<string, string>,
): Promise<AdjuntoSubido[]> => {
  const subidos: AdjuntoSubido[] = [];
  try {
    for (const file of files) {
      const ref = await subirArchivo(file, bucket, { ...(usuarioId && { uploadedBy: String(usuarioId) }), ...(extra || {}) });
      subidos.push({ ...ref, fileId: ref.fileId as Types.ObjectId, fechaSubida: new Date() });
    }
    return subidos;
  } catch (error) {
    await eliminarAdjuntos(subidos, bucket);
    throw error;
  }
};

/** Borra archivos ya subidos (best effort; la referencia dice en qué almacén está cada uno). */
export const eliminarAdjuntos = async (refs: RefArchivo[], bucket: string): Promise<void> => {
  await Promise.all(refs.map((r) => eliminarArchivo(r, bucket).catch(() => undefined)));
};
