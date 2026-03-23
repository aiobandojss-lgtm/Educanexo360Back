import helmet from 'helmet';
import cors from 'cors';
import { Express } from 'express';

export const configureSecurityMiddleware = (app: Express) => {
  // Configuración básica de Helmet
  app.use(helmet());

  // Configuración de CORS - Modificada para incluir el dominio de Vercel
  const corsOptions = {
    origin: function (origin: string | undefined, callback: any) {
      const allowedDomains = [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://educanexo360.creativebycode.com',
        'https://www.educanexo360.creativebycode.com',
        'https://educanexo360-web.vercel.app',
      ];

      // Permitir solicitudes sin origen (como Postman)
      if (!origin) return callback(null, true);

      if (allowedDomains.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log(`Origen bloqueado por CORS: ${origin}`);
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400, // 24 horas
  };

  app.use(cors(corsOptions));

  // Headers de seguridad adicionales
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
};
