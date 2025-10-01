// src/controllers/dashboard.controller.ts - USANDO EL SERVICE OPTIMIZADO
import { Request, Response } from 'express';
import dashboardService from '../services/dashboard.service';
import { invalidateCache } from '../cache/simpleCache';

// Interfaz para request autenticado (basada en tu estructura)
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo:
      | 'ADMIN'
      | 'DOCENTE'
      | 'ESTUDIANTE'
      | 'PADRE'
      | 'RECTOR'
      | 'COORDINADOR'
      | 'ADMINISTRATIVO';
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    [key: string]: any;
  };
}

// 🚀 ESTADÍSTICAS PRINCIPALES - AHORA USA EL SERVICE
export const obtenerEstadisticasDashboard = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const usuario = req.user;
    const escuelaId = usuario?.escuelaId;

    if (!escuelaId) {
      res.status(400).json({
        success: false,
        message: 'Usuario no tiene escuela asignada',
      });
      return;
    }

    // ✅ DELEGAR AL SERVICE OPTIMIZADO
    const estadisticas = await dashboardService.obtenerEstadisticas(usuario._id, escuelaId);

    res.status(200).json({
      success: true,
      data: estadisticas,
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas del dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
};

// 🚀 RESUMEN POR ROL - AHORA EXPANDIDO Y OPTIMIZADO
export const obtenerResumenPorRol = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const usuario = req.user;
    const escuelaId = usuario?.escuelaId;

    if (!escuelaId || !usuario) {
      res.status(400).json({
        success: false,
        message: 'Usuario no tiene escuela asignada',
      });
      return;
    }

    // ✅ DELEGAR AL SERVICE OPTIMIZADO CON DATOS REALES
    const resumen = await dashboardService.obtenerResumenPorRol(
      usuario._id,
      escuelaId,
      usuario.tipo,
    );

    res.status(200).json({
      success: true,
      data: resumen,
    });
  } catch (error) {
    console.error('Error obteniendo resumen por rol:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
};

// 🚀 NUEVO: RESUMEN COMPLETO - TODO EN UNA LLAMADA
export const obtenerResumenCompleto = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const usuario = req.user;
    const escuelaId = usuario?.escuelaId;

    if (!escuelaId) {
      res.status(400).json({
        success: false,
        message: 'Usuario no tiene escuela asignada',
      });
      return;
    }

    // ✅ CONSULTAS EN PARALELO PARA MÁXIMO RENDIMIENTO
    const [estadisticas, resumenRol] = await Promise.all([
      dashboardService.obtenerEstadisticas(usuario._id, escuelaId),
      dashboardService.obtenerResumenPorRol(usuario._id, escuelaId, usuario.tipo),
    ]);

    res.status(200).json({
      success: true,
      data: {
        estadisticas,
        resumenRol,
        usuario: {
          nombre: usuario.nombre,
          apellidos: usuario.apellidos,
          tipo: usuario.tipo,
          email: usuario.email,
        },
      },
      message: 'Resumen completo obtenido exitosamente',
    });
  } catch (error) {
    console.error('Error obteniendo resumen completo:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
};

// 🚀 NUEVO: EVENTOS DEL DÍA
export const obtenerEventosHoy = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const usuario = req.user;
    const escuelaId = usuario?.escuelaId;

    if (!escuelaId) {
      res.status(400).json({
        success: false,
        message: 'Usuario no tiene escuela asignada',
      });
      return;
    }

    const eventos = await dashboardService.obtenerEventosHoy(escuelaId);

    res.status(200).json({
      success: true,
      data: eventos,
      message: 'Eventos del día obtenidos exitosamente',
    });
  } catch (error) {
    console.error('Error obteniendo eventos del día:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
};

// 🚀 NUEVO: MÉTRICAS AVANZADAS (Para admins)
export const obtenerMetricasAvanzadas = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  try {
    const usuario = req.user;
    const escuelaId = usuario?.escuelaId;

    // Solo admin/rector pueden ver métricas avanzadas
    if (!usuario || !['ADMIN', 'RECTOR', 'COORDINADOR'].includes(usuario.tipo)) {
      res.status(403).json({
        success: false,
        message: 'No tienes permisos para ver métricas avanzadas',
      });
      return;
    }

    if (!escuelaId) {
      res.status(400).json({
        success: false,
        message: 'Usuario no tiene escuela asignada',
      });
      return;
    }

    const metricas = await dashboardService.obtenerMetricasAvanzadas(escuelaId);

    res.status(200).json({
      success: true,
      data: metricas,
      message: 'Métricas avanzadas obtenidas exitosamente',
    });
  } catch (error) {
    console.error('Error obteniendo métricas avanzadas:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: process.env.NODE_ENV === 'development' ? error : {},
    });
  }
};

// 🚀 FUNCIÓN: Invalidar cache dashboard (usando TU sistema)
export const invalidarCacheDashboard = (usuarioId: string, escuelaId: string): void => {
  console.log(`🔄 Invalidando cache dashboard para usuario ${usuarioId} en escuela ${escuelaId}`);
  invalidateCache('dashboard', usuarioId, escuelaId);
};
