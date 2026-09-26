// src/controllers/boletin.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose, { Types } from 'mongoose';
import Calificacion from '../models/calificacion.model';
import Logro from '../models/logro.model';
import Usuario from '../models/usuario.model';
import Asignatura from '../models/asignatura.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import { puedeVerEstudiante } from '../utils/accesoAcademico';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

// Definir interfaces específicas
interface IUserInfo {
  _id: string;
  escuelaId: string;
  tipo: string;
  email: string;
  nombre: string;
  apellidos: string;
  estado: string;
  permisos: string[];
  perfilRolId?: string;
}

interface RequestWithUser<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = ParsedQs>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: IUserInfo;
}

// Definir interface para manejo seguro del docente
interface IDocenteInfo {
  nombre?: string;
  apellidos?: string;
}

class BoletinController {
  async generarBoletinPeriodo(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId, periodo, año_academico } = req.query;

      if (!estudianteId || !periodo || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }

      // Regla de rol: ESTUDIANTE él mismo, ACUDIENTE sus hijos, DOCENTE sus cursos, administrativos su colegio
      if (!(await puedeVerEstudiante(req.user, estudianteId))) {
        throw new ApiError(403, 'No tiene acceso a la información de este estudiante');
      }
      const escuelaId = req.user.escuelaId;

      // Validar que el estudiante exista (siempre dentro del colegio)
      const estudiante = await Usuario.findOne({ _id: estudianteId, escuelaId });

      if (!estudiante) {
        throw new ApiError(404, 'Estudiante no encontrado');
      }

      // Verificar que sea un estudiante
      if (estudiante.tipo !== 'ESTUDIANTE') {
        throw new ApiError(400, 'El ID proporcionado no corresponde a un estudiante');
      }

      // Encontrar el curso del estudiante
      const curso = await Curso.findOne({
        escuelaId,
        estudiantes: { $in: [estudianteId] },
      });

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado para el estudiante');
      }

      // Obtener todas las asignaturas del curso
      const asignaturas = await Asignatura.find({
        cursoId: curso._id,
        escuelaId,
        estado: 'ACTIVO',
      }).populate('docenteId', 'nombre apellidos');

      // Calificaciones y logros de TODAS las asignaturas en 2 consultas $in (antes: 2 por asignatura)
      const idsAsignaturas = asignaturas.map((a) => a._id);
      const [calificacionesPeriodo, logrosPeriodo] = await Promise.all([
        Calificacion.find({
          estudianteId,
          asignaturaId: { $in: idsAsignaturas },
          escuelaId,
          periodo: Number(periodo),
          año_academico: String(año_academico),
        }),
        Logro.find({
          asignaturaId: { $in: idsAsignaturas },
          escuelaId,
          periodo: Number(periodo),
          año_academico: String(año_academico),
          estado: 'ACTIVO',
        }).lean(),
      ]);
      const calificacionPorAsignatura = new Map<string, (typeof calificacionesPeriodo)[number]>(
        calificacionesPeriodo.map((c) => [String(c.asignaturaId), c]),
      );

      // Para cada asignatura, obtener calificaciones
      const asignaturasData = [];

      for (const asignatura of asignaturas) {
        // Calificación del estudiante en esta asignatura
        const calificacion = calificacionPorAsignatura.get(String(asignatura._id)) || null;

        // Logros de la asignatura en este periodo (mismo orden que devolvía la consulta)
        const logros = logrosPeriodo.filter((l: any) => String(l.asignaturaId) === String(asignatura._id));

        const logrosData = [];
        let calificadosCount = 0;
        let totalPorcentajeCalificado = 0;

        // Mapear los logros con sus calificaciones
        for (const logro of logros) {
          let calificacionData = null;

          if (
            calificacion &&
            calificacion.calificaciones_logros &&
            calificacion.calificaciones_logros.length > 0
          ) {
            const calLogroItem = calificacion.calificaciones_logros.find(
              (cl) => cl.logroId && cl.logroId.toString() === logro._id.toString(),
            );

            if (calLogroItem) {
              calificacionData = {
                valor: calLogroItem.calificacion,
                observacion: calLogroItem.observacion || '',
                fecha: calLogroItem.fecha_calificacion,
              };
              calificadosCount++;
              totalPorcentajeCalificado += logro.porcentaje || 0;
            }
          }

          logrosData.push({
            logro: {
              _id: logro._id,
              nombre: logro.nombre || '',
              descripcion: logro.descripcion || '',
              tipo: logro.tipo || '',
              porcentaje: logro.porcentaje || 0,
            },
            calificacion: calificacionData,
          });
        }

        // Calcular promedio
        const promedio = calificacion ? calificacion.promedio_periodo : 0;

        // Manejar de forma segura la información del docente
        const docenteInfo = asignatura.docenteId as unknown as IDocenteInfo;
        const nombreDocente = docenteInfo
          ? `${docenteInfo.nombre || ''} ${docenteInfo.apellidos || ''}`.trim()
          : 'No asignado';

        asignaturasData.push({
          asignatura: {
            _id: asignatura._id,
            nombre: asignatura.nombre,
            docente: nombreDocente,
          },
          logros: logrosData,
          promedio: promedio,
          observaciones: calificacion ? calificacion.observaciones : '',
          progreso: {
            logros_calificados: calificadosCount,
            total_logros: logros.length,
            porcentaje_completado:
              logros.length > 0 ? Math.round((calificadosCount / logros.length) * 100) : 0,
          },
        });
      }

      // Calcular promedio general
      const promedioGeneral =
        asignaturasData.length > 0
          ? asignaturasData.reduce((sum, asignatura) => sum + asignatura.promedio, 0) /
            asignaturasData.length
          : 0;

      // Calcular estadísticas generales
      const estadisticas = {
        asignaturas_total: asignaturasData.length,
        asignaturas_aprobadas: asignaturasData.filter((a) => a.promedio >= 3).length,
        asignaturas_reprobadas: asignaturasData.filter((a) => a.promedio < 3 && a.promedio > 0)
          .length,
        asignaturas_sin_calificar: asignaturasData.filter((a) => a.promedio === 0).length,
        promedio_general: Number(promedioGeneral.toFixed(2)),
      };

      // Construir respuesta
      const boletin = {
        estudiante: {
          _id: estudiante._id,
          nombre: `${estudiante.nombre} ${estudiante.apellidos}`,
          curso: curso.nombre,
        },
        periodo: Number(periodo),
        año_academico,
        fecha_generacion: new Date(),
        asignaturas: asignaturasData,
        estadisticas,
      };

      res.json({
        success: true,
        data: boletin,
      });
    } catch (error) {
      next(error);
    }
  }

  async generarBoletinFinal(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId, año_academico } = req.query;

      if (!estudianteId || !año_academico) {
        throw new ApiError(400, 'Faltan parámetros requeridos');
      }

      // Regla de rol: ESTUDIANTE él mismo, ACUDIENTE sus hijos, DOCENTE sus cursos, administrativos su colegio
      if (!(await puedeVerEstudiante(req.user, estudianteId))) {
        throw new ApiError(403, 'No tiene acceso a la información de este estudiante');
      }
      const escuelaId = req.user.escuelaId;

      // Validar que el estudiante exista (siempre dentro del colegio)
      const estudiante = await Usuario.findOne({ _id: estudianteId, escuelaId });

      if (!estudiante) {
        throw new ApiError(404, 'Estudiante no encontrado');
      }

      // Verificar que sea un estudiante
      if (estudiante.tipo !== 'ESTUDIANTE') {
        throw new ApiError(400, 'El ID proporcionado no corresponde a un estudiante');
      }

      // Encontrar el curso del estudiante
      const curso = await Curso.findOne({
        escuelaId,
        estudiantes: { $in: [estudianteId] },
      });

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado para el estudiante');
      }

      // Obtener todas las asignaturas del curso
      const asignaturas = await Asignatura.find({
        cursoId: curso._id,
        escuelaId,
        estado: 'ACTIVO',
      }).populate('docenteId', 'nombre apellidos');

      // Configuración de periodos (obtener de la escuela si es necesario)
      const periodos = [1, 2, 3, 4];

      // Calificaciones de todas las asignaturas y periodos + logros calificados: 2 consultas $in
      // (antes: una por asignatura×periodo y otra por cada logro calificado)
      const calificacionesAño = await Calificacion.find({
        estudianteId,
        asignaturaId: { $in: asignaturas.map((a) => a._id) },
        escuelaId,
        periodo: { $in: periodos },
        año_academico: String(año_academico),
      });
      const calificacionPorClave = new Map(
        calificacionesAño.map((c: any) => [`${c.asignaturaId}|${c.periodo}`, c]),
      );
      const idsLogros = calificacionesAño.flatMap((c: any) =>
        (c.calificaciones_logros || []).map((cl: any) => cl.logroId),
      );
      const logrosCalificadosDocs = await Logro.find({ _id: { $in: idsLogros }, escuelaId });
      const logroPorId = new Map(logrosCalificadosDocs.map((l: any) => [String(l._id), l]));

      // Para cada asignatura, obtener calificaciones de todos los periodos
      const asignaturasData = [];

      for (const asignatura of asignaturas) {
        const periodosData = [];
        let sumaPeriodos = 0;
        let periodosCalificados = 0;

        for (const periodo of periodos) {
          const calificacion = calificacionPorClave.get(`${asignatura._id}|${periodo}`) || null;

          // Obtener los logros calificados para este periodo
          const logrosCalificados = [];
          if (
            calificacion &&
            calificacion.calificaciones_logros &&
            calificacion.calificaciones_logros.length > 0
          ) {
            for (const calLogro of calificacion.calificaciones_logros) {
              const logro = logroPorId.get(String(calLogro.logroId));
              if (logro) {
                logrosCalificados.push({
                  logro: {
                    _id: logro._id,
                    nombre: logro.nombre,
                    descripcion: logro.descripcion,
                    tipo: logro.tipo,
                    porcentaje: logro.porcentaje,
                  },
                  calificacion: calLogro.calificacion,
                  observacion: calLogro.observacion || '',
                });
              }
            }
          }

          if (calificacion && calificacion.promedio_periodo > 0) {
            sumaPeriodos += calificacion.promedio_periodo;
            periodosCalificados++;
          }

          periodosData.push({
            periodo,
            promedio: calificacion ? calificacion.promedio_periodo : 0,
            observaciones: calificacion ? calificacion.observaciones : '',
            logros_calificados: logrosCalificados,
            total_logros_calificados: logrosCalificados.length,
          });
        }

        // Calcular promedio final de la asignatura
        const promedioFinal =
          periodosCalificados > 0 ? Number((sumaPeriodos / periodosCalificados).toFixed(2)) : 0;

        // Manejar de forma segura la información del docente
        const docenteInfo = asignatura.docenteId as unknown as IDocenteInfo;
        const nombreDocente = docenteInfo
          ? `${docenteInfo.nombre || ''} ${docenteInfo.apellidos || ''}`.trim()
          : 'No asignado';

        asignaturasData.push({
          asignatura: {
            _id: asignatura._id,
            nombre: asignatura.nombre,
            docente: nombreDocente,
          },
          periodos: periodosData,
          promedio_final: promedioFinal,
          estado: promedioFinal >= 3 ? 'APROBADA' : 'REPROBADA',
        });
      }

      // Calcular promedio general
      const promedioGeneral =
        asignaturasData.length > 0
          ? asignaturasData.reduce((sum, asignatura) => sum + asignatura.promedio_final, 0) /
            asignaturasData.length
          : 0;

      // Calcular estadísticas generales
      const estadisticas = {
        asignaturas_total: asignaturasData.length,
        asignaturas_aprobadas: asignaturasData.filter((a) => a.promedio_final >= 3).length,
        asignaturas_reprobadas: asignaturasData.filter(
          (a) => a.promedio_final < 3 && a.promedio_final > 0,
        ).length,
        asignaturas_sin_calificar: asignaturasData.filter((a) => a.promedio_final === 0).length,
        promedio_general: Number(promedioGeneral.toFixed(2)),
        resultado_final: promedioGeneral >= 3 ? 'APROBADO' : 'REPROBADO',
      };

      // Construir respuesta
      const boletinFinal = {
        estudiante: {
          _id: estudiante._id,
          nombre: `${estudiante.nombre} ${estudiante.apellidos}`,
          curso: curso.nombre,
        },
        año_academico,
        fecha_generacion: new Date(),
        asignaturas: asignaturasData,
        estadisticas,
      };

      res.json({
        success: true,
        data: boletinFinal,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new BoletinController();
