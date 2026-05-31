import { Request, Response, NextFunction } from 'express';
import invitacionService from '../services/invitacion.service';
import { TipoInvitacion, EstadoInvitacion } from '../models/invitacion.model';
import { catchAsync } from '../utils/catchAsync';

interface CustomRequest extends Request {
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

export const crearInvitacion = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    console.log('Creando invitación, datos de usuario:', req.user);
    const { tipo, cursoId, estudianteId, cantidadUsos, fechaExpiracion, datosAdicionales } =
      req.body;

    // Corregido: Usar req.user en lugar de req.usuario
    const escuelaId = req.body.escuelaId || (req.user?.escuelaId as string);
    const creadorId = req.user?._id as string;

    console.log('Datos para crear invitación:', {
      tipo,
      escuelaId,
      creadorId,
      cursoId: cursoId || 'No proporcionado',
    });

    const invitacion = await invitacionService.crearInvitacion({
      tipo,
      escuelaId,
      cursoId,
      estudianteId,
      creadorId,
      cantidadUsos,
      fechaExpiracion: fechaExpiracion ? new Date(fechaExpiracion) : undefined,
      datosAdicionales,
    });

    res.status(201).json({
      success: true,
      data: invitacion,
      message: 'Invitación creada exitosamente',
    });
  },
);

export const validarCodigo = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { codigo } = req.body;

  const resultado = await invitacionService.validarCodigo(codigo);

  res.status(200).json({
    success: true,
    data: resultado,
    message: 'Código de invitación válido',
  });
});

export const obtenerInvitacionesPorCurso = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { cursoId } = req.params;
    const { estado } = req.query;

    const invitaciones = await invitacionService.obtenerInvitacionesPorCurso(
      cursoId,
      estado as EstadoInvitacion,
    );

    res.status(200).json({
      success: true,
      data: invitaciones,
      message: 'Invitaciones obtenidas exitosamente',
    });
  },
);

export const revocarInvitacion = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const resultado = await invitacionService.revocarInvitacion(id);

    res.status(200).json({
      success: true,
      message: resultado.message,
    });
  },
);

export const obtenerInvitacionPorId = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    const invitacion = await invitacionService.obtenerInvitacionPorId(id);

    res.status(200).json({
      success: true,
      data: invitacion,
      message: 'Invitación obtenida exitosamente',
    });
  },
);

export const obtenerInvitacionesEscuela = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    // Corregido: Usar req.user en lugar de req.usuario
    const escuelaId = req.params.escuelaId || (req.user?.escuelaId as string);
    const { estado } = req.query;
    const pagina = parseInt(req.query.pagina as string) || 1;
    const limite = parseInt(req.query.limite as string) || 10;

    console.log('Obteniendo invitaciones con escuelaId:', escuelaId);
    console.log('Estado filtro:', estado);
    console.log('Pagina:', pagina, 'Limite:', limite);

    const resultado = await invitacionService.obtenerInvitacionesEscuela(
      escuelaId,
      estado as EstadoInvitacion,
      pagina,
      limite,
    );

    console.log('Invitaciones encontradas:', resultado.invitaciones.length);

    res.status(200).json({
      success: true,
      data: resultado,
      message: 'Invitaciones obtenidas exitosamente',
    });
  },
);
