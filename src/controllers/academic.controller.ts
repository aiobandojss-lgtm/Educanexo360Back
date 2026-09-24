// src/controllers/academic.controller.ts

import { Request, Response, NextFunction } from 'express';
import academicService from '../services/academic.service';
import mongoose from 'mongoose';
import ApiError from '../utils/ApiError';
import {
  puedeVerEstudiante,
  docenteTieneCurso,
  esRolAdministrativo,
  queryString,
} from '../utils/accesoAcademico';

// Valida que los IDs recibidos por query sean ObjectId (evita operadores y errores de cast)
const validarIds = (...ids: (string | undefined)[]): void => {
  if (ids.some((id) => !id || !mongoose.isValidObjectId(id))) {
    throw new ApiError(400, 'Parámetros inválidos');
  }
};

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

      const estudianteId = queryString(req.query.estudianteId);
      const asignaturaId = queryString(req.query.asignaturaId);
      const periodo = queryString(req.query.periodo);
      const año_academico = queryString(req.query.año_academico);

      if (!estudianteId || !asignaturaId || !periodo || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }
      validarIds(estudianteId, asignaturaId);

      if (!(await puedeVerEstudiante(req.user, estudianteId))) {
        throw new ApiError(403, 'No tiene acceso a la información de este estudiante');
      }

      const promedios = await academicService.calcularPromedioPeriodo(
        estudianteId,
        asignaturaId,
        Number(periodo),
        año_academico,
        req.user.escuelaId,
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

      const estudianteId = queryString(req.query.estudianteId);
      const asignaturaId = queryString(req.query.asignaturaId);
      const año_academico = queryString(req.query.año_academico);

      if (!estudianteId || !asignaturaId || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }
      validarIds(estudianteId, asignaturaId);

      if (!(await puedeVerEstudiante(req.user, estudianteId))) {
        throw new ApiError(403, 'No tiene acceso a la información de este estudiante');
      }

      const promedios = await academicService.calcularPromedioAsignatura(
        estudianteId,
        asignaturaId,
        año_academico,
        req.user.escuelaId,
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

      const cursoId = queryString(req.query.cursoId);
      const asignaturaId = queryString(req.query.asignaturaId);
      const periodo = queryString(req.query.periodo);
      const año_academico = queryString(req.query.año_academico);

      if (!cursoId || !asignaturaId || !periodo || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }
      validarIds(cursoId, asignaturaId);

      // DOCENTE: solo sus cursos. Administrativos: su colegio (el filtro escuelaId va en la agregación)
      if (!esRolAdministrativo(req.user.tipo) && !(await docenteTieneCurso(req.user, cursoId))) {
        throw new ApiError(403, 'No tiene acceso a este curso');
      }

      const estadisticas = await academicService.obtenerEstadisticasGrupo(
        cursoId,
        asignaturaId,
        Number(periodo),
        año_academico,
        req.user.escuelaId,
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
