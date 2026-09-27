// src/routes/system.routes.ts
import express from 'express';
import { query, body } from 'express-validator';
import { checkSystemStatus, initializeSystem } from '../controllers/system.controller';
import { obtenerEstadoOutbox, reintentarFallidos } from '../controllers/outbox.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { systemInitializeValidation } from '../validations/system.validation';

const router = express.Router();

// Verificar el estado del sistema
router.get('/status', checkSystemStatus);

// Inicializar el sistema
router.post('/initialize', validate(systemInitializeValidation), initializeSystem);

/**
 * @swagger
 * /system/outbox:
 *   get:
 *     summary: Estado de la cola de envíos (outbox)
 *     description: >
 *       Para verificar en producción que el worker de la cola corre (último tick, conteos por estado,
 *       PENDIENTE más antiguo, últimos FALLIDO, y los PENDIENTE con error —fallos en curso— con los intentos que
 *       llevan). SUPER_ADMIN ve toda la cola (o la de ?escuelaId) y además el estado del correo (episodio de
 *       fallos sistémicos y cortocircuito, auditoría 4.AG); ADMIN solo los trabajos de su colegio; los demás
 *       roles reciben 403.
 *     tags: [Sistema]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: escuelaId
 *         schema:
 *           type: string
 *         description: Solo SUPER_ADMIN. Filtra por colegio.
 *     responses:
 *       200:
 *         description: Estado del worker y conteos por estado
 *       403:
 *         description: Rol sin permiso
 */
router.get(
  '/outbox',
  authenticate,
  validate([query('escuelaId').optional().isMongoId().withMessage('ID de escuela inválido')]),
  obtenerEstadoOutbox,
);

/**
 * @swagger
 * /system/outbox/reintentar-fallidos:
 *   post:
 *     summary: Devuelve a la cola los trabajos FALLIDO reintentables (SUPER_ADMIN)
 *     description: >
 *       Tras resolver un problema del proveedor de correo (auditoría 4.AG). Filtra por fecha del fallo
 *       (updatedAt) y/o tipo. Omite los FALLIDO definitivos (rechazo permanente, enlace vencido), los de payload
 *       sensible ya redactado y los correos de cuenta cuyo enlace ya habría vencido.
 *     tags: [Sistema]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               desde: { type: string, format: date-time }
 *               hasta: { type: string, format: date-time }
 *               tipo: { type: string, enum: [email, correo-cuenta, push, despachar-mensaje, copias-acudientes, resumen-diario] }
 *     responses:
 *       200:
 *         description: '{ success, data: { reintentados }, message }'
 *       400:
 *         description: Fechas o tipo inválidos
 *       403:
 *         description: Solo SUPER_ADMIN
 */
router.post(
  '/outbox/reintentar-fallidos',
  authenticate,
  authorize('SUPER_ADMIN'),
  validate([
    body('desde').optional().isISO8601().withMessage('desde debe ser una fecha ISO 8601'),
    body('hasta').optional().isISO8601().withMessage('hasta debe ser una fecha ISO 8601'),
    body('tipo')
      .optional()
      .isIn(['email', 'correo-cuenta', 'push', 'despachar-mensaje', 'copias-acudientes', 'resumen-diario'])
      .withMessage('Tipo de trabajo no válido'),
  ]),
  reintentarFallidos,
);

export default router;
