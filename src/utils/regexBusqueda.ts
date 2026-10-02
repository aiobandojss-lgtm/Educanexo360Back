import { escapeRegex } from './escapeRegex';

/**
 * Búsqueda insensible a tildes y mayúsculas (auditoría H2): "maria fernanda" encuentra "María Fernanda" y
 * "nino" encuentra "Niño" (y al revés).
 *
 * Se quita la tilde del texto buscado y cada vocal, la n y la c se expanden a una clase con sus variantes
 * acentuadas en minúscula y mayúscula (las mayúsculas acentuadas se ponen explícitas: no se depende de que el
 * motor de regex de MongoDB pliegue mayúsculas fuera de ASCII). El resto de caracteres se escapa (texto literal,
 * sin riesgo de ReDoS ni de regex inválida). Uso: TODAS las búsquedas por texto de nombres, títulos y asuntos.
 */
const VARIANTES: Record<string, string> = {
  a: 'aáàäâãAÁÀÄÂÃ',
  e: 'eéèëêEÉÈËÊ',
  i: 'iíìïîIÍÌÏÎ',
  o: 'oóòöôõOÓÒÖÔÕ',
  u: 'uúùüûUÚÙÜÛ',
  n: 'nñNÑ',
  c: 'cçCÇ',
};

/** Patrón (string) para { $regex: patron, $options: 'i' } o para new RegExp(patron, 'i'). */
export const patronBusqueda = (texto: string): string =>
  Array.from(
    String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // "María" → "Maria", "ñ" → "n"
      .toLowerCase(),
  )
    .map((ch) => (VARIANTES[ch] ? `[${VARIANTES[ch]}]` : escapeRegex(ch)))
    .join('');

/** RegExp lista para usar en consultas de Mongoose. prefijo: true → solo coincidencias al inicio del campo. */
export const regexBusqueda = (texto: string, opciones: { prefijo?: boolean } = {}): RegExp =>
  new RegExp(`${opciones.prefijo ? '^' : ''}${patronBusqueda(texto)}`, 'i');
