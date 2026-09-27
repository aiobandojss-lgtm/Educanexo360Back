// src/controllers/asistencia.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Asistencia from '../models/asistencia.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import pushNotificationService from '../services/pushNotification.service';
import {
  IEstadisticasAsistencia,
  IEstadisticasEstudiante,
  EstadoAsistencia,
} from '../interfaces/IAsistencia';
import AlertaAsistencia from '../models/alertaAsistencia.model';
import { procesarAlertasAsistenciaCurso } from '../services/alertaAsistencia.service';
import { numeroPagina, numeroLimite } from '../utils/paginacion';
import { logger } from '../utils/logger';
import { inicioMesColombia } from '../utils/fechas';
import {
  esRolAdministrativo,
  docenteTieneCurso,
  obtenerCursosDocente,
  obtenerHijosIds,
  puedeVerEstudiante,
  queryString,
} from '../utils/accesoAcademico';

const idDe = (valor: any): string => String(valor?._id ?? valor);

// DOCENTE: puede ver un registro si lo creó o si es de uno de sus cursos
const docentePuedeVerRegistro = async (user: any, asistencia: any): Promise<boolean> =>
  idDe(asistencia.docenteId) === String(user._id) ||
  (await docenteTieneCurso(user, idDe(asistencia.cursoId)));

// Solo el docente que creó el registro o un rol administrativo pueden modificarlo
const puedeModificarRegistro = (user: any, asistencia: any): boolean =>
  esRolAdministrativo(user.tipo) || idDe(asistencia.docenteId) === String(user._id);

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
    permisos: string[];
    perfilRolId?: string;
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
      periodoId,
    } = req.body;

    // Verificar si ya existe un registro de asistencia para este curso, fecha y asignatura
    const existeAsistencia = await Asistencia.findOne({
      escuelaId: req.user.escuelaId,
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
        escuelaId: req.user.escuelaId,
        director_grupo: req.user._id,
      });

      // 2. Si no es director, verificar si imparte alguna asignatura en el curso
      if (!curso) {
        const tieneAsignatura = await mongoose.model('Asignatura').findOne({
          cursoId: cursoId,
          escuelaId: req.user.escuelaId,
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

    // El curso debe ser del colegio del usuario
    const curso = await Curso.findOne({ _id: cursoId, escuelaId: req.user.escuelaId })
      .select('estudiantes')
      .lean();
    if (!curso) {
      return next(new ApiError(404, 'Curso no encontrado'));
    }
    const idsCurso = new Set((curso.estudiantes || []).map((e: any) => String(e)));
    const ahora = new Date();

    // Estudiantes: normalizados (id o poblado), solo del curso y solo campos permitidos.
    // Deduplicados por estudianteId con un Map (si se repite, gana el último; auditoría 3.W).
    // Si no se envían, todos los del curso en PRESENTE (como antes).
    const estudiantesRegistro =
      Array.isArray(estudiantes) && estudiantes.length > 0
        ? [
            ...new Map(
              estudiantes
                .filter((est: any) => est && est.estudianteId && idsCurso.has(idDe(est.estudianteId)))
                .map((est: any) => [
                  idDe(est.estudianteId),
                  {
                    estudianteId: idDe(est.estudianteId),
                    estado: est.estado || EstadoAsistencia.PRESENTE,
                    justificacion: est.justificacion,
                    observaciones: est.observaciones,
                    registradoPor: req.user!._id,
                    fechaRegistro: ahora,
                  },
                ]),
            ).values(),
          ]
        : [...idsCurso].map((estudianteId) => ({
            estudianteId,
            estado: EstadoAsistencia.PRESENTE,
            registradoPor: req.user!._id,
            fechaRegistro: ahora,
          }));

    // Lista blanca (auditoría 3.E): antes Asistencia.create(req.body) aceptaba cualquier campo
    // (finalizado, docenteId, escuelaId...). finalizado, docenteId y escuelaId los pone el servidor.
    const nuevaAsistencia = await Asistencia.create({
      fecha,
      cursoId,
      ...(asignaturaId && { asignaturaId }),
      ...(periodoId && { periodoId }),
      tipoSesion,
      horaInicio,
      horaFin,
      observacionesGenerales,
      estudiantes: estudiantesRegistro,
      docenteId: req.user._id,
      escuelaId: req.user.escuelaId,
      finalizado: false,
    });

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

    // Valores de query casteados a string (evita operadores como cursoId[$ne]=)
    const cursoId = queryString(req.query.cursoId);
    const asignaturaId = queryString(req.query.asignaturaId);
    const desde = queryString(req.query.desde);
    const hasta = queryString(req.query.hasta);
    const docenteId = queryString(req.query.docenteId);
    const finalizado = queryString(req.query.finalizado);
    const page = numeroPagina(req.query.page);
    const limit = numeroLimite(req.query.limit, 10);

    const skip = (Number(page) - 1) * Number(limit);

    // Construir la consulta
    const query: any = { escuelaId: req.user.escuelaId };

    if (cursoId) query.cursoId = cursoId;
    if (asignaturaId) query.asignaturaId = asignaturaId;
    if (docenteId) query.docenteId = docenteId;
    if (finalizado !== undefined) query.finalizado = finalizado === 'true';

    // DOCENTE: solo registros propios o de sus cursos
    if (req.user.tipo === 'DOCENTE') {
      const cursosDocente = await obtenerCursosDocente(req.user._id, req.user.escuelaId);
      query.$or = [{ docenteId: req.user._id }, { cursoId: { $in: cursosDocente } }];
    }

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

    const asistencia = await Asistencia.findOne({ _id: id, escuelaId: req.user.escuelaId })
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

    // DOCENTE: solo registros propios o de sus cursos
    if (req.user.tipo === 'DOCENTE' && !(await docentePuedeVerRegistro(req.user, asistencia))) {
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

    logger.debug(
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
    const { observacionesGenerales, tipoSesion, horaInicio, horaFin } = req.body;
    let { estudiantes } = req.body;

    const asistencia = await Asistencia.findOne({ _id: id, escuelaId: req.user.escuelaId });

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Solo el docente que creó el registro o un rol administrativo
    if (!puedeModificarRegistro(req.user, asistencia)) {
      return next(new ApiError(403, 'No tiene autorización para modificar este registro'));
    }

    // Actualizar solo los campos permitidos
    if (Array.isArray(estudiantes)) {
      // Permitidos: los que YA están en el registro (conserva la historia de estudiantes trasladados)
      // o los que están hoy en el curso. El id se normaliza: puede llegar poblado ({ _id, ... }).
      const curso = await Curso.findOne({ _id: asistencia.cursoId, escuelaId: req.user.escuelaId })
        .select('estudiantes')
        .lean();
      const idsPermitidos = new Set<string>([
        ...(curso?.estudiantes || []).map((e: any) => String(e)),
        ...(asistencia.estudiantes || []).map((e: any) => idDe(e.estudianteId)),
      ]);

      estudiantes = estudiantes
        .filter((est: any) => est && est.estudianteId && idsPermitidos.has(idDe(est.estudianteId)))
        .map((est: any) => ({ ...est, estudianteId: idDe(est.estudianteId) }));

      // MERGE por estudianteId: se actualizan los enviados y se CONSERVAN los no enviados
      // (antes se reemplazaba el arreglo completo y se perdían entradas históricas).
      const enviados = new Map<string, any>(estudiantes.map((est: any) => [est.estudianteId, est]));
      // Desde aquí se recorre el Map (deduplicado; gana el último): sin entradas dobles ni notificaciones
      // repetidas si el cliente envía el mismo estudiante dos veces (auditoría 3.W)
      estudiantes = [...enviados.values()];
      const ahora = new Date();
      const actualizar = (est: any) => ({
        estado: est.estado,
        justificacion: est.justificacion,
        observaciones: est.observaciones,
        registradoPor: req.user!._id,
        fechaRegistro: ahora,
      });

      const existentes = new Set<string>();
      (asistencia.estudiantes || []).forEach((entrada: any) => {
        const k = idDe(entrada.estudianteId);
        existentes.add(k);
        const est = enviados.get(k);
        if (est) Object.assign(entrada, actualizar(est));
      });
      // Nuevos del curso que aún no tenían entrada en el registro
      estudiantes
        .filter((est: any) => !existentes.has(est.estudianteId))
        .forEach((est: any) => {
          asistencia.estudiantes.push({ estudianteId: est.estudianteId, ...actualizar(est) } as any);
        });
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

    // Notificar acudientes de ausentes (fire-and-forget, antes del return para que ejecute)
    if (estudiantes && Array.isArray(estudiantes)) {
      const ausentes = estudiantes.filter((est: any) => est.estado === 'AUSENTE');
      if (ausentes.length > 0) {
        const ausentesIds = ausentes.map((est: any) => est.estudianteId);
        const asignaturaNombre = (asistencia.asignaturaId as any)?.nombre || 'clase';

        (async () => {
          for (const estudianteId of ausentesIds) {
            try {
              const estudiante = await Usuario.findOne({ _id: estudianteId, escuelaId: asistencia.escuelaId })
                .select('nombre apellidos')
                .lean() as any;
              if (!estudiante) continue;

              // Corregido: el campo real es info_academica.estudiantes_asociados (antes: estudiantesAsociados)
              const acudientes = await Usuario.find(
                {
                  escuelaId: asistencia.escuelaId,
                  tipo: 'ACUDIENTE',
                  'info_academica.estudiantes_asociados': estudianteId,
                  fcmToken: { $exists: true, $ne: null },
                },
                { fcmToken: 1 }
              ).lean() as any[];

              for (const acudiente of acudientes) {
                pushNotificationService.enviarNotificacion({
                  token: acudiente.fcmToken,
                  titulo: 'Ausencia registrada',
                  mensaje: `${estudiante.nombre} ${estudiante.apellidos} fue marcado ausente en ${asignaturaNombre}`,
                  data: { tipo: 'ausencia', estudianteId: estudianteId.toString() },
                }).catch(() => {});
              }
            } catch {/* silencioso */}
          }
        })();
      }
    }

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

    const asistencia = await Asistencia.findOne({ _id: id, escuelaId: req.user.escuelaId });

    if (!asistencia) {
      return next(new ApiError(404, 'Registro de asistencia no encontrado'));
    }

    // Solo el docente que creó el registro o un rol administrativo
    if (!puedeModificarRegistro(req.user, asistencia)) {
      return next(new ApiError(403, 'No tiene autorización para modificar este registro'));
    }

    // Verificar que tenga al menos un estudiante registrado
    if (!asistencia.estudiantes || asistencia.estudiantes.length === 0) {
      return next(new ApiError(400, 'No se puede finalizar un registro sin estudiantes'));
    }

    // Finalizar el registro
    asistencia.finalizado = true;
    await asistencia.save();

    setImmediate(() => {
      // Usar el docenteId del registro, no de quien finaliza (puede ser rector/coordinador)
      const docenteId = asistencia.docenteId.toString();
      const cursoId = asistencia.cursoId.toString();
      const escuelaId = req.user!.escuelaId.toString();
      const periodoId = asistencia.periodoId?.toString();

      // Una sola evaluación por curso (agregación + concurrencia acotada) en vez de una por estudiante
      procesarAlertasAsistenciaCurso({
        estudianteIds: (asistencia.estudiantes ?? []).map((entrada) => entrada.estudianteId.toString()),
        cursoId,
        escuelaId,
        docenteId,
        periodoId,
      }).catch((err: any) => console.error('[AlertaAsistencia]', err));
    });

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
    if (!puedeModificarRegistro(req.user, asistencia)) {
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
    const desde = queryString(req.query.desde);
    const hasta = queryString(req.query.hasta);
    const asignaturaId = queryString(req.query.asignaturaId);

    // DOCENTE: solo sus cursos
    if (req.user.tipo === 'DOCENTE' && !(await docenteTieneCurso(req.user, cursoId))) {
      return next(new ApiError(403, 'No tiene acceso a este curso'));
    }

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
    const desde = queryString(req.query.desde);
    const hasta = queryString(req.query.hasta);
    const cursoId = queryString(req.query.cursoId);
    const asignaturaId = queryString(req.query.asignaturaId);

    // Regla de rol: ESTUDIANTE él mismo, ACUDIENTE sus hijos, DOCENTE sus cursos, administrativos su colegio
    if (!(await puedeVerEstudiante(req.user, estudianteId))) {
      return next(new ApiError(403, 'No tiene acceso a la información de este estudiante'));
    }

    // Verificar que el estudiante existe en el colegio
    const estudiante = await Usuario.findOne({
      _id: estudianteId,
      escuelaId: req.user.escuelaId,
    }).select('nombre apellidos');
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

    const fecha = queryString(req.query.fecha);
    const cursoId = queryString(req.query.cursoId);
    const asignaturaId = queryString(req.query.asignaturaId);

    if (!fecha) {
      return next(new ApiError(400, 'La fecha es requerida'));
    }

    if (!cursoId) {
      return next(new ApiError(400, 'El ID del curso es requerido'));
    }

    // DOCENTE: solo sus cursos
    if (req.user.tipo === 'DOCENTE' && !(await docenteTieneCurso(req.user, cursoId))) {
      return next(new ApiError(403, 'No tiene acceso a este curso'));
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

    const fechaInicio = queryString(req.query.fechaInicio);
    const fechaFin = queryString(req.query.fechaFin);
    const cursoId = queryString(req.query.cursoId);
    const estudianteIdQuery = queryString(req.query.estudianteId);

    // cursoId mal formado → 400 (antes: excepción al convertirlo a ObjectId → 500)
    if (cursoId && !mongoose.isValidObjectId(cursoId)) {
      return next(new ApiError(400, 'cursoId inválido'));
    }

    // Construir la consulta
    const query: any = { escuelaId: req.user.escuelaId };

    if (cursoId) query.cursoId = cursoId;

    // ESTUDIANTE / ACUDIENTE: solo registros donde aparece el estudiante permitido
    const esRolPersonal = req.user.tipo === 'ESTUDIANTE' || req.user.tipo === 'ACUDIENTE';
    let estudiantesPermitidos: string[] = [];
    if (req.user.tipo === 'ESTUDIANTE') {
      estudiantesPermitidos = [String(req.user._id)];
    } else if (req.user.tipo === 'ACUDIENTE') {
      const hijos = await obtenerHijosIds(req.user);
      if (estudianteIdQuery) {
        if (!hijos.includes(estudianteIdQuery)) {
          return next(new ApiError(403, 'No tiene acceso a la información de este estudiante'));
        }
        estudiantesPermitidos = [estudianteIdQuery];
      } else {
        estudiantesPermitidos = hijos;
      }
    }
    if (esRolPersonal) {
      query['estudiantes.estudianteId'] = { $in: estudiantesPermitidos };
    }

    // Filtro por rango de fechas. Sin fechas: el mes actual, igual que el rango por defecto de web y
    // Flutter (antes traía TODO el histórico y con volumen real tumbaba el proceso por memoria).
    query.fecha = {};
    if (fechaInicio) query.fecha.$gte = new Date(fechaInicio as string);
    if (fechaFin) query.fecha.$lte = new Date(fechaFin as string);
    if (!fechaInicio && !fechaFin) {
      // Mes actual según la hora de Colombia (entre las 19:00 y las 24:00 del último día, el mes UTC ya
      // es el siguiente), expresado como medianoche UTC del día 1, igual que se guardan las fechas
      query.fecha.$gte = inicioMesColombia();
    }

    // Si es docente, solo mostrar sus propios registros
    if (req.user.tipo === 'DOCENTE') {
      query.docenteId = req.user._id;
    }

    // Agregación (Fase 3.7): los conteos se calculan en MongoDB y no se traen los arreglos de
    // estudiantes a memoria. La forma de cada fila es idéntica a la versión anterior.
    const oid = (v: any) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));
    const matchAgg: any = { escuelaId: oid(query.escuelaId) };
    if (query.cursoId) matchAgg.cursoId = oid(query.cursoId);
    if (query.docenteId) matchAgg.docenteId = oid(query.docenteId);
    if (query.fecha) matchAgg.fecha = query.fecha;
    const permitidosOid = estudiantesPermitidos.filter((id) => mongoose.isValidObjectId(id)).map(oid);
    if (esRolPersonal) matchAgg['estudiantes.estudianteId'] = { $in: permitidosOid };

    // Roles personales: cada registro solo con la entrada del estudiante permitido (no la de sus compañeros)
    const entradas = esRolPersonal
      ? { $filter: { input: '$estudiantes', as: 'e', cond: { $in: ['$$e.estudianteId', permitidosOid] } } }
      : '$estudiantes';
    const contar = (estado: string) => ({
      $size: { $filter: { input: '$entradas', as: 'e', cond: { $eq: ['$$e.estado', estado] } } },
    });

    const filas = await Asistencia.aggregate([
      { $match: matchAgg },
      // Orden por fecha: usa el índice {escuelaId, fecha} (ordenar por _id forzaba recorrer la colección)
      { $sort: { fecha: 1 } },
      { $project: { fecha: 1, cursoId: 1, asignaturaId: 1, docenteId: 1, createdAt: 1, finalizado: 1, entradas } },
      {
        $project: {
          fecha: 1,
          cursoId: 1,
          asignaturaId: 1,
          docenteId: 1,
          createdAt: 1,
          finalizado: 1,
          totalEstudiantes: { $size: '$entradas' },
          presentes: contar(EstadoAsistencia.PRESENTE),
          ausentes: contar(EstadoAsistencia.AUSENTE),
          tardes: contar(EstadoAsistencia.TARDANZA),
          justificados: contar(EstadoAsistencia.JUSTIFICADO),
          permisos: contar(EstadoAsistencia.PERMISO),
        },
      },
    ]);

    // Curso, asignatura y docente: una consulta $in por colección (antes: populate por registro)
    const unicos = (campo: string) => [...new Set(filas.map((f: any) => f[campo]).filter(Boolean).map(String))];
    const [cursosInfo, asignaturasInfo, docentesInfo] = await Promise.all([
      Curso.find({ _id: { $in: unicos('cursoId') } }).select('nombre nivel grado grupo').lean(),
      mongoose.model('Asignatura').find({ _id: { $in: unicos('asignaturaId') } }).select('nombre codigo').lean(),
      Usuario.find({ _id: { $in: unicos('docenteId') } }).select('nombre apellidos').lean(),
    ]);
    const mapa = (docs: any[]) => new Map(docs.map((d) => [String(d._id), d]));
    const cursosMap = mapa(cursosInfo);
    const asignaturasMap = mapa(asignaturasInfo);
    const docentesMap = mapa(docentesInfo);

    // Transformar los datos para el formato que espera el frontend (igual que antes)
    const resumen = filas.map((registro: any) => {
      const { totalEstudiantes, presentes, ausentes, tardes, justificados, permisos } = registro;

      // Calcular porcentaje de asistencia (Math.round; NaN → null en JSON si no hay estudiantes)
      const porcentajeAsistencia = Math.round(((presentes + justificados) / totalEstudiantes) * 100);

      const cursoData: any = (registro.cursoId && cursosMap.get(String(registro.cursoId))) || {
        nombre: 'Sin curso',
        grado: '',
        grupo: '',
      };
      const asignaturaData: any = registro.asignaturaId
        ? asignaturasMap.get(String(registro.asignaturaId)) || null
        : null;
      const docenteData: any = (registro.docenteId && docentesMap.get(String(registro.docenteId))) || {
        nombre: 'Sin nombre',
        apellidos: '',
      };

      return {
        _id: registro._id,
        fecha: registro.fecha,
        cursoId: cursoData._id || '',
        curso: {
          nombre: cursoData.nombre || 'Sin curso',
          grado: cursoData.grado || '',
          grupo: cursoData.grupo || '',
        },
        asignatura: asignaturaData
          ? {
              _id: asignaturaData._id || '',
              nombre: asignaturaData.nombre || '',
            }
          : null,
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
    const curso = await Curso.findOne({ _id: cursoId, escuelaId: req.user.escuelaId }).populate({
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

/**
 * GET /api/asistencia/alertas
 * Retorna alertas de asistencia con populate de estudiante y curso.
 */
export const getAlertasAsistencia = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new ApiError(401, 'No autorizado'));
    }

    const { cursoId, estudianteId, nivel, periodoId } = req.query;

    const filtro: Record<string, any> = {
      escuelaId: req.user.escuelaId,
    };

    if (cursoId) filtro.cursoId = cursoId;
    if (estudianteId) filtro.estudianteId = estudianteId;
    if (nivel) filtro.nivel = nivel;
    if (periodoId) filtro.periodoId = periodoId;

    const alertas = await AlertaAsistencia.find(filtro)
      .populate('estudianteId', 'nombre apellidos')
      .populate('cursoId', 'nombre nivel grado grupo')
      .sort({ fechaEnvio: -1 });

    return res.status(200).json({
      success: true,
      data: alertas,
    });
  } catch (error) {
    return next(error);
  }
};
