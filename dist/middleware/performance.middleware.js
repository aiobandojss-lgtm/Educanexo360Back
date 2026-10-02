"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.clavePorUsuarioOIp = exports.responseTimeMiddleware = exports.rutaNormalizada = exports.cacheMiddleware = exports.setupCompression = void 0;
const compression_1 = __importDefault(require("compression"));
const node_cache_1 = __importDefault(require("node-cache"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const logger_1 = require("../utils/logger");
const jwt_config_1 = require("../config/jwt.config");
const appCache = new node_cache_1.default({ stdTTL: 300, checkperiod: 60 });
const setupCompression = (app) => {
    app.use((0, compression_1.default)({
        threshold: 1024,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression_1.default.filter(req, res);
        },
    }));
};
exports.setupCompression = setupCompression;
const cacheMiddleware = (duration = 300) => {
    return (req, res, next) => {
        if (req.method !== 'GET' || req.user) {
            return next();
        }
        const key = `__express__${req.originalUrl || req.url}`;
        const cachedBody = appCache.get(key);
        if (cachedBody) {
            res.send(cachedBody);
            return;
        }
        const originalSend = res.send;
        res.send = function (body) {
            appCache.set(key, body, duration);
            return originalSend.call(this, body);
        };
        next();
    };
};
exports.cacheMiddleware = cacheMiddleware;
const SEGMENTO_ID = /^(?:[0-9a-f]{24}|\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const segmentos = (p) => p.split('/').filter(Boolean);
const sinIds = (segs) => segs.map((s) => (SEGMENTO_ID.test(s) ? ':id' : s));
const rutaNormalizada = (req) => {
    const url = segmentos(String(req.originalUrl || req.url || '').split('?')[0]);
    if (req.route && typeof req.route.path === 'string') {
        const ruta = segmentos(req.route.path);
        return '/' + [...sinIds(url.slice(0, Math.max(0, url.length - ruta.length))), ...ruta].join('/');
    }
    return '/' + sinIds(url).join('/');
};
exports.rutaNormalizada = rutaNormalizada;
const responseTimeMiddleware = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger_1.logger.debug(`${req.method} ${req.originalUrl} - ${duration}ms`);
        const umbral = Number(process.env.LOG_LENTAS_MS) || 2000;
        if (duration > umbral) {
            logger_1.logger.warn(`[Lenta] ${req.method} ${(0, exports.rutaNormalizada)(req)} → ${res.statusCode} en ${duration} ms`);
        }
    });
    next();
};
exports.responseTimeMiddleware = responseTimeMiddleware;
const clavePorUsuarioOIp = (req) => {
    const cabecera = req.headers.authorization;
    if (cabecera && cabecera.startsWith('Bearer ')) {
        try {
            const datos = jsonwebtoken_1.default.verify(cabecera.slice(7), jwt_config_1.jwtConfig.secret);
            if (datos && datos.sub)
                return `u:${datos.sub}`;
        }
        catch {
        }
    }
    return `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
};
exports.clavePorUsuarioOIp = clavePorUsuarioOIp;
const rateLimiter = (windowMs = 60000, max = 100, keyGenerator) => {
    const requests = new Map();
    setInterval(() => {
        const now = Date.now();
        requests.forEach((timestamps, ip) => {
            const vigentes = timestamps.filter((timestamp) => now - timestamp < windowMs);
            if (vigentes.length === 0) {
                requests.delete(ip);
            }
            else {
                requests.set(ip, vigentes);
            }
        });
    }, 5 * 60 * 1000).unref();
    const middleware = (req, res, next) => {
        const ip = keyGenerator ? keyGenerator(req) : req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const userRequests = requests.get(ip) || [];
        const validRequests = userRequests.filter((timestamp) => now - timestamp < windowMs);
        validRequests.push(now);
        requests.set(ip, validRequests);
        if (validRequests.length > max) {
            if (validRequests.length === max + 1) {
                const tipo = !keyGenerator ? 'IP' : ip.startsWith('u:') ? 'usuario' : ip.startsWith('ip:') ? 'IP' : 'clave';
                logger_1.logger.warn(`[429] ${req.method} ${req.baseUrl || '/'} (límite ${max} en ${Math.round(windowMs / 1000)} s, por ${tipo})`);
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
exports.rateLimiter = rateLimiter;
//# sourceMappingURL=performance.middleware.js.map