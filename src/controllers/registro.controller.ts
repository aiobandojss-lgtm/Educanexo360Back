import { Request, Response, NextFunction } from 'express';
import registroService from '../services/registro.service';
import { EstadoSolicitud } from '../models/solicitud-registro.model';
import { catchAsync } from '../utils/catchAsync';
import ApiError from '../utils/ApiError';

// El middleware authenticate coloca el usuario en req.user (no en req.usuario).
// Declarado aquí con la MISMA forma que src/@types: ts-node (npm run dev) no carga la augmentación global.
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

// Filtro de escuela obligatorio: sin escuelaId no se puede operar sobre solicitudes
const obtenerEscuelaId = (req: CustomRequest): string => {
  const escuelaId = req.user?.escuelaId;
  if (!escuelaId) {
    throw new ApiError(403, 'No tiene una escuela asociada');
  }
  return escuelaId;
};

export const crearSolicitud = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { invitacionId, nombre, apellidos, email, telefono, estudiantes } = req.body;

    const resultado = await registroService.crearSolicitud({
      invitacionId,
      nombre,
      apellidos,
      email,
      telefono,
      estudiantes,
    });

    // Preparar respuesta con advertencias si las hay
    const response: any = {
      success: true,
      data: resultado.solicitud,
      message:
        'Solicitud de registro creada exitosamente. Un administrador revisará su solicitud en breve.',
    };

    // Añadir advertencias a la respuesta si existen
    if (resultado.advertencias && resultado.advertencias.length > 0) {
      response.advertencias = resultado.advertencias;
      response.message +=
        ' Nota: Se han realizado algunos ajustes automáticos en los emails de los estudiantes.';
    }

    res.status(201).json(response);
  },
);

export const aprobarSolicitud = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const usuarioAdminId = req.user?._id as string;
    const escuelaId = obtenerEscuelaId(req);

    const resultado = await registroService.aprobarSolicitud(id, usuarioAdminId, escuelaId);

    res.status(200).json({
      success: true,
      data: resultado,
      message: 'Solicitud aprobada exitosamente',
    });
  },
);

export const rechazarSolicitud = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuarioAdminId = req.user?._id as string;
    const escuelaId = obtenerEscuelaId(req);

    const resultado = await registroService.rechazarSolicitud(
      id,
      usuarioAdminId,
      motivo,
      escuelaId,
    );

    res.status(200).json({
      success: true,
      message: 'Solicitud rechazada exitosamente',
    });
  },
);

export const obtenerSolicitudesPendientes = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const escuelaId = obtenerEscuelaId(req);
    const pagina = parseInt(req.query.pagina as string) || 1;
    const limite = parseInt(req.query.limite as string) || 10;

    const resultado = await registroService.obtenerSolicitudesPendientes(escuelaId, pagina, limite);

    res.status(200).json({
      success: true,
      data: resultado,
      message: 'Solicitudes pendientes obtenidas exitosamente',
    });
  },
);

export const obtenerSolicitudPorId = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const escuelaId = obtenerEscuelaId(req);

    const solicitud = await registroService.obtenerSolicitudPorId(id, escuelaId);

    res.status(200).json({
      success: true,
      data: solicitud,
      message: 'Solicitud obtenida exitosamente',
    });
  },
);

export const obtenerHistorialSolicitudes = catchAsync(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const escuelaId = obtenerEscuelaId(req);
    const { estado } = req.query;
    const pagina = parseInt(req.query.pagina as string) || 1;
    const limite = parseInt(req.query.limite as string) || 10;

    const resultado = await registroService.obtenerHistorialSolicitudes(
      escuelaId,
      estado as EstadoSolicitud,
      pagina,
      limite,
    );

    res.status(200).json({
      success: true,
      data: resultado,
      message: 'Historial de solicitudes obtenido exitosamente',
    });
  },
);
