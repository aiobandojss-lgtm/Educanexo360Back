"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const escuela_routes_1 = __importDefault(require("./routes/escuela.routes"));
const usuario_routes_1 = __importDefault(require("./routes/usuario.routes"));
const ApiError_1 = __importDefault(require("./utils/ApiError"));
const curso_routes_1 = __importDefault(require("./routes/curso.routes"));
const asignatura_routes_1 = __importDefault(require("./routes/asignatura.routes"));
const logro_routes_1 = __importDefault(require("./routes/logro.routes"));
const academic_routes_1 = __importDefault(require("./routes/academic.routes"));
const calificacion_routes_1 = __importDefault(require("./routes/calificacion.routes"));
const boletin_routes_1 = __importDefault(require("./routes/boletin.routes"));
const mensaje_routes_1 = __importDefault(require("./routes/mensaje.routes"));
const gridfs_1 = __importDefault(require("./config/gridfs"));
const notificacion_routes_1 = __importDefault(require("./routes/notificacion.routes"));
const performance_middleware_1 = require("./middleware/performance.middleware");
const calendario_routes_1 = __importDefault(require("./routes/calendario.routes"));
const anuncio_routes_1 = __importDefault(require("./routes/anuncio.routes"));
const asistencia_routes_1 = __importDefault(require("./routes/asistencia.routes"));
const asistenciaInformes_routes_1 = __importDefault(require("./routes/asistenciaInformes.routes"));
const system_routes_1 = __importDefault(require("./routes/system.routes"));
const superadmin_routes_1 = __importDefault(require("./routes/superadmin.routes"));
const invitacion_routes_1 = __importDefault(require("./routes/invitacion.routes"));
const registro_routes_1 = __importDefault(require("./routes/registro.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const estudiante_routes_1 = __importDefault(require("./routes/estudiante.routes"));
const cache_routes_1 = __importDefault(require("./routes/cache.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const tarea_routes_1 = __importDefault(require("./routes/tarea.routes"));
const perfilRol_routes_1 = __importDefault(require("./routes/perfilRol.routes"));
dotenv_1.default.config();
const basePath = process.env.BASE_PATH || '';
console.log(`Inicializando aplicación con BASE_PATH: "${basePath}"`);
const app = (0, express_1.default)();
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
            : ['http://localhost:3000', 'http://localhost:3001'];
        allowedOrigins.push('https://educanexo360-web.vercel.app');
        if (process.env.FRONTEND_URL) {
            allowedOrigins.push(process.env.FRONTEND_URL);
        }
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.log(`Solicitud CORS bloqueada: ${origin}`);
            callback(new Error('No permitido por CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
(0, performance_middleware_1.setupCompression)(app);
app.use(performance_middleware_1.responseTimeMiddleware);
const apiRouter = express_1.default.Router();
apiRouter.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        mongodb: mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected',
    });
});
apiRouter.use('/auth', (0, performance_middleware_1.rateLimiter)(60000, 20), auth_routes_1.default);
apiRouter.use('/mensajes', (0, performance_middleware_1.rateLimiter)(60000, 60), mensaje_routes_1.default);
apiRouter.use('/usuarios', (0, performance_middleware_1.rateLimiter)(60000, 60), usuario_routes_1.default);
apiRouter.use('/dashboard', (0, performance_middleware_1.rateLimiter)(60000, 30), dashboard_routes_1.default);
apiRouter.use('/escuelas', escuela_routes_1.default);
apiRouter.use('/cursos', curso_routes_1.default);
apiRouter.use('/asignaturas', asignatura_routes_1.default);
apiRouter.use('/logros', logro_routes_1.default);
apiRouter.use('/academic', academic_routes_1.default);
apiRouter.use('/calificaciones', calificacion_routes_1.default);
apiRouter.use('/boletin', boletin_routes_1.default);
apiRouter.use('/notificaciones', notificacion_routes_1.default);
apiRouter.use('/calendario', calendario_routes_1.default);
apiRouter.use('/anuncios', anuncio_routes_1.default);
apiRouter.use('/asistencia', asistencia_routes_1.default);
apiRouter.use('/asistencia/informes', asistenciaInformes_routes_1.default);
apiRouter.use('/system', system_routes_1.default);
apiRouter.use('/superadmin', superadmin_routes_1.default);
apiRouter.use('/invitaciones', (0, performance_middleware_1.rateLimiter)(60000, 20), invitacion_routes_1.default);
apiRouter.use('/registro', (0, performance_middleware_1.rateLimiter)(60000, 10), registro_routes_1.default);
apiRouter.use('/public', public_routes_1.default);
apiRouter.use('/estudiantes', estudiante_routes_1.default);
apiRouter.use('/cache', cache_routes_1.default);
apiRouter.use('/perfiles-rol', perfilRol_routes_1.default);
app.use(`${basePath}/api/tareas`, (0, performance_middleware_1.rateLimiter)(60000, 60), tarea_routes_1.default);
if (basePath) {
    app.use(`${basePath}/api`, apiRouter);
}
else {
    app.use('/api', apiRouter);
}
app.get(basePath || '/', (req, res) => {
    res.json({
        name: 'EducaNexo360 API',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        time: new Date().toISOString(),
    });
});
app.use((req, res, next) => {
    next(new ApiError_1.default(404, 'Ruta no encontrada'));
});
app.use((err, req, res, next) => {
    console.error('Error en la aplicación:', err);
    if (err instanceof ApiError_1.default) {
        res.status(err.statusCode).json({
            success: false,
            message: err.message,
            error: err.name,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });
    }
    else {
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            error: err.name || 'UnknownError',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        });
    }
});
const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educanexo360';
        console.log(`Conectando a MongoDB en: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);
        const mongooseOptions = {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        };
        const conn = await mongoose_1.default.connect(mongoURI, mongooseOptions);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        console.log(`Database Name: ${conn.connection.name}`);
        await gridfs_1.default.initializeStorage(mongoURI);
        console.log('GridFS Storage initialized successfully');
    }
    catch (error) {
        console.error('Error connecting to MongoDB:', error);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(() => {
            connectDB().catch((err) => {
                console.error('Failed to reconnect to MongoDB:', err);
                process.exit(1);
            });
        }, 5000);
    }
};
const PORT = process.env.PORT || 3000;
const startServer = async () => {
    await connectDB();
    const server = app.listen(PORT, () => {
        console.log(`✅ Servidor iniciado en puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
        console.log(`📝 API documentación: http://localhost:${PORT}${basePath}/api/docs`);
        console.log(`🩺 Health check: http://localhost:${PORT}${basePath}/api/health`);
        console.log(`📊 Dashboard: http://localhost:${PORT}${basePath}/api/dashboard/estadisticas`);
    });
    const gracefulShutdown = async (signal) => {
        console.log(`Recibida señal ${signal}. Cerrando servidor...`);
        server.close(async () => {
            console.log('Servidor HTTP cerrado.');
            try {
                await mongoose_1.default.connection.close();
                console.log('Conexión a MongoDB cerrada correctamente.');
                process.exit(0);
            }
            catch (err) {
                console.error('Error al cerrar conexión a MongoDB:', err);
                process.exit(1);
            }
        });
        setTimeout(() => {
            console.error('No se pudo cerrar limpiamente, forzando salida.');
            process.exit(1);
        }, 10000);
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
        console.error('Excepción no capturada:', error);
        gracefulShutdown('uncaughtException');
    });
};
startServer().catch((err) => {
    console.error('Error fatal al iniciar servidor:', err);
    process.exit(1);
});
exports.default = app;
//# sourceMappingURL=app.js.map