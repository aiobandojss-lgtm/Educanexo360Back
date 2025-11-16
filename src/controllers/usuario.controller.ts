import { Request, Response, NextFunction } from 'express';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';

// Extender el tipo Request para incluir el usuario
interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
  };
}

class UsuarioController {
  async obtenerUsuarios(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Agregar soporte para filtro por tipo de usuario
      const tipoUsuario = req.query.tipo as string;
      const searchTerm = req.query.q as string;

      const query: any = { escuelaId: req.user.escuelaId };

      // Agregar filtro por tipo si está especificado
      if (tipoUsuario) {
        query.tipo = tipoUsuario;
      }

      // Agregar búsqueda si hay término de búsqueda
      if (searchTerm) {
        query.$or = [
          { nombre: new RegExp(searchTerm, 'i') },
          { apellidos: new RegExp(searchTerm, 'i') },
          { email: new RegExp(searchTerm, 'i') },
        ];
      }

      const usuarios = await Usuario.find(query).select('-password');

      res.json({
        success: true,
        data: usuarios,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerUsuario(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario está intentando acceder a su propio perfil o si tiene rol administrativo
      const solicitandoPropioUsuario = req.params.id === req.user._id;

      // Incluir RECTOR y COORDINADOR junto con ADMIN como roles con permisos administrativos
      const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);

      // ✅ NUEVO: Verificar si es acudiente intentando ver el perfil de un hijo asociado
      let esHijoAsociado = false;
      if (req.user.tipo === 'ACUDIENTE') {
        // Obtener el perfil del acudiente para verificar sus estudiantes asociados
        const acudiente = await Usuario.findById(req.user._id);
        const estudiantesAsociados = acudiente?.info_academica?.estudiantes_asociados || [];
        esHijoAsociado = estudiantesAsociados.some(
          (estudianteId) => estudianteId.toString() === req.params.id
        );
      }

      // ✅ MODIFICADO: Permitir acceso si es propio perfil, rol administrativo, O hijo asociado
      if (!solicitandoPropioUsuario && !tieneRolAdministrativo && !esHijoAsociado) {
        throw new ApiError(403, 'No tienes permiso para ver este perfil');
      }

      const usuario = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).select('-password');

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      res.json({
        success: true,
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  // Actualización para el método actualizarUsuario

  async actualizarUsuario(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario está intentando actualizar su propio perfil o si tiene rol administrativo
      const actualizandoPropioUsuario = req.params.id === req.user._id;

      // Incluir RECTOR y COORDINADOR como roles administrativos
      const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);

      if (!actualizandoPropioUsuario && !tieneRolAdministrativo) {
        throw new ApiError(403, 'No tienes permiso para modificar este perfil');
      }

      // Si no tiene rol administrativo y está intentando cambiar el email, lo eliminamos de la solicitud
      if (!tieneRolAdministrativo && req.body.email !== req.user.email) {
        delete req.body.email; // Solo los roles administrativos pueden cambiar el email
      }

      // Verificar si están intentando actualizar el email
      if (req.body.email) {
        // Buscar el usuario que se está actualizando para verificar si el email es el mismo
        const usuarioActual = await Usuario.findById(req.params.id);

        if (!usuarioActual) {
          throw new ApiError(404, 'Usuario no encontrado');
        }

        // Solo verificar duplicados si el email está siendo cambiado
        if (usuarioActual.email !== req.body.email) {
          // Verificar si ya existe otro usuario con ese email en la misma escuela
          const emailExistente = await Usuario.findOne({
            email: req.body.email,
            escuelaId: req.user.escuelaId,
            _id: { $ne: req.params.id }, // Excluir el usuario actual de la búsqueda
          });

          if (emailExistente) {
            throw new ApiError(
              400,
              'El correo electrónico ya está en uso por otro usuario de esta escuela',
            );
          }
        }
      }

      // Permitir campos específicos para usuarios no administrativos
      let datosPermitidos = {};

      if (tieneRolAdministrativo) {
        // Los roles administrativos pueden actualizar todos los campos
        datosPermitidos = req.body;
      } else {
        // Usuarios normales solo pueden actualizar campos específicos
        datosPermitidos = {
          nombre: req.body.nombre,
          apellidos: req.body.apellidos,
          perfil: req.body.perfil, // Incluye el teléfono
        };
      }

      const usuario = await Usuario.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        datosPermitidos,
        { new: true, runValidators: true },
      ).select('-password');

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      res.json({
        success: true,
        data: usuario,
      });
    } catch (error) {
      next(error);
    }
  }

  async buscarUsuarios(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const searchTerm = req.query.q as string;
      const filter = {
        escuelaId: req.user.escuelaId,
        $or: [
          { nombre: new RegExp(searchTerm, 'i') },
          { apellidos: new RegExp(searchTerm, 'i') },
          { email: new RegExp(searchTerm, 'i') },
        ],
      };

      const usuarios = await Usuario.find(filter).select('-password').limit(10);

      res.json({
        success: true,
        data: usuarios,
      });
    } catch (error) {
      next(error);
    }
  }

  async cambiarPassword(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { passwordActual, nuevaPassword } = req.body;
      const usuario = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      const isPasswordMatch = await usuario.compararPassword(passwordActual);
      if (!isPasswordMatch) {
        throw new ApiError(400, 'La contraseña actual es incorrecta');
      }

      usuario.password = nuevaPassword;
      await usuario.save();

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminarUsuario(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que solo ADMIN, RECTOR o COORDINADOR puedan eliminar usuarios
      const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);

      if (!tieneRolAdministrativo) {
        throw new ApiError(403, 'No tienes permiso para eliminar usuarios');
      }

      const usuario = await Usuario.findOneAndUpdate(
        {
          _id: req.params.id,
          escuelaId: req.user.escuelaId,
        },
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!usuario) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      res.json({
        success: true,
        message: 'Usuario desactivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // -------- Métodos para la gestión de estudiantes asociados --------

  async obtenerEstudiantesAsociados(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario existe
      const acudiente = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      // Verificar que sea un acudiente
      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Obtener los IDs de estudiantes asociados
      const estudiantesIds = acudiente.info_academica?.estudiantes_asociados || [];

      // Buscar los estudiantes completos
      const estudiantes = await Usuario.find({
        _id: { $in: estudiantesIds },
        escuelaId: req.user.escuelaId,
      }).select('_id nombre apellidos email');

      res.json({
        success: true,
        data: estudiantes,
      });
    } catch (error) {
      next(error);
    }
  }

  async asociarEstudiante(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estudianteId } = req.body;

      if (!estudianteId) {
        throw new ApiError(400, 'ID de estudiante requerido');
      }

      // Verificar si el acudiente existe y es tipo ACUDIENTE
      const acudiente = await Usuario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Verificar si el estudiante existe y es tipo ESTUDIANTE
      const estudiante = await Usuario.findOne({
        _id: estudianteId,
        tipo: 'ESTUDIANTE',
        escuelaId: req.user.escuelaId,
      });

      if (!estudiante) {
        throw new ApiError(404, 'Estudiante no encontrado');
      }

      // Verificar si el estudiante ya está asociado
      const estudiantesAsociados = acudiente.info_academica?.estudiantes_asociados || [];

      if (estudiantesAsociados.some((id) => id.toString() === estudianteId)) {
        throw new ApiError(400, 'El estudiante ya está asociado a este acudiente');
      }

      // Preparar la actualización basada en si info_academica ya existe
      let actualizacion;

      if (acudiente.info_academica) {
        // Si info_academica ya existe, usa $push para añadir a la lista existente
        actualizacion = await Usuario.findOneAndUpdate(
          { _id: req.params.id },
          { $push: { 'info_academica.estudiantes_asociados': estudianteId } },
          { new: true },
        );
      } else {
        // Si info_academica no existe, inicialízala con un array que contenga el estudianteId
        actualizacion = await Usuario.findOneAndUpdate(
          { _id: req.params.id },
          {
            $set: {
              info_academica: {
                estudiantes_asociados: [estudianteId],
              },
            },
          },
          { new: true },
        );
      }

      res.json({
        success: true,
        message: 'Estudiante asociado exitosamente',
        data: actualizacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminarAsociacionEstudiante(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const acudienteId = req.params.id;
      const estudianteId = req.params.estudianteId;

      // Verificar si el acudiente existe
      const acudiente = await Usuario.findOne({
        _id: acudienteId,
        escuelaId: req.user.escuelaId,
      });

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      if (acudiente.tipo !== 'ACUDIENTE') {
        throw new ApiError(400, 'El usuario no es un acudiente');
      }

      // Verificar si el estudiante está asociado
      if (
        !acudiente.info_academica?.estudiantes_asociados?.some(
          (id) => id.toString() === estudianteId,
        )
      ) {
        throw new ApiError(404, 'El estudiante no está asociado a este acudiente');
      }

      // Eliminar el estudiante de la lista de asociados
      await Usuario.findOneAndUpdate(
        { _id: acudienteId },
        { $pull: { 'info_academica.estudiantes_asociados': estudianteId } },
      );

      res.json({
        success: true,
        message: 'Asociación eliminada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new UsuarioController();