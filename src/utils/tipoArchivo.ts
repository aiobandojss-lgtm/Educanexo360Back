import fs from 'fs';
import path from 'path';

/**
 * Validación de archivos subidos (Fase 5.4): lista blanca por EXTENSIÓN y por CONTENIDO (magic bytes). Nunca se
 * confía en el mimetype que declara el cliente: el tipo guardado y servido es el canónico de la extensión.
 *
 * Firmas:
 *   pdf            '%PDF-' en los primeros 1024 bytes
 *   doc xls ppt    OLE2  D0 CF 11 E0 A1 B1 1A E1
 *   docx xlsx pptx zip   ZIP  'PK' 03 04 (o 05 06 vacío / 07 08)
 *   jpg jpeg       FF D8 FF
 *   png            89 50 4E 47 0D 0A 1A 0A
 *   gif            'GIF87a' | 'GIF89a'
 *   webp           'RIFF' ???? 'WEBP'
 *   heic heif      'ftyp' en el byte 4 con marca heic | heix | mif1 | msf1 (fotos de iPhone)
 *   txt csv        sin firma: texto (sin bytes nulos; se admite UTF-16 con BOM)
 */
type Familia = 'pdf' | 'ole' | 'zip' | 'jpg' | 'png' | 'gif' | 'webp' | 'heif' | 'texto';

const TIPOS: Record<string, { familia: Familia; mime: string }> = {
  pdf: { familia: 'pdf', mime: 'application/pdf' },
  doc: { familia: 'ole', mime: 'application/msword' },
  xls: { familia: 'ole', mime: 'application/vnd.ms-excel' },
  ppt: { familia: 'ole', mime: 'application/vnd.ms-powerpoint' },
  docx: { familia: 'zip', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { familia: 'zip', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { familia: 'zip', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  zip: { familia: 'zip', mime: 'application/zip' },
  txt: { familia: 'texto', mime: 'text/plain' },
  csv: { familia: 'texto', mime: 'text/csv' },
  jpg: { familia: 'jpg', mime: 'image/jpeg' },
  jpeg: { familia: 'jpg', mime: 'image/jpeg' },
  png: { familia: 'png', mime: 'image/png' },
  gif: { familia: 'gif', mime: 'image/gif' },
  webp: { familia: 'webp', mime: 'image/webp' },
  heic: { familia: 'heif', mime: 'image/heic' },
  heif: { familia: 'heif', mime: 'image/heif' },
};

export const EXTENSIONES_PERMITIDAS = Object.keys(TIPOS);
export const DESCRIPCION_PERMITIDOS =
  'PDF, Word, Excel, PowerPoint, texto (TXT, CSV), imágenes (JPG, PNG, GIF, WEBP, HEIC) y ZIP';

const MARCAS_HEIF = ['heic', 'heix', 'mif1', 'msf1'];

const coincide = (familia: Familia, b: Buffer): boolean => {
  const ascii = (desde: number, hasta: number) => b.subarray(desde, hasta).toString('latin1');
  switch (familia) {
    case 'pdf':
      return b.subarray(0, 1024).includes(Buffer.from('%PDF-'));
    case 'ole':
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case 'zip':
      return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && [0x0304, 0x0506, 0x0708].includes((b[2] << 8) | b[3]);
    case 'jpg':
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'png':
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
    case 'webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'heif':
      return ascii(4, 8) === 'ftyp' && MARCAS_HEIF.includes(ascii(8, 12));
    case 'texto': {
      if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) return true; // UTF-16 con BOM
      return !b.includes(0x00);
    }
    default:
      return false;
  }
};

export interface ResultadoValidacion {
  valido: boolean;
  /** Content-Type canónico (si es válido) */
  mime?: string;
  /** Mensaje en español para el 400 (si no es válido) */
  mensaje?: string;
}

/** Valida un archivo ya en disco (temporal de multer) por extensión y contenido. */
export const validarArchivo = async (ruta: string, nombreOriginal: string): Promise<ResultadoValidacion> => {
  const ext = path.extname(String(nombreOriginal || '')).slice(1).toLowerCase();
  const tipo = TIPOS[ext];
  if (!tipo) {
    return {
      valido: false,
      mensaje: `El archivo "${nombreOriginal}" no es de un tipo permitido. Tipos permitidos: ${DESCRIPCION_PERMITIDOS}.`,
    };
  }
  const fd = await fs.promises.open(ruta, 'r');
  let cabecera: Buffer;
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    cabecera = buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
  if (cabecera.length === 0) return { valido: false, mensaje: `El archivo "${nombreOriginal}" está vacío.` };
  if (!coincide(tipo.familia, cabecera)) {
    return {
      valido: false,
      mensaje: `El contenido del archivo "${nombreOriginal}" no corresponde a un archivo .${ext} válido.`,
    };
  }
  return { valido: true, mime: tipo.mime };
};
