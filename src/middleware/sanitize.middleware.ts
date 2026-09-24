import { Request, Response, NextFunction } from 'express';

/**
 * Sanitización NoSQL: elimina claves que empiezan con "$" o contienen "."
 * en req.body, req.query y req.params (p. ej. ?estado[$ne]=x → estado queda vacío).
 *
 * Se usa de forma global después de los parsers JSON/urlencoded y otra vez después
 * de multer en las rutas multipart (multer arma objetos anidados con "campo[$ne]").
 * Propio en lugar de express-mongo-sanitize para no agregar dependencias.
 */

const esClavePeligrosa = (clave: string): boolean => clave.startsWith('$') || clave.includes('.');

const limpiar = (valor: unknown, profundidad = 0): void => {
  if (profundidad > 20 || valor === null || typeof valor !== 'object') return;
  if (valor instanceof Date || Buffer.isBuffer(valor)) return;

  if (Array.isArray(valor)) {
    valor.forEach((item) => limpiar(item, profundidad + 1));
    return;
  }

  const objeto = valor as Record<string, unknown>;
  Object.keys(objeto).forEach((clave) => {
    if (esClavePeligrosa(clave)) {
      delete objeto[clave];
    } else {
      limpiar(objeto[clave], profundidad + 1);
    }
  });
};

export const sanitizeNoSQL = (req: Request, _res: Response, next: NextFunction): void => {
  limpiar(req.body);
  limpiar(req.query);
  limpiar(req.params);
  next();
};

export default sanitizeNoSQL;
