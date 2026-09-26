// src/controllers/calificacion.controller.ts

import { Request, Response, NextFunction } from 'express';
import Calificacion from '../models/calificacion.model';
import ApiError from '../utils/ApiError';
import Asignatura from '../models/asignatura.model';
import Curso from '../models/curso.model';
import {
  esRolAdministrativo,
  obtenerAsignaturasDocente,
  obtenerHijosIds,
  queryString,
} from '../utils/accesoAcademico';

// Filtro adicional de LECTURA según el rol:
// ESTUDIANTE lo suyo, ACUDIENTE sus hijos, DOCENTE sus asignaturas o los cursos que dirige,
// administrativos todo su colegio. Devuelve null si el rol no tiene acceso.
const filtroLecturaPorRol = async (user: any): Promise<Record<string, unknown> | null> => {
  if (esRolAdministrativo(user.tipo)) return {};
  if (user.tipo === 'ESTUDIANTE') return { estudianteId: user._id };
  if (user.tipo === 'ACUDIENTE') {
    const hijos = await obtenerHijosIds(user);
    return { estudianteId: { $in: hijos } };
  }
  if (user.tipo === 'DOCENTE') {
    const [asignaturas, dirigidos] = await Promise.all([
      obtenerAsignaturasDocente(user._id, user.escuelaId),
      Curso.find({ escuelaId: user.escuelaId, director_grupo: user._id }).select('_id').lean(),
    ]);
    return {
      $or: [
        { asignaturaId: { $in: asignaturas } },
        { cursoId: { $in: dirigidos.map((c) => c._id) } },
      ],
    };
  }
  return null;
};

// Filtro adicional de ESCRITURA: el DOCENTE solo en sus asignaturas; administrativos todo su colegio
const filtroEscrituraPorRol = async (user: any): Promise<Record<string, unknown>> => {
  if (user.tipo === 'DOCENTE') {
    const asignaturas = await obtenerAsignaturasDocente(user._id, user.escuelaId);
    return { asignaturaId: { $in: asignaturas } };
  }
  return {};
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

// Populate proyectado (Fase 3.6): mismos tipos que antes, solo los campos necesarios
const POBLAR_CALIFICACION = [
  { path: 'estudianteId', select: 'nombre apellidos email estado info_academica.codigo_estudiante' },
  { path: 'asignaturaId', select: 'nombre cursoId docenteId' },
  { path: 'cursoId', select: 'nombre nivel grado grupo jornada año_academico' },
];

class CalificacionController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Lista blanca de campos (sin ...req.body)
      const {
        estudianteId,
        asignaturaId,
        cursoId,
        periodo,
        año_academico,
        calificaciones_logros,
        observaciones,
      } = req.body;

      // La asignatura debe ser del colegio y del curso indicado; el DOCENTE solo en sus asignaturas
      const asignatura = await Asignatura.findOne({
        _id: asignaturaId,
        escuelaId: req.user.escuelaId,
        cursoId,
      }).select('docenteId');
      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada en este curso');
      }
      if (req.user.tipo === 'DOCENTE' && String(asignatura.docenteId) !== String(req.user._id)) {
        throw new ApiError(403, 'Solo puede calificar en sus asignaturas');
      }

      // El estudiante debe pertenecer al curso
      const enCurso = await Curso.exists({
        _id: cursoId,
        escuelaId: req.user.escuelaId,
        estudiantes: estudianteId,
      });
      if (!enCurso) {
        throw new ApiError(400, 'El estudiante no pertenece a este curso');
      }

      const calificacionData = {
        estudianteId,
        asignaturaId,
        cursoId,
        periodo,
        año_academico,
        calificaciones_logros,
        observaciones,
        escuelaId: req.user.escuelaId,
      };

      const calificacion = await Calificacion.create(calificacionData);
      await calificacion.populate(POBLAR_CALIFICACION);

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

      const estudianteId = queryString(req.query.estudianteId);
      const asignaturaId = queryString(req.query.asignaturaId);
      const cursoId = queryString(req.query.cursoId);
      const periodo = queryString(req.query.periodo);
      const año_academico = queryString(req.query.año_academico);

      const filtroRol = await filtroLecturaPorRol(req.user);
      if (!filtroRol) {
        throw new ApiError(403, 'No tiene acceso a las calificaciones');
      }

      // ACUDIENTE que pide un estudiante que no es su hijo → 403 explícito
      if (req.user.tipo === 'ACUDIENTE' && estudianteId) {
        const hijos = await obtenerHijosIds(req.user);
        if (!hijos.includes(estudianteId)) {
          throw new ApiError(403, 'No tiene acceso a la información de este estudiante');
        }
      }

      const query: any = { escuelaId: req.user.escuelaId };

      if (estudianteId) query.estudianteId = estudianteId;
      if (asignaturaId) query.asignaturaId = asignaturaId;
      if (cursoId) query.cursoId = cursoId;
      if (periodo) query.periodo = periodo;
      if (año_academico) query.año_academico = año_academico;

      // El filtro de rol se combina con $and para que no lo pisen los parámetros del cliente
      const calificaciones = await Calificacion.find({ $and: [query, filtroRol] })
        .populate(POBLAR_CALIFICACION)
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

      const filtroRol = await filtroLecturaPorRol(req.user);
      if (!filtroRol) {
        throw new ApiError(403, 'No tiene acceso a las calificaciones');
      }

      const calificacion = await Calificacion.findOne({
        $and: [{ _id: req.params.id, escuelaId: req.user.escuelaId }, filtroRol],
      }).populate(POBLAR_CALIFICACION);

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

      // Lista blanca: estudianteId, asignaturaId, cursoId y escuelaId no se pueden cambiar
      const { calificaciones_logros, observaciones, periodo, año_academico } = req.body;
      const datos: Record<string, unknown> = {};
      if (calificaciones_logros !== undefined) datos.calificaciones_logros = calificaciones_logros;
      if (observaciones !== undefined) datos.observaciones = observaciones;
      if (periodo !== undefined) datos.periodo = periodo;
      if (año_academico !== undefined) datos.año_academico = año_academico;

      const calificacion = await Calificacion.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
          ...(await filtroEscrituraPorRol(req.user)),
        },
        datos,
        { new: true, runValidators: true },
      ).populate(POBLAR_CALIFICACION);

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
          ...(await filtroEscrituraPorRol(req.user)),
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
      ).populate(POBLAR_CALIFICACION);

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
          ...(await filtroEscrituraPorRol(req.user)),
        },
        {
          $set: {
            'calificaciones_logros.$.calificacion': valorCalificacion,
            'calificaciones_logros.$.observacion': observacion,
          },
        },
        { new: true, runValidators: true },
      ).populate(POBLAR_CALIFICACION);

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
