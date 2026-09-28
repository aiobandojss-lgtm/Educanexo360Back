import mongoose from 'mongoose';
import { eliminarArchivo, RefArchivo } from '../services/storage';
import { logger } from './logger';

/**
 * Dónde puede estar referenciado un archivo según su bucket (Fase 5.5). Si se agrega un flujo nuevo con archivos,
 * sumarlo aquí Y en src/scripts/barrer-archivos-huerfanos.js.
 */
export const REFERENCIAS_POR_BUCKET: Record<string, { coleccion: string; campo: string }[]> = {
  uploads: [
    { coleccion: 'mensajes', campo: 'adjuntos.fileId' }, // incluye las copias a acudientes (comparten fileId)
    { coleccion: 'eventocalendarios', campo: 'archivoAdjunto.fileId' },
  ],
  tareas_referencias: [{ coleccion: 'tareas', campo: 'archivosReferencia.fileId' }],
  tareas_entregas: [
    { coleccion: 'tareas', campo: 'entregas.archivos.fileId' },
    { coleccion: 'tareas', campo: 'entregas.historial.archivos.fileId' }, // 5.C9: evidencia de entregas calificadas
  ],
  anuncios_adjuntos: [{ coleccion: 'anuncios', campo: 'archivosAdjuntos.fileId' }],
};

/** ¿Algún documento sigue referenciando este fileId? Ante error se responde true (no borrar: criterio 3.X). */
export const estaReferenciado = async (fileId: any, bucket: string): Promise<boolean> => {
  const db = mongoose.connection.db;
  if (!db) return true;
  try {
    for (const { coleccion, campo } of REFERENCIAS_POR_BUCKET[bucket] || []) {
      if (await db.collection(coleccion).findOne({ [campo]: fileId }, { projection: { _id: 1 } })) return true;
    }
    return false;
  } catch {
    return true;
  }
};

/**
 * Borra los archivos que ya NINGÚN documento referencia (Fase 5.5, verificación de 3.X para no borrar archivos
 * compartidos). Llamar DESPUÉS de haber quitado las referencias (deleteOne / save). Best effort: lo que no se pueda
 * borrar queda para el script de barrido de huérfanos.
 */
export const eliminarSiNoReferenciados = async (refs: RefArchivo[], bucket: string): Promise<number> => {
  let borrados = 0;
  for (const ref of refs) {
    if (!ref || !ref.fileId) continue;
    if (await estaReferenciado(ref.fileId, bucket)) continue;
    try {
      await eliminarArchivo(ref, bucket);
      borrados++;
    } catch (error: any) {
      logger.warn(`[Archivos] No se pudo borrar ${bucket}/${ref.fileId}: ${error?.message || error}`);
    }
  }
  return borrados;
};
