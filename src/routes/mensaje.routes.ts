// src/routes/mensaje.routes.ts

import express, { Request, Response, NextFunction } from 'express';
import mensajeController, { ROLES_CON_BORRADORES } from '../controllers/mensaje.controller';
import { authenticate } from '../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { TipoUsuario } from '../interfaces/IUsuario';

import { cacheMiddleware } from '../cache/simpleCache';
import { invalidateOnMensaje } from '../middleware/dashboardCacheInvalidation.middleware';

const router = express.Router();

// Middleware para verificar permisos de borradores
const verificarPermisoBorradores = (req: any, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'No autorizado',
    });
    return;
  }

  if (!ROLES_CON_BORRADORES.includes(req.user.tipo as TipoUsuario)) {
    res.status(403).json({
      success: false,
      message: 'No tiene permisos para usar borradores',
    });
    return;
  }

  next();
};

// Crear directorio para archivos temporales si no existe
const uploadsDir = path.join(__dirname, '../../uploads/temp');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para almacenamiento temporal
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB por archivo
    files: 5, // Máximo 5 archivos
  },
});

// Todas las rutas requieren autenticación
router.use(authenticate);

// ===== RUTAS PARA BORRADORES =====
// Guardar borrador (nuevo o actualizar existente)
router.post(
  '/borradores',
  upload.array('adjuntos', 5),
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.guardarBorrador(req, res, next);
  },
);

// Nueva ruta para actualizar un borrador existente
router.post(
  '/borradores/:id',
  upload.array('adjuntos', 5),
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    // Añadir ID a req.query para que el controlador sepa que es una actualización
    req.query.id = req.params.id;
    mensajeController.guardarBorrador(req, res, next);
  },
);

// Obtener borradores
router.get(
  '/borradores',
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.obtenerBorradores(req, res, next);
  },
);

// Obtener un borrador específico por ID - NUEVA RUTA
router.get(
  '/borradores/:id',
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.obtenerBorradorPorId(req, res, next);
  },
);

// Enviar un borrador como mensaje
router.post(
  '/borradores/:id/enviar',
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.enviarBorrador(req, res, next);
  },
);

// Eliminar un borrador
router.delete(
  '/borradores/:id',
  verificarPermisoBorradores,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.eliminarBorrador(req, res, next);
  },
);

// Ruta para obtener destinatarios específicamente para acudientes
router.get('/destinatarios-acudiente', (req: any, res: Response, next: NextFunction) => {
  mensajeController.getDestinatariosParaAcudiente(req, res, next);
});

router.get('/destinatarios-estudiante', (req: any, res: Response, next: NextFunction) => {
  mensajeController.getDestinatariosParaAcudiente(req, res, next); // ← Usar la misma función
});

// Rutas para obtener destinatarios y cursos disponibles
router.get('/destinatarios-disponibles', (req: any, res: Response, next: NextFunction) => {
  mensajeController.getPosiblesDestinatarios(req, res, next);
});

router.get('/cursos-disponibles', (req: any, res: Response, next: NextFunction) => {
  mensajeController.getCursosPosiblesDestinatarios(req, res, next);
});

// Rutas para mensajes
router.post(
  '/',
  upload.array('adjuntos', 5),
  invalidateOnMensaje,
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.crear(req, res, next);
  },
);

router.get('/', cacheMiddleware('mensajes'), (req: any, res: Response, next: NextFunction) => {
  mensajeController.obtenerTodos(req, res, next);
});

router.get('/:id', (req: any, res: Response, next: NextFunction) => {
  mensajeController.obtenerPorId(req, res, next);
});

// Rutas para gestión de mensajes
router.put('/:id/eliminar', (req: any, res: Response, next: NextFunction) => {
  mensajeController.eliminar(req, res, next);
});

router.put('/:id/restaurar', (req: any, res: Response, next: NextFunction) => {
  mensajeController.restaurar(req, res, next);
});

// Ruta para eliminar permanentemente el mensaje
router.delete('/:id', (req: any, res: Response, next: NextFunction) => {
  mensajeController.eliminarPermanentemente(req, res, next);
});

router.put('/:id/archivar', (req: any, res: Response, next: NextFunction) => {
  mensajeController.archivar(req, res, next);
});

// Ruta para desarchivar
router.put('/:id/desarchivar', (req: any, res: Response, next: NextFunction) => {
  mensajeController.desarchivar(req, res, next);
});

// Nueva ruta para marcar como leído/no leído
router.put('/:id/lectura', (req: any, res: Response, next: NextFunction) => {
  mensajeController.actualizarEstadoLectura(req, res, next);
});

router.post(
  '/:mensajeId/responder',
  upload.array('adjuntos', 5),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.responder(req, res, next);
  },
);

// Ruta para descargar archivos adjuntos
router.get('/:mensajeId/adjuntos/:adjuntoId', (req: any, res: Response, next: NextFunction) => {
  mensajeController.descargarAdjunto(req, res, next);
});

export default router;
