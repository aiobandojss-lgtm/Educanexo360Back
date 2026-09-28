import express from 'express';
import anuncioController from '../controllers/anuncio.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import anuncioValidation from '../validations/anuncio.validation';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sanitizeFilename } from '../utils/sanitizeFilename';
import { cacheMiddleware } from '../cache/simpleCache';
import { invalidateOnAnuncio } from '../middleware/dashboardCacheInvalidation.middleware';
import { sanitizeNoSQL } from '../middleware/sanitize.middleware';
import { validarArchivos } from '../middleware/validarArchivos.middleware';
import { limpiarTemporales } from '../middleware/limpiarTemporales.middleware';

const router = express.Router();

// Configurar un almacenamiento temporal para los archivos
// Usaremos el disco en lugar de GridFS para evitar problemas de compatibilidad de tipos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + sanitizeFilename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite de tamaño
  },
});

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para crear y gestionar anuncios
router.post(
  '/',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  invalidateOnAnuncio, // ← AGREGAR ESTA LÍNEA
  validate(anuncioValidation.crear),
  anuncioController.crear,
);

router.put(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  invalidateOnAnuncio, // ← AGREGAR ESTA LÍNEA
  validate(anuncioValidation.actualizar),
  anuncioController.actualizar,
);

router.patch(
  '/:id/publicar',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  invalidateOnAnuncio, // ← AGREGAR ESTA LÍNEA
  anuncioController.publicar,
);

router.delete(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  anuncioController.eliminar,
);

// Rutas de adjuntos
router.post(
  '/:id/adjuntos',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  limpiarTemporales, // borra los temporales de multer al terminar la respuesta (3.Q)
  upload.array('archivos', 5),
  validarArchivos, // tipos permitidos por extensión y contenido (5.4)
  sanitizeNoSQL, // multer arma objetos anidados con campo[$ne]
  anuncioController.agregarAdjuntos,
);

router.delete(
  '/:id/adjuntos/:archivoId',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  anuncioController.eliminarAdjunto,
);

// Rutas de consulta
router.get('/', cacheMiddleware('anuncios'), anuncioController.obtenerTodos);
router.get('/:id', anuncioController.obtenerPorId);
router.get('/:id/adjunto/:archivoId', authenticate, anuncioController.obtenerAdjunto);

export default router;
