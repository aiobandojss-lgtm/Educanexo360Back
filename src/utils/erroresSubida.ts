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
