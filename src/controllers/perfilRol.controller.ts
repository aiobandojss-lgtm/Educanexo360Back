import { Request, Response, NextFunction } from 'express';
import perfilRolService from '../services/perfilRol.service';
import { Permission } from '../constants/permissions';

interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
  };
}

const perfilRolController = {

  /**
   * GET /api/perfiles-rol
   * Lista todos los perfiles de rol activos de la escuela del ADMIN autenticado.
   */
  async listar(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;
      const perfiles = await perfilRolService.listarPorEscuela(escuelaId);

      res.json({
        success: true,
        data: perfiles,
        total: perfiles.length,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/perfiles-rol/:id
   * Obtiene un perfil de rol por ID.
   */
  async obtener(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;
      const perfil = await perfilRolService.obtenerPorId(req.params.id, escuelaId);

      res.json({ success: true, data: perfil });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/perfiles-rol
   * Crea un nuevo perfil de rol para la escuela.
   */
  async crear(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;
      const creadoPor = req.user!._id;

      const perfil = await perfilRolService.crear({
        nombre: req.body.nombre,
        descripcion: req.body.descripcion,
        rolBase: req.body.rolBase,
        permisos: req.body.permisos as Permission[],
        escuelaId,
        creadoPor,
      });

      res.status(201).json({ success: true, data: perfil });
    } catch (error) {
      next(error);
    }
  },

  /**
   * PUT /api/perfiles-rol/:id
   * Actualiza nombre, descripción, permisos o estado activo.
   */
  async actualizar(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;

      const perfil = await perfilRolService.actualizar(req.params.id, escuelaId, {
        nombre: req.body.nombre,
        descripcion: req.body.descripcion,
        permisos: req.body.permisos as Permission[] | undefined,
        activo: req.body.activo,
      });

      res.json({ success: true, data: perfil });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/perfiles-rol/:id
   * Elimina un perfil y reasigna usuarios afectados al rol base puro.
   */
  async eliminar(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;
      await perfilRolService.eliminar(req.params.id, escuelaId);

      res.json({
        success: true,
        message: 'Perfil de rol eliminado. Los usuarios afectados conservan su tipo base.',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/perfiles-rol/usuarios/:usuarioId/asignar
   * Asigna un perfil de rol a un usuario de la escuela.
   */
  async asignarAUsuario(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;

      await perfilRolService.asignarAUsuario(
        req.params.usuarioId,
        req.body.perfilRolId,
        escuelaId,
      );

      res.json({ success: true, message: 'Perfil de rol asignado correctamente' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/perfiles-rol/usuarios/:usuarioId/perfil
   * Remueve el perfil personalizado de un usuario.
   */
  async removerDeUsuario(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      const escuelaId = req.user!.escuelaId;
      await perfilRolService.removerDeUsuario(req.params.usuarioId, escuelaId);

      res.json({ success: true, message: 'Perfil de rol removido. El usuario conserva su tipo base.' });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/perfiles-rol/catalogo/permisos
   * Devuelve el catálogo completo de permisos disponibles.
   */
  async obtenerCatalogoPermisos(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const catalogo = perfilRolService.obtenerCatalogoPermisos();
      res.json({ success: true, data: catalogo });
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/perfiles-rol/catalogo/sugeridos/:rolBase
   * Devuelve los permisos sugeridos para un rol base como punto de partida.
   */
  async obtenerPermisosSugeridos(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { rolBase } = req.params;
      const permisos = perfilRolService.obtenerPermisosSugeridos(rolBase);
      res.json({ success: true, data: permisos });
    } catch (error) {
      next(error);
    }
  },
};

export default perfilRolController;
