import { RequestHandler } from 'express';
import multer from 'multer';
import ApiError from './ApiError';

/**
 * Fase 5.A2: errores de subida de archivos (multer/busboy). Son errores del CLIENTE: 400 con mensaje en español.
 * Antes caían en el 500 "Error interno del servidor" del manejador global (p. ej. un archivo que supera el límite
 * o un multipart mal formado).
 */
const MENSAJES_MULTER: Record<string, string> = {
  LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido',
  LIMIT_FILE_COUNT: 'Se enviaron más archivos de los permitidos',
  LIMIT_UNEXPECTED_FILE: 'Se envió un archivo en un campo no esperado o más archivos de los permitidos',
  LIMIT_PART_COUNT: 'La solicitud tiene demasiadas partes',
  LIMIT_FIELD_KEY: 'Un nombre de campo es demasiado largo',
  LIMIT_FIELD_VALUE: 'Un campo del formulario es demasiado largo',
  LIMIT_FIELD_COUNT: 'La solicitud tiene demasiados campos',
};
const MULTIPART_MAL_FORMADO =
  /Malformed part header|Unexpected end of form|Multipart: Boundary not found|Malformed urlencoded form|Unexpected end of multipart/i;

/**
 * Auditoría 5.C10: límites de subida por flujo, en UN solo lugar. La configuración de multer de cada ruta los usa y
 * los mensajes de error los citan, así el mensaje y el límite real no pueden quedar distintos.
 */
export interface LimitesSubida {
  campo: string; // nombre del campo multipart que esperan web y Flutter
  maxArchivos: number;
  maxMB: number; // por archivo
}
export const LIMITES_SUBIDA = {
  anuncios: { campo: 'archivos', maxArchivos: 5, maxMB: 10 },
  tareas: { campo: 'archivos', maxArchivos: 5, maxMB: 10 },
  mensajes: { campo: 'adjuntos', maxArchivos: 5, maxMB: 5 },
  calendario: { campo: 'archivo', maxArchivos: 1, maxMB: 5 },
} satisfies Record<string, LimitesSubida>;

export const bytesMaximos = (l: LimitesSubida): number => l.maxMB * 1024 * 1024;

const mensajeCantidad = (l: LimitesSubida): string =>
  l.maxArchivos === 1 ? 'Solo se permite 1 archivo' : `Máximo ${l.maxArchivos} archivos`;

/** Error de multer → 400 con el límite concreto de la ruta; lo demás, como errorDeSubida (o el error tal cual). */
export const errorDeSubidaConLimites = (err: any, l: LimitesSubida): any => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const sujeto = l.maxArchivos === 1 ? 'El archivo' : 'Cada archivo';
      return new ApiError(400, `${sujeto} puede pesar máximo ${l.maxMB} MB`, true);
    }
    if (err.code === 'LIMIT_FILE_COUNT') return new ApiError(400, mensajeCantidad(l), true);
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      // multer usa este código tanto para un campo desconocido como para pasarse del máximo del campo esperado
      if (err.field === l.campo) return new ApiError(400, mensajeCantidad(l), true);
      return new ApiError(400, `Campo de archivo no esperado: '${err.field}' (use '${l.campo}')`, true);
    }
  }
  return errorDeSubida(err) || err;
};

/**
 * Envuelve el middleware de multer de una ruta para que sus errores salgan como 400 con el límite concreto
 * ("Máximo 5 archivos", "Cada archivo puede pesar máximo 10 MB"). El manejador global conserva el mapeo genérico
 * como red para rutas que no usen este envoltorio.
 */
export const subidaConLimites =
  (l: LimitesSubida, middleware: RequestHandler): RequestHandler =>
  (req, res, next) =>
    middleware(req, res, (err?: any) => (err ? next(errorDeSubidaConLimites(err, l)) : next()));

/** Si el error viene de la subida de archivos devuelve el ApiError 400 equivalente; si no, null. */
export const errorDeSubida = (err: any): ApiError | null => {
  if (err instanceof multer.MulterError) {
    return new ApiError(400, MENSAJES_MULTER[err.code] || 'La subida de archivos no es válida', true);
  }
  if (MULTIPART_MAL_FORMADO.test(String(err?.message || ''))) {
    return new ApiError(400, 'La solicitud de archivos está mal formada', true);
  }
  return null;
};
