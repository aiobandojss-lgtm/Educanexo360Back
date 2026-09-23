import { Request, Response, NextFunction } from 'express';
import Escuela from '../models/escuela.model';
import ApiError from '../utils/ApiError';
import mongoose from 'mongoose';

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

// Tipo explícito para el documento de Escuela
interface EscuelaDocument {
  _id: mongoose.Types.ObjectId;
  nombre: string;
  codigo?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  sitioWeb?: string;
  logo?: string;
  descripcion?: string;
  [key: string]: any; // Para otras propiedades que pueda tener
}

// Verifica que el usuario opere sobre su propia escuela (SUPER_ADMIN puede operar sobre cualquiera)
const verificarAccesoEscuela = (req: Request, escuelaId: string): void => {
  const currentUser = (req as RequestWithUser).user;
  if (!currentUser) {
    throw new ApiError(401, 'No autorizado');
  }
  if (currentUser.tipo === 'SUPER_ADMIN') {
    return;
  }
  if (!currentUser.escuelaId || String(currentUser.escuelaId) !== String(escuelaId)) {
    throw new ApiError(403, 'No tienes permiso sobre esta escuela');
  }
};

class EscuelaController {
  async crear(req: Request, res: Response, next: NextFunction) {
    try {
      const escuela = await Escuela.create(req.body);
      res.status(201).json({
        success: true,
        data: escuela,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtener(req: Request, res: Response, next: NextFunction) {
    try {
      const currentUser = (req as RequestWithUser).user;
      if (!currentUser) {
        throw new ApiError(401, 'No autorizado');
      }

      // SUPER_ADMIN ve todas; los demás solo su propia escuela (se mantiene la forma de lista)
      let escuelas: unknown[] = [];
      if (currentUser.tipo === 'SUPER_ADMIN') {
        escuelas = await Escuela.find();
      } else if (currentUser.escuelaId) {
        escuelas = await Escuela.find({ _id: currentUser.escuelaId });
      }

      res.json({
        success: true,
        data: escuelas,
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerPorId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userRequest = req as RequestWithUser;
      const currentUser = userRequest.user;

      if (!currentUser) {
        throw new ApiError(401, 'No autorizado');
        return;
      }

      // Usamos type assertion para el documento
      const escuela = (await Escuela.findById(req.params.id)) as unknown as EscuelaDocument;

      if (!escuela) {
        throw new ApiError(404, 'Escuela no encontrada');
        return;
      }

      // Convertimos ambos IDs a string para comparar
      const escuelaIdStr = String(escuela._id);
      const userEscuelaIdStr = String(currentUser.escuelaId);

      // Verificar que el usuario solo pueda ver su propia escuela (SUPER_ADMIN puede ver cualquiera)
      if (userEscuelaIdStr !== escuelaIdStr && currentUser.tipo !== 'SUPER_ADMIN') {
        throw new ApiError(403, 'No tienes permiso para ver esta escuela');
        return;
      }

      // Para administradores, devolver la información completa
      if (currentUser.tipo === 'ADMIN' || currentUser.tipo === 'SUPER_ADMIN') {
        res.json({
          success: true,
          data: escuela,
        });
        return;
      }

      // Para otros roles, devolver solo información pública
      const informacionPublica = {
        _id: escuela._id,
        nombre: escuela.nombre,
        codigo: escuela.codigo || '',
        direccion: escuela.direccion || '',
        telefono: escuela.telefono || '',
        email: escuela.email || '',
        sitioWeb: escuela.sitioWeb || '',
        logo: escuela.logo || '',
        descripcion: escuela.descripcion || '',
        periodos_academicos: escuela.periodos_academicos || [],
      };

      res.json({
        success: true,
        data: informacionPublica,
      });
      return;
    } catch (error) {
      next(error);
      return;
    }
  }

  async actualizar(req: Request, res: Response, next: NextFunction) {
    try {
      verificarAccesoEscuela(req, req.params.id);

      // Lista blanca de campos editables; estado y codigo solo los cambia SUPER_ADMIN
      const esSuperAdmin = (req as RequestWithUser).user?.tipo === 'SUPER_ADMIN';
      const { nombre, direccion, telefono, email, estado, codigo } = req.body;
      const datos: Record<string, unknown> = { nombre, direccion, telefono, email };
      if (esSuperAdmin) {
        datos.estado = estado;
        datos.codigo = codigo;
      }

      const escuela = await Escuela.findByIdAndUpdate(req.params.id, datos, {
        new: true,
        runValidators: true,
      });

      if (!escuela) {
        throw new ApiError(404, 'Escuela no encontrada');
      }

      res.json({
        success: true,
        data: escuela,
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminar(req: Request, res: Response, next: NextFunction) {
    try {
      const escuela = await Escuela.findByIdAndUpdate(
        req.params.id,
        { estado: 'INACTIVO' },
        { new: true },
      );

      if (!escuela) {
        throw new ApiError(404, 'Escuela no encontrada');
      }

      res.json({
        success: true,
        message: 'Escuela desactivada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizarConfiguracion(req: Request, res: Response, next: NextFunction) {
    try {
      verificarAccesoEscuela(req, req.params.id);

      const escuela = await Escuela.findByIdAndUpdate(
        req.params.id,
        { configuracion: req.body },
        { new: true, runValidators: true },
      );

      if (!escuela) {
        throw new ApiError(404, 'Escuela no encontrada');
      }

      res.json({
        success: true,
        data: escuela,
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizarPeriodosAcademicos(req: Request, res: Response, next: NextFunction) {
    try {
      verificarAccesoEscuela(req, req.params.id);

      const escuela = await Escuela.findByIdAndUpdate(
        req.params.id,
        { periodos_academicos: req.body.periodos_academicos },
        { new: true, runValidators: true },
      );

      if (!escuela) {
        throw new ApiError(404, 'Escuela no encontrada');
      }

      res.json({
        success: true,
        data: escuela,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new EscuelaController(); // Exportamos una instancia por defecto
