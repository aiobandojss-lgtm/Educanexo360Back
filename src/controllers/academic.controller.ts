// src/controllers/academic.controller.ts

import { Request, Response, NextFunction } from 'express';
import academicService from '../services/academic.service';
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

class AcademicController {
  async obtenerPromedioPeriodo(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId, asignaturaId, periodo, año_academico } = req.query;

      if (!estudianteId || !asignaturaId || !periodo || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }

      const promedios = await academicService.calcularPromedioPeriodo(
        estudianteId as string,
        asignaturaId as string,
        Number(periodo),
        año_academico as string,
      );

      res.json({
        success: true,
        data: promedios,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerPromedioAsignatura(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId, asignaturaId, año_academico } = req.query;

      if (!estudianteId || !asignaturaId || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }

      const promedios = await academicService.calcularPromedioAsignatura(
        estudianteId as string,
        asignaturaId as string,
        año_academico as string,
      );

      res.json({
        success: true,
        data: promedios,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerEstadisticasGrupo(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { cursoId, asignaturaId, periodo, año_academico } = req.query;

      if (!cursoId || !asignaturaId || !periodo || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }

      const estadisticas = await academicService.obtenerEstadisticasGrupo(
        cursoId as string,
        asignaturaId as string,
        Number(periodo),
        año_academico as string,
      );

      res.json({
        success: true,
        data: estadisticas,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AcademicController();
