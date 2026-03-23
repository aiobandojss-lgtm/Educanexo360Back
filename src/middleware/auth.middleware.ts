import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';
import { jwtConfig } from '../config/jwt.config';

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

interface JwtPayload {
  sub: string;
  tipo: string;
  escuelaId?: string; // Hecho opcional para evitar errores
  user?: any; // Added to support user data in token
}

interface MongooseUser extends mongoose.Document {
  _id: mongoose.Types.ObjectId;
  escuelaId?: mongoose.Types.ObjectId; // Hecho opcional para SUPER_ADMIN
  email: string;
  tipo: string;
  nombre: string;
  apellidos: string;
  estado: string;
}

export const authenticate = async (req: RequestWithUser, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'No autorizado - Token no proporcionado');
    }

    const token = authHeader.substring(7);

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    } catch (verifyError) {
      console.error('Error al verificar token JWT');
      throw new ApiError(401, 'No autorizado - Token inválido o expirado');
    }

    const user = (await Usuario.findById(decoded.sub).select('-password')) as MongooseUser;

    if (!user) {
      throw new ApiError(401, 'No autorizado - Usuario no encontrado');
    }

    if (user.estado !== 'ACTIVO') {
      throw new ApiError(401, 'No autorizado - Usuario inactivo');
    }

    // Manejar caso especial para SUPER_ADMIN que puede no tener escuelaId
    if (user.tipo === 'SUPER_ADMIN' && !user.escuelaId) {
      req.user = {
        _id: user._id.toString(),
        escuelaId: '', // String vacío para mantener la compatibilidad con la interfaz
        tipo: user.tipo,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        estado: user.estado,
      };
    } else {
      req.user = {
        _id: user._id.toString(),
        escuelaId: user.escuelaId ? user.escuelaId.toString() : '', // Protección adicional
        tipo: user.tipo,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        estado: user.estado,
      };
    }

    next();
  } catch (error) {
    console.error('Error de autenticación');
    next(new ApiError(401, 'No autorizado - Token inválido'));
  }
};

// Roles administrativos que pueden tener acceso a las funcionalidades administrativas
const ROLES_ADMINISTRATIVOS = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'];

// Función de autorización mejorada que permite acceso a roles administrativos adicionales
export const authorize = (...allowedRoles: string[]) => {
  return (req: RequestWithUser, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado - Usuario no autenticado');
    }

    // Verificar si el usuario tiene un rol administrativo para ciertos accesos
    if (allowedRoles.includes('ADMIN') && ROLES_ADMINISTRATIVOS.includes(req.user.tipo)) {
      next();
      return;
    }

    // Si no es un caso especial administrativo, verificar las reglas normales
    if (!allowedRoles.includes(req.user.tipo)) {
      throw new ApiError(403, 'Prohibido - No tiene permisos suficientes');
    }

    next();
  };
};

// Helper para verificar si un usuario tiene acceso administrativo
export const hasAdminAccess = (userType: string): boolean => {
  return ROLES_ADMINISTRATIVOS.includes(userType);
};

export const authenticateDownload = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    let token = '';

    // Primero intentar obtener el token del header de Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Si no existe en el header, intentar obtenerlo del query param
    else if (req.query.token) {
      token = req.query.token as string;
    }

    // Si no hay token, retornar error de autenticación
    if (!token) {
      throw new ApiError(401, 'No autorizado: Token no proporcionado');
    }

    // Verificar el token
    const decoded = jwt.verify(
      token,
      jwtConfig.secret,
    ) as JwtPayload;

    // Obtener el usuario desde la base de datos (igual que en authenticate)
    const user = (await Usuario.findById(decoded.sub).select('-password')) as MongooseUser;

    if (!user) {
      throw new ApiError(401, 'No autorizado - Usuario no encontrado');
    }

    if (user.estado !== 'ACTIVO') {
      throw new ApiError(401, 'No autorizado - Usuario inactivo');
    }

    // Asignar el usuario al request
    // Manejar caso especial para SUPER_ADMIN que puede no tener escuelaId
    if (user.tipo === 'SUPER_ADMIN' && !user.escuelaId) {
      req.user = {
        _id: user._id.toString(),
        escuelaId: '', // String vacío para mantener la compatibilidad con la interfaz
        tipo: user.tipo,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        estado: user.estado,
      };
    } else {
      req.user = {
        _id: user._id.toString(),
        escuelaId: user.escuelaId ? user.escuelaId.toString() : '', // Protección adicional
        tipo: user.tipo,
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        estado: user.estado,
      };
    }

    next();
  } catch (error) {
    // Si el token es inválido o ha expirado
    next(new ApiError(401, 'No autorizado: Token inválido o expirado'));
  }
};

// Middleware específico para verificar si un usuario puede ver cualquier perfil
export const canViewUserProfiles = (req: RequestWithUser, _res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new ApiError(401, 'No autorizado - Usuario no autenticado');
  }

  // Los roles ADMIN, RECTOR y COORDINADOR pueden ver cualquier perfil
  if (['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo)) {
    next();
    return;
  }

  // Para otros roles, solo pueden ver su propio perfil (esto se maneja en el controlador)
  next();
};
