"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = exports.responseTimeMiddleware = exports.cacheMiddleware = exports.setupCompression = void 0;
const compression_1 = __importDefault(require("compression"));
const node_cache_1 = __importDefault(require("node-cache"));
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
const responseTimeMiddleware = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${duration}ms`);
    });
    next();
};
exports.responseTimeMiddleware = responseTimeMiddleware;
const rateLimiter = (windowMs = 60000, max = 100) => {
    const requests = new Map();
    const middleware = (req, res, next) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        const userRequests = requests.get(ip) || [];
        const validRequests = userRequests.filter((timestamp) => now - timestamp < windowMs);
        validRequests.push(now);
        requests.set(ip, validRequests);
        if (validRequests.length > max) {
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