import path from 'path';

/**
 * Sanitiza el nombre de un archivo subido por el usuario para prevenir
 * path traversal, XSS e inyección de caracteres especiales en el filesystem.
 */
export function sanitizeFilename(filename: string): string {
  // path.basename elimina componentes de ruta (../../etc/passwd → passwd)
  const safe = path.basename(filename)
    .replace(/[^a-zA-Z0-9\-_. ]/g, '_') // Solo caracteres seguros
    .replace(/\.{2,}/g, '.')             // Sin puntos consecutivos (..)
    .replace(/\s+/g, '_')                // Espacios a guiones bajos
    .substring(0, 200);                  // Limite de longitud

  return safe || 'archivo'; // Fallback si el resultado queda vacío
}
