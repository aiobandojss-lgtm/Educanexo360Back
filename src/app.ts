import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes';
import escuelaRoutes from './routes/escuela.routes';
import usuarioRoutes from './routes/usuario.routes';
import ApiError from './utils/ApiError';
import cursoRoutes from './routes/curso.routes';
import asignaturaRoutes from './routes/asignatura.routes';
import logroRoutes from './routes/logro.routes';
import academicRoutes from './routes/academic.routes';
import calificacionRoutes from './routes/calificacion.routes';
import boletinRoutes from './routes/boletin.routes';
import mensajeRoutes from './routes/mensaje.routes';
import gridfsManager from './config/gridfs';
import notificacionRoutes from './routes/notificacion.routes';
import {
  setupCompression,
  responseTimeMiddleware,
  rateLimiter,
} from './middleware/performance.middleware';
import calendarioRoutes from './routes/calendario.routes';
import anuncioRoutes from './routes/anuncio.routes';
import asistenciaRoutes from './routes/asistencia.routes';
import systemRoutes from './routes/system.routes';
import superadminRoutes from './routes/superadmin.routes';

// RUTAS PARA EL SISTEMA DE INVITACIONES Y REGISTRO
import invitacionRoutes from './routes/invitacion.routes';
import registroRoutes from './routes/registro.routes';
import publicRoutes from './routes/public.routes';
import estudianteRoutes from './routes/estudiante.routes';
import cacheRoutes from './routes/cache.routes';
import dashboardRoutes from './routes/dashboard.routes'; // ✅ IMPORTADO CORRECTAMENTE

// Configuración de variables de entorno
dotenv.config();

// Obtiene la ruta base configurada en app.js (archivo raíz)
const basePath = process.env.BASE_PATH || '';
console.log(`Inicializando aplicación con BASE_PATH: "${basePath}"`);

const app: Express = express();

// ===== CONFIGURACIÓN CORS MEJORADA =====
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:3001'];

    // Añadir explícitamente el dominio de Vercel
    allowedOrigins.push('https://educa-nexo360-react.vercel.app');

    // Permitir solicitudes sin origen (como Postman o solicitudes del servidor)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Solicitud CORS bloqueada: ${origin}`);
      // Durante el desarrollo/diagnóstico podemos permitir todos los orígenes
      // En producción deberías cambiar esto a:
      // callback(new Error('No permitido por CORS'));
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};
app.use(cors(corsOptions));

// ===== MIDDLEWARES PRINCIPALES =====
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
setupCompression(app);
app.use(responseTimeMiddleware);

// ======= SOLUCIÓN DEFINITIVA DE RUTEO =======
// Crear router para API
const apiRouter = express.Router();

// ===== ENDPOINT DE DIAGNÓSTICO/SALUD =====
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ===== RUTAS DE LA API en el router =====
apiRouter.use('/auth', rateLimiter(60000, 20), authRoutes);
apiRouter.use('/mensajes', rateLimiter(60000, 100), mensajeRoutes);
apiRouter.use('/escuelas', escuelaRoutes);
apiRouter.use('/usuarios', usuarioRoutes);
apiRouter.use('/cursos', cursoRoutes);
apiRouter.use('/asignaturas', asignaturaRoutes);
apiRouter.use('/logros', logroRoutes);
apiRouter.use('/academic', academicRoutes);
apiRouter.use('/calificaciones', calificacionRoutes);
apiRouter.use('/boletin', boletinRoutes);
apiRouter.use('/notificaciones', notificacionRoutes);
apiRouter.use('/calendario', calendarioRoutes);
apiRouter.use('/anuncios', anuncioRoutes);
apiRouter.use('/asistencia', asistenciaRoutes);
apiRouter.use('/system', systemRoutes);
apiRouter.use('/superadmin', superadminRoutes);

// RUTAS PARA EL SISTEMA DE INVITACIONES Y REGISTRO
apiRouter.use('/invitaciones', invitacionRoutes);
apiRouter.use('/registro', registroRoutes);
apiRouter.use('/public', publicRoutes);
apiRouter.use('/estudiantes', estudianteRoutes);
apiRouter.use('/cache', cacheRoutes);

// ✅ CORRECCIÓN PRINCIPAL: Dashboard dentro del apiRouter
apiRouter.use('/dashboard', dashboardRoutes); // ✅ AHORA ESTÁ DENTRO DEL apiRouter

// ===== MONTAR EL ROUTER API =====
// Si hay basePath, lo usamos; de lo contrario, montamos en /api
if (basePath) {
  app.use(`${basePath}/api`, apiRouter);
} else {
  app.use('/api', apiRouter);
}

// ===== RUTA BASE =====
app.get(basePath || '/', (req: Request, res: Response) => {
  res.json({
    name: 'EducaNexo360 API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Ruta no encontrada'));
});

// ===== MANEJO DE ERRORES GLOBAL =====
app.use((err: Error | ApiError, req: Request, res: Response, next: NextFunction) => {
  console.error('Error en la aplicación:', err);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: err.name,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: err.name || 'UnknownError',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }
});

// ===== CONEXIÓN A BASE DE DATOS =====
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educanexo360';
    console.log(
      `Conectando a MongoDB en: ${mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`,
    );

    // Opciones de conexión mejoradas
    const mongooseOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    // Conectar a MongoDB
    const conn = await mongoose.connect(mongoURI, mongooseOptions);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    console.log(`Database Name: ${conn.connection.name}`);

    // Inicializar GridFS
    await gridfsManager.initializeStorage(mongoURI);
    console.log('GridFS Storage initialized successfully');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    // En lugar de cerrar inmediatamente, vamos a reintentar
    console.log('Retrying connection in 5 seconds...');
    setTimeout(() => {
      connectDB().catch((err) => {
        console.error('Failed to reconnect to MongoDB:', err);
        process.exit(1);
      });
    }, 5000);
  }
};

// ===== INICIAR SERVIDOR =====
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(
      `✅ Servidor iniciado en puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`,
    );
    console.log(`📝 API documentación: http://localhost:${PORT}${basePath}/api/docs`);
    console.log(`🩺 Health check: http://localhost:${PORT}${basePath}/api/health`);
    console.log(`📊 Dashboard: http://localhost:${PORT}${basePath}/api/dashboard/estadisticas`); // ✅ Nueva línea de verificación
  });

  // Manejo graceful de cierre
  const gracefulShutdown = async (signal: string) => {
    console.log(`Recibida señal ${signal}. Cerrando servidor...`);
    server.close(async () => {
      console.log('Servidor HTTP cerrado.');

      try {
        await mongoose.connection.close();
        console.log('Conexión a MongoDB cerrada correctamente.');
        process.exit(0);
      } catch (err) {
        console.error('Error al cerrar conexión a MongoDB:', err);
        process.exit(1);
      }
    });

    // Si no se cierra en 10 segundos, forzar cierre
    setTimeout(() => {
      console.error('No se pudo cerrar limpiamente, forzando salida.');
      process.exit(1);
    }, 10000);
  };

  // Capturar señales para cierre graceful
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Manejar excepciones no capturadas
  process.on('uncaughtException', (error) => {
    console.error('Excepción no capturada:', error);
    gracefulShutdown('uncaughtException');
  });
};

startServer().catch((err) => {
  console.error('Error fatal al iniciar servidor:', err);
  process.exit(1);
});

export default app;
