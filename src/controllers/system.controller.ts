// src/controllers/system.controller.ts
import { Request, Response, NextFunction } from 'express';
import Escuela from '../models/escuela.model';
import Usuario from '../models/usuario.model';
import mongoose from 'mongoose';
import AuthService from '../services/auth/auth.service';
import ApiError from '../utils/ApiError';

/**
 * Verificar el estado del sistema
 * @route GET /api/system/status
 */
export const checkSystemStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verificar si hay escuelas
    const schoolCount = await Escuela.countDocuments();
    const hasSchools = schoolCount > 0;

    // Verificar si hay administradores
    const adminCount = await Usuario.countDocuments({ tipo: 'ADMIN' });
    const hasAdmins = adminCount > 0;

    // Un sistema se considera inicializado si tiene al menos una escuela y un administrador
    const initialized = hasSchools && hasAdmins;

    res.status(200).json({
      success: true,
      data: {
        initialized,
      },
    });
  } catch (error) {
    console.error('Error en checkSystemStatus:', error);
    next(error);
  }
};

/**
 * Inicializar el sistema con la primera escuela y administrador
 * @route POST /api/system/initialize
 */
export const initializeSystem = async (req: Request, res: Response, next: NextFunction) => {
  let session = null;

  try {
    // Verificar token de setup antes de cualquier operación
    const setupToken = process.env.SYSTEM_SETUP_TOKEN;
    if (!setupToken) {
      throw new ApiError(403, 'Este endpoint no está disponible en este ambiente');
    }
    if (req.headers['x-setup-token'] !== setupToken) {
      throw new ApiError(403, 'Token de inicialización inválido');
    }

    // Verificar si el sistema ya está inicializado
    const schoolCount = await Escuela.countDocuments();
    const adminCount = await Usuario.countDocuments({ tipo: 'ADMIN' });

    if (schoolCount > 0 || adminCount > 0) {
      throw new ApiError(400, 'El sistema ya ha sido inicializado');
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const { escuela, admin } = req.body;

    // Validar el código de la escuela
    if (!escuela.codigo) {
      throw new ApiError(400, 'El código de la escuela es requerido');
    }

    // Crear la escuela - ajustado para coincidir con tu modelo real
    try {
      const periodos = [];
      const numPeriodos = escuela.configuracion.periodos_academicos || 4;

      // Crear períodos académicos
      for (let i = 0; i < numPeriodos; i++) {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() + i * 3);

        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 3);

        periodos.push({
          numero: i + 1,
          nombre: `Periodo ${i + 1}`,
          fecha_inicio: startDate,
          fecha_fin: endDate,
        });
      }

      // Preparar datos de la escuela según el modelo actual
      const escuelaData = {
        nombre: escuela.nombre,
        codigo: escuela.codigo, // Agregamos este campo aunque no esté en el modelo
        direccion: escuela.direccion,
        telefono: escuela.telefono,
        email: escuela.email,
        estado: 'ACTIVO',
        configuracion: {
          periodos_academicos: escuela.configuracion.periodos_academicos,
          escala_calificacion: {
            minima: escuela.configuracion.escala_calificacion.minima,
            maxima: escuela.configuracion.escala_calificacion.maxima,
          },
          logros_por_periodo: 3, // Valor por defecto
        },
        periodos_academicos: periodos,
      };

      const newEscuela = new Escuela(escuelaData);
      await newEscuela.save({ session });
    } catch (error) {
      console.error('Error al crear la escuela:', error);
      throw error;
    }

    // Buscar la escuela recién creada (para asegurarnos de tener el ID)
    const savedEscuela = await Escuela.findOne({}, null, { session });
    if (!savedEscuela) {
      throw new Error('No se pudo crear la escuela');
    }

    // Crear el usuario administrador
    let savedAdmin;
    try {
      const newAdmin = new Usuario({
        ...admin,
        tipo: 'ADMIN',
        estado: 'ACTIVO',
        escuelaId: savedEscuela._id,
      });

      savedAdmin = await newAdmin.save({ session });
    } catch (error) {
      console.error('Error al crear el administrador:', error);
      throw error;
    }

    // Finalizar la transacción
    await session.commitTransaction();
    session.endSession();

    // Responder sin intentar generar tokens (para evitar errores potenciales)
    res.status(201).json({
      success: true,
      message: 'Sistema inicializado correctamente',
      data: {
        escuela: {
          _id: savedEscuela._id,
          nombre: savedEscuela.nombre,
          codigo: escuela.codigo, // Incluimos el código en la respuesta
          email: savedEscuela.email,
        },
        admin: {
          _id: savedAdmin._id,
          nombre: savedAdmin.nombre,
          apellidos: savedAdmin.apellidos,
          email: savedAdmin.email,
          tipo: savedAdmin.tipo,
        },
      },
    });
  } catch (error) {
    console.error('Error en initializeSystem:', error);

    // Revertir transacción si hay una sesión activa
    if (session) {
      try {
        await session.abortTransaction();
        session.endSession();
      } catch (sessionError) {
        console.error('Error al abortar la transacción:', sessionError);
      }
    }

    // Si es un ApiError, pasarlo al siguiente middleware
    if (error instanceof ApiError) {
      next(error);
    } else {
      // Para otros errores, crear un ApiError genérico
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      next(new ApiError(500, `Error al inicializar el sistema: ${errorMessage}`));
    }
  }
};
