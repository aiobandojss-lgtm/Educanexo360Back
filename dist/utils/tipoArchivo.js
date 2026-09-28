"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validarArchivo = exports.DESCRIPCION_PERMITIDOS = exports.EXTENSIONES_PERMITIDAS = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const TIPOS = {
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
exports.EXTENSIONES_PERMITIDAS = Object.keys(TIPOS);
exports.DESCRIPCION_PERMITIDOS = 'PDF, Word, Excel, PowerPoint, texto (TXT, CSV), imágenes (JPG, PNG, GIF, WEBP, HEIC) y ZIP';
const MARCAS_HEIF = ['heic', 'heix', 'mif1', 'msf1'];
const coincide = (familia, b) => {
    const ascii = (desde, hasta) => b.subarray(desde, hasta).toString('latin1');
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
            if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff)))
                return true;
            return !b.includes(0x00);
        }
        default:
            return false;
    }
};
const validarArchivo = async (ruta, nombreOriginal) => {
    const ext = path_1.default.extname(String(nombreOriginal || '')).slice(1).toLowerCase();
    const tipo = TIPOS[ext];
    if (!tipo) {
        return {
            valido: false,
            mensaje: `El archivo "${nombreOriginal}" no es de un tipo permitido. Tipos permitidos: ${exports.DESCRIPCION_PERMITIDOS}.`,
        };
    }
    const fd = await fs_1.default.promises.open(ruta, 'r');
    let cabecera;
    try {
        const buf = Buffer.alloc(8192);
        const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
        cabecera = buf.subarray(0, bytesRead);
    }
    finally {
        await fd.close();
    }
    if (cabecera.length === 0)
        return { valido: false, mensaje: `El archivo "${nombreOriginal}" está vacío.` };
    if (!coincide(tipo.familia, cabecera)) {
        return {
            valido: false,
            mensaje: `El contenido del archivo "${nombreOriginal}" no corresponde a un archivo .${ext} válido.`,
        };
    }
    return { valido: true, mime: tipo.mime };
};
exports.validarArchivo = validarArchivo;
//# sourceMappingURL=tipoArchivo.js.map