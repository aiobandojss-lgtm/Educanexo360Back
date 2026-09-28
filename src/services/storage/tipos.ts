import { Readable } from 'stream';

/**
 * Capa de almacenamiento de archivos intercambiable (Fase 5.1).
 *
 * Tres implementaciones con la misma interfaz:
 *   - 's3':     cualquier servicio compatible con S3 (Backblaze B2, Cloudflare R2, AWS S3) — solo cambian variables.
 *   - 'gridfs': MongoDB GridFS (lo de siempre: lectura del legado y transición).
 *   - 'local':  carpeta en disco, SOLO para pruebas.
 *
 * La CLAVE identifica el archivo dentro del almacén. Convención del proyecto: '<bucket>/<fileId>', p. ej.
 * 'uploads/65ab…' o 'tareas_entregas/65ab…' (el mismo nombre de bucket de GridFS de cada flujo). Así un archivo
 * migrado de GridFS a S3 tiene una clave determinista y la migración es reanudable.
 */
export type NombreAlmacen = 's3' | 'gridfs' | 'local';

export interface MetaArchivo {
  /** Nombre original (solo metadata; nunca forma parte de la clave) */
  nombre: string;
  /** Content-Type ya validado */
  tipo: string;
  /** Tamaño en bytes (S3 lo exige para subir un stream) */
  tamaño: number;
  /** Metadata extra (p. ej. uploadedBy); valores string */
  extra?: Record<string, string>;
}

export interface ResultadoGuardar {
  clave: string;
  tamaño: number;
  /** sha256 hexadecimal del contenido, calculado mientras se sube */
  sha256: string;
}

export interface ArchivoStorage {
  readonly nombre: NombreAlmacen;
  guardar(origen: Readable, clave: string, meta: MetaArchivo): Promise<ResultadoGuardar>;
  leer(clave: string): Promise<Readable>;
  eliminar(clave: string): Promise<void>;
  existe(clave: string): Promise<boolean>;
}
