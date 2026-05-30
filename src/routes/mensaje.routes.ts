// src/routes/mensaje.routes.ts

import express, { Request, Response, NextFunction } from 'express';
import mensajeController, { ROLES_CON_BORRADORES } from '../controllers/mensaje.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { sanitizeFilename } from '../utils/sanitizeFilename';
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
    cb(null, uniqueSuffix + path.extname(sanitizeFilename(file.originalname)));
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
router.get(
  '/destinatarios-acudiente',
  authorize('ACUDIENTE', 'ESTUDIANTE'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.getDestinatariosParaAcudiente(req, res, next);
  },
);

router.get(
  '/destinatarios-estudiante',
  authorize('ACUDIENTE', 'ESTUDIANTE'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.getDestinatariosParaAcudiente(req, res, next); // ← Usar la misma función
  },
);

// Rutas para obtener destinatarios y cursos disponibles
router.get('/destinatarios-disponibles', (req: any, res: Response, next: NextFunction) => {
  mensajeController.getPosiblesDestinatarios(req, res, next);
});

router.get(
  '/cursos-disponibles',
  authorize('ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.getCursosPosiblesDestinatarios(req, res, next);
  },
);

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

router.get('/ultimos', (req: any, res: Response, next: NextFunction) => {
  mensajeController.obtenerUltimos(req, res, next);
});

/**
 * @swagger
 * /api/mensajes/estadisticas-docentes:
 *   get:
 *     summary: Estadísticas de mensajes enviados por cada docente en un periodo
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha inicio del periodo (ISO 8601)
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Fecha fin del periodo (ISO 8601 — se extiende a 23:59:59 UTC)
 *       - in: query
 *         name: cursoId
 *         schema:
 *           type: string
 *         description: Filtrar solo docentes de ese curso
 *       - in: query
 *         name: docenteId
 *         schema:
 *           type: string
 *         description: Filtrar por un docente específico
 *     responses:
 *       200:
 *         description: Lista de docentes con conteo de mensajes y cursos asignados
 *       400:
 *         description: Parámetros desde/hasta faltantes o ID inválido
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol insuficiente (requiere RECTOR, COORDINADOR o ADMIN)
 */
router.get(
  '/estadisticas-docentes',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.estadisticasDocentes(req, res, next);
  },
);

/**
 * @swagger
 * /api/mensajes/auditoria:
 *   get:
 *     summary: Lista paginada de mensajes enviados por un docente específico
 *     tags: [Mensajes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: remitenteId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del docente a auditar
 *       - in: query
 *         name: desde
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: hasta
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Mensajes del docente con info de destinatario o curso
 *       400:
 *         description: Parámetros requeridos faltantes o remitenteId inválido
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Rol insuficiente (requiere RECTOR, COORDINADOR o ADMIN)
 */
router.get(
  '/auditoria',
  authorize('RECTOR', 'COORDINADOR', 'ADMIN'),
  (req: any, res: Response, next: NextFunction) => {
    mensajeController.auditoriaDocente(req, res, next);
  },
);

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

// ✅ ALIAS: Ruta alternativa /leer (para compatibilidad con Flutter)
router.put('/:id/leer', (req: any, res: Response, next: NextFunction) => {
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