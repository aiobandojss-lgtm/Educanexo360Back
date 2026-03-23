// src/services/estudiante.service.ts - VERSIÓN CORREGIDA
import { Types } from 'mongoose';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import { escapeRegex } from '../utils/escapeRegex';

export interface BusquedaEstudianteOptions {
  nombre?: string;
  apellidos?: string;
  email?: string;
  codigo_estudiante?: string;
  cursoId?: string;
  escuelaId: string;
}

export interface EstudianteEncontrado {
  _id: string;
  nombre: string;
  apellidos: string;
  email: string;
  codigo_estudiante?: string;
  curso?: {
    _id: string;
    nombre: string;
    grado: string;
    grupo: string;
  };
  acudientesActuales: Array<{
    _id: string;
    nombre: string;
    apellidos: string;
    email: string;
  }>;
}

class EstudianteService {
  /**
   * Busca estudiantes existentes por diferentes criterios
   */
  async buscarEstudiantesExistentes(
    options: BusquedaEstudianteOptions,
  ): Promise<EstudianteEncontrado[]> {
    const { escuelaId, ...criterios } = options;

    // Construir query de búsqueda
    const query: any = {
      tipo: 'ESTUDIANTE',
      estado: 'ACTIVO',
      escuelaId: new Types.ObjectId(escuelaId),
    };

    // Agregar criterios de búsqueda (OR lógico para flexibilidad)
    const orConditions = [];

    if (criterios.email) {
      orConditions.push({ email: criterios.email });
    }

    if (criterios.codigo_estudiante) {
      orConditions.push({ 'info_academica.codigo_estudiante': criterios.codigo_estudiante });
    }

    if (criterios.nombre && criterios.apellidos) {
      orConditions.push({
        nombre: new RegExp(escapeRegex(criterios.nombre), 'i'),
        apellidos: new RegExp(escapeRegex(criterios.apellidos), 'i'),
      });
    } else if (criterios.nombre) {
      orConditions.push({
        nombre: new RegExp(escapeRegex(criterios.nombre), 'i'),
      });
    } else if (criterios.apellidos) {
      orConditions.push({
        apellidos: new RegExp(escapeRegex(criterios.apellidos), 'i'),
      });
    }

    if (orConditions.length > 0) {
      query.$or = orConditions;
    } else {
      // Si no hay criterios específicos, no devolver nada
      return [];
    }

    try {
      const estudiantes = await Usuario.find(query).lean();

      // Para cada estudiante, obtener información adicional
      const estudiantesEncontrados: EstudianteEncontrado[] = [];

      for (const estudiante of estudiantes) {
        // Buscar curso del estudiante
        let cursoInfo:
          | {
              _id: string;
              nombre: string;
              grado: string;
              grupo: string;
            }
          | undefined = undefined;

        try {
          const curso = await Curso.findOne({
            estudiantes: { $in: [estudiante._id] },
            escuelaId: new Types.ObjectId(escuelaId),
          }).lean();

          if (curso) {
            cursoInfo = {
              _id: curso._id.toString(),
              nombre: curso.nombre || '',
              grado: curso.grado || '',
              grupo: curso.grupo || '',
            };
          }
        } catch (error) {
          console.error('Error al buscar curso del estudiante:', error);
        }

        // Buscar acudientes actuales
        const acudientesRaw = await Usuario.find({
          tipo: 'ACUDIENTE',
          estado: 'ACTIVO',
          escuelaId: new Types.ObjectId(escuelaId),
          'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
        })
          .select('nombre apellidos email')
          .lean();

        const acudientes = acudientesRaw.map((acudiente) => ({
          _id: acudiente._id.toString(),
          nombre: acudiente.nombre,
          apellidos: acudiente.apellidos,
          email: acudiente.email,
        }));

        estudiantesEncontrados.push({
          _id: estudiante._id.toString(),
          nombre: estudiante.nombre,
          apellidos: estudiante.apellidos,
          email: estudiante.email,
          codigo_estudiante: estudiante.info_academica?.codigo_estudiante,
          curso: cursoInfo,
          acudientesActuales: acudientes,
        });
      }

      return estudiantesEncontrados;
    } catch (error) {
      console.error('Error al buscar estudiantes existentes:', error);
      throw new ApiError(500, 'Error al buscar estudiantes existentes');
    }
  }

  /**
   * Busca un estudiante específico por ID
   */
  async obtenerEstudiantePorId(
    id: string,
    escuelaId: string,
  ): Promise<EstudianteEncontrado | null> {
    try {
      const estudiante = await Usuario.findOne({
        _id: new Types.ObjectId(id),
        tipo: 'ESTUDIANTE',
        estado: 'ACTIVO',
        escuelaId: new Types.ObjectId(escuelaId),
      }).lean();

      if (!estudiante) {
        return null;
      }

      // Buscar curso del estudiante
      let cursoInfo:
        | {
            _id: string;
            nombre: string;
            grado: string;
            grupo: string;
          }
        | undefined = undefined;

      try {
        const curso = await Curso.findOne({
          estudiantes: { $in: [estudiante._id] },
          escuelaId: new Types.ObjectId(escuelaId),
        }).lean();

        if (curso) {
          cursoInfo = {
            _id: curso._id.toString(),
            nombre: curso.nombre || '',
            grado: curso.grado || '',
            grupo: curso.grupo || '',
          };
        }
      } catch (error) {
        console.error('Error al buscar curso del estudiante:', error);
      }

      // Buscar acudientes actuales
      const acudientesRaw = await Usuario.find({
        tipo: 'ACUDIENTE',
        estado: 'ACTIVO',
        escuelaId: new Types.ObjectId(escuelaId),
        'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
      })
        .select('nombre apellidos email')
        .lean();

      const acudientes = acudientesRaw.map((acudiente) => ({
        _id: acudiente._id.toString(),
        nombre: acudiente.nombre,
        apellidos: acudiente.apellidos,
        email: acudiente.email,
      }));

      return {
        _id: estudiante._id.toString(),
        nombre: estudiante.nombre,
        apellidos: estudiante.apellidos,
        email: estudiante.email,
        codigo_estudiante: estudiante.info_academica?.codigo_estudiante,
        curso: cursoInfo,
        acudientesActuales: acudientes,
      };
    } catch (error) {
      console.error('Error al obtener estudiante por ID:', error);
      throw new ApiError(500, 'Error al obtener información del estudiante');
    }
  }

  /**
   * Verifica si un estudiante puede ser asociado a un nuevo acudiente
   */
  async puedeAsociarAcudiente(
    estudianteId: string,
    acudienteEmail: string,
    escuelaId: string,
  ): Promise<{ puede: boolean; razon?: string }> {
    try {
      // Verificar que el estudiante existe y está activo
      const estudiante = await Usuario.findOne({
        _id: new Types.ObjectId(estudianteId),
        tipo: 'ESTUDIANTE',
        estado: 'ACTIVO',
        escuelaId: new Types.ObjectId(escuelaId),
      });

      if (!estudiante) {
        return { puede: false, razon: 'Estudiante no encontrado o inactivo' };
      }

      // Verificar que el acudiente no esté ya asociado
      const acudienteExistente = await Usuario.findOne({
        email: acudienteEmail,
        tipo: 'ACUDIENTE',
        escuelaId: new Types.ObjectId(escuelaId),
        'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
      });

      if (acudienteExistente) {
        return {
          puede: false,
          razon: 'Este acudiente ya está asociado a este estudiante',
        };
      }

      return { puede: true };
    } catch (error) {
      console.error('Error al verificar asociación:', error);
      return { puede: false, razon: 'Error al verificar la asociación' };
    }
  }

  /**
   * Asocia un estudiante existente a un acudiente
   */
  async asociarEstudianteAcudiente(
    estudianteId: string,
    acudienteId: string,
    cursoId: string,
    session?: any,
  ): Promise<void> {
    try {
      // Actualizar el acudiente para incluir al estudiante
      await Usuario.findByIdAndUpdate(
        acudienteId,
        {
          $addToSet: {
            'info_academica.estudiantes_asociados': new Types.ObjectId(estudianteId),
          },
        },
        { session },
      );

      // Asegurar que el estudiante esté en el curso correcto
      await Curso.findByIdAndUpdate(
        cursoId,
        {
          $addToSet: { estudiantes: new Types.ObjectId(estudianteId) },
        },
        { session },
      );

      console.log(`Estudiante ${estudianteId} asociado exitosamente al acudiente ${acudienteId}`);
    } catch (error) {
      console.error('Error al asociar estudiante y acudiente:', error);
      throw new ApiError(500, 'Error al asociar estudiante y acudiente');
    }
  }
}

export const estudianteService = new EstudianteService();
export default estudianteService;
