import mongoose from 'mongoose';
import PerfilRol from '../models/perfilRol.model';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';
import { IPerfilRolLean } from '../interfaces/IPerfilRol';
import { Permission, ALL_PERMISSIONS, DEFAULT_PERMISSIONS_BY_ROLE } from '../constants/permissions';

// ── Tipos internos ──────────────────────────────────────────────────────────

interface CrearPerfilRolDto {
  nombre: string;
  descripcion?: string;
  rolBase: string;
  permisos: Permission[];
  escuelaId: string;
  creadoPor: string;
}

interface ActualizarPerfilRolDto {
  nombre?: string;
  descripcion?: string;
  permisos?: Permission[];
  activo?: boolean;
}

// ── Servicio ────────────────────────────────────────────────────────────────

const perfilRolService = {

  /**
   * Crea un nuevo perfil de rol para una escuela.
   * Un perfil extiende a un rol base (ej: DOCENTE) con permisos específicos.
   */
  async crear(dto: CrearPerfilRolDto): Promise<IPerfilRolLean> {
    const existente = await PerfilRol.findOne({
      escuelaId: dto.escuelaId,
      nombre: { $regex: new RegExp(`^${dto.nombre}$`, 'i') },
    });

    if (existente) {
      throw new ApiError(409, `Ya existe un perfil de rol con el nombre "${dto.nombre}" en esta escuela`);
    }

    const perfil = new PerfilRol({
      nombre: dto.nombre,
      descripcion: dto.descripcion,
      rolBase: dto.rolBase,
      permisos: dto.permisos,
      escuelaId: new mongoose.Types.ObjectId(dto.escuelaId),
      creadoPor: new mongoose.Types.ObjectId(dto.creadoPor),
      activo: true,
    });

    await perfil.save();
    return perfil.toObject() as IPerfilRolLean;
  },

  /**
   * Lista todos los perfiles de rol activos de una escuela.
   */
  async listarPorEscuela(escuelaId: string): Promise<IPerfilRolLean[]> {
    const perfiles = await PerfilRol.find({ escuelaId, activo: true })
      .populate('creadoPor', 'nombre apellidos')
      .sort({ rolBase: 1, nombre: 1 })
      .lean();

    return perfiles as IPerfilRolLean[];
  },

  /**
   * Obtiene un perfil de rol por su ID, validando que pertenece a la escuela.
   */
  async obtenerPorId(perfilId: string, escuelaId: string): Promise<IPerfilRolLean> {
    if (!mongoose.Types.ObjectId.isValid(perfilId)) {
      throw new ApiError(400, 'ID de perfil de rol inválido');
    }

    const perfil = await PerfilRol.findOne({ _id: perfilId, escuelaId }).lean();

    if (!perfil) {
      throw new ApiError(404, 'Perfil de rol no encontrado');
    }

    return perfil as IPerfilRolLean;
  },

  /**
   * Actualiza nombre, descripción, permisos o estado activo de un perfil.
   */
  async actualizar(
    perfilId: string,
    escuelaId: string,
    dto: ActualizarPerfilRolDto,
  ): Promise<IPerfilRolLean> {
    if (!mongoose.Types.ObjectId.isValid(perfilId)) {
      throw new ApiError(400, 'ID de perfil de rol inválido');
    }

    // Verificar nombre único si se está cambiando
    if (dto.nombre) {
      const existente = await PerfilRol.findOne({
        escuelaId,
        nombre: { $regex: new RegExp(`^${dto.nombre}$`, 'i') },
        _id: { $ne: perfilId },
      });

      if (existente) {
        throw new ApiError(409, `Ya existe un perfil de rol con el nombre "${dto.nombre}" en esta escuela`);
      }
    }

    const perfil = await PerfilRol.findOneAndUpdate(
      { _id: perfilId, escuelaId },
      { $set: dto },
      { new: true, runValidators: true },
    ).lean();

    if (!perfil) {
      throw new ApiError(404, 'Perfil de rol no encontrado');
    }

    // Si se actualizaron los permisos, propagarlos a todos los usuarios con este perfil
    if (dto.permisos !== undefined) {
      await Usuario.updateMany(
        { perfilRolId: new mongoose.Types.ObjectId(perfilId) },
        { $set: { permisos: perfil.permisos } },
      );
    }

    return perfil as IPerfilRolLean;
  },

  /**
   * Elimina un perfil de rol.
   * Antes de eliminar, quita el perfilRolId a todos los usuarios que lo tengan asignado.
   */
  async eliminar(perfilId: string, escuelaId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(perfilId)) {
      throw new ApiError(400, 'ID de perfil de rol inválido');
    }

    const perfil = await PerfilRol.findOne({ _id: perfilId, escuelaId });

    if (!perfil) {
      throw new ApiError(404, 'Perfil de rol no encontrado');
    }

    // Reasignar usuarios que tenían este perfil — quedan sin perfil personalizado
    await Usuario.updateMany(
      { perfilRolId: perfilId, escuelaId },
      { $unset: { perfilRolId: 1 }, $set: { permisos: [] } },
    );

    await perfil.deleteOne();
  },

  /**
   * Asigna un perfil de rol a un usuario.
   * Valida que el rolBase del perfil coincida con el tipo del usuario.
   */
  async asignarAUsuario(
    usuarioId: string,
    perfilRolId: string,
    escuelaId: string,
  ): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(usuarioId) || !mongoose.Types.ObjectId.isValid(perfilRolId)) {
      throw new ApiError(400, 'IDs inválidos');
    }

    const [usuario, perfil] = await Promise.all([
      Usuario.findOne({ _id: usuarioId, escuelaId }),
      PerfilRol.findOne({ _id: perfilRolId, escuelaId, activo: true }),
    ]);

    if (!usuario) throw new ApiError(404, 'Usuario no encontrado en esta escuela');
    if (!perfil) throw new ApiError(404, 'Perfil de rol no encontrado o inactivo');

    // El tipo del usuario debe coincidir con el rolBase del perfil
    if (usuario.tipo !== perfil.rolBase) {
      throw new ApiError(
        400,
        `Este perfil es para usuarios de tipo "${perfil.rolBase}", pero el usuario es "${usuario.tipo}"`,
      );
    }

    await Usuario.updateOne(
      { _id: usuarioId },
      {
        $set: {
          perfilRolId: new mongoose.Types.ObjectId(perfilRolId),
          rolBase: perfil.rolBase,
          permisos: perfil.permisos,
        },
      },
    );
  },

  /**
   * Remueve el perfil personalizado de un usuario, dejándolo con el rol base puro.
   */
  async removerDeUsuario(usuarioId: string, escuelaId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(usuarioId)) {
      throw new ApiError(400, 'ID de usuario inválido');
    }

    const usuario = await Usuario.findOne({ _id: usuarioId, escuelaId });

    if (!usuario) throw new ApiError(404, 'Usuario no encontrado en esta escuela');

    await Usuario.updateOne(
      { _id: usuarioId },
      { $unset: { perfilRolId: 1, rolBase: 1 }, $set: { permisos: [] } },
    );
  },

  /**
   * Devuelve el catálogo completo de permisos disponibles en el sistema.
   * Útil para que el frontend muestre checkboxes al ADMIN.
   */
  obtenerCatalogoPermisos(): { permiso: string; modulo: string; accion: string }[] {
    return ALL_PERMISSIONS.map((p) => {
      const [modulo, accion] = p.split('.');
      return { permiso: p, modulo, accion };
    });
  },

  /**
   * Devuelve los permisos por defecto sugeridos para un rol base.
   * Útil como punto de partida al crear un perfil nuevo.
   */
  obtenerPermisosSugeridos(rolBase: string): Permission[] {
    return DEFAULT_PERMISSIONS_BY_ROLE[rolBase] ?? [];
  },
};

export default perfilRolService;
