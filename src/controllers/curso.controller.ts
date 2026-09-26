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

// Populate proyectado (Fase 3.6): mismos tipos (objetos) que antes para no romper APKs viejas,
// pero solo con los campos que usan los clientes (antes: documentos de usuario completos)
const POBLAR_CURSO = [
  { path: 'director_grupo', select: 'nombre apellidos email tipo' },
  { path: 'estudiantes', select: 'nombre apellidos email estado' },
];

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
      await curso.populate(POBLAR_CURSO);

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

      const año_academico = typeof req.query.año_academico === 'string' ? req.query.año_academico : undefined;
      const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
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
        cursos = await Curso.find(query).populate(POBLAR_CURSO).sort({ nombre: 1 }).lean();
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
          .populate(POBLAR_CURSO)
          .sort({ nombre: 1 })
          .lean();
      }
      // Para otros roles (estudiantes, padres), no deberían acceder a esta función
      else {
        throw new ApiError(403, 'No tiene permisos para ver cursos');
      }

      // Conteos (Flutter los lee si vienen): una sola agregación para todas las asignaturas
      const idsCursos = (cursos as any[]).map((c) => c._id);
      const conteoAsignaturas = await mongoose.model('Asignatura').aggregate([
        { $match: { escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId), cursoId: { $in: idsCursos } } },
        { $group: { _id: '$cursoId', total: { $sum: 1 } } },
      ]);
      const asignaturasPorCurso = new Map(conteoAsignaturas.map((a: any) => [String(a._id), a.total]));
      const cursosConConteo = (cursos as any[]).map((c) => ({
        ...c,
        estudiantesCount: Array.isArray(c.estudiantes) ? c.estudiantes.length : 0,
        asignaturasCount: asignaturasPorCurso.get(String(c._id)) || 0,
      }));

      res.json({
        success: true,
        data: cursosConConteo,
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
      }).populate(POBLAR_CURSO);

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
      ).populate(POBLAR_CURSO);

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
      ).populate(POBLAR_CURSO);

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
      ).populate(POBLAR_CURSO);

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
