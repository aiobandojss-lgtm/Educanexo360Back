import crypto from 'crypto';

/**
 * claveUnica de un lote de trabajos a partir de QUIÉNES contiene (auditoría 4.AC), no de su posición.
 * Con la posición (…:0, …:1) un conjunto que cambia entre intentos reasigna usuarios a lotes y una clave ya
 * existente descarta un lote con OTROS usuarios (se perdían). Con el hash, la misma clave solo se repite si el
 * lote es exactamente el mismo; si el conjunto cambió, el lote nuevo se encola (nunca una pérdida).
 * OJO (auditoría 4.AK): el hash solo NO evita duplicados si cambia la membresía (los lotes se recortan cada 50 y
 * todos los posteriores cambian). Por eso el despacho marca por usuario lo ya encolado (emailEncolado/pushEncolado)
 * y el resumen consume la marca metadata.resumen al encolar: el reintento excluye a quien ya lo tiene.
 */
export const claveDeLote = (prefijo: string, ids: string[]): string => {
  const hash = crypto
    .createHash('sha1')
    .update([...ids].map(String).sort().join(','))
    .digest('hex')
    .slice(0, 20);
  return `${prefijo}:${hash}`;
};
