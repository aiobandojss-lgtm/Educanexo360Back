// src/controllers/logro.controller.ts

import { Request, Response, NextFunction } from 'express';
import Logro from '../models/logro.model';
import ApiError from '../utils/ApiError';

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

class LogroController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const logroData = {
        ...req.body,
        escuelaId: req.user.escuelaId,
      };

      const logro = await Logro.create(logroData);
      await logro.populate(['asignaturaId', 'cursoId']);

      res.status(201).json({
        success: true,
        data: logro,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerTodos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { asignaturaId, periodo, año_academico, estado } = req.query;
      const query: any = { escuelaId: req.user.escuelaId };

      if (asignaturaId) query.asignaturaId = asignaturaId;
      if (periodo) query.periodo = periodo;
      if (año_academico) query.año_academico = año_academico;
      if (estado) query.estado = estado;

      const logros = await Logro.find(query)
        .populate(['asignaturaId', 'cursoId'])
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: logros,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const logro = await Logro.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate(['asignaturaId', 'cursoId']);

      if (!logro) {
        throw new ApiError(404, 'Logro no encontrado');
      }

      res.json({
        success: true,
        data: logro,
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const logro = await Logro.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        req.body,
        { new: true, runValidators: true },
      ).populate(['asignaturaId', 'cursoId']);

      if (!logro) {
        throw new ApiError(404, 'Logro no encontrado');
      }

      res.json({
        success: true,
        data: logro,
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const logro = await Logro.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!logro) {
        throw new ApiError(404, 'Logro no encontrado');
      }

      res.json({
        success: true,
        message: 'Logro desactivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerLogrosAsignatura(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { asignaturaId } = req.params;
      const { periodo, año_academico } = req.query;

      const logros = await Logro.find({
        asignaturaId,
        escuelaId: req.user.escuelaId,
        periodo: periodo || { $exists: true },
        año_academico: año_academico || { $exists: true },
        estado: 'ACTIVO',
      }).populate(['asignaturaId', 'cursoId']);

      res.json({
        success: true,
        data: logros,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new LogroController();
