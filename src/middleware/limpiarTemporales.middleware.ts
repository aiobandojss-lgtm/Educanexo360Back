import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

/**
 * Borra los archivos temporales que multer dejó en disco (req.file / req.files) cuando termina la
 * respuesta, sea éxito o error, incluso si el cliente corta la conexión (auditoría 3.Q).
 *
 * Es el ÚNICO lugar donde se limpian los temporales de las rutas que lo usan: antes solo se borraban
 * si el controlador llegaba a subirlos a GridFS; si fallaba antes (404, validación) quedaban en uploads/temp.
 * Va ANTES de multer en la ruta; req.files se lee al terminar, cuando multer ya lo llenó.
 */
export const limpiarTemporales = (req: Request, res: Response, next: NextFunction): void => {
  let limpiado = false;
  const limpiar = (): void => {
    if (limpiado) return;
    limpiado = true;
    const archivos: any[] = [];
    if ((req as any).file) archivos.push((req as any).file);
    const files = (req as any).files;
    if (Array.isArray(files)) archivos.push(...files);
    else if (files && typeof files === 'object') Object.values(files).forEach((l: any) => archivos.push(...l));
    archivos
      .filter((f) => f && typeof f.path === 'string')
      .forEach((f) => fs.promises.unlink(f.path).catch(() => undefined)); // ya borrado → se ignora
  };
  res.on('finish', limpiar);
  res.on('close', limpiar);
  next();
};
