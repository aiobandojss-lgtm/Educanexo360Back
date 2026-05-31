"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureSecurityMiddleware = void 0;
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const configureSecurityMiddleware = (app) => {
    app.use((0, helmet_1.default)());
    const corsOptions = {
        origin: function (origin, callback) {
            const allowedDomains = [
                'http://localhost:3000',
                'http://localhost:3001',
                'https://educanexo360.creativebycode.com',
                'https://www.educanexo360.creativebycode.com',
                'https://educanexo360-web.vercel.app',
            ];
            if (!origin)
                return callback(null, true);
            if (allowedDomains.indexOf(origin) !== -1) {
                callback(null, true);
            }
            else {
                console.log(`Origen bloqueado por CORS: ${origin}`);
                callback(new Error('No permitido por CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Range', 'X-Content-Range'],
        maxAge: 86400,
    };
    app.use((0, cors_1.default)(corsOptions));
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        next();
    });
};
exports.configureSecurityMiddleware = configureSecurityMiddleware;
//# sourceMappingURL=security.middleware.js.map