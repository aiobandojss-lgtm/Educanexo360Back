import { Types } from 'mongoose';
import Invitacion, { TipoInvitacion, EstadoInvitacion } from '../models/invitacion.model';
import ApiError from '../utils/ApiError';
import { generarCodigoAleatorio } from '../utils/codigoUtils';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import { logger } from '../utils/logger';

class InvitacionService {
  /**
   * Genera un código único para la invitación
   */
  private async generarCodigoUnico(
    escuelaId: string,
    tipo: TipoInvitacion,
    cursoId?: string,
  ): Promise<string> {
    // Prefijo según el tipo de invitación
    let prefijo = '';

    if (tipo === TipoInvitacion.CURSO && cursoId) {
      try {
        const curso = await Curso.findById(cursoId);
        if (curso) {
          // Usar los primeros caracteres del nombre del curso o su código
          prefijo = curso.nombre.substring(0, 2).toUpperCase();
        } else {
          prefijo = 'C';
        }
      } catch (error) {
        prefijo = 'C';
      }
    } else if (tipo === TipoInvitacion.ESTUDIANTE_ESPECIFICO) {
      prefijo = 'E';
    } else {
      prefijo = 'P';
    }

    // Añadir año actual
    const año = new Date().getFullYear();
    prefijo = `${prefijo}${año.toString().slice(-2)}-`;

    // Generar parte aleatoria y verificar unicidad
    let codigo;
    let esUnico = false;

    while (!esUnico) {
      // Generar 6 caracteres alfanuméricos
      const parteAleatoria = generarCodigoAleatorio(6);
      codigo = `${prefijo}${parteAleatoria}`;

      // Verificar que no exista
      const invitacionExistente = await Invitacion.findOne({ codigo });
      if (!invitacionExistente) {
        esUnico = true;
      }
    }

    return codigo!;
  }

  /**
   * Crea una nueva invitación
   */
  async crearInvitacion(data: {
    tipo: TipoInvitacion;
    escuelaId: string;
    cursoId?: string;
    estudianteId?: string;
    creadorId: string;
    cantidadUsos?: number;
    fechaExpiracion?: Date;
    datosAdicionales?: any;
  }) {
    logger.debug('Datos recibidos:', JSON.stringify(data));

    // Si se proporciona un cursoId, validar que pertenezca a la escuela
    if (data.cursoId) {
      const curso = await Curso.findOne({ _id: data.cursoId, escuelaId: data.escuelaId });

      logger.debug('Curso encontrado:', curso ? JSON.stringify(curso) : 'Curso no encontrado');

      if (curso) {
        logger.debug('Comparando escuelas:', {
          cursoEscuelaId: curso.escuelaId.toString(),
          requestEscuelaId: data.escuelaId,
          sonIguales: curso.escuelaId.toString() === data.escuelaId,
        });
      }

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      // Verificar que el curso pertenezca a la escuela
      if (curso.escuelaId.toString() !== data.escuelaId) {
        throw new ApiError(400, 'El curso no pertenece a la escuela especificada');
      }
    }

    // Si se proporciona un estudianteId, verificar que existe y pertenece a la escuela
    if (data.estudianteId && data.tipo === TipoInvitacion.ESTUDIANTE_ESPECIFICO) {
      const estudiante = await Usuario.findOne({
        _id: data.estudianteId,
        tipo: 'ESTUDIANTE',
        escuelaId: data.escuelaId,
      });

      if (!estudiante) {
        throw new ApiError(
          404,
          'Estudiante no encontrado o no pertenece a la escuela especificada',
        );
      }
    }

    // Generar código único
    const codigo = await this.generarCodigoUnico(data.escuelaId, data.tipo, data.cursoId);

    // Crear la invitación
    const invitacion = new Invitacion({
      codigo,
      tipo: data.tipo,
      escuelaId: new Types.ObjectId(data.escuelaId),
      cursoId: data.cursoId ? new Types.ObjectId(data.cursoId) : undefined,
      estudianteId: data.estudianteId ? new Types.ObjectId(data.estudianteId) : undefined,
      estado: EstadoInvitacion.ACTIVO,
      fechaCreacion: new Date(),
      fechaExpiracion: data.fechaExpiracion,
      creadorId: new Types.ObjectId(data.creadorId),
      datosAdicionales: data.datosAdicionales,
      cantidadUsos: data.cantidadUsos || 1,
      usosActuales: 0,
      registros: [],
    });

    await invitacion.save();
    return invitacion;
  }

  /**
   * Valida un código de invitación
   */
  async validarCodigo(codigo: string) {
    // Buscar la invitación sin poblar primero
    const invitacion = await Invitacion.findOne({
      codigo,
      estado: EstadoInvitacion.ACTIVO,
    });

    if (!invitacion) {
      throw new ApiError(404, 'Código de invitación no válido o expirado');
    }

    // Verificar si ha alcanzado el límite de usos
    if (invitacion.usosActuales >= invitacion.cantidadUsos) {
      throw new ApiError(400, 'Este código ha alcanzado el límite máximo de usos');
    }

    // Verificar si ha expirado
    if (invitacion.fechaExpiracion && invitacion.fechaExpiracion < new Date()) {
      // Actualizar estado a expirado
      invitacion.estado = EstadoInvitacion.EXPIRADO;
      await invitacion.save();

      throw new ApiError(400, 'Este código de invitación ha expirado');
    }

    // Información adicional según el tipo de invitación
    const response: any = {
      invitacionId: invitacion._id,
      codigo: invitacion.codigo,
      tipo: invitacion.tipo,
      escuelaId: invitacion.escuelaId,
      cursoId: invitacion.cursoId,
      estudianteId: invitacion.estudianteId,
      datosAdicionales: invitacion.datosAdicionales,
    };

    // Si hay un curso asociado, obtener sus datos
    if (invitacion.cursoId) {
      try {
        const curso = await Curso.findById(invitacion.cursoId);
        if (curso) {
          response.cursoInfo = {
            _id: curso._id,
            nombre: curso.nombre,
            grado: curso.grado,
            grupo: curso.grupo,
          };
        }
      } catch (error) {
        console.error('Error al obtener información del curso:', error);
      }
    }

    // Si es invitación para un curso, obtener cursos de la escuela para el formulario
    if (invitacion.tipo === TipoInvitacion.CURSO) {
      try {
        const cursos = await Curso.find({ escuelaId: invitacion.escuelaId })
          .select('_id nombre grado grupo')
          .sort({ grado: 1, grupo: 1 })
          .lean();

        response.cursos = cursos;
      } catch (error) {
        console.error('Error al obtener cursos:', error);
      }
    }

    // Si es invitación para un estudiante específico, obtener sus datos
    if (invitacion.tipo === TipoInvitacion.ESTUDIANTE_ESPECIFICO && invitacion.estudianteId) {
      try {
        const estudiante = await Usuario.findById(invitacion.estudianteId).select(
          'nombre apellidos info_academica',
        );

        if (estudiante) {
          // Crear objeto con la información del estudiante
          const estudianteInfo: any = {
            _id: estudiante._id,
            nombre: estudiante.nombre,
            apellidos: estudiante.apellidos,
            codigo: estudiante.info_academica?.codigo_estudiante,
          };

          // Si tiene grado/grupo, añadirlos
          if (estudiante.info_academica?.grado) {
            estudianteInfo.grado = estudiante.info_academica.grado;
          }

          if (estudiante.info_academica?.grupo) {
            estudianteInfo.grupo = estudiante.info_academica.grupo;
          }

          // Buscar el curso del estudiante si está en la lista de estudiantes del curso
          const cursos = await Curso.find({
            estudiantes: { $in: [estudiante._id] },
            escuelaId: invitacion.escuelaId,
          })
            .select('_id nombre grado grupo')
            .lean();

          if (cursos && cursos.length > 0) {
            estudianteInfo.curso = {
              _id: cursos[0]._id,
              nombre: cursos[0].nombre,
              grado: cursos[0].grado,
              grupo: cursos[0].grupo,
            };
          }

          response.estudiante = estudianteInfo;
        }
      } catch (error) {
        console.error('Error al obtener datos del estudiante:', error);
      }
    }

    return response;
  }

  /**
   * Registra el uso de una invitación
   */
  async registrarUso(
    invitacionId: string,
    usuarioId: string,
    tipoCuenta: 'ESTUDIANTE' | 'ACUDIENTE',
  ) {
    const invitacion = await Invitacion.findById(invitacionId);

    if (!invitacion || invitacion.estado !== EstadoInvitacion.ACTIVO) {
      throw new ApiError(404, 'Invitación no encontrada o no activa');
    }

    // Incrementar contador de usos
    invitacion.usosActuales += 1;

    // Registrar el uso
    invitacion.registros.push({
      usuarioId: new Types.ObjectId(usuarioId),
      fechaRegistro: new Date(),
      tipoCuenta,
    });

    // Si alcanzó el límite, marcar como utilizada
    if (invitacion.usosActuales >= invitacion.cantidadUsos) {
      invitacion.estado = EstadoInvitacion.UTILIZADO;
      invitacion.fechaUtilizacion = new Date();
    }

    await invitacion.save();
    return {
      message: 'Uso de invitación registrado correctamente',
      invitacionId: invitacion._id,
      usosRestantes:
        invitacion.cantidadUsos > invitacion.usosActuales
          ? invitacion.cantidadUsos - invitacion.usosActuales
          : 0,
    };
  }

  /**
   * Obtiene invitaciones por curso
   */
  async obtenerInvitacionesPorCurso(cursoId: string, escuelaId: string, estado?: EstadoInvitacion) {
    if (!Types.ObjectId.isValid(cursoId) || !Types.ObjectId.isValid(escuelaId)) {
      throw new ApiError(400, 'Parámetros inválidos');
    }
    const filtro: any = {
      cursoId: new Types.ObjectId(cursoId),
      escuelaId: new Types.ObjectId(escuelaId),
      tipo: TipoInvitacion.CURSO,
    };

    if (estado) {
      filtro.estado = estado;
    }

    const invitaciones = await Invitacion.find(filtro)
      .sort({ fechaCreacion: -1 })
      .populate('creadorId', 'nombre apellidos');

    return invitaciones;
  }

  /**
   * Revocar una invitación
   */
  async revocarInvitacion(invitacionId: string, escuelaId: string) {
    const invitacion = await Invitacion.findOne({ _id: invitacionId, escuelaId });

    if (!invitacion) {
      throw new ApiError(404, 'Invitación no encontrada');
    }

    if (invitacion.estado !== EstadoInvitacion.ACTIVO) {
      return {
        message: `La invitación ya no está activa. Estado actual: ${invitacion.estado}`,
      };
    }

    invitacion.estado = EstadoInvitacion.REVOCADO;
    await invitacion.save();

    return { message: 'Invitación revocada exitosamente' };
  }

  /**
   * Obtiene una invitación por ID
   */
  async obtenerInvitacionPorId(id: string, escuelaId: string) {
    // Buscar la invitación (solo del colegio del usuario) y poblar los campos relacionados
    const invitacion = await Invitacion.findOne({ _id: id, escuelaId })
      .populate('creadorId', 'nombre apellidos')
      .populate('cursoId', 'nombre grado grupo');

    if (!invitacion) {
      throw new ApiError(404, 'Invitación no encontrada');
    }

    return invitacion;
  }

  /**
   * Obtiene todas las invitaciones de una escuela
   */
  async obtenerInvitacionesEscuela(
    escuelaId: string,
    estado?: EstadoInvitacion,
    pagina = 1,
    limite = 10,
  ) {
    const filtro: any = {
      escuelaId: new Types.ObjectId(escuelaId),
    };

    if (estado) {
      filtro.estado = estado;
    }

    const total = await Invitacion.countDocuments(filtro);

    const invitaciones = await Invitacion.find(filtro)
      .sort({ fechaCreacion: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite)
      .populate('cursoId', 'nombre grado grupo')
      .populate('creadorId', 'nombre apellidos')
      .populate('estudianteId', 'nombre apellidos');

    return {
      total,
      pagina,
      limite,
      invitaciones,
    };
  }

  /**
   * Obtiene los cursos de una escuela
   * Método auxiliar para el frontend
   */
  async obtenerCursosEscuela(escuelaId: string) {
    try {
      const cursos = await Curso.find({ escuelaId: new Types.ObjectId(escuelaId) })
        .select('_id nombre grado grupo director_grupo')
        .sort({ grado: 1, grupo: 1 });

      return cursos;
    } catch (error) {
      console.error('Error al obtener cursos de la escuela:', error);
      throw new ApiError(500, 'Error al obtener cursos de la escuela');
    }
  }
}

export const invitacionService = new InvitacionService();
export default invitacionService;
