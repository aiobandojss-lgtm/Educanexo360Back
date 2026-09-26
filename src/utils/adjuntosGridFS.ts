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
 * Sube a GridFS los archivos temporales que dejó multer.
 * - Siempre borra los temporales del disco (también los que no alcanzaron a subirse).
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
  } finally {
    await Promise.all(files.map((f) => fs.promises.unlink(f.path).catch(() => undefined)));
  }
};
