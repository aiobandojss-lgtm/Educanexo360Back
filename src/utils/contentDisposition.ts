/**
 * Cabecera Content-Disposition para descargar un adjunto (RFC 6266 / RFC 5987).
 * - filename: respaldo ASCII (caracteres no imprimibles o comillas → '_').
 * - filename*: UTF-8 codificado. encodeURIComponent no codifica ' ( ) *, que RFC 5987 no admite sin
 *   codificar en attr-char; se codifican a mano.
 */
export const contentDispositionAdjunto = (nombre: unknown): string => {
  const nombreArchivo = String(nombre || 'archivo');
  const nombreAscii = nombreArchivo.replace(/[^\x20-\x7E]|"/g, '_');
  const codificado = encodeURIComponent(nombreArchivo).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${nombreAscii}"; filename*=UTF-8''${codificado}`;
};
