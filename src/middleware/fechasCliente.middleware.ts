import { Request, Response, NextFunction } from 'express';
import { normalizarFechaCliente } from '../utils/fechas';

/**
 * Auditoría H3: fechas y horas SIN zona horaria en el body y la query se interpretan como hora de Colombia
 * (convención en docs/convencion-fechas.md) y se reescriben como ISO UTC ("…Z"). Así el resto del código, que hace
 * new Date(str), no depende de la zona del servidor.
 *
 * Solo toca claves de fecha (fecha*, inicio, fin, desde, hasta; también anidadas, p. ej. periodos[].fecha_inicio)
 * y solo valores con forma exacta de fecha y hora sin zona; nunca textos libres. "YYYY-MM-DD" y lo que ya trae Z u
 * offset quedan igual. Va global (JSON y query) y otra vez después de multer en rutas multipart (calendario).
 */
const ES_CLAVE_FECHA = /^(fecha.*|inicio|fin|desde|hasta)$/i;
const PROFUNDIDAD_MAXIMA = 5;

const normalizar = (valor: any, profundidad: number): void => {
  if (!valor || typeof valor !== 'object' || profundidad > PROFUNDIDAD_MAXIMA) return;
  for (const clave of Object.keys(valor)) {
    const v = valor[clave];
    if (typeof v === 'string' && ES_CLAVE_FECHA.test(clave)) valor[clave] = normalizarFechaCliente(v);
    else if (v && typeof v === 'object') normalizar(v, profundidad + 1);
  }
};

export const normalizarFechasCliente = (req: Request, _res: Response, next: NextFunction): void => {
  normalizar(req.body, 0);
  normalizar(req.query, 0);
  next();
};
