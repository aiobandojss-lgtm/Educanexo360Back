import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Outbox from '../models/outbox.model';
import ApiError from '../utils/ApiError';
import { estadoWorker, configuracionWorker, TIPOS_CORREO } from '../queue/outbox';
import { estadoMonitor } from '../queue/monitorEnvios';
import { estadoCortocircuito } from '../services/email/proveedores';

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

    const [porEstado, pendienteMasAntiguo, fallidosRecientes, conErrorPorTipo, conErrorRecientes] = await Promise.all([
      Outbox.aggregate([{ $match: filtro }, { $group: { _id: '$estado', total: { $sum: 1 } } }]),
      Outbox.findOne({ ...filtro, estado: 'PENDIENTE' })
        .sort({ nextRunAt: 1 })
        .select('tipo nextRunAt createdAt intentos')
        .lean(),
      Outbox.find({ ...filtro, estado: 'FALLIDO' })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('tipo error intentos updatedAt definitivo')
        .lean(),
      // 4.AG: fallos EN CURSO (PENDIENTE con error), visibles antes de que pasen a FALLIDO (~1 h en los correos)
      Outbox.aggregate([
        { $match: { ...filtro, estado: 'PENDIENTE', error: { $exists: true, $ne: null } } },
        { $group: { _id: '$tipo', total: { $sum: 1 }, maxIntentosLlevados: { $max: '$intentos' } } },
      ]),
      Outbox.find({ ...filtro, estado: 'PENDIENTE', error: { $exists: true, $ne: null } })
        .sort({ updatedAt: -1 })
        .limit(10)
        .select('tipo error intentos nextRunAt updatedAt')
        .lean(),
    ]);
    const cfg = configuracionWorker();
    const pendientesConError = {
      total: conErrorPorTipo.reduce((t: number, g: any) => t + g.total, 0),
      porTipo: conErrorPorTipo.map((g: any) => ({
        tipo: g._id,
        total: g.total,
        maxIntentosLlevados: g.maxIntentosLlevados,
        intentosPermitidos: TIPOS_CORREO.includes(g._id) ? cfg.maxIntentosCorreo : cfg.maxIntentos,
      })),
      recientes: conErrorRecientes,
    };

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
        pendientesConError,
        // Estado global del correo (episodio de fallos y cortocircuito): solo SUPER_ADMIN
        ...(req.user.tipo === 'SUPER_ADMIN' && { correo: { ...estadoMonitor(), cortocircuito: estadoCortocircuito() } }),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/system/outbox/reintentar-fallidos (auditoría 4.AG) — SOLO SUPER_ADMIN. Tras resolver un problema del
 * proveedor, devuelve a PENDIENTE los FALLIDO reintentables (por rango de fechas del fallo y/o tipo). Se omiten:
 * los marcados definitivo (rechazo permanente, enlace vencido), los de payload sensible ya redactado y los correos
 * de cuenta cuyo enlace ya habría vencido (caducaEn pasado).
 */
export const reintentarFallidos = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new ApiError(401, 'No autorizado');
    if (req.user.tipo !== 'SUPER_ADMIN') throw new ApiError(403, 'Solo SUPER_ADMIN puede reintentar la cola de envíos');
    const { desde, hasta, tipo } = req.body || {};
    const ahora = new Date();
    const filtro: Record<string, unknown> = {
      estado: 'FALLIDO',
      definitivo: { $ne: true },
      'payload.redactado': { $ne: true },
      $or: [{ 'payload.caducaEn': { $exists: false } }, { 'payload.caducaEn': { $gt: ahora } }],
    };
    if (tipo) filtro.tipo = tipo;
    if (desde || hasta) {
      filtro.updatedAt = { ...(desde && { $gte: new Date(desde) }), ...(hasta && { $lte: new Date(hasta) }) };
    }
    const r = await Outbox.updateMany(filtro, {
      $set: { estado: 'PENDIENTE', intentos: 0, nextRunAt: ahora, error: `Reintento manual (${ahora.toISOString()})` },
      $unset: { expireAt: 1, lockedUntil: 1 },
    });
    res.json({
      success: true,
      data: { reintentados: r.modifiedCount },
      message: `${r.modifiedCount} trabajo(s) devueltos a la cola`,
    });
  } catch (error) {
    next(error);
  }
};
