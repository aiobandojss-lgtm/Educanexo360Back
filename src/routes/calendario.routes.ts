// src/routes/calendario.routes.ts

import express from 'express';
import calendarioController from '../controllers/calendario.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  crearEventoValidation,
  actualizarEventoValidation,
  confirmarAsistenciaValidation,
} from '../validations/calendario.validation';
import gridfsManager from '../config/gridfs';
import ApiError from '../utils/ApiError';
import { LIMITES_SUBIDA, subidaConLimites } from '../utils/erroresSubida';
import { invalidateOnCalendario } from '../middleware/dashboardCacheInvalidation.middleware';
import { sanitizeNoSQL } from '../middleware/sanitize.middleware';
import { normalizarFechasCliente } from '../middleware/fechasCliente.middleware';
import { validarArchivos } from '../middleware/validarArchivos.middleware';
import { limpiarTemporales } from '../middleware/limpiarTemporales.middleware';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Subida del adjunto (un solo archivo en el campo 'archivo', como envían web y Flutter).
// Se resuelve en cada petición: getUpload() solo existe después de initializeStorage (al conectar Mongo),
// que ocurre DESPUÉS de importar las rutas. Antes se evaluaba al importar y quedaba en [] (nunca subía).
const subirAdjunto: express.RequestHandler = (req, res, next) => {
  const upload = gridfsManager.getUpload();
  if (!upload) {
    return next(new ApiError(503, 'Servicio de archivos no disponible'));
  }
  // 5.C10: errores de multer → 400 con el límite concreto ("Solo se permite 1 archivo", "máximo 5 MB")
  return subidaConLimites(LIMITES_SUBIDA.calendario, upload.single(LIMITES_SUBIDA.calendario.campo))(req, res, next);
};

// Middlewares de actualización, compartidos por PUT /:id y su alias POST /:id
const middlewaresActualizar = [
  authorize('ADMIN', 'DOCENTE'),
  invalidateOnCalendario,
  limpiarTemporales, // borra los temporales de multer al terminar la respuesta (3.Q)
  subirAdjunto,
  validarArchivos, // tipos permitidos por extensión y contenido (5.4)
  sanitizeNoSQL, // multer arma objetos anidados con campo[$ne]
  normalizarFechasCliente, // H3: el body multipart llega después del middleware global
  validate(actualizarEventoValidation),
  calendarioController.actualizarEvento as express.RequestHandler,
];

// Rutas para gestionar eventos
// Crear: solo administrativos (authorize('ADMIN') los incluye) y DOCENTE
router.post(
  '/',
  authorize('ADMIN', 'DOCENTE'),
  invalidateOnCalendario, // ← AGREGAR ESTA LÍNEA
  limpiarTemporales, // borra los temporales de multer al terminar la respuesta (3.Q)
  subirAdjunto,
  validarArchivos, // tipos permitidos por extensión y contenido (5.4)
  sanitizeNoSQL, // multer arma objetos anidados con campo[$ne]
  normalizarFechasCliente, // H3: el body multipart llega después del middleware global
  validate(crearEventoValidation),
  calendarioController.crearEvento as unknown as express.RequestHandler,
);

router.get(
  '/',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), // 👈 Añadido ACUDIENTE
  calendarioController.obtenerEventos as express.RequestHandler,
);

router.get(
  '/:id',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), // 👈 Añadido ACUDIENTE
  calendarioController.obtenerEventoPorId as express.RequestHandler,
);

router.put('/:id', ...middlewaresActualizar);

/**
 * @swagger
 * /api/calendario/{id}:
 *   post:
 *     summary: Alias de PUT /api/calendario/{id} para actualizar un evento con adjunto (multipart)
 *     description: Usado por la app Flutter. Mismo handler, autenticación, validaciones y reglas de propiedad que el PUT.
 *     tags: [Calendario]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Evento actualizado
 *       403:
 *         description: Sin permiso (DOCENTE que no creó el evento)
 *       404:
 *         description: Evento no encontrado
 */
router.post('/:id', ...middlewaresActualizar);

router.delete(
  '/:id',
  authorize('ADMIN', 'DOCENTE'),
  invalidateOnCalendario, // ← AGREGAR ESTA LÍNEA
  calendarioController.eliminarEvento as express.RequestHandler,
);

// Rutas específicas
router.post(
  '/:id/confirmar',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), // 👈 Añadido ACUDIENTE
  validate(confirmarAsistenciaValidation),
  calendarioController.confirmarAsistencia as express.RequestHandler,
);

router.get(
  '/:id/adjunto',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'PADRE', 'ACUDIENTE'), // 👈 Añadido ACUDIENTE
  calendarioController.descargarAdjunto as express.RequestHandler,
);

router.patch(
  '/:id/estado',
  authorize('ADMIN', 'DOCENTE'),
  calendarioController.cambiarEstadoEvento as express.RequestHandler,
);

export default router;
