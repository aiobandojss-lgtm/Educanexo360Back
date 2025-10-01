// src/services/dashboard.service.ts - BACKEND SERVICE OPTIMIZADO
import mongoose from 'mongoose';
import Mensaje from '../models/mensaje.model';
import Calendario from '../models/calendario.model';
import Anuncio from '../models/anuncio.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import Calificacion from '../models/calificacion.model';
import Asistencia from '../models/asistencia.model';

export interface DashboardStats {
  mensajesSinLeer: number;
  eventosProximos: number;
  anunciosRecientes: number;
}

export interface ResumenPorRol {
  // Para DOCENTE
  cursosAsignados?: number;
  estudiantesTotales?: number;
  calificacionesPendientes?: number;

  // Para ESTUDIANTE
  calificacionesRecientes?: number;
  asistenciaPromedio?: number;
  tareasPendientes?: number;

  // Para PADRE
  hijosEnSistema?: number;
  citasPendientes?: number;
  notificacionesImportantes?: number;

  // Para ADMIN/RECTOR/COORDINADOR
  totalUsuarios?: number;
  totalCursos?: number;
  totalEstudiantes?: number;
}

class DashboardService {
  // 🚀 ESTADÍSTICAS PRINCIPALES - OPTIMIZADO
  async obtenerEstadisticas(usuarioId: string, escuelaId: string): Promise<DashboardStats> {
    const usuarioObjectId = new mongoose.Types.ObjectId(usuarioId);
    const escuelaObjectId = new mongoose.Types.ObjectId(escuelaId);

    // Fechas para filtros
    const fechaActual = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaActual.getDate() + 30);

    const fechaReciente = new Date();
    fechaReciente.setDate(fechaActual.getDate() - 7);

    console.log(`🔍 Calculando estadísticas dashboard para usuario ${usuarioId}`);

    // 🚀 QUERIES EN PARALELO (igual que tu controller pero reutilizable)
    const [mensajesSinLeer, eventosProximos, anunciosRecientes] = await Promise.all([
      // ✅ MENSAJES SIN LEER
      this.contarMensajesSinLeer(usuarioObjectId, escuelaObjectId),

      // ✅ EVENTOS PRÓXIMOS
      this.contarEventosProximos(escuelaObjectId, fechaActual, fechaLimite),

      // ✅ ANUNCIOS RECIENTES
      this.contarAnunciosRecientes(escuelaObjectId, fechaReciente),
    ]);

    const estadisticas = {
      mensajesSinLeer,
      eventosProximos,
      anunciosRecientes,
    };

    console.log(`✅ Estadísticas calculadas:`, estadisticas);
    return estadisticas;
  }

  // 🚀 MENSAJES SIN LEER - MÉTODO PRIVADO OPTIMIZADO
  private async contarMensajesSinLeer(
    usuarioId: mongoose.Types.ObjectId,
    escuelaId: mongoose.Types.ObjectId,
  ): Promise<number> {
    return await Mensaje.countDocuments({
      escuelaId: escuelaId,
      $or: [{ destinatarios: usuarioId }, { destinatariosCc: usuarioId }],
      $and: [
        // Mensaje no está en lecturas del usuario
        {
          'lecturas.usuarioId': { $ne: usuarioId },
        },
        // Y no está eliminado/archivado para este usuario
        {
          $or: [
            { estadosUsuarios: { $exists: false } },
            {
              estadosUsuarios: {
                $not: {
                  $elemMatch: {
                    usuarioId: usuarioId,
                    estado: { $in: ['ELIMINADO', 'ARCHIVADO'] },
                  },
                },
              },
            },
          ],
        },
        // Y no es borrador
        {
          tipo: { $ne: 'BORRADOR' },
        },
      ],
    });
  }

  // 🚀 EVENTOS PRÓXIMOS - MÉTODO PRIVADO OPTIMIZADO
  private async contarEventosProximos(
    escuelaId: mongoose.Types.ObjectId,
    fechaActual: Date,
    fechaLimite: Date,
  ): Promise<number> {
    return await Calendario.countDocuments({
      escuelaId: escuelaId,
      fechaInicio: {
        $gte: fechaActual,
        $lte: fechaLimite,
      },
      estado: { $ne: 'CANCELADO' },
    });
  }

  // 🚀 ANUNCIOS RECIENTES - MÉTODO PRIVADO OPTIMIZADO
  private async contarAnunciosRecientes(
    escuelaId: mongoose.Types.ObjectId,
    fechaReciente: Date,
  ): Promise<number> {
    return await Anuncio.countDocuments({
      escuelaId: escuelaId,
      estaPublicado: true,
      fechaPublicacion: {
        $gte: fechaReciente,
      },
    });
  }

  // 🚀 RESUMEN POR ROL - EXPANDIDO Y OPTIMIZADO
  async obtenerResumenPorRol(
    usuarioId: string,
    escuelaId: string,
    tipoUsuario: string,
  ): Promise<ResumenPorRol> {
    const escuelaObjectId = new mongoose.Types.ObjectId(escuelaId);
    const usuarioObjectId = new mongoose.Types.ObjectId(usuarioId);

    switch (tipoUsuario) {
      case 'DOCENTE':
        return await this.obtenerResumenDocente(usuarioObjectId, escuelaObjectId);

      case 'ESTUDIANTE':
        return await this.obtenerResumenEstudiante(usuarioObjectId, escuelaObjectId);

      case 'PADRE':
        return await this.obtenerResumenPadre(usuarioObjectId, escuelaObjectId);

      case 'ADMIN':
      case 'RECTOR':
      case 'COORDINADOR':
      case 'ADMINISTRATIVO':
        return await this.obtenerResumenAdministrativo(escuelaObjectId);

      default:
        return {};
    }
  }

  // 🚀 RESUMEN DOCENTE - OPTIMIZADO CON AGREGACIONES
  private async obtenerResumenDocente(
    usuarioId: mongoose.Types.ObjectId,
    escuelaId: mongoose.Types.ObjectId,
  ): Promise<ResumenPorRol> {
    const [cursosInfo, calificacionesPendientes] = await Promise.all([
      // Cursos donde es docente
      Curso.aggregate([
        {
          $match: {
            escuelaId: escuelaId,
            $or: [{ director_grupo: usuarioId }, { 'asignaturas.docenteId': usuarioId }],
          },
        },
        {
          $group: {
            _id: null,
            cursosAsignados: { $sum: 1 },
            estudiantesTotales: { $sum: { $size: '$estudiantes' } },
          },
        },
      ]),

      // Calificaciones pendientes (ejemplo)
      Calificacion.countDocuments({
        docenteId: usuarioId,
        escuelaId: escuelaId,
        estado: 'PENDIENTE',
      }),
    ]);

    const resumen = cursosInfo[0] || { cursosAsignados: 0, estudiantesTotales: 0 };
    return {
      cursosAsignados: resumen.cursosAsignados,
      estudiantesTotales: resumen.estudiantesTotales,
      calificacionesPendientes,
    };
  }

  // 🚀 RESUMEN ESTUDIANTE - OPTIMIZADO
  private async obtenerResumenEstudiante(
    usuarioId: mongoose.Types.ObjectId,
    escuelaId: mongoose.Types.ObjectId,
  ): Promise<ResumenPorRol> {
    const [calificacionesRecientes, asistenciaInfo] = await Promise.all([
      // Calificaciones recientes
      Calificacion.countDocuments({
        estudianteId: usuarioId,
        escuelaId: escuelaId,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // últimos 7 días
      }),

      // Promedio de asistencia
      Asistencia.aggregate([
        {
          $match: {
            escuelaId: escuelaId,
            'estudiantes.estudianteId': usuarioId,
            fecha: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // último mes
          },
        },
        {
          $unwind: '$estudiantes',
        },
        {
          $match: {
            'estudiantes.estudianteId': usuarioId,
          },
        },
        {
          $group: {
            _id: null,
            totalDias: { $sum: 1 },
            diasPresente: {
              $sum: {
                $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            asistenciaPromedio: {
              $cond: [
                { $gt: ['$totalDias', 0] },
                { $multiply: [{ $divide: ['$diasPresente', '$totalDias'] }, 100] },
                0,
              ],
            },
          },
        },
      ]),
    ]);

    const asistencia = asistenciaInfo[0]?.asistenciaPromedio || 0;

    return {
      calificacionesRecientes,
      asistenciaPromedio: Math.round(asistencia),
      tareasPendientes: 0, // Por implementar según tu modelo
    };
  }

  // 🚀 RESUMEN PADRE - OPTIMIZADO
  private async obtenerResumenPadre(
    usuarioId: mongoose.Types.ObjectId,
    escuelaId: mongoose.Types.ObjectId,
  ): Promise<ResumenPorRol> {
    const usuario = await Usuario.findById(usuarioId).select(
      'info_academica.estudiantes_asociados',
    );
    const hijosIds = usuario?.info_academica?.estudiantes_asociados || [];

    const [hijosActivos, notificacionesImportantes] = await Promise.all([
      // Hijos activos en el sistema
      Usuario.countDocuments({
        _id: { $in: hijosIds },
        escuelaId: escuelaId,
        estado: 'ACTIVO',
        tipo: 'ESTUDIANTE',
      }),

      // Notificaciones importantes (ejemplo)
      Mensaje.countDocuments({
        destinatarios: usuarioId,
        escuelaId: escuelaId,
        prioridad: 'ALTA',
        'lecturas.usuarioId': { $ne: usuarioId },
      }),
    ]);

    return {
      hijosEnSistema: hijosActivos,
      citasPendientes: 0, // Por implementar
      notificacionesImportantes,
    };
  }

  // 🚀 RESUMEN ADMINISTRATIVO - OPTIMIZADO CON AGREGACIÓN
  private async obtenerResumenAdministrativo(
    escuelaId: mongoose.Types.ObjectId,
  ): Promise<ResumenPorRol> {
    const [estadisticas] = await Promise.all([
      Usuario.aggregate([
        {
          $match: {
            escuelaId: escuelaId,
            estado: 'ACTIVO',
          },
        },
        {
          $group: {
            _id: '$tipo',
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            totalUsuarios: { $sum: '$count' },
            tipos: {
              $push: {
                tipo: '$_id',
                cantidad: '$count',
              },
            },
          },
        },
      ]),
    ]);

    const [cursos, estudiantes] = await Promise.all([
      Curso.countDocuments({ escuelaId: escuelaId }),
      Usuario.countDocuments({ escuelaId: escuelaId, tipo: 'ESTUDIANTE', estado: 'ACTIVO' }),
    ]);

    const stats = estadisticas[0] || { totalUsuarios: 0 };

    return {
      totalUsuarios: stats.totalUsuarios,
      totalCursos: cursos,
      totalEstudiantes: estudiantes,
    };
  }

  // 🚀 MÉTODO ADICIONAL: Obtener eventos del día
  async obtenerEventosHoy(escuelaId: string): Promise<any[]> {
    const hoy = new Date();
    const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);

    return await Calendario.find({
      escuelaId: new mongoose.Types.ObjectId(escuelaId),
      fechaInicio: {
        $gte: inicioDia,
        $lt: finDia,
      },
      estado: { $in: ['PENDIENTE', 'ACTIVO'] },
    })
      .select('titulo descripcion fechaInicio fechaFin lugar tipo')
      .sort({ fechaInicio: 1 })
      .limit(5)
      .lean();
  }

  // 🚀 MÉTODO ADICIONAL: Obtener métricas avanzadas
  async obtenerMetricasAvanzadas(escuelaId: string): Promise<any> {
    const escuelaObjectId = new mongoose.Types.ObjectId(escuelaId);

    const [actividad, rendimiento] = await Promise.all([
      // Actividad de la semana
      Usuario.aggregate([
        {
          $match: {
            escuelaId: escuelaObjectId,
            ultimoAcceso: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: '$tipo',
            usuariosActivos: { $sum: 1 },
          },
        },
      ]),

      // Rendimiento académico general
      Calificacion.aggregate([
        {
          $match: {
            escuelaId: escuelaObjectId,
            fecha: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id: null,
            promedioGeneral: { $avg: '$valor' },
            totalCalificaciones: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      actividadSemanal: actividad,
      rendimiento: rendimiento[0] || { promedioGeneral: 0, totalCalificaciones: 0 },
    };
  }
}

export default new DashboardService();
