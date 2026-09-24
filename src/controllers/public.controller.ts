import { Request, Response } from 'express';
import invitacionService from '../services/invitacion.service';
import { estudianteService } from '../services/estudiante.service';
import Curso from '../models/curso.model';
import Escuela from '../models/escuela.model';
import ApiError from '../utils/ApiError';

/**
 * Valida un código de invitación (endpoint público)
 */
export const validarCodigoInvitacion = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codigo } = req.body;

    if (!codigo) {
      res.status(400).json({
        success: false,
        message: 'El código de invitación es requerido',
      });
      return;
    }

    // Usar el servicio de invitación para validar
    const resultado = await invitacionService.validarCodigo(codigo);

    res.status(200).json({
      success: true,
      data: resultado,
      message: 'Código de invitación válido',
    });
  } catch (error) {
    console.error('Error al validar código de invitación:', error);

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

/**
 * Obtiene información de un curso con código de invitación
 */
export const obtenerInfoCurso = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cursoId, codigoInvitacion } = req.params;

    if (!cursoId || !codigoInvitacion) {
      res.status(400).json({
        success: false,
        message: 'ID de curso y código de invitación son requeridos',
      });
      return;
    }

    // Validar primero el código de invitación
    try {
      await invitacionService.validarCodigo(codigoInvitacion);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación no válido',
      });
      return;
    }

    // Obtener información del curso
    const curso = await Curso.findById(cursoId)
      .select('nombre grado grupo seccion descripcion')
      .populate('escuelaId', 'nombre');

    if (!curso) {
      res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: curso,
    });
  } catch (error) {
    console.error('Error al obtener información del curso:', error);

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

/**
 * Obtiene cursos disponibles con código de invitación
 */
export const obtenerCursosDisponibles = async (req: Request, res: Response): Promise<void> => {
  try {
    const { codigoInvitacion } = req.params;

    if (!codigoInvitacion) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación es requerido',
      });
      return;
    }

    // Validar código y obtener información
    let invitacionInfo;
    try {
      invitacionInfo = await invitacionService.validarCodigo(codigoInvitacion);
    } catch (error) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación no válido',
      });
      return;
    }

    // Obtener cursos de la escuela
    const cursos = await Curso.find({
      escuelaId: invitacionInfo.escuelaId,
    })
      .select('nombre grado grupo seccion')
      .sort({ grado: 1, grupo: 1 });

    res.status(200).json({
      success: true,
      data: cursos,
      message: `Se encontraron ${cursos.length} cursos disponibles`,
    });
  } catch (error) {
    console.error('Error al obtener cursos disponibles:', error);

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

/**
 * Obtiene información pública de un curso
 */
export const obtenerInfoCursoPublica = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cursoId } = req.params;

    if (!cursoId) {
      res.status(400).json({
        success: false,
        message: 'ID de curso es requerido',
      });
      return;
    }

    const curso = await Curso.findById(cursoId)
      .select('nombre grado grupo seccion descripcion')
      .populate('escuelaId', 'nombre');

    if (!curso) {
      res.status(404).json({
        success: false,
        message: 'Curso no encontrado',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: curso,
    });
  } catch (error) {
    console.error('Error al obtener información pública del curso:', error);

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

/**
 * NUEVO: Busca estudiantes disponibles para asociación usando código de invitación válido
 * Este endpoint es público y se usa durante el proceso de registro
 */
export const buscarEstudiantesConInvitacion = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { codigoInvitacion } = req.params;
    // Solo strings: evita operadores NoSQL (email[$ne]=x) desde un endpoint público
    const comoTexto = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
    const nombre = comoTexto(req.query.nombre);
    const apellidos = comoTexto(req.query.apellidos);
    const email = comoTexto(req.query.email);
    const codigo_estudiante = comoTexto(req.query.codigo_estudiante);

    if (!codigoInvitacion) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación es requerido',
      });
      return;
    }

    // Validar primero que el código de invitación sea válido
    let invitacionInfo;
    try {
      invitacionInfo = await invitacionService.validarCodigo(codigoInvitacion);

      if (!invitacionInfo || !invitacionInfo.escuelaId) {
        res.status(400).json({
          success: false,
          message: 'Código de invitación no válido',
        });
        return;
      }
    } catch (invitacionError) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación no válido o expirado',
      });
      return;
    }

    // Buscar estudiantes existentes en la escuela
    const estudiantes = await estudianteService.buscarEstudiantesExistentes({
      escuelaId: invitacionInfo.escuelaId,
      nombre,
      apellidos,
      email,
      codigo_estudiante,
    });

    // Filtrar solo información necesaria para el registro público
    const estudiantesPublicos = estudiantes.map((est) => ({
      _id: est._id,
      nombre: est.nombre,
      apellidos: est.apellidos,
      codigo_estudiante: est.codigo_estudiante,
      curso: est.curso,
      tieneAcudientes: est.acudientesActuales.length > 0,
      numeroAcudientes: est.acudientesActuales.length,
    }));

    res.status(200).json({
      success: true,
      data: estudiantesPublicos,
      message: `Se encontraron ${estudiantesPublicos.length} estudiantes disponibles`,
    });
  } catch (error) {
    console.error('Error al buscar estudiantes con invitación:', error);

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

/**
 * NUEVO: Obtiene información de un estudiante específico usando código de invitación
 */
export const obtenerEstudianteConInvitacion = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { codigoInvitacion, estudianteId } = req.params;

    if (!codigoInvitacion || !estudianteId) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación y ID de estudiante son requeridos',
      });
      return;
    }

    // Validar código de invitación
    let invitacionInfo;
    try {
      invitacionInfo = await invitacionService.validarCodigo(codigoInvitacion);

      if (!invitacionInfo || !invitacionInfo.escuelaId) {
        res.status(400).json({
          success: false,
          message: 'Código de invitación no válido',
        });
        return;
      }
    } catch (invitacionError) {
      res.status(400).json({
        success: false,
        message: 'Código de invitación no válido o expirado',
      });
      return;
    }

    // Obtener estudiante
    const estudiante = await estudianteService.obtenerEstudiantePorId(
      estudianteId,
      invitacionInfo.escuelaId,
    );

    if (!estudiante) {
      res.status(404).json({
        success: false,
        message: 'Estudiante no encontrado',
      });
      return;
    }

    // Retornar solo información pública necesaria
    const estudiantePublico = {
      _id: estudiante._id,
      nombre: estudiante.nombre,
      apellidos: estudiante.apellidos,
      codigo_estudiante: estudiante.codigo_estudiante,
      curso: estudiante.curso,
      tieneAcudientes: estudiante.acudientesActuales.length > 0,
      numeroAcudientes: estudiante.acudientesActuales.length,
    };

    res.status(200).json({
      success: true,
      data: estudiantePublico,
    });
  } catch (error) {
    console.error('Error al obtener estudiante con invitación:', error);

    if (error instanceof ApiError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
    });
  }
};

// Exportar todos los métodos
const publicController = {
  validarCodigoInvitacion,
  obtenerInfoCurso,
  obtenerCursosDisponibles,
  obtenerInfoCursoPublica,
  buscarEstudiantesConInvitacion,
  obtenerEstudianteConInvitacion,
};

export default publicController;
