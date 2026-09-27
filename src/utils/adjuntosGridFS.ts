import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { GridFSBucket, ObjectId } from 'mongodb';

export interface AdjuntoSubido {
  nombre: string;
  tipo: string;
  tamaño: number;
  fileId: ObjectId;
  fechaSubida: Date;
}

/**
 * Borra de GridFS archivos ya subidos (best effort): se usa cuando el mensaje/borrador no se pudo guardar
 * después de subir los adjuntos, para no dejarlos huérfanos (auditoría 3.O).
 */
export const eliminarArchivosGridFS = async (
  bucket: GridFSBucket | null | undefined,
  ids: ObjectId[],
): Promise<void> => {
  if (!bucket || ids.length === 0) return;
  await Promise.all(ids.map((id) => bucket.delete(id).catch(() => undefined)));
};

/**
 * Sube a GridFS los archivos temporales que dejó multer.
 * - Los temporales del disco NO se borran aquí: los borra el middleware limpiarTemporales al terminar la
 *   respuesta (un solo lugar, auditoría 3.Q), también cuando el controlador falla antes de subir.
 * - Si una subida falla, elimina de GridFS los archivos ya subidos y el parcial del que falló
 *   (no quedan huérfanos) y relanza el error.
 */
export const subirAdjuntosGridFS = async (
  files: any[],
  bucket: GridFSBucket,
  usuarioId: string,
): Promise<AdjuntoSubido[]> => {
  const subidos: AdjuntoSubido[] = [];
  let enCurso: ObjectId | null = null;
  try {
    for (const file of files) {
      const filename = file.filename || path.basename(file.path);
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          originalName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          uploadedBy: usuarioId,
        },
      });
      enCurso = uploadStream.id as ObjectId;
      // Stream del disco a GridFS esperando a que termine
      await pipeline(fs.createReadStream(file.path), uploadStream);
      enCurso = null;

      subidos.push({
        nombre: file.originalname,
        tipo: file.mimetype,
        tamaño: file.size,
        fileId: uploadStream.id as ObjectId,
        fechaSubida: new Date(),
      });
    }
    return subidos;
  } catch (error) {
    const aBorrar = [...subidos.map((a) => a.fileId), ...(enCurso ? [enCurso] : [])];
    await Promise.all(aBorrar.map((id) => bucket.delete(id).catch(() => undefined)));
    throw error;
  }
};
