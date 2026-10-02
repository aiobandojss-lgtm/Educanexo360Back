// H7: PRIMER import — carga el .env y quita espacios sobrantes de las variables antes de que otro módulo las lea
import './config/entorno';
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.routes';
import escuelaRoutes from './routes/escuela.routes';
import usuarioRoutes from './routes/usuario.routes';
import ApiError from './utils/ApiError';
import { errorDeSubida } from './utils/erroresSubida';
import { reemplazoRespuestaJson } from './utils/filtroRespuesta';
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
import asistenciaInformesRoutes from './routes/asistenciaInformes.routes';
import systemRoutes from './routes/system.routes';
import superadminRoutes from './routes/superadmin.routes';

// RUTAS PARA EL SISTEMA DE INVITACIONES Y REGISTRO
import invitacionRoutes from './routes/invitacion.routes';
import registroRoutes from './routes/registro.routes';
import publicRoutes from './routes/public.routes';
import estudianteRoutes from './routes/estudiante.routes';
import cacheRoutes from './routes/cache.routes';
import dashboardRoutes from './routes/dashboard.routes';
import tareaRoutes from './routes/tarea.routes';
import perfilRolRoutes from './routes/perfilRol.routes';
import { sanitizeNoSQL } from './middleware/sanitize.middleware';
import { iniciarWorker, detenerWorker } from './queue/outbox';
import './queue/handlers'; // registra los handlers de la cola (Fase 4)

// Configuración de variables de entorno
dotenv.config();

// Obtiene la ruta base configurada en app.js (archivo raíz)
const basePath = process.env.BASE_PATH || '';
console.log(`Inicializando aplicación con BASE_PATH: "${basePath}"`);

const app: Express = express();

// Detrás del proxy de cPanel/Passenger: confiar en 1 salto para que req.ip sea la IP real
// del cliente (X-Forwarded-For). Sin esto todos comparten IP y el rate limiter los bloquea juntos.
app.set('trust proxy', 1);
// 5.C6: las respuestas JSON no exponen almacen/clave/sha256 de las referencias de archivo (ver utils/filtroRespuesta)
app.set('json replacer', reemplazoRespuestaJson);

// TEMPORAL: verificar en producción que req.ip cambia por cliente (activar con LOG_CLIENT_IP=true)
if (process.env.LOG_CLIENT_IP === 'true') {
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[trust-proxy] req.ip=${req.ip} x-forwarded-for=${req.headers['x-forwarded-for']}`);
    next();
  });
}

// ===== CONFIGURACIÓN CORS MEJORADA =====
const corsOptions = {
  origin: function (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void,
  ) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];

    // Añadir explícitamente el dominio de Vercel
    allowedOrigins.push('https://educanexo360-web.vercel.app');

    // Incluir FRONTEND_URL si está definida en variables de entorno
    if (process.env.FRONTEND_URL) {
      allowedOrigins.push(process.env.FRONTEND_URL);
    }

    // Permitir solicitudes sin origen (como Postman o solicitudes del servidor)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`Solicitud CORS bloqueada: ${origin}`);
      callback(new Error('No permitido por CORS'));
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
// Sanitización NoSQL: elimina claves con $ o . en body/query/params (p. ej. estado[$ne]=x)
app.use(sanitizeNoSQL);
setupCompression(app);
app.use(responseTimeMiddleware);

// ======= SOLUCIÓN DEFINITIVA DE RUTEO =======
// Crear router para API
const apiRouter = express.Router();

// ===== ENDPOINT DE DIAGNÓSTICO/SALUD =====
// Público: solo el estado (sin memoria, entorno ni versión). Flutter solo revisa el HTTP 200.
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
  });
});

// ===== RUTAS DE LA API en el router =====
apiRouter.use('/auth', authRoutes); // límites propios por endpoint en auth.routes.ts (login por IP+email, refresh holgado)
apiRouter.use('/mensajes', rateLimiter(60000, 60), mensajeRoutes);    // 60 req/min — tiene uploads
apiRouter.use('/usuarios', rateLimiter(60000, 60), usuarioRoutes);    // 60 req/min — busquedas con regex
apiRouter.use('/dashboard', rateLimiter(60000, 30), dashboardRoutes); // 30 req/min — queries de agregacion pesadas
apiRouter.use('/escuelas', escuelaRoutes);
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
apiRouter.use('/asistencia/informes', asistenciaInformesRoutes);
apiRouter.use('/system', systemRoutes);
apiRouter.use('/superadmin', superadminRoutes);

// RUTAS PARA EL SISTEMA DE INVITACIONES Y REGISTRO
apiRouter.use('/invitaciones', rateLimiter(60000, 20), invitacionRoutes); // 20 req/min — previene abuso de invitaciones
apiRouter.use('/registro', rateLimiter(60000, 10), registroRoutes);       // 10 req/min — previene spam de cuentas
apiRouter.use('/public', rateLimiter(60000, 30), publicRoutes); // 30 req/min por IP — endpoints sin autenticación
apiRouter.use('/estudiantes', estudianteRoutes);
apiRouter.use('/cache', cacheRoutes);
apiRouter.use('/perfiles-rol', perfilRolRoutes);

app.use(`${basePath}/api/tareas`, rateLimiter(60000, 60), tareaRoutes); // 60 req/min — tiene uploads

// ===== MONTAR EL ROUTER API =====
// Si hay basePath, lo usamos; de lo contrario, montamos en /api
if (basePath) {
  app.use(`${basePath}/api`, apiRouter);
} else {
  app.use('/api', apiRouter);
}

// ===== RUTA BASE =====
// Público: sin entorno ni versión (información útil para un atacante)
app.get(basePath || '/', (req: Request, res: Response) => {
  res.json({
    name: 'EducaNexo360 API',
  });
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, 'Ruta no encontrada'));
});

// ===== MANEJO DE ERRORES GLOBAL =====
app.use((errOriginal: Error | ApiError, req: Request, res: Response, next: NextFunction) => {
  // Fase 5.A2: errores de subida de archivos (multer/busboy) → 400 con mensaje claro
  const err = errorDeSubida(errOriginal) || errOriginal;
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
    // maxPoolSize 10: un solo proceso de Passenger no necesita más y Atlas M0 admite máx. 500
    // conexiones en total (el default del driver es 100 por proceso)
    const mongooseOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    };

    // Listeners de conexión: registrar caídas y reconexiones (el driver reintenta solo)
    if (mongoose.connection.listenerCount('error') === 0) {
      mongoose.connection.on('error', (err) => console.error('[MongoDB] Error de conexión:', err));
      mongoose.connection.on('disconnected', () => console.warn('[MongoDB] Desconectado'));
      mongoose.connection.on('reconnected', () => console.warn('[MongoDB] Reconectado'));
    }

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

  // Worker de la cola de envíos (Fase 4.1): después de conectar Mongo. Si la conexión inicial falló y se
  // está reintentando, cada tick se salta hasta que Mongo esté conectado.
  iniciarWorker();

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
        // Deja de tomar trabajos y espera los que están en curso (lo PROCESANDO se retoma al reiniciar)
        await detenerWorker();
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

  // Promesas rechazadas sin catch (p. ej. tareas en segundo plano): registrar SIN tumbar el proceso.
  // Con un solo proceso de Passenger, una caída deja a todos los colegios sin servicio.
  process.on('unhandledRejection', (reason) => {
    console.error('Promesa rechazada sin manejar:', reason);
  });

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
