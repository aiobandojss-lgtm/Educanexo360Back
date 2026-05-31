import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Curso from '../models/curso.model';
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

class CursoController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const cursoData = {
        ...req.body,
        escuelaId: req.user.escuelaId,
      };

      const curso = await Curso.create(cursoData);
      await curso.populate(['director_grupo', 'estudiantes']);

      res.status(201).json({
        success: true,
        data: curso,
      });
    } catch (error) {
      next(error);
    }
  }

  // Modificación para el controlador de cursos - Método obtenerTodos

  async obtenerTodos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { año_academico, estado } = req.query;
      const query: any = { escuelaId: req.user.escuelaId };

      if (año_academico) {
        query.año_academico = año_academico;
      }

      if (estado) {
        query.estado = estado;
      }

      // Filtrar cursos según el rol del usuario
      let cursos;

      // Si es ADMIN o RECTOR o COORDINADOR, puede ver todos los cursos
      if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(req.user.tipo)) {
        cursos = await Curso.find(query)
          .populate(['director_grupo', 'estudiantes'])
          .sort({ nombre: 1 });
      }
      // Si es DOCENTE, solo ve los cursos donde es director o imparte clases
      else if (req.user.tipo === 'DOCENTE') {
        // 1. Buscar cursos donde es director de grupo
        const cursosDirigidos = await Curso.find({
          ...query,
          director_grupo: req.user._id,
        });

        // 2. Buscar asignaturas donde el docente imparte clases
        const asignaturas = await mongoose.model('Asignatura').find({
          escuelaId: req.user.escuelaId,
          docenteId: req.user._id,
          estado: 'ACTIVO',
        });

        // 3. Extraer los cursos de esas asignaturas
        const cursosAsignaturas = await Curso.find({
          ...query,
          _id: { $in: asignaturas.map((a) => a.cursoId) },
        });

        // 4. Combinar y eliminar duplicados
        const todosLosCursos = [...cursosDirigidos, ...cursosAsignaturas];
        const cursosIds = new Set(todosLosCursos.map((c: { _id: any }) => c._id.toString()));

        // 5. Buscar los cursos completos con sus relaciones
        cursos = await Curso.find({
          _id: { $in: Array.from(cursosIds) },
        })
          .populate(['director_grupo', 'estudiantes'])
          .sort({ nombre: 1 });
      }
      // Para otros roles (estudiantes, padres), no deberían acceder a esta función
      else {
        throw new ApiError(403, 'No tiene permisos para ver cursos');
      }

      res.json({
        success: true,
        data: cursos,
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

      const curso = await Curso.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate(['director_grupo', 'estudiantes']);

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        data: curso,
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

      const curso = await Curso.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        req.body,
        { new: true, runValidators: true },
      ).populate(['director_grupo', 'estudiantes']);

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        data: curso,
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

      const curso = await Curso.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        message: 'Curso desactivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async agregarEstudiantes(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudiantes } = req.body;

      const curso = await Curso.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { $addToSet: { estudiantes: { $each: estudiantes } } },
        { new: true },
      ).populate(['director_grupo', 'estudiantes']);

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        data: curso,
      });
    } catch (error) {
      next(error);
    }
  }

  async removerEstudiantes(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudiantes } = req.body;

      const curso = await Curso.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { $pullAll: { estudiantes } },
        { new: true },
      ).populate(['director_grupo', 'estudiantes']);

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        data: curso,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerEstudiantes(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const curso = await Curso.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate('estudiantes', 'nombre apellidos email tipo');

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      res.json({
        success: true,
        data: curso.estudiantes,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new CursoController();
