// src/routes/tarea.routes.ts
import express from 'express';
import tareaController from '../controllers/tarea.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import tareaValidation from '../validations/tarea.validation';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sanitizeFilename } from '../utils/sanitizeFilename';
import { sanitizeNoSQL } from '../middleware/sanitize.middleware';
import { validarArchivos } from '../middleware/validarArchivos.middleware';
import { limpiarTemporales } from '../middleware/limpiarTemporales.middleware';

const router = express.Router();

// Configuración de multer para subir archivos
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
  // Nombres de archivo en UTF-8: multer 2 (busboy 1) los decodifica como latin1 por defecto ("año" → "aÃ±o")
  defParamCharset: 'utf8',
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB límite
  },
});

// ========================================
// TODAS LAS RUTAS REQUIEREN AUTENTICACIÓN
// ========================================
router.use(authenticate);

// ========================================
// GESTIÓN DE TAREAS (DOCENTE/ADMIN)
// ========================================
router.post(
  '/',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.crear),
  tareaController.crear
);

// Lectura: administrativos (authorize('ADMIN') los incluye), DOCENTE, ESTUDIANTE y ACUDIENTE;
// el controlador filtra por rol
router.get(
  '/',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  validate(tareaValidation.listar),
  tareaController.listar
);

router.get(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  validate(tareaValidation.obtenerPorId),
  tareaController.obtenerPorId
);

router.put(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.actualizar),
  tareaController.actualizar
);

router.delete(
  '/:id',
  authorize('ADMIN', 'DOCENTE'),
  validate(tareaValidation.obtenerPorId),
  tareaController.eliminar
);

router.patch(
  '/:id/cerrar',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.obtenerPorId),
  tareaController.cerrar
);

// ========================================
// ARCHIVOS DE REFERENCIA (DOCENTE)
// ========================================
router.post(
  '/:id/archivos',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  limpiarTemporales, // borra los temporales de multer al terminar la respuesta (3.Q)
  upload.array('archivos', 5),
  validarArchivos, // tipos permitidos por extensión y contenido (5.4)
  sanitizeNoSQL, // multer arma objetos anidados con campo[$ne]
  tareaController.subirArchivosReferencia
);

router.delete(
  '/:id/archivos/:archivoId',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.archivo),
  tareaController.eliminarArchivoReferencia
);

// Descarga: el controlador verifica acceso a la tarea y, en entregas, que sea visible para el rol
router.get(
  '/:id/archivos/:archivoId',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  validate(tareaValidation.archivo),
  tareaController.descargarArchivo
);

// ========================================
// ENTREGAS (ESTUDIANTE)
// ========================================
router.patch(
  '/:id/marcar-vista',
  authorize('ESTUDIANTE'),
  validate(tareaValidation.obtenerPorId),
  tareaController.marcarVista
);

router.post(
  '/:id/entregar',
  authorize('ESTUDIANTE'),
  limpiarTemporales, // borra los temporales de multer al terminar la respuesta (3.Q)
  upload.array('archivos', 5),
  validarArchivos, // tipos permitidos por extensión y contenido (5.4)
  sanitizeNoSQL, // multer arma objetos anidados con campo[$ne]
  validate(tareaValidation.entregar),
  tareaController.entregar
);

router.get(
  '/:id/mi-entrega',
  authorize('ESTUDIANTE'),
  validate(tareaValidation.obtenerPorId),
  tareaController.verMiEntrega
);

// ========================================
// CALIFICACIONES (DOCENTE)
// ========================================
router.get(
  '/:id/entregas',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.obtenerPorId),
  tareaController.verEntregas
);

// Ruta antigua (PUT) - mantener por compatibilidad con web React
router.put(
  '/:id/entregas/:entregaId',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.calificar),
  tareaController.calificarEntrega
);

// ✅ NUEVA RUTA: POST con /calificar explícito (para Flutter)
router.post(
  '/:id/entregas/:entregaId/calificar',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  validate(tareaValidation.calificar),
  tareaController.calificarEntrega
);

// ========================================
// VISTAS ESPECIALES
// ========================================
router.get(
  '/especial/mis-tareas',
  authorize('ESTUDIANTE'),
  tareaController.misTareas
);

router.get(
  '/especial/estudiante/:estudianteId',
  authorize('ACUDIENTE', 'ADMIN', 'COORDINADOR', 'RECTOR'),
  tareaController.tareasEstudiante
);

router.get(
  '/especial/estadisticas',
  authorize('ADMIN', 'DOCENTE', 'RECTOR', 'COORDINADOR'),
  tareaController.estadisticas
);

router.get(
  '/especial/proximas-vencer',
  authorize('DOCENTE', 'ESTUDIANTE', 'ADMIN', 'RECTOR', 'COORDINADOR'),
  tareaController.proximasVencer
);

export default router;