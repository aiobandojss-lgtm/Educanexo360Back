// src/routes/system.routes.ts
import express from 'express';
import { query } from 'express-validator';
import { checkSystemStatus, initializeSystem } from '../controllers/system.controller';
import { obtenerEstadoOutbox } from '../controllers/outbox.controller';
import { authenticate } from '../middleware/auth.middleware';
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
 *       PENDIENTE más antiguo, últimos FALLIDO). SUPER_ADMIN ve toda la cola (o la de ?escuelaId);
 *       ADMIN solo los trabajos de su colegio; los demás roles reciben 403.
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

export default router;
