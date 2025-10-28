// src/controllers/asistencia.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Asistencia from '../models/asistencia.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import {
  IEstadisticasAsistencia,
  IEstadisticasEstudiante,
  EstadoAsistencia,
} from '../interfaces/IAsistencia';

// Definir la interfaz para Request con el usuario autenticado
interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
  };
}

/**
 * Crear un nuevo registro de asistencia
 * @route POST /api/asistencia
 */
// Modificación para el controlador de asistencia - Método crearAsistencia

export const crearAsistencia = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const {
      fecha,
      cursoId,
      asignaturaId,
      tipoSesion,
      horaInicio,
      horaFin,
      observacionesGenerales,
      estudiantes,
    } = req.body;

    // Verificar si ya existe un registro de asistencia para este curso, fecha y asignatura
    const existeAsistencia = await Asistencia.findOne({
      fecha: new Date(fecha),
      cursoId,
      ...(asignaturaId && { asignaturaId }),
    });

    if (existeAsistencia) {
      return next(
        new ApiError(
          400,
          'Ya existe un registro de asistencia para esta fecha, curso y asignatura',
        ),
      );
    }

    // VALIDACIÓN ADICIONAL: Verificar que el docente puede registrar asistencia para este curso
    if (req.user.tipo === 'DOCENTE') {
      // 1. Verificar si es director de grupo del curso
      const curso = await Curso.findOne({
        _id: cursoId,
        director_grupo: req.user._id,
      });

      // 2. Si no es director, verificar si imparte alguna asignatura en el curso
      if (!curso) {
        const tieneAsignatura = await mongoose.model('Asignatura').findOne({
          cursoId: cursoId,
          docenteId: req.user._id,
          estado: 'ACTIVO',
        });

        // 3. Si no tiene relación con el curso, denegar acceso
        if (!tieneAsignatura) {
          return next(
            new ApiError(403, 'No tiene autorización para registrar asistencia en este curso'),
          );
        }
      }
    }

    // Obtener los estudiantes del curso si no se proporcionaron
    if (!estudiantes || estudiantes.length === 0) {
      const curso = await Curso.findById(cursoId);
      if (!curso) {
        return next(new ApiError(404, 'Curso no encontrado'));
      }

      // Crear la lista de estudiantes con estado PRESENTE por defecto
      const estudiantesRegistro = curso.estudiantes.map(
        (estudianteId: mongoose.Types.ObjectId) => ({
          estudianteId,
          estado: EstadoAsistencia.PRESENTE,
          fechaRegistro: new Date(),
          registradoPor: (req.user as NonNullable<typeof req.user>)._id,
        }),
      );

      req.body.estudiantes = estudiantesRegistro;
    }

    // Agregar datos del docente y escuela
    req.body.docenteId = req.user._id;
    req.body.escuelaId = req.user.escuelaId;

    const nuevaAsistencia = await Asistencia.create(req.body);

    return res.status(201).json({
      success: true,
      data: nuevaAsistencia,
      message: 'Registro de asistencia creado exitosamente',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener todos los registros de asistencia
 * @route GET /api/asistencia
 */
export const obtenerAsistencias = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const {
      cursoId,
      asignaturaId,
      desde,
      hasta,
      docenteId,
      finalizado,
      page = 1,
      limit = 10,
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    // Construir la consulta
    const query: any = { escuelaId: req.user.escuelaId };

    if (cursoId) query.cursoId = cursoId;
    if (asignaturaId) query.asignaturaId = asignaturaId;
    if (docenteId) query.docenteId = docenteId;
    if (finalizado !== undefined) query.finalizado = finalizado === 'true';

    // Filtro por rango de fechas
    if (desde || hasta) {
      query.fecha = {};
      if (desde) query.fecha.$gte = new Date(desde as string);
      if (hasta) query.fecha.$lte = new Date(hasta as string);
    }

    // Total de documentos para paginación
    const total = await Asistencia.countDocuments(query);

    // Obtener registros de asistencia
    const asistencias = await Asistencia.find(query)
      .sort({ fecha: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('cursoId', 'nombre nivel grado grupo')
      .populate('asignaturaId', 'nombre codigo')
      .populate('docenteId', 'nombre apellidos')
      .populate('estudiantes.estudianteId', 'nombre apellidos');

    return res.status(200).json({
      success: true,
      total,
      count: asistencias.length,
      data: asistencias,
      pagination: {
        totalPages: Math.ceil(total / Number(limit)),
        currentPage: Number(page),
        hasNext: Number(page) < Math.ceil(total / Number(limit)),
        hasPrev: Number(page) > 1,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener un registro de asistencia por ID
 * @route GET /api/asistencia/:id
 */
export const obtenerAsistenciaPorId = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { id } = req.params;

    const asistencia = await Asistencia.findById(id)
      .populate('cursoId', 'nombre nivel grado grupo')
      .populate('asignaturaId', 'nombre codigo')
      .populate('docenteId', 'nombre apellidos')
      .populate({
        path: 'estudiantes.estudianteId',
        select: 'nombre apellidos email',
        model: 'Usuario',
      });

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Verificar que pertenece a la escuela del usuario
    if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
      return next(new ApiError(403, 'No tiene acceso a este registro de asistencia'));
    }

    // Formatear los datos de estudiantes para enviar información completa
    const estudiantesFormateados = asistencia.estudiantes.map((est) => {
      // Determinar si estudianteId es un objeto o solo el ID
      const estudianteObj =
        typeof est.estudianteId === 'object' && est.estudianteId !== null
          ? est.estudianteId
          : { _id: est.estudianteId, nombre: '', apellidos: '' };

      // Verificar que estado sea un valor válido, si no, asignar PRESENTE
      const estadoValido = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'JUSTIFICADO', 'PERMISO'].includes(
        est.estado,
      )
        ? est.estado
        : 'PRESENTE';

      return {
        estudianteId: estudianteObj._id || est.estudianteId,
        nombre: 'nombre' in estudianteObj ? estudianteObj.nombre : '',
        apellidos: 'apellidos' in estudianteObj ? estudianteObj.apellidos : '',
        estado: estadoValido,
        observaciones: est.observaciones || '',
        justificacion: est.justificacion || '',
      };
    });

    // Crear objeto de respuesta con datos formateados
    const respuesta = {
      ...asistencia.toObject(),
      estudiantes: estudiantesFormateados,
      cursoNombre: (asistencia.cursoId as any)?.nombre || '',
      asignaturaNombre: (asistencia.asignaturaId as any)?.nombre || '',
      grado: (asistencia.cursoId as any)?.grado || '',
      grupo: (asistencia.cursoId as any)?.grupo || '',
    };

    console.log(
      'Estados de estudiantes:',
      estudiantesFormateados.map((e) => e.estado),
    );

    return res.status(200).json({
      success: true,
      data: respuesta,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Actualizar un registro de asistencia
 * @route PUT /api/asistencia/:id
 */
export const actualizarAsistencia = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { id } = req.params;
    const { estudiantes, observacionesGenerales, tipoSesion, horaInicio, horaFin } = req.body;

    const asistencia = await Asistencia.findById(id);

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Verificar que pertenece a la escuela del usuario
    if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
      return next(new ApiError(403, 'No tiene acceso a este registro de asistencia'));
    }

    // Actualizar solo los campos permitidos
    if (estudiantes) {
      // Añadir registradoPor y fechaRegistro a cada estudiante actualizado
      const estudiantesActualizados = estudiantes.map((est: any) => ({
        ...est,
        registradoPor: req.user!._id,
        fechaRegistro: new Date(),
      }));

      asistencia.estudiantes = estudiantesActualizados;
    }

    if (observacionesGenerales !== undefined) {
      asistencia.observacionesGenerales = observacionesGenerales;
    }

    if (tipoSesion) {
      asistencia.tipoSesion = tipoSesion;
    }

    if (horaInicio) {
      asistencia.horaInicio = horaInicio;
    }

    if (horaFin) {
      asistencia.horaFin = horaFin;
    }

    // Guardar los cambios
    await asistencia.save();

    return res.status(200).json({
      success: true,
      data: asistencia,
      message: 'Registro de asistencia actualizado exitosamente',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Finalizar un registro de asistencia
 * @route PATCH /api/asistencia/:id/finalizar
 */
export const finalizarAsistencia = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { id } = req.params;

    const asistencia = await Asistencia.findById(id);

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Verificar que pertenece a la escuela del usuario
    if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
      return next(new ApiError(403, 'No tiene acceso a este registro de asistencia'));
    }

    // Verificar que tenga al menos un estudiante registrado
    if (!asistencia.estudiantes || asistencia.estudiantes.length === 0) {
      return next(new ApiError(400, 'No se puede finalizar un registro sin estudiantes'));
    }

    // Finalizar el registro
    asistencia.finalizado = true;
    await asistencia.save();

    return res.status(200).json({
      success: true,
      message: 'Registro de asistencia finalizado exitosamente',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Eliminar un registro de asistencia
 * @route DELETE /api/asistencia/:id
 */
export const eliminarAsistencia = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { id } = req.params;

    const asistencia = await Asistencia.findById(id);

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Verificar que pertenece a la escuela del usuario
    if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
      return next(new ApiError(403, 'No tiene acceso a este registro de asistencia'));
    }

    // Verificar que solo el creador o un administrador puede eliminar
    if (asistencia.docenteId.toString() !== req.user._id && req.user.tipo !== 'ADMIN') {
      return next(new ApiError(403, 'No tiene autorización para eliminar este registro'));
    }

    // Solo permitir eliminar si no está finalizado
    if (asistencia.finalizado) {
      return next(new ApiError(400, 'No se puede eliminar un registro finalizado'));
    }

    await Asistencia.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Registro de asistencia eliminado exitosamente',
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener estadísticas de asistencia por curso
 * @route GET /api/asistencia/estadisticas/curso/:cursoId
 */
export const obtenerEstadisticasCurso = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { cursoId } = req.params;
    const { desde, hasta, asignaturaId } = req.query;

    // Construir la consulta
    const query: any = {
      cursoId,
      escuelaId: req.user.escuelaId,
      finalizado: true,
    };

    if (asignaturaId) query.asignaturaId = asignaturaId;

    // Filtro por rango de fechas
    if (desde || hasta) {
      query.fecha = {};
      if (desde) query.fecha.$gte = new Date(desde as string);
      if (hasta) query.fecha.$lte = new Date(hasta as string);
    }

    // Obtener todos los registros de asistencia del curso
    const registros = await Asistencia.find(query).select('estudiantes fecha').sort({ fecha: 1 });

    if (registros.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay registros de asistencia para este curso en el período seleccionado',
        data: {
          registrosTotales: 0,
          estadisticas: {
            presentes: 0,
            ausentes: 0,
            tardanzas: 0,
            justificados: 0,
            permisos: 0,
            total: 0,
            porcentajeAsistencia: 0,
          },
          porDia: [],
        },
      });
    }

    // Calcular estadísticas generales
    let presentes = 0;
    let ausentes = 0;
    let tardanzas = 0;
    let justificados = 0;
    let permisos = 0;
    let total = 0;

    // Estadísticas por día
    const porDia: any[] = [];

    registros.forEach((registro) => {
      // Estadísticas de este día
      const estadisticaDia: IEstadisticasAsistencia = {
        presentes: 0,
        ausentes: 0,
        tardanzas: 0,
        justificados: 0,
        permisos: 0,
        total: registro.estudiantes.length,
        porcentajeAsistencia: 0,
      };

      // Contar cada tipo de asistencia
      registro.estudiantes.forEach((est) => {
        switch (est.estado) {
          case EstadoAsistencia.PRESENTE:
            presentes++;
            estadisticaDia.presentes++;
            break;
          case EstadoAsistencia.AUSENTE:
            ausentes++;
            estadisticaDia.ausentes++;
            break;
          case EstadoAsistencia.TARDANZA:
            tardanzas++;
            estadisticaDia.tardanzas++;
            break;
          case EstadoAsistencia.JUSTIFICADO:
            justificados++;
            estadisticaDia.justificados++;
            break;
          case EstadoAsistencia.PERMISO:
            permisos++;
            estadisticaDia.permisos++;
            break;
        }
      });

      total += registro.estudiantes.length;

      // Calcular porcentaje de asistencia para este día
      estadisticaDia.porcentajeAsistencia = Math.round(
        ((estadisticaDia.presentes + estadisticaDia.tardanzas) / estadisticaDia.total) * 100,
      );

      // Agregar a la lista por día
      porDia.push({
        fecha: registro.fecha,
        estadisticas: estadisticaDia,
      });
    });

    // Calcular porcentaje general
    const porcentajeAsistencia = Math.round(((presentes + tardanzas) / total) * 100);

    return res.status(200).json({
      success: true,
      data: {
        registrosTotales: registros.length,
        estadisticas: {
          presentes,
          ausentes,
          tardanzas,
          justificados,
          permisos,
          total,
          porcentajeAsistencia,
        },
        porDia,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener estadísticas de asistencia por estudiante
 * @route GET /api/asistencia/estadisticas/estudiante/:estudianteId
 */
export const obtenerEstadisticasEstudiante = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { estudianteId } = req.params;
    const { desde, hasta, cursoId, asignaturaId } = req.query;

    // Verificar que el estudiante existe
    const estudiante = await Usuario.findById(estudianteId).select('nombre apellidos');
    if (!estudiante) {
      return next(new ApiError(404, 'Estudiante no encontrado'));
    }

    // Construir la consulta
    const query: any = {
      'estudiantes.estudianteId': estudianteId,
      escuelaId: req.user.escuelaId,
      finalizado: true,
    };

    if (cursoId) query.cursoId = cursoId;
    if (asignaturaId) query.asignaturaId = asignaturaId;

    // Filtro por rango de fechas
    if (desde || hasta) {
      query.fecha = {};
      if (desde) query.fecha.$gte = new Date(desde as string);
      if (hasta) query.fecha.$lte = new Date(hasta as string);
    }

    // Obtener todos los registros que incluyen a este estudiante
    const registros = await Asistencia.find(query)
      .populate({
        path: 'cursoId',
        select: 'nombre nivel grado grupo',
      })
      .populate({
        path: 'asignaturaId',
        select: 'nombre codigo',
      })
      .sort({ fecha: 1 });

    if (registros.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No hay registros de asistencia para este estudiante en el período seleccionado',
        data: {
          estudiante: {
            _id: estudianteId,
            nombre: estudiante.nombre,
            apellidos: estudiante.apellidos,
          },
          estadisticas: {
            clasesTotales: 0,
            presentes: 0,
            ausentes: 0,
            tardanzas: 0,
            justificados: 0,
            permisos: 0,
            porcentajeAsistencia: 0,
          },
          registros: [],
        },
      });
    }

    // Calcular estadísticas
    let presentes = 0;
    let ausentes = 0;
    let tardanzas = 0;
    let justificados = 0;
    let permisos = 0;

    // Detalles por día
    const registrosDetalle: any[] = [];

    registros.forEach((registro) => {
      // Buscar al estudiante específico en la lista
      const estudianteInfo = registro.estudiantes.find(
        (est: any) => est.estudianteId.toString() === estudianteId,
      );

      if (estudianteInfo) {
        // Contar cada tipo de asistencia
        switch (estudianteInfo.estado) {
          case EstadoAsistencia.PRESENTE:
            presentes++;
            break;
          case EstadoAsistencia.AUSENTE:
            ausentes++;
            break;
          case EstadoAsistencia.TARDANZA:
            tardanzas++;
            break;
          case EstadoAsistencia.JUSTIFICADO:
            justificados++;
            break;
          case EstadoAsistencia.PERMISO:
            permisos++;
            break;
        }

        // Usar casting a any para acceso seguro a propiedades
        const cursoData = registro.cursoId ? (registro.cursoId as any) : null;
        const asignaturaData = registro.asignaturaId ? (registro.asignaturaId as any) : null;

        // Agregar a la lista de detalles
        registrosDetalle.push({
          _id: registro._id,
          fecha: registro.fecha,
          curso: cursoData,
          asignatura: asignaturaData,
          estado: estudianteInfo.estado,
          justificacion: estudianteInfo.justificacion,
          observaciones: estudianteInfo.observaciones,
        });
      }
    });

    const clasesTotales = registros.length;
    const porcentajeAsistencia =
      clasesTotales > 0 ? Math.round(((presentes + tardanzas) / clasesTotales) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        estudiante: {
          _id: estudianteId,
          nombre: estudiante.nombre,
          apellidos: estudiante.apellidos,
        },
        estadisticas: {
          clasesTotales,
          presentes,
          ausentes,
          tardanzas,
          justificados,
          permisos,
          porcentajeAsistencia,
        },
        registros: registrosDetalle,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener registros de asistencia por día para un curso
 * @route GET /api/asistencia/dia
 */
export const obtenerAsistenciaDia = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { fecha, cursoId, asignaturaId } = req.query;

    if (!fecha) {
      return next(new ApiError(400, 'La fecha es requerida'));
    }

    if (!cursoId) {
      return next(new ApiError(400, 'El ID del curso es requerido'));
    }

    // Construir fechas para buscar registros en el día específico
    const fechaInicio = new Date(fecha as string);
    fechaInicio.setHours(0, 0, 0, 0);

    const fechaFin = new Date(fecha as string);
    fechaFin.setHours(23, 59, 59, 999);

    // Construir la consulta
    const query: any = {
      cursoId,
      escuelaId: req.user.escuelaId,
      fecha: { $gte: fechaInicio, $lte: fechaFin },
    };

    if (asignaturaId) {
      query.asignaturaId = asignaturaId;
    }

    // Buscar los registros de asistencia para ese día
    const registros = await Asistencia.find(query)
      .populate({
        path: 'asignaturaId',
        select: 'nombre codigo',
      })
      .populate({
        path: 'docenteId',
        select: 'nombre apellidos',
      })
      .populate({
        path: 'estudiantes.estudianteId',
        select: 'nombre apellidos',
      });

    return res.status(200).json({
      success: true,
      count: registros.length,
      data: registros,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Obtener resumen general de asistencia
 * @route GET /api/asistencia/resumen
 */
// src/controllers/asistencia.controller.ts
// MÉTODO: obtenerResumen (línea ~580)

/**
 * Obtener resumen general de asistencia
 * @route GET /api/asistencia/resumen
 */
export const obtenerResumen = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { fechaInicio, fechaFin, cursoId } = req.query;

    // Construir la consulta
    const query: any = { escuelaId: req.user.escuelaId };

    if (cursoId) query.cursoId = cursoId;

    // Filtro por rango de fechas
    if (fechaInicio || fechaFin) {
      query.fecha = {};
      if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
      if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    }

    // Si es docente, solo mostrar sus propios registros
    if (req.user.tipo === 'DOCENTE') {
      query.docenteId = req.user._id;
    }

    // ✅ CAMBIO 1: Agregar asignaturaId al select y populate
    const registros = await Asistencia.find(query)
      .populate('cursoId', 'nombre nivel grado grupo')
      .populate('asignaturaId', 'nombre codigo') // ← ✅ AGREGAR ESTA LÍNEA
      .populate('docenteId', 'nombre apellidos')
      .select('fecha cursoId asignaturaId docenteId estudiantes createdAt finalizado'); // ← ✅ Agregar asignaturaId

    // Transformar los datos para el formato que espera el frontend
    const resumen = registros.map((registro) => {
      // Calcular estadísticas para este registro
      const totalEstudiantes = registro.estudiantes.length;
      const presentes = registro.estudiantes.filter(
        (est) => est.estado === EstadoAsistencia.PRESENTE,
      ).length;
      const ausentes = registro.estudiantes.filter(
        (est) => est.estado === EstadoAsistencia.AUSENTE,
      ).length;
      const tardes = registro.estudiantes.filter(
        (est) => est.estado === EstadoAsistencia.TARDANZA,
      ).length;
      const justificados = registro.estudiantes.filter(
        (est) => est.estado === EstadoAsistencia.JUSTIFICADO,
      ).length;
      const permisos = registro.estudiantes.filter(
        (est) => est.estado === EstadoAsistencia.PERMISO,
      ).length;

      // Calcular porcentaje de asistencia
      const porcentajeAsistencia = Math.round(
        ((presentes + justificados) / totalEstudiantes) * 100,
      );

      // Usar casting a any para acceso seguro a propiedades
      const cursoData = registro.cursoId
        ? (registro.cursoId as any)
        : { nombre: 'Sin curso', grado: '', grupo: '' };
      
      // ✅ CAMBIO 2: Agregar asignaturaData
      const asignaturaData = registro.asignaturaId
        ? (registro.asignaturaId as any)
        : null;
      
      const docenteData = registro.docenteId
        ? (registro.docenteId as any)
        : { nombre: 'Sin nombre', apellidos: '' };

      return {
        _id: registro._id,
        fecha: registro.fecha,
        cursoId: cursoData._id || '',
        curso: {
          nombre: cursoData.nombre || 'Sin curso',
          grado: cursoData.grado || '',
          grupo: cursoData.grupo || '',
        },
        // ✅ CAMBIO 3: Agregar campo asignatura en el resultado
        asignatura: asignaturaData ? {
          _id: asignaturaData._id || '',
          nombre: asignaturaData.nombre || '',
        } : null,
        totalEstudiantes,
        presentes,
        ausentes,
        tardes,
        justificados,
        permisos,
        porcentajeAsistencia,
        registradoPor: {
          _id: docenteData._id || '',
          nombre: docenteData.nombre || 'Sin nombre',
          apellidos: docenteData.apellidos || '',
        },
        createdAt: registro.createdAt,
        finalizado: registro.finalizado || false,
      };
    });

    return res.status(200).json({
      success: true,
      count: resumen.length,
      data: resumen,
    });
  } catch (error) {
    console.error('Error al obtener resumen de asistencia:', error);
    return next(error);
  }
};

/**
 * Obtener resumen de asistencia para un período académico específico
 * @route GET /api/asistencia/resumen/periodo/:periodoId
 */
export const obtenerResumenPeriodo = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { periodoId } = req.params;
    const { cursoId } = req.query;

    if (!cursoId) {
      return next(new ApiError(400, 'El ID del curso es requerido'));
    }

    // Obtener la escuela para verificar el periodo
    const escuela = await mongoose.model('Escuela').findById(req.user.escuelaId);

    if (!escuela) {
      return next(new ApiError(404, 'Escuela no encontrada'));
    }

    // Buscar el periodo específico en la escuela
    let periodoEncontrado: any = null;

    if (escuela.periodos_academicos && Array.isArray(escuela.periodos_academicos)) {
      periodoEncontrado = escuela.periodos_academicos.find(
        (periodo: any) => periodo._id.toString() === periodoId,
      );
    }

    if (!periodoEncontrado) {
      return next(new ApiError(404, 'Periodo académico no encontrado'));
    }

    // Obtener fechas del periodo para filtrar asistencias
    const fechaInicio = new Date(periodoEncontrado.fecha_inicio);
    const fechaFin = new Date(periodoEncontrado.fecha_fin);

    // Obtener todos los estudiantes del curso
    const curso = await Curso.findById(cursoId).populate({
      path: 'estudiantes',
      select: 'nombre apellidos',
    });

    if (!curso) {
      return next(new ApiError(404, 'Curso no encontrado'));
    }

    // Obtener todos los registros de asistencia del período para este curso
    const registros = await Asistencia.find({
      cursoId,
      escuelaId: req.user.escuelaId,
      finalizado: true,
      fecha: { $gte: fechaInicio, $lte: fechaFin },
    }).select('estudiantes fecha');

    // Inicializar resultados
    const estudiantesEstadisticas: IEstadisticasEstudiante[] = [];

    // Para cada estudiante, calcular sus estadísticas
    for (const estudiante of curso.estudiantes) {
      const estudianteId = estudiante._id;
      const estudianteDoc = estudiante as any; // Hacemos un cast a any para acceder a las propiedades

      // Inicializar contadores
      let presentes = 0;
      let ausentes = 0;
      let tardanzas = 0;
      let justificados = 0;
      let permisos = 0;

      // Contar cada tipo de asistencia para este estudiante
      for (const registro of registros) {
        const estudianteInfo = registro.estudiantes.find(
          (est: any) => est.estudianteId.toString() === estudianteId.toString(),
        );

        if (estudianteInfo) {
          switch (estudianteInfo.estado) {
            case EstadoAsistencia.PRESENTE:
              presentes++;
              break;
            case EstadoAsistencia.AUSENTE:
              ausentes++;
              break;
            case EstadoAsistencia.TARDANZA:
              tardanzas++;
              break;
            case EstadoAsistencia.JUSTIFICADO:
              justificados++;
              break;
            case EstadoAsistencia.PERMISO:
              permisos++;
              break;
          }
        }
      }

      const clasesTotales = registros.length;
      const porcentajeAsistencia =
        clasesTotales > 0 ? Math.round(((presentes + tardanzas) / clasesTotales) * 100) : 0;

      // Agregar estadísticas del estudiante al resultado
      estudiantesEstadisticas.push({
        estudianteId,
        nombreEstudiante: `${estudianteDoc.nombre || ''} ${estudianteDoc.apellidos || ''}`,
        clasesTotales,
        presentes,
        ausentes,
        tardanzas,
        justificados,
        permisos,
        porcentajeAsistencia,
      });
    }

    // Ordenar por porcentaje de asistencia (de mayor a menor)
    estudiantesEstadisticas.sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia);

    // Usar casting a any para acceso seguro a propiedades
    const cursoAny = curso as any;

    return res.status(200).json({
      success: true,
      data: {
        periodo: {
          _id: periodoEncontrado._id,
          nombre: periodoEncontrado.nombre,
          numero: periodoEncontrado.numero,
          fechaInicio: periodoEncontrado.fecha_inicio,
          fechaFin: periodoEncontrado.fecha_fin,
        },
        curso: {
          _id: curso._id,
          nombre: cursoAny.nombre || '',
          nivel: cursoAny.nivel || '',
          grado: cursoAny.grado || '',
          grupo: cursoAny.grupo || '',
        },
        totalClases: registros.length,
        estudiantes: estudiantesEstadisticas,
      },
    });
  } catch (error) {
    return next(error);
  }
};
