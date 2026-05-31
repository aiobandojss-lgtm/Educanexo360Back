/**
 * Catálogo centralizado de permisos del sistema EducaNexo360.
 *
 * Convención: <módulo>.<acción>
 * Este archivo es la única fuente de verdad para los strings de permisos.
 * Úsalo siempre en lugar de strings literales para evitar errores de tipeo.
 */

export const PERMISSIONS = {
  // ── Calificaciones ─────────────────────────────────────────────────────────
  CALIFICACIONES_VER:      'calificaciones.ver',
  CALIFICACIONES_CREAR:    'calificaciones.crear',
  CALIFICACIONES_EDITAR:   'calificaciones.editar',
  CALIFICACIONES_ELIMINAR: 'calificaciones.eliminar',

  // ── Asistencia ─────────────────────────────────────────────────────────────
  ASISTENCIA_VER:          'asistencia.ver',
  ASISTENCIA_REGISTRAR:    'asistencia.registrar',

  // ── Anuncios ───────────────────────────────────────────────────────────────
  ANUNCIOS_VER:            'anuncios.ver',
  ANUNCIOS_CREAR:          'anuncios.crear',
  ANUNCIOS_EDITAR:         'anuncios.editar',
  ANUNCIOS_ELIMINAR:       'anuncios.eliminar',

  // ── Tareas ─────────────────────────────────────────────────────────────────
  TAREAS_VER:              'tareas.ver',
  TAREAS_CREAR:            'tareas.crear',
  TAREAS_EDITAR:           'tareas.editar',
  TAREAS_ELIMINAR:         'tareas.eliminar',

  // ── Calendario ─────────────────────────────────────────────────────────────
  CALENDARIO_VER:          'calendario.ver',
  CALENDARIO_CREAR:        'calendario.crear',
  CALENDARIO_EDITAR:       'calendario.editar',

  // ── Mensajes ───────────────────────────────────────────────────────────────
  MENSAJES_VER:            'mensajes.ver',
  MENSAJES_ENVIAR:         'mensajes.enviar',

  // ── Logros ─────────────────────────────────────────────────────────────────
  LOGROS_VER:              'logros.ver',
  LOGROS_CREAR:            'logros.crear',
  LOGROS_EDITAR:           'logros.editar',
  LOGROS_ELIMINAR:         'logros.eliminar',

  // ── Usuarios ───────────────────────────────────────────────────────────────
  USUARIOS_VER:            'usuarios.ver',
  USUARIOS_CREAR:          'usuarios.crear',
  USUARIOS_EDITAR:         'usuarios.editar',
  USUARIOS_ELIMINAR:       'usuarios.eliminar',

  // ── Cursos ─────────────────────────────────────────────────────────────────
  CURSOS_VER:              'cursos.ver',
  CURSOS_CREAR:            'cursos.crear',
  CURSOS_EDITAR:           'cursos.editar',

  // ── Asignaturas ────────────────────────────────────────────────────────────
  ASIGNATURAS_VER:         'asignaturas.ver',
  ASIGNATURAS_CREAR:       'asignaturas.crear',
  ASIGNATURAS_EDITAR:      'asignaturas.editar',

  // ── Reportes / Boletín ─────────────────────────────────────────────────────
  REPORTES_VER:            'reportes.ver',

  // ── Dashboard ──────────────────────────────────────────────────────────────
  DASHBOARD_VER:           'dashboard.ver',

  // ── Gestión de perfiles de rol (solo ADMIN) ────────────────────────────────
  PERFILES_ROL_GESTIONAR:  'perfiles_rol.gestionar',
} as const;

// Tipo que representa cualquier valor del catálogo
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Array con todos los permisos válidos (útil para validación en express-validator)
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Permisos por defecto asignados a cada rol base cuando no tiene perfil personalizado.
 * Sirve como referencia para el ADMIN al crear perfiles nuevos.
 */
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, Permission[]> = {
  DOCENTE: [
    PERMISSIONS.CALIFICACIONES_VER,
    PERMISSIONS.CALIFICACIONES_CREAR,
    PERMISSIONS.CALIFICACIONES_EDITAR,
    PERMISSIONS.ASISTENCIA_VER,
    PERMISSIONS.ASISTENCIA_REGISTRAR,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.TAREAS_VER,
    PERMISSIONS.TAREAS_CREAR,
    PERMISSIONS.TAREAS_EDITAR,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.LOGROS_VER,
    PERMISSIONS.LOGROS_CREAR,
    PERMISSIONS.CURSOS_VER,
    PERMISSIONS.ASIGNATURAS_VER,
    PERMISSIONS.REPORTES_VER,
    PERMISSIONS.DASHBOARD_VER,
  ],
  COORDINADOR: [
    PERMISSIONS.CALIFICACIONES_VER,
    PERMISSIONS.CALIFICACIONES_CREAR,
    PERMISSIONS.CALIFICACIONES_EDITAR,
    PERMISSIONS.ASISTENCIA_VER,
    PERMISSIONS.ASISTENCIA_REGISTRAR,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.ANUNCIOS_CREAR,
    PERMISSIONS.ANUNCIOS_EDITAR,
    PERMISSIONS.TAREAS_VER,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.CALENDARIO_CREAR,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.LOGROS_VER,
    PERMISSIONS.LOGROS_CREAR,
    PERMISSIONS.USUARIOS_VER,
    PERMISSIONS.CURSOS_VER,
    PERMISSIONS.ASIGNATURAS_VER,
    PERMISSIONS.REPORTES_VER,
    PERMISSIONS.DASHBOARD_VER,
  ],
  RECTOR: [
    PERMISSIONS.CALIFICACIONES_VER,
    PERMISSIONS.ASISTENCIA_VER,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.ANUNCIOS_CREAR,
    PERMISSIONS.ANUNCIOS_EDITAR,
    PERMISSIONS.ANUNCIOS_ELIMINAR,
    PERMISSIONS.TAREAS_VER,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.CALENDARIO_CREAR,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.LOGROS_VER,
    PERMISSIONS.LOGROS_CREAR,
    PERMISSIONS.USUARIOS_VER,
    PERMISSIONS.USUARIOS_EDITAR,
    PERMISSIONS.CURSOS_VER,
    PERMISSIONS.ASIGNATURAS_VER,
    PERMISSIONS.REPORTES_VER,
    PERMISSIONS.DASHBOARD_VER,
  ],
  ADMINISTRATIVO: [
    PERMISSIONS.USUARIOS_VER,
    PERMISSIONS.USUARIOS_CREAR,
    PERMISSIONS.USUARIOS_EDITAR,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.DASHBOARD_VER,
  ],
  ACUDIENTE: [
    PERMISSIONS.CALIFICACIONES_VER,
    PERMISSIONS.ASISTENCIA_VER,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.TAREAS_VER,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.LOGROS_VER,
  ],
  ESTUDIANTE: [
    PERMISSIONS.CALIFICACIONES_VER,
    PERMISSIONS.ASISTENCIA_VER,
    PERMISSIONS.ANUNCIOS_VER,
    PERMISSIONS.TAREAS_VER,
    PERMISSIONS.CALENDARIO_VER,
    PERMISSIONS.MENSAJES_VER,
    PERMISSIONS.MENSAJES_ENVIAR,
    PERMISSIONS.LOGROS_VER,
  ],
};
