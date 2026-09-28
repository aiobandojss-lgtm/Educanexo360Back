import { Request, Response, NextFunction } from 'express';
import ApiError from '../utils/ApiError';
import { validarArchivo } from '../utils/tipoArchivo';

/**
 * Fase 5.4: valida TODOS los archivos que dejó multer (req.file / req.files) por extensión y magic bytes.
 * Si alguno no es válido responde 400 con mensaje en español (los temporales los borra limpiarTemporales).
 * Si todos son válidos, reemplaza file.mimetype por el Content-Type canónico de su extensión (nunca el del cliente).
 * Va DESPUÉS de multer y ANTES del controlador.
 */
export const validarArchivos = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const r: any = req;
    const archivos: any[] = [];
    if (r.file) archivos.push(r.file);
    if (Array.isArray(r.files)) archivos.push(...r.files);
    else if (r.files && typeof r.files === 'object') Object.values(r.files).forEach((l: any) => archivos.push(...(l as any[])));
    for (const archivo of archivos) {
      const v = await validarArchivo(archivo.path, archivo.originalname);
      if (!v.valido) {
        next(new ApiError(400, v.mensaje || 'Archivo no permitido'));
        return;
      }
      archivo.mimetype = v.mime;
    }
    next();
  } catch (error) {
    next(error);
  }
};
