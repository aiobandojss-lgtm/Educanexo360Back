import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError';
import {
  informeEstudiantesEnRiesgo,
  informeTendencia,
  informeRankingCursos,
  informePatronDias,
  informeHistorialEstudiante,
} from '../services/asistenciaInformes.service';

interface RequestWithUser extends Request {
  user: {
    _id: string;
    id: string;
    tipo: string;
    escuelaId: string;
    nombre: string;
    apellidos: string;
    email: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
  };
}

// Valida query params de fecha y retorna objetos Date o undefined
const parsearFechas = (desde?: string, hasta?: string): { desde?: Date; hasta?: Date } => {
  const result: { desde?: Date; hasta?: Date } = {};
  if (desde) {
    const d = new Date(desde);
    if (isNaN(d.getTime())) throw new ApiError(400, 'Formato de fecha inválido para "desde" (use YYYY-MM-DD)');
    result.desde = d;
  }
  if (hasta) {
    const h = new Date(hasta);
    if (isNaN(h.getTime())) throw new ApiError(400, 'Formato de fecha inválido para "hasta" (use YYYY-MM-DD)');
    // Incluir todo el último día
    h.setHours(23, 59, 59, 999);
    result.hasta = h;
  }
  return result;
};

// ── INFORME 1 — Estudiantes en riesgo ────────────────────────────────────────
/**
 * GET /api/asistencia/informes/riesgo
 * Query: umbral? (default 80), cursoId?, desde?, hasta?
 * Roles: ADMIN, RECTOR, COORDINADOR, DOCENTE
 */
export const obtenerInformeRiesgo = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ApiError(400, errors.array()[0].msg as string));

    const { escuelaId } = req.user;
    const umbral  = req.query.umbral  ? Number(req.query.umbral)  : 80;
    const cursoId = req.query.cursoId as string | undefined;
    const { desde, hasta } = parsearFechas(
      req.query.desde as string | undefined,
      req.query.hasta as string | undefined,
    );

    if (umbral < 0 || umbral > 100) return next(new ApiError(400, 'El umbral debe estar entre 0 y 100'));

    const datos = await informeEstudiantesEnRiesgo(escuelaId, umbral, cursoId, desde, hasta);

    res.json({
      ok: true,
      umbral,
      total: datos.length,
      criticos: datos.filter(e => e.nivelRiesgo === 'CRITICO').length,
      alertas:  datos.filter(e => e.nivelRiesgo === 'ALERTA').length,
      estudiantes: datos,
    });
  } catch (err) {
    next(err);
  }
};

// ── INFORME 2 — Tendencia de asistencia ──────────────────────────────────────
/**
 * GET /api/asistencia/informes/tendencia
 * Query: desde (requerido), hasta (requerido), agrupacion? (semana|mes), cursoId?
 */
export const obtenerInformeTendencia = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ApiError(400, errors.array()[0].msg as string));

    const { escuelaId } = req.user;
    const { desde, hasta } = parsearFechas(
      req.query.desde as string | undefined,
      req.query.hasta as string | undefined,
    );

    if (!desde || !hasta) return next(new ApiError(400, 'Los parámetros "desde" y "hasta" son requeridos'));

    const agrupacion = (req.query.agrupacion as 'semana' | 'mes') ?? 'semana';
    if (!['semana', 'mes'].includes(agrupacion)) {
      return next(new ApiError(400, 'agrupacion debe ser "semana" o "mes"'));
    }

    const cursoId = req.query.cursoId as string | undefined;
    const datos   = await informeTendencia(escuelaId, desde, hasta, agrupacion, cursoId);

    res.json({ ok: true, agrupacion, puntos: datos.length, tendencia: datos });
  } catch (err) {
    next(err);
  }
};

// ── INFORME 3 — Ranking de cursos ────────────────────────────────────────────
/**
 * GET /api/asistencia/informes/ranking-cursos
 * Query: desde (requerido), hasta (requerido)
 */
export const obtenerInformeRankingCursos = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ApiError(400, errors.array()[0].msg as string));

    const { escuelaId } = req.user;
    const { desde, hasta } = parsearFechas(
      req.query.desde as string | undefined,
      req.query.hasta as string | undefined,
    );

    if (!desde || !hasta) return next(new ApiError(400, 'Los parámetros "desde" y "hasta" son requeridos'));

    const datos = await informeRankingCursos(escuelaId, desde, hasta);

    res.json({ ok: true, total: datos.length, ranking: datos });
  } catch (err) {
    next(err);
  }
};

// ── INFORME 4 — Patrón por día de la semana ──────────────────────────────────
/**
 * GET /api/asistencia/informes/patron-dias
 * Query: desde (requerido), hasta (requerido), cursoId?
 */
export const obtenerInformePatronDias = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ApiError(400, errors.array()[0].msg as string));

    const { escuelaId } = req.user;
    const { desde, hasta } = parsearFechas(
      req.query.desde as string | undefined,
      req.query.hasta as string | undefined,
    );

    if (!desde || !hasta) return next(new ApiError(400, 'Los parámetros "desde" y "hasta" son requeridos'));

    const cursoId = req.query.cursoId as string | undefined;
    const datos   = await informePatronDias(escuelaId, desde, hasta, cursoId);

    res.json({ ok: true, dias: datos });
  } catch (err) {
    next(err);
  }
};

// ── INFORME 5 — Historial de estudiante ──────────────────────────────────────
/**
 * GET /api/asistencia/informes/historial/:estudianteId
 * Query: desde (requerido), hasta (requerido)
 * Restricción adicional: DOCENTE solo puede ver estudiantes de sus cursos (se valida en el servicio vía escuelaId)
 */
export const obtenerHistorialEstudiante = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return next(new ApiError(400, errors.array()[0].msg as string));

    const { escuelaId } = req.user;
    const { estudianteId } = req.params;
    const { desde, hasta } = parsearFechas(
      req.query.desde as string | undefined,
      req.query.hasta as string | undefined,
    );

    if (!desde || !hasta) return next(new ApiError(400, 'Los parámetros "desde" y "hasta" son requeridos'));

    const datos = await informeHistorialEstudiante(estudianteId, escuelaId, desde, hasta);

    res.json({ ok: true, ...datos });
  } catch (err) {
    next(err);
  }
};
