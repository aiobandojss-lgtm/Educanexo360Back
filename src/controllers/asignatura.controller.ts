import { Request, Response, NextFunction } from 'express';
import Asignatura from '../models/asignatura.model';
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

class AsignaturaController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const asignaturaData = {
        ...req.body,
        escuelaId: req.user.escuelaId,
      };

      const asignatura = await Asignatura.create(asignaturaData);
      await asignatura.populate(['cursoId', 'docenteId']);

      res.status(201).json({
        success: true,
        data: asignatura,
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

      const { cursoId, docenteId, estado } = req.query;
      const query: any = { escuelaId: req.user.escuelaId };

      if (cursoId) {
        query.cursoId = cursoId;
      }

      if (docenteId) {
        query.docenteId = docenteId;
      }

      if (estado) {
        query.estado = estado;
      }

      // Modificar la forma en que se hace populate para garantizar todos los datos del docente
      const asignaturas = await Asignatura.find(query)
        .populate({
          path: 'docenteId',
          select: 'nombre apellidos email tipo estado', // Incluir todos los campos necesarios
          model: 'Usuario',
        })
        .populate('cursoId', 'nombre grado grupo nivel jornada año_academico')
        .sort({ nombre: 1 });

      // Transformación de datos para asegurar consistencia
      const asignaturasConDocentes = asignaturas.map((asignatura) => {
        const doc = asignatura.toObject();
        return {
          ...doc,
          docente: doc.docenteId, // Asegurar que el campo docente siempre esté presente
        };
      });

      res.json({
        success: true,
        data: asignaturasConDocentes,
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

      const asignatura = await Asignatura.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      })
        .populate({
          path: 'docenteId',
          select: 'nombre apellidos email tipo estado',
          model: 'Usuario',
        })
        .populate('cursoId', 'nombre grado grupo nivel jornada año_academico');

      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada');
      }

      const doc = asignatura.toObject();

      res.json({
        success: true,
        data: {
          ...doc,
          docente: doc.docenteId, // Asegurar que el campo docente siempre esté presente
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ✅ SOLUCIÓN REAL: Modificar el método actualizar para manejar desasignación de cursos
  async actualizar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // ✅ MANEJO ESPECIAL: Si se envía cursoId como string vacío o null, removerlo del curso
      const updateData = { ...req.body };

      if (
        updateData.cursoId === '' ||
        updateData.cursoId === null ||
        updateData.cursoId === 'null'
      ) {
        console.log(`🔄 Desasignando asignatura ${req.params.id} de su curso`);

        // Usar $unset para remover completamente el campo cursoId
        const asignatura = await Asignatura.findOneAndUpdate(
          {
            _id: req.params.id,
            escuelaId: req.user.escuelaId,
          },
          {
            $unset: { cursoId: 1 }, // Remover el campo completamente
            estado: 'ACTIVO', // Mantener activa
          },
          { new: true, runValidators: false }, // Desactivar validaciones para esta operación
        ).populate(['docenteId']);

        if (!asignatura) {
          throw new ApiError(404, 'Asignatura no encontrada');
        }

        console.log('✅ Asignatura desasignada del curso exitosamente');

        res.json({
          success: true,
          data: asignatura,
          message: 'Asignatura removida del curso exitosamente',
        });
        return;
      }

      // ✅ ACTUALIZACIÓN NORMAL: Para otros casos de actualización
      const asignatura = await Asignatura.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        updateData,
        { new: true, runValidators: true },
      ).populate(['cursoId', 'docenteId']);

      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada');
      }

      res.json({
        success: true,
        data: asignatura,
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

      const asignatura = await Asignatura.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada');
      }

      res.json({
        success: true,
        message: 'Asignatura desactivada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizarPeriodos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { periodos } = req.body;

      const asignatura = await Asignatura.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { periodos },
        { new: true, runValidators: true },
      ).populate(['cursoId', 'docenteId']);

      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada');
      }

      res.json({
        success: true,
        data: asignatura,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerPorCurso(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { cursoId } = req.params;

      const asignaturas = await Asignatura.find({
        cursoId,
        escuelaId: req.user.escuelaId,
        estado: 'ACTIVO',
      }).populate({
        path: 'docenteId',
        select: 'nombre apellidos email tipo estado',
        model: 'Usuario',
      });

      // Transformar datos para asegurar consistencia
      const asignaturasFormateadas = asignaturas.map((asignatura) => {
        const doc = asignatura.toObject();
        return {
          ...doc,
          docente: doc.docenteId,
        };
      });

      res.json({
        success: true,
        data: asignaturasFormateadas,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerNoAsignadasACurso(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { cursoId } = req.params;
      console.log(`Buscando asignaturas no asignadas al curso ${cursoId}`);

      // Primero, obtener todas las asignaturas que ya están asignadas a este curso
      interface AsignaturaDoc {
        _id: any;
      }

      const asignaturasAsignadas = await Asignatura.find({
        cursoId,
        escuelaId: req.user.escuelaId,
      }).select('_id');

      console.log(`Encontradas ${asignaturasAsignadas.length} asignaturas ya asignadas al curso`);

      // Obtener IDs de asignaturas ya asignadas
      const idsAsignadas = asignaturasAsignadas.map((a: AsignaturaDoc) => a._id.toString());

      // Ahora buscar asignaturas que no estén asignadas a este curso
      interface AsignaturaQuery {
        escuelaId: string;
        estado: string;
        _id?: { $nin: string[] };
      }

      const query: AsignaturaQuery = {
        escuelaId: req.user.escuelaId,
        estado: 'ACTIVO',
      };

      // Solo aplicar filtro de exclusión si hay asignaturas asignadas
      if (idsAsignadas.length > 0) {
        query._id = { $nin: idsAsignadas };
      }

      console.log('Ejecutando consulta para asignaturas no asignadas:', JSON.stringify(query));

      const asignaturas = await Asignatura.find(query)
        .populate({
          path: 'docenteId',
          select: 'nombre apellidos email tipo estado',
          model: 'Usuario',
        })
        .populate('cursoId', 'nombre grado grupo nivel jornada año_academico')
        .sort({ nombre: 1 });

      console.log(`Encontradas ${asignaturas.length} asignaturas no asignadas al curso`);

      // Transformar datos para asegurar consistencia
      const asignaturasFormateadas = asignaturas.map((asignatura) => {
        const doc = asignatura.toObject();
        return {
          ...doc,
          docente: doc.docenteId,
        };
      });

      res.json({
        success: true,
        data: asignaturasFormateadas,
      });
    } catch (error) {
      console.error('Error en obtenerNoAsignadasACurso:', error);
      next(error);
    }
  }

  async removerDeCurso(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const asignatura = await Asignatura.findOneAndUpdate(
        { _id: req.params.id, escuelaId: req.user.escuelaId },
        { $unset: { cursoId: 1 } },
        { new: true, runValidators: false },
      );

      if (!asignatura) {
        throw new ApiError(404, 'Asignatura no encontrada');
      }

      res.json({ success: true, message: 'Asignatura removida del curso' });
    } catch (error) {
      next(error);
    }
  }
}

export default new AsignaturaController();
