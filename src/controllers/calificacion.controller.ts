// src/controllers/calificacion.controller.ts

import { Request, Response, NextFunction } from 'express';
import Calificacion from '../models/calificacion.model';
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

class CalificacionController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const calificacionData = {
        ...req.body,
        escuelaId: req.user.escuelaId,
      };

      const calificacion = await Calificacion.create(calificacionData);
      await calificacion.populate(['estudianteId', 'asignaturaId', 'cursoId']);

      res.status(201).json({
        success: true,
        data: calificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerTodas(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId, asignaturaId, cursoId, periodo, año_academico } = req.query;
      const query: any = { escuelaId: req.user.escuelaId };

      if (estudianteId) query.estudianteId = estudianteId;
      if (asignaturaId) query.asignaturaId = asignaturaId;
      if (cursoId) query.cursoId = cursoId;
      if (periodo) query.periodo = periodo;
      if (año_academico) query.año_academico = año_academico;

      const calificaciones = await Calificacion.find(query)
        .populate(['estudianteId', 'asignaturaId', 'cursoId'])
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: calificaciones,
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

      const calificacion = await Calificacion.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate(['estudianteId', 'asignaturaId', 'cursoId']);

      if (!calificacion) {
        throw new ApiError(404, 'Calificación no encontrada');
      }

      res.json({
        success: true,
        data: calificacion,
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

      const calificacion = await Calificacion.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        req.body,
        { new: true, runValidators: true },
      ).populate(['estudianteId', 'asignaturaId', 'cursoId']);

      if (!calificacion) {
        throw new ApiError(404, 'Calificación no encontrada');
      }

      res.json({
        success: true,
        data: calificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async agregarCalificacionLogro(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { logroId, calificacion: valorCalificacion, observacion } = req.body;

      const calificacion = await Calificacion.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        {
          $push: {
            calificaciones_logros: {
              logroId,
              calificacion: valorCalificacion,
              observacion,
              fecha_calificacion: new Date(),
            },
          },
        },
        { new: true, runValidators: true },
      ).populate(['estudianteId', 'asignaturaId', 'cursoId']);

      if (!calificacion) {
        throw new ApiError(404, 'Calificación no encontrada');
      }

      res.json({
        success: true,
        data: calificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizarCalificacionLogro(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { logroId, calificacion: valorCalificacion, observacion } = req.body;

      const calificacion = await Calificacion.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
          'calificaciones_logros.logroId': logroId,
        },
        {
          $set: {
            'calificaciones_logros.$.calificacion': valorCalificacion,
            'calificaciones_logros.$.observacion': observacion,
          },
        },
        { new: true, runValidators: true },
      ).populate(['estudianteId', 'asignaturaId', 'cursoId']);

      if (!calificacion) {
        throw new ApiError(404, 'Calificación o logro no encontrado');
      }

      res.json({
        success: true,
        data: calificacion,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CalificacionController();
