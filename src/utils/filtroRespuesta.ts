/**
 * Filtro de salida de las respuestas JSON (Fase 5, auditoría 5.C6).
 *
 * Las referencias de archivo guardan datos internos del almacén ({ fileId, nombre, tipo, tamaño, almacen, clave,
 * sha256 }): la clave del objeto en S3 y el hash no deben salir en la API (los clientes solo usan fileId en las URLs).
 *
 * Se aplica como 'json replacer' de Express: res.json (y res.send con objeto, que delega en res.json) serializa con
 * JSON.stringify(cuerpo, replacer). Así:
 *   - nunca se muta el objeto original (el replacer solo decide qué se escribe): el documento, el caché en memoria y
 *     las referencias que usan las descargas quedan intactos;
 *   - solo afecta respuestas JSON: descargas y streams no pasan por res.json;
 *   - no hay un recorrido extra del objeto (va dentro de la serialización que Express ya hace), así que no hace
 *     falta límite de profundidad: el costo es una comparación por campo;
 *   - solo se quitan esos campos en objetos que también tienen fileId (una "clave" de otro tipo no se toca).
 */
const CAMPOS_INTERNOS = new Set(['almacen', 'clave', 'sha256']);

export function reemplazoRespuestaJson(this: any, campo: string, valor: unknown): unknown {
  if (CAMPOS_INTERNOS.has(campo) && this && typeof this === 'object' && this.fileId != null) return undefined;
  return valor;
}
