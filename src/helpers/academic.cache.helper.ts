// src/helpers/academic.cache.helper.ts - INVALIDACIÓN AUTOMÁTICA DE CACHE

import academicService from '../services/academic.service';
import { invalidateRelatedCache } from '../cache/simpleCache';

/**
 * Helper para invalidar cache automáticamente cuando se modifican datos académicos
 */
class AcademicCacheHelper {
  /**
   * Invalidar cache cuando se crea/actualiza una calificación
   */
  static invalidateOnCalificacionChange(
    estudianteId: string,
    asignaturaId: string,
    cursoId: string,
    escuelaId: string,
  ): void {
    console.log(`🔄 Invalidando cache por cambio en calificación - Estudiante: ${estudianteId}`);

    // Invalidar cache del estudiante específico
    academicService.invalidarCacheEstudiante(estudianteId, asignaturaId, escuelaId);

    // Invalidar cache del curso (estadísticas grupales)
    academicService.invalidarCacheCurso(cursoId, escuelaId);

    // Invalidar cache relacionado del dashboard
    invalidateRelatedCache('dashboard', estudianteId, escuelaId, [
      'dashboard_rol',
      'dashboard_completo',
      'metricas_avanzadas',
    ]);
  }

  /**
   * Invalidar cache cuando se crea/actualiza un logro
   */
  static invalidateOnLogroChange(
    asignaturaId: string,
    cursoId: string,
    escuelaId: string,
    periodo?: number,
  ): void {
    console.log(`🔄 Invalidando cache por cambio en logro - Asignatura: ${asignaturaId}`);

    // Como un logro afecta a todos los estudiantes del curso, limpiar cache masivamente
    academicService.invalidarCacheCurso(cursoId, escuelaId);

    // Limpiar cache de todos los estudiantes que tengan esa asignatura
    // (Esto es más agresivo pero necesario porque un logro afecta cálculos de todos)
    academicService.limpiarCacheAcademico();
  }

  /**
   * Invalidar cache cuando se modifica un curso (estudiantes agregados/removidos)
   */
  static invalidateOnCursoChange(cursoId: string, escuelaId: string): void {
    console.log(`🔄 Invalidando cache por cambio en curso - Curso: ${cursoId}`);

    academicService.invalidarCacheCurso(cursoId, escuelaId);

    // También invalidar dashboard de usuarios de esa escuela
    invalidateRelatedCache('dashboard', 'all', escuelaId, ['dashboard_rol', 'dashboard_completo']);
  }

  /**
   * Invalidar cache al final del periodo académico
   */
  static invalidateOnPeriodoClose(escuelaId: string, periodo: number): void {
    console.log(`🔄 Invalidando cache por cierre de periodo ${periodo} - Escuela: ${escuelaId}`);

    // Limpiar todo el cache académico (nuevo periodo = nuevos cálculos)
    academicService.limpiarCacheAcademico();

    // Limpiar dashboard de toda la escuela
    invalidateRelatedCache('dashboard', 'all', escuelaId, [
      'dashboard_rol',
      'dashboard_completo',
      'metricas_avanzadas',
    ]);
  }

  /**
   * Middleware para usar en controladores académicos
   */
  static invalidationMiddleware() {
    return {
      /**
       * Para usar después de crear/actualizar calificaciones
       */
      onCalificacionChange: (req: any, res: any, next: any) => {
        const { estudianteId, asignaturaId, cursoId } = req.body;
        const escuelaId = req.user?.escuelaId;

        if (estudianteId && asignaturaId && cursoId && escuelaId) {
          AcademicCacheHelper.invalidateOnCalificacionChange(
            estudianteId,
            asignaturaId,
            cursoId,
            escuelaId,
          );
        }

        next();
      },

      /**
       * Para usar después de crear/actualizar logros
       */
      onLogroChange: (req: any, res: any, next: any) => {
        const { asignaturaId, cursoId, periodo } = req.body;
        const escuelaId = req.user?.escuelaId;

        if (asignaturaId && cursoId && escuelaId) {
          AcademicCacheHelper.invalidateOnLogroChange(asignaturaId, cursoId, escuelaId, periodo);
        }

        next();
      },

      /**
       * Para usar después de modificar cursos
       */
      onCursoChange: (req: any, res: any, next: any) => {
        const cursoId = req.params.id || req.body.cursoId;
        const escuelaId = req.user?.escuelaId;

        if (cursoId && escuelaId) {
          AcademicCacheHelper.invalidateOnCursoChange(cursoId, escuelaId);
        }

        next();
      },
    };
  }
}

export default AcademicCacheHelper;
