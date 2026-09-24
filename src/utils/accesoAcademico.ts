import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import Asignatura from '../models/asignatura.model';

/**
 * Helpers de acceso por rol (Fase 1 de endurecimiento).
 *
 * Regla general:
 * - ESTUDIANTE: solo lo suyo.
 * - ACUDIENTE: solo lo de sus hijos (info_academica.estudiantes_asociados).
 * - DOCENTE: sus cursos (director de grupo) o los cursos donde dicta una asignatura ACTIVA.
 * - Roles administrativos: todo su colegio.
 * Todas las consultas llevan escuelaId en el filtro.
 */

export const ROLES_ADMINISTRATIVOS = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'];

export interface UsuarioAcceso {
  _id: string;
  escuelaId: string;
  tipo: string;
}

export const esRolAdministrativo = (tipo?: string): boolean =>
  !!tipo && ROLES_ADMINISTRATIVOS.includes(tipo);

const esIdValido = (id: unknown): id is string =>
  typeof id === 'string' && mongoose.isValidObjectId(id);

/**
 * IDs (string) de los hijos del acudiente que siguen siendo ESTUDIANTES de su colegio.
 */
export const obtenerHijosIds = async (user: UsuarioAcceso): Promise<string[]> => {
  if (user.tipo !== 'ACUDIENTE' || !user.escuelaId) return [];

  const acudiente = await Usuario.findOne({ _id: user._id, escuelaId: user.escuelaId })
    .select('info_academica.estudiantes_asociados')
    .lean();
  const asociados = acudiente?.info_academica?.estudiantes_asociados || [];
  if (asociados.length === 0) return [];

  const hijos = await Usuario.find({
    _id: { $in: asociados },
    escuelaId: user.escuelaId,
    tipo: 'ESTUDIANTE',
  })
    .select('_id')
    .lean();
  return hijos.map((h) => String(h._id));
};

/**
 * IDs (string) de los cursos del docente: director de grupo o asignatura ACTIVA asignada.
 */
export const obtenerCursosDocente = async (
  docenteId: string,
  escuelaId: string,
  soloAsignaturasActivas = true,
): Promise<string[]> => {
  if (!escuelaId) return [];

  const filtroAsignaturas: Record<string, unknown> = { escuelaId, docenteId };
  if (soloAsignaturasActivas) filtroAsignaturas.estado = 'ACTIVO';

  const [dirigidos, asignaturas] = await Promise.all([
    Curso.find({ escuelaId, director_grupo: docenteId }).select('_id').lean(),
    Asignatura.find(filtroAsignaturas).select('cursoId').lean(),
  ]);

  const ids = new Set<string>();
  dirigidos.forEach((c) => ids.add(String(c._id)));
  asignaturas.forEach((a) => a.cursoId && ids.add(String(a.cursoId)));
  return [...ids];
};

/**
 * IDs (string) de las asignaturas ACTIVAS del docente en su colegio.
 */
export const obtenerAsignaturasDocente = async (
  docenteId: string,
  escuelaId: string,
): Promise<string[]> => {
  if (!escuelaId) return [];
  const asignaturas = await Asignatura.find({ escuelaId, docenteId, estado: 'ACTIVO' })
    .select('_id')
    .lean();
  return asignaturas.map((a) => String(a._id));
};

/**
 * ¿El docente tiene acceso a este curso (director o dicta una asignatura en él)?
 */
export const docenteTieneCurso = async (
  user: UsuarioAcceso,
  cursoId: unknown,
): Promise<boolean> => {
  if (!esIdValido(cursoId)) return false;
  const cursos = await obtenerCursosDocente(user._id, user.escuelaId);
  return cursos.includes(cursoId);
};

/**
 * ¿El usuario puede ver la información académica de este estudiante?
 */
export const puedeVerEstudiante = async (
  user: UsuarioAcceso,
  estudianteId: unknown,
): Promise<boolean> => {
  if (!esIdValido(estudianteId) || !user.escuelaId) return false;

  if (user.tipo === 'ESTUDIANTE') {
    return String(user._id) === estudianteId;
  }

  if (user.tipo === 'ACUDIENTE') {
    const hijos = await obtenerHijosIds(user);
    return hijos.includes(estudianteId);
  }

  // Para los demás roles el estudiante debe existir en el mismo colegio
  const existe = await Usuario.exists({
    _id: estudianteId,
    escuelaId: user.escuelaId,
    tipo: 'ESTUDIANTE',
  });
  if (!existe) return false;

  if (esRolAdministrativo(user.tipo)) return true;

  if (user.tipo === 'DOCENTE') {
    const cursos = await obtenerCursosDocente(user._id, user.escuelaId);
    if (cursos.length === 0) return false;
    const enCurso = await Curso.exists({
      _id: { $in: cursos },
      escuelaId: user.escuelaId,
      estudiantes: estudianteId,
    });
    return !!enCurso;
  }

  return false;
};

/**
 * Normaliza un valor de body/FormData que puede llegar como string, array o vacío.
 * (Flutter envía FormData sin [] → un solo valor llega como string).
 */
export const aArregloDeIds = (valor: unknown): string[] => {
  if (valor === undefined || valor === null || valor === '') return [];
  const lista = Array.isArray(valor) ? valor : [valor];
  return lista
    .map((v) => (v && typeof v === 'object' && '_id' in (v as any) ? (v as any)._id : v))
    .map((v) => String(v))
    .filter((v) => mongoose.isValidObjectId(v));
};

/**
 * Convierte un valor de query a string (o undefined). Evita operadores como estado[$ne]=x.
 */
export const queryString = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
