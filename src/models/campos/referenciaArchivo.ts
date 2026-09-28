/**
 * Campos de la referencia de un archivo en la capa de almacenamiento (Fase 5.2), comunes a mensajes, tareas,
 * anuncios y calendario. Son OPCIONALES: las referencias viejas solo tienen fileId (GridFS del flujo).
 *   almacen  dónde está: 'gridfs' | 's3' | 'local' (pruebas)
 *   clave    '<bucket>/<fileId>' dentro de ese almacén
 *   sha256   hash del contenido calculado al subir (lo usa la migración para verificar)
 */
export const camposAlmacen = {
  almacen: { type: String, enum: ['gridfs', 's3', 'local'] },
  clave: { type: String },
  sha256: { type: String },
};

export interface ICamposAlmacen {
  almacen?: 'gridfs' | 's3' | 'local';
  clave?: string;
  sha256?: string;
}
