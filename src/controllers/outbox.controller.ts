import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Outbox from '../models/outbox.model';
import ApiError from '../utils/ApiError';
import { estadoWorker } from '../queue/outbox';

interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
  };
}

/**
 * GET /api/system/outbox — estado de la cola de envíos (Fase 4.1), para verificar en producción que el
 * worker corre. SUPER_ADMIN: toda la cola (o ?escuelaId=). ADMIN: SOLO los trabajos de su colegio.
 */
export const obtenerEstadoOutbox = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, 'No autorizado');

    let filtro: Record<string, unknown> = {};
    if (req.user.tipo === 'SUPER_ADMIN') {
      const escuelaId = typeof req.query.escuelaId === 'string' ? req.query.escuelaId : undefined;
      if (escuelaId) filtro = { escuelaId: new mongoose.Types.ObjectId(escuelaId) };
    } else if (req.user.tipo === 'ADMIN') {
      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'El usuario no tiene un colegio asociado');
      }
      // Nunca conteos de otros colegios
      filtro = { escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId) };
    } else {
      throw new ApiError(403, 'No tienes permiso para ver la cola de envíos');
    }

    const [porEstado, pendienteMasAntiguo, fallidosRecientes] = await Promise.all([
      Outbox.aggregate([{ $match: filtro }, { $group: { _id: '$estado', total: { $sum: 1 } } }]),
      Outbox.findOne({ ...filtro, estado: 'PENDIENTE' })
        .sort({ nextRunAt: 1 })
        .select('tipo nextRunAt createdAt intentos')
        .lean(),
      Outbox.find({ ...filtro, estado: 'FALLIDO' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('tipo error intentos updatedAt')
        .lean(),
    ]);

    const conteos: Record<string, number> = { PENDIENTE: 0, PROCESANDO: 0, HECHO: 0, FALLIDO: 0 };
    porEstado.forEach((e: any) => {
      conteos[e._id] = e.total;
    });

    res.json({
      success: true,
      data: {
        worker: estadoWorker(),
        conteos,
        pendienteMasAntiguo,
        fallidosRecientes,
      },
    });
  } catch (error) {
    next(error);
  }
};
