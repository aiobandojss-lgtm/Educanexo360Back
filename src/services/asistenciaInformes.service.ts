/**
 * Servicio de informes de asistencia — EducaNexo360
 *
 * Provee 5 informes orientados a toma de decisiones institucionales:
 * 1. Estudiantes en riesgo por inasistencia
 * 2. Tendencia de asistencia por semana/mes
 * 3. Ranking de cursos por asistencia
 * 4. Patrón de ausencias por día de la semana
 * 5. Historial detallado de un estudiante
 */

import mongoose from 'mongoose';
import Asistencia from '../models/asistencia.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import { EstadoAsistencia } from '../interfaces/IAsistencia';

// ── Utilidad centralizada de porcentaje ────────────────────────────────────
// Estándar: presentes + tardanzas cuentan como asistencia efectiva
export const calcularPorcentaje = (presentes: number, tardanzas: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round(((presentes + tardanzas) / total) * 100);
};

// ── Utilidad: contadores desde array de estados ─────────────────────────────
const contarEstados = (estados: string[]) => {
  const contadores = { presentes: 0, ausentes: 0, tardanzas: 0, justificados: 0, permisos: 0 };
  for (const estado of estados) {
    switch (estado) {
      case EstadoAsistencia.PRESENTE:    contadores.presentes++;    break;
      case EstadoAsistencia.AUSENTE:     contadores.ausentes++;     break;
      case EstadoAsistencia.TARDANZA:    contadores.tardanzas++;    break;
      case EstadoAsistencia.JUSTIFICADO: contadores.justificados++; break;
      case EstadoAsistencia.PERMISO:     contadores.permisos++;     break;
    }
  }
  return contadores;
};

// ══════════════════════════════════════════════════════════════════════════════
// INFORME 1 — Estudiantes en riesgo por inasistencia
// ══════════════════════════════════════════════════════════════════════════════

export interface EstudianteEnRiesgo {
  estudianteId: string;
  nombre: string;
  apellidos: string;
  curso: { _id: string; nombre: string; grado: string; grupo: string };
  clasesTotales: number;
  ausencias: number;
  tardanzas: number;
  porcentajeAsistencia: number;
  nivelRiesgo: 'CRITICO' | 'ALERTA' | 'OK';
}

export const informeEstudiantesEnRiesgo = async (
  escuelaId: string,
  umbral: number = 80,
  cursoId?: string,
  desde?: Date,
  hasta?: Date,
): Promise<EstudianteEnRiesgo[]> => {
  const queryBase: any = { escuelaId: new mongoose.Types.ObjectId(escuelaId) };
  if (cursoId) queryBase.cursoId = new mongoose.Types.ObjectId(cursoId);
  if (desde || hasta) {
    queryBase.fecha = {};
    if (desde) queryBase.fecha.$gte = desde;
    if (hasta) queryBase.fecha.$lte = hasta;
  }

  // Agregar directamente en MongoDB para mayor eficiencia
  const pipeline: any[] = [
    { $match: queryBase },
    { $unwind: '$estudiantes' },
    {
      $group: {
        _id: { estudianteId: '$estudiantes.estudianteId', cursoId: '$cursoId' },
        clasesTotales: { $sum: 1 },
        presentes:    { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] },    1, 0] } },
        ausentes:     { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] },     1, 0] } },
        tardanzas:    { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] },    1, 0] } },
        justificados: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
        permisos:     { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] },     1, 0] } },
      },
    },
    {
      $addFields: {
        porcentajeAsistencia: {
          $cond: [
            { $eq: ['$clasesTotales', 0] },
            0,
            { $round: [{ $multiply: [{ $divide: [{ $add: ['$presentes', '$tardanzas'] }, '$clasesTotales'] }, 100] }, 0] },
          ],
        },
      },
    },
    { $match: { porcentajeAsistencia: { $lt: umbral } } },
    { $sort: { porcentajeAsistencia: 1 } },
  ];

  const resultados = await Asistencia.aggregate(pipeline);

  if (resultados.length === 0) return [];

  // Enriquecer con datos de estudiante y curso
  const estudianteIds = [...new Set(resultados.map((r: any) => r._id.estudianteId.toString()))];
  const cursoIds      = [...new Set(resultados.map((r: any) => r._id.cursoId.toString()))];

  const [estudiantes, cursos] = await Promise.all([
    Usuario.find({ _id: { $in: estudianteIds } }).select('nombre apellidos').lean(),
    Curso.find({ _id: { $in: cursoIds } }).select('nombre grado grupo').lean(),
  ]);

  const estudianteMap = new Map(estudiantes.map((e: any) => [e._id.toString(), e]));
  const cursoMap      = new Map(cursos.map((c: any) => [c._id.toString(), c]));

  return resultados.map((r: any) => {
    const est   = estudianteMap.get(r._id.estudianteId.toString()) as any;
    const curso = cursoMap.get(r._id.cursoId.toString()) as any;
    const pct   = r.porcentajeAsistencia;

    return {
      estudianteId: r._id.estudianteId.toString(),
      nombre:       est?.nombre    ?? 'Desconocido',
      apellidos:    est?.apellidos ?? '',
      curso: {
        _id:    r._id.cursoId.toString(),
        nombre: curso?.nombre ?? '',
        grado:  curso?.grado  ?? '',
        grupo:  curso?.grupo  ?? '',
      },
      clasesTotales:        r.clasesTotales,
      ausencias:            r.ausentes,
      tardanzas:            r.tardanzas,
      porcentajeAsistencia: pct,
      nivelRiesgo: pct < 70 ? 'CRITICO' : pct < umbral ? 'ALERTA' : 'OK',
    } as EstudianteEnRiesgo;
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// INFORME 2 — Tendencia de asistencia por semana o mes
// ══════════════════════════════════════════════════════════════════════════════

export interface PuntoTendencia {
  periodo: string;       // "2026-W14" o "2026-04"
  fechaInicio: Date;
  totalClases: number;
  totalEstudiantes: number;
  presentes: number;
  ausentes: number;
  tardanzas: number;
  porcentajeAsistencia: number;
}

export const informeTendencia = async (
  escuelaId: string,
  desde: Date,
  hasta: Date,
  agrupacion: 'semana' | 'mes' = 'semana',
  cursoId?: string,
): Promise<PuntoTendencia[]> => {
  const queryBase: any = {
    escuelaId: new mongoose.Types.ObjectId(escuelaId),
    fecha: { $gte: desde, $lte: hasta },
  };
  if (cursoId) queryBase.cursoId = new mongoose.Types.ObjectId(cursoId);

  const formatoFecha = agrupacion === 'mes'
    ? { year: { $year: '$fecha' }, month: { $month: '$fecha' } }
    : { year: { $year: '$fecha' }, week: { $isoWeek: '$fecha' } };

  const pipeline: any[] = [
    { $match: queryBase },
    { $unwind: '$estudiantes' },
    {
      $group: {
        _id: formatoFecha,
        totalClases:      { $addToSet: '$_id' },
        presentes:        { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] },    1, 0] } },
        ausentes:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] },     1, 0] } },
        tardanzas:        { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] },    1, 0] } },
        justificados:     { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
        permisos:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] },     1, 0] } },
        totalEstudiantes: { $sum: 1 },
        fechaMinima:      { $min: '$fecha' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } },
  ];

  const resultados = await Asistencia.aggregate(pipeline);

  return resultados.map((r: any) => {
    const total = r.totalEstudiantes;
    const pct   = calcularPorcentaje(r.presentes, r.tardanzas, total);
    const label = agrupacion === 'mes'
      ? `${r._id.year}-${String(r._id.month).padStart(2, '0')}`
      : `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`;

    return {
      periodo:              label,
      fechaInicio:          r.fechaMinima,
      totalClases:          r.totalClases.length,
      totalEstudiantes:     total,
      presentes:            r.presentes,
      ausentes:             r.ausentes,
      tardanzas:            r.tardanzas,
      porcentajeAsistencia: pct,
    };
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// INFORME 3 — Ranking de cursos por asistencia
// ══════════════════════════════════════════════════════════════════════════════

export interface CursoRanking {
  posicion: number;
  cursoId: string;
  nombre: string;
  grado: string;
  grupo: string;
  totalClases: number;
  totalEstudiantes: number;
  presentes: number;
  ausentes: number;
  tardanzas: number;
  porcentajeAsistencia: number;
}

export const informeRankingCursos = async (
  escuelaId: string,
  desde: Date,
  hasta: Date,
): Promise<CursoRanking[]> => {
  const pipeline: any[] = [
    {
      $match: {
        escuelaId: new mongoose.Types.ObjectId(escuelaId),
        fecha: { $gte: desde, $lte: hasta },
      },
    },
    { $unwind: '$estudiantes' },
    {
      $group: {
        _id:               '$cursoId',
        totalClases:       { $addToSet: '$_id' },
        presentes:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] },    1, 0] } },
        ausentes:          { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] },     1, 0] } },
        tardanzas:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] },    1, 0] } },
        totalRegistros:    { $sum: 1 },
        estudiantesUnicos: { $addToSet: '$estudiantes.estudianteId' },
      },
    },
    {
      $addFields: {
        totalEstudiantes: { $size: '$estudiantesUnicos' },
        porcentajeAsistencia: {
          $cond: [
            { $eq: ['$totalRegistros', 0] },
            0,
            { $round: [{ $multiply: [{ $divide: [{ $add: ['$presentes', '$tardanzas'] }, '$totalRegistros'] }, 100] }, 0] },
          ],
        },
      },
    },
    { $sort: { porcentajeAsistencia: -1 } },
  ];

  const resultados = await Asistencia.aggregate(pipeline);

  if (resultados.length === 0) return [];

  const cursoIds = resultados.map((r: any) => r._id);
  const cursos   = await Curso.find({ _id: { $in: cursoIds } }).select('nombre grado grupo').lean();
  const cursoMap = new Map(cursos.map((c: any) => [c._id.toString(), c]));

  return resultados.map((r: any, idx: number) => {
    const curso = cursoMap.get(r._id.toString()) as any;
    return {
      posicion:             idx + 1,
      cursoId:              r._id.toString(),
      nombre:               curso?.nombre ?? '',
      grado:                curso?.grado  ?? '',
      grupo:                curso?.grupo  ?? '',
      totalClases:          r.totalClases.length,
      totalEstudiantes:     r.totalEstudiantes,
      presentes:            r.presentes,
      ausentes:             r.ausentes,
      tardanzas:            r.tardanzas,
      porcentajeAsistencia: r.porcentajeAsistencia,
    };
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// INFORME 4 — Patrón de ausencias por día de la semana
// ══════════════════════════════════════════════════════════════════════════════

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export interface PatronDia {
  diaSemana: number;       // 1=Lunes ... 5=Viernes
  nombreDia: string;
  totalClases: number;
  totalEstudiantes: number;
  ausencias: number;
  tardanzas: number;
  porcentajeAusentismo: number;  // inverso: cuánto faltaron ese día
}

export const informePatronDias = async (
  escuelaId: string,
  desde: Date,
  hasta: Date,
  cursoId?: string,
): Promise<PatronDia[]> => {
  const queryBase: any = {
    escuelaId: new mongoose.Types.ObjectId(escuelaId),
    fecha: { $gte: desde, $lte: hasta },
  };
  if (cursoId) queryBase.cursoId = new mongoose.Types.ObjectId(cursoId);

  const pipeline: any[] = [
    { $match: queryBase },
    { $unwind: '$estudiantes' },
    {
      $group: {
        _id:              { $isoDayOfWeek: '$fecha' }, // 1=Lunes ... 7=Domingo
        totalClases:      { $addToSet: '$_id' },
        ausentes:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] },     1, 0] } },
        tardanzas:        { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] },    1, 0] } },
        presentes:        { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] },    1, 0] } },
        justificados:     { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
        permisos:         { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] },     1, 0] } },
        totalEstudiantes: { $sum: 1 },
      },
    },
    { $match: { _id: { $gte: 1, $lte: 5 } } }, // Solo lunes a viernes
    { $sort: { _id: 1 } },
  ];

  const resultados = await Asistencia.aggregate(pipeline);

  const diasNombres = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  return resultados.map((r: any) => {
    const total = r.totalEstudiantes;
    const pctAusentismo = total > 0 ? Math.round(((r.ausentes + r.tardanzas) / total) * 100) : 0;

    return {
      diaSemana:            r._id,
      nombreDia:            diasNombres[r._id] ?? DIAS_SEMANA[r._id],
      totalClases:          r.totalClases.length,
      totalEstudiantes:     total,
      ausencias:            r.ausentes,
      tardanzas:            r.tardanzas,
      porcentajeAusentismo: pctAusentismo,
    };
  });
};

// ══════════════════════════════════════════════════════════════════════════════
// INFORME 5 — Historial detallado de un estudiante (para reunión con padres)
// ══════════════════════════════════════════════════════════════════════════════

export interface RegistroHistorial {
  fecha: Date;
  diaSemana: string;
  curso: { _id: string; nombre: string; grado: string; grupo: string };
  asignatura: { _id: string; nombre: string } | null;
  estado: string;
  justificacion: string;
  observaciones: string;
  registradoPor: { _id: string; nombre: string; apellidos: string } | null;
}

export interface HistorialEstudiante {
  estudiante: { _id: string; nombre: string; apellidos: string; email: string };
  resumen: {
    clasesTotales: number;
    presentes: number;
    ausentes: number;
    tardanzas: number;
    justificados: number;
    permisos: number;
    porcentajeAsistencia: number;
  };
  registros: RegistroHistorial[];
}

export const informeHistorialEstudiante = async (
  estudianteId: string,
  escuelaId: string,
  desde: Date,
  hasta: Date,
): Promise<HistorialEstudiante> => {
  const estudiante = await Usuario.findById(estudianteId).select('nombre apellidos email').lean() as any;
  if (!estudiante) throw new ApiError(404, 'Estudiante no encontrado');

  const registros = await Asistencia.find({
    'estudiantes.estudianteId': new mongoose.Types.ObjectId(estudianteId),
    escuelaId: new mongoose.Types.ObjectId(escuelaId),
    fecha: { $gte: desde, $lte: hasta },
  })
    .populate('cursoId',      'nombre grado grupo')
    .populate('asignaturaId', 'nombre')
    .sort({ fecha: 1 })
    .lean();

  const contadores = { presentes: 0, ausentes: 0, tardanzas: 0, justificados: 0, permisos: 0 };
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const historial: RegistroHistorial[] = [];

  for (const registro of registros) {
    const entrada = (registro.estudiantes as any[]).find(
      (e: any) => e.estudianteId.toString() === estudianteId,
    );
    if (!entrada) continue;

    // Contar estado
    switch (entrada.estado) {
      case EstadoAsistencia.PRESENTE:    contadores.presentes++;    break;
      case EstadoAsistencia.AUSENTE:     contadores.ausentes++;     break;
      case EstadoAsistencia.TARDANZA:    contadores.tardanzas++;    break;
      case EstadoAsistencia.JUSTIFICADO: contadores.justificados++; break;
      case EstadoAsistencia.PERMISO:     contadores.permisos++;     break;
    }

    const cursoData       = registro.cursoId as any;
    const asignaturaData  = registro.asignaturaId as any;

    // Si tiene registradoPor, obtener nombre
    let registradoPor = null;
    if (entrada.registradoPor) {
      const docente = await Usuario.findById(entrada.registradoPor).select('nombre apellidos').lean() as any;
      if (docente) {
        registradoPor = { _id: docente._id.toString(), nombre: docente.nombre, apellidos: docente.apellidos };
      }
    }

    historial.push({
      fecha:        registro.fecha,
      diaSemana:    dias[new Date(registro.fecha).getDay()],
      curso: {
        _id:    cursoData?._id?.toString() ?? '',
        nombre: cursoData?.nombre ?? '',
        grado:  cursoData?.grado  ?? '',
        grupo:  cursoData?.grupo  ?? '',
      },
      asignatura: asignaturaData ? { _id: asignaturaData._id.toString(), nombre: asignaturaData.nombre } : null,
      estado:       entrada.estado,
      justificacion: entrada.justificacion ?? '',
      observaciones: entrada.observaciones ?? '',
      registradoPor,
    });
  }

  const clasesTotales = historial.length;

  return {
    estudiante: {
      _id:      estudiante._id.toString(),
      nombre:   estudiante.nombre,
      apellidos: estudiante.apellidos,
      email:    estudiante.email,
    },
    resumen: {
      clasesTotales,
      ...contadores,
      porcentajeAsistencia: calcularPorcentaje(contadores.presentes, contadores.tardanzas, clasesTotales),
    },
    registros: historial,
  };
};
