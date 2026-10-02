// src/middleware/performance.middleware.ts

import compression from 'compression';
import { Express, Request, Response, NextFunction, RequestHandler } from 'express';
import NodeCache from 'node-cache';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { jwtConfig } from '../config/jwt.config';

// Caché en memoria para consultas frecuentes
const appCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 minutos de TTL por defecto

// Middleware para compresión HTTP
export const setupCompression = (app: Express) => {
  app.use(
    compression({
      // Umbral de activación - comprime respuestas mayores a 1KB
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        // Comprimir por defecto
        return compression.filter(req, res);
      },
    }),
  );
};

// Middleware para cacheo de respuestas
export const cacheMiddleware = (duration: number = 300): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    // No cachear peticiones autenticadas con datos personales
    if (req.method !== 'GET' || (req as any).user) {
      return next();
    }

    const key = `__express__${req.originalUrl || req.url}`;
    const cachedBody = appCache.get(key);

    if (cachedBody) {
      res.send(cachedBody);
      return;
    }

    // Capturar la respuesta original
    const originalSend = res.send;
    res.send = function (body: any) {
      appCache.set(key, body, duration);
      return originalSend.call(this, body);
    };

    next();
  };
};

/**
 * Ruta SIN datos personales para los logs (H1/H4): el patrón de Express si hubo ruta ("/educanexo360/api/mensajes/:id");
 * si no, la URL sin query con los IDs (ObjectId, números, UUID) reemplazados por ":id".
 */
const SEGMENTO_ID = /^(?:[0-9a-f]{24}|\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const segmentos = (p: string): string[] => p.split('/').filter(Boolean);
const sinIds = (segs: string[]): string[] => segs.map((s) => (SEGMENTO_ID.test(s) ? ':id' : s));
export const rutaNormalizada = (req: Request): string => {
  const url = segmentos(String(req.originalUrl || req.url || '').split('?')[0]);
  if (req.route && typeof req.route.path === 'string') {
    // req.route.path es relativo al router ('/:id') y req.baseUrl ya no sirve si la respuesta salió por un error
    // (Express lo restaura al propagarlo): prefijo = los montajes tomados de la URL real, sin IDs
    const ruta = segmentos(req.route.path);
    return '/' + [...sinIds(url.slice(0, Math.max(0, url.length - ruta.length))), ...ruta].join('/');
  }
  return '/' + sinIds(url).join('/');
};

// Middleware para medir tiempos de respuesta
export const responseTimeMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`${req.method} ${req.originalUrl} - ${duration}ms`);
    // H1: peticiones lentas a stderr (stderr.log en cPanel) con nivel warn, visible con el nivel por defecto de
    // producción. Sin usuario, IP ni query. Umbral: LOG_LENTAS_MS (2000 por defecto).
    const umbral = Number(process.env.LOG_LENTAS_MS) || 2000;
    if (duration > umbral) {
      logger.warn(`[Lenta] ${req.method} ${rutaNormalizada(req)} → ${res.statusCode} en ${duration} ms`);
    }
  });

  next();
};

/**
 * H4: clave del límite en rutas autenticadas. Con un token válido (verificado con la misma clave que authenticate,
 * sin consultar la base) el límite es POR USUARIO: antes era por IP y todos los usuarios detrás de la misma IP
 * pública (WiFi del colegio, NAT del operador) compartían el cupo y recibían 429 ajenos. Sin token o con uno
 * inválido, por IP (inventar tokens no sirve para esquivar el límite).
 */
export const clavePorUsuarioOIp = (req: Request): string => {
  const cabecera = req.headers.authorization;
  if (cabecera && cabecera.startsWith('Bearer ')) {
    try {
      const datos = jwt.verify(cabecera.slice(7), jwtConfig.secret) as jwt.JwtPayload;
      if (datos && datos.sub) return `u:${datos.sub}`;
    } catch {
      // token inválido o vencido: cuenta por IP
    }
  }
  return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};

// Middleware para limitar tasa de peticiones
// keyGenerator opcional: por defecto la llave es la IP (p. ej. login usa IP + email; rutas autenticadas: clavePorUsuarioOIp)
export const rateLimiter = (
  windowMs: number = 60000,
  max: number = 100,
  keyGenerator?: (req: Request) => string,
): RequestHandler => {
  const requests = new Map<string, number[]>();

  // Limpieza periódica: eliminar IPs sin peticiones dentro de la ventana (evita que el Map crezca sin límite)
  setInterval(() => {
    const now = Date.now();
    requests.forEach((timestamps, ip) => {
      const vigentes = timestamps.filter((timestamp) => now - timestamp < windowMs);
      if (vigentes.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, vigentes);
      }
    });
  }, 5 * 60 * 1000).unref();

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    const ip = keyGenerator ? keyGenerator(req) : req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Inicializar array si no existe
    const userRequests = requests.get(ip) || [];

    // Filtrar solicitudes que están dentro de la ventana de tiempo
    const validRequests = userRequests.filter((timestamp: number) => now - timestamp < windowMs);

    // Actualizar peticiones válidas
    validRequests.push(now);
    requests.set(ip, validRequests);

    // Verificar si excede el límite
    if (validRequests.length > max) {
      // H4: los 429 quedan en stderr (antes no se registraban). Una vez por clave y ventana para no inundar el log;
      // solo el montaje de la ruta (las rutas públicas llevan códigos de invitación en la URL) y el tipo de límite,
      // sin usuario, IP ni token
      if (validRequests.length === max + 1) {
        const tipo = !keyGenerator ? 'IP' : ip.startsWith('u:') ? 'usuario' : ip.startsWith('ip:') ? 'IP' : 'clave';
        logger.warn(`[429] ${req.method} ${req.baseUrl || '/'} (límite ${max} en ${Math.round(windowMs / 1000)} s, por ${tipo})`);
      }
      res.status(429).json({
        success: false,
        message: 'Demasiadas peticiones, intente más tarde',
      });
      return;
    }

    next();
  };

  return middleware;
};
