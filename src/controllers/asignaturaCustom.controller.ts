// src/controllers/asignaturaCustom.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Asignatura from '../models/asignatura.model';
import ApiError from '../utils/ApiError';

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

export const obtenerAsignaturasNoAsignadasAlCurso = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    const result = await Asignatura.find({ escuelaId: req.user.escuelaId });

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error obteniendo asignaturas disponibles:', error);
    next(error);
    // Añade esta línea:
    return; // Para indicar que el camino de ejecución termina aquí
  }
};
