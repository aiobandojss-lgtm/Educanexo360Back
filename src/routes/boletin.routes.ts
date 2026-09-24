// src/routes/boletin.routes.ts

import express from 'express';
import boletinController from '../controllers/boletin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas para generar boletines
router.get(
  '/periodo',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  boletinController.generarBoletinPeriodo,
);

router.get(
  '/final',
  authorize('ADMIN', 'DOCENTE', 'ESTUDIANTE', 'ACUDIENTE'),
  boletinController.generarBoletinFinal,
);

export default router;
