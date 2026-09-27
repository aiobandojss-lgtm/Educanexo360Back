import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Notificacion from '../models/notificacion.model';
import Usuario from '../models/usuario.model';
import notificacionService from '../services/notificacion.service';
import pushNotificationService from '../services/pushNotification.service';
import ApiError from '../utils/ApiError';
import { EstadoNotificacion, TipoNotificacion } from '../interfaces/INotificacion';
import { numeroPagina, numeroLimite } from '../utils/paginacion';
import { logger } from '../utils/logger';

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

/**
 * Actualizaciones atómicas (pipeline) de los dispositivos FCM (Fase 4.3). fcmToken/platform (campos
 * antiguos) quedan siempre con el último dispositivo del arreglo, o se quitan si no queda ninguno.
 */
const MAX_DISPOSITIVOS = 5;
const ultimoToken = { $arrayElemAt: ['$fcmTokens', -1] };
const sincronizarCamposAntiguos = {
  $set: {
    fcmToken: { $ifNull: [{ $getField: { field: 'token', input: ultimoToken } }, null] },
    platform: { $ifNull: [{ $getField: { field: 'platform', input: ultimoToken } }, '$$REMOVE'] },
    fcmTokenUpdatedAt: '$$NOW',
  },
};

const AGREGAR_TOKEN = (token: string, platform: string, deviceInfo: Record<string, unknown>) => [
  {
    $set: {
      fcmTokens: {
        $slice: [
          {
            $concatArrays: [
              // Migración perezosa: el token antiguo (fcmToken) entra al arreglo si aún no está
              {
                $cond: [
                  {
                    $and: [
                      { $eq: [{ $type: '$fcmToken' }, 'string'] },
                      { $ne: ['$fcmToken', token] },
                      { $not: [{ $in: ['$fcmToken', { $ifNull: ['$fcmTokens.token', []] }] }] },
                    ],
                  },
                  [
                    {
                      token: '$fcmToken',
                      platform: { $ifNull: ['$platform', 'android'] },
                      updatedAt: { $ifNull: ['$fcmTokenUpdatedAt', '$$NOW'] },
                    },
                  ],
                  [],
                ],
              },
              // Los demás dispositivos (sin el que se registra, que va al final como el más reciente)
              {
                $filter: {
                  input: { $ifNull: ['$fcmTokens', []] },
                  as: 'd',
                  cond: { $ne: ['$$d.token', token] },
                },
              },
              [{ token, platform, deviceInfo, updatedAt: '$$NOW' }],
            ],
          },
          -MAX_DISPOSITIVOS, // se quedan los 5 más recientes: sale el más viejo
        ],
      },
      deviceInfo,
    },
  },
  sincronizarCamposAntiguos,
];

// Quita un dispositivo. El campo antiguo pasa al último dispositivo que quede SOLO si era ese token (o ya
// estaba en el arreglo); un token antiguo aún no migrado a fcmTokens se conserva.
const QUITAR_TOKEN = (token: string) => [
  {
    $set: {
      fcmTokens: {
        $filter: { input: { $ifNull: ['$fcmTokens', []] }, as: 'd', cond: { $ne: ['$$d.token', token] } },
      },
      _resincronizar: {
        $or: [
          { $eq: ['$fcmToken', token] },
          { $in: ['$fcmToken', { $ifNull: ['$fcmTokens.token', []] }] },
        ],
      },
    },
  },
  {
    $set: {
      fcmToken: {
        $cond: [
          '$_resincronizar',
          { $ifNull: [{ $getField: { field: 'token', input: ultimoToken } }, null] },
          '$fcmToken',
        ],
      },
      platform: {
        $cond: [
          '$_resincronizar',
          { $ifNull: [{ $getField: { field: 'platform', input: ultimoToken } }, '$$REMOVE'] },
          { $ifNull: ['$platform', '$$REMOVE'] },
        ],
      },
      fcmTokenUpdatedAt: '$$NOW',
    },
  },
  { $unset: '_resincronizar' },
];

const QUITAR_TODOS_LOS_TOKENS = () => [
  { $set: { fcmTokens: [], fcmToken: null, fcmTokenUpdatedAt: '$$NOW', platform: '$$REMOVE' } },
];

export class NotificacionController {
  // Registrar token FCM (Fase 4.3): AGREGA el dispositivo al arreglo fcmTokens (máx. 5; sale el más viejo).
  // Compatibilidad: las APK viejas envían lo mismo que antes y siguen funcionando; fcmToken (campo antiguo)
  // queda con el último token registrado.
  async registrarTokenFCM(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { fcmToken, deviceInfo } = req.body;

      // fcmToken null: desvincular (las APK 1.0.0 lo envían así al cerrar sesión). Sin token concreto → TODOS
      if (fcmToken === null) {
        await Usuario.updateOne({ _id: req.user._id }, QUITAR_TODOS_LOS_TOKENS());
        res.json({ success: true, message: 'Token FCM eliminado', data: { tokenRegistered: false } });
        return;
      }

      if (!fcmToken) {
        throw new ApiError(400, 'Token FCM es requerido');
      }

      // platform opcional: por defecto 'android' (APK anteriores al 2026-06-10)
      const platform = req.body.platform || 'android';
      if (!['ios', 'android'].includes(platform)) {
        throw new ApiError(400, 'Platform debe ser "ios" o "android"');
      }

      logger.debug(`📱 Registrando token FCM para usuario: ${req.user._id}`);

      const registrar = async () => {
        // Un token pertenece a un solo usuario: quitarlo de cualquier otra cuenta
        // (celular compartido → evita que lleguen push de la cuenta anterior)
        await Usuario.updateMany(
          { _id: { $ne: req.user!._id }, $or: [{ 'fcmTokens.token': fcmToken }, { fcmToken }] },
          QUITAR_TOKEN(fcmToken),
        );
        return Usuario.findOneAndUpdate(
          { _id: req.user!._id },
          AGREGAR_TOKEN(fcmToken, platform, deviceInfo || {}),
          { new: true, projection: { _id: 1, nombre: 1, apellidos: 1 } },
        ).lean();
      };

      let usuarioActualizado: any;
      try {
        usuarioActualizado = await registrar();
      } catch (error: any) {
        // Índice único: otro usuario registró el mismo token en paralelo → se vuelve a quitar y se reintenta
        if (error?.code !== 11000) throw error;
        usuarioActualizado = await registrar();
      }

      if (!usuarioActualizado) {
        throw new ApiError(404, 'Usuario no encontrado');
      }

      logger.debug(`✅ Token FCM registrado para: ${usuarioActualizado.nombre} ${usuarioActualizado.apellidos}`);

      res.json({
        success: true,
        message: 'Token FCM registrado exitosamente',
        data: {
          userId: String(usuarioActualizado._id),
          platform: platform,
          tokenRegistered: true,
        },
      });
    } catch (error) {
      console.error('❌ Error registrando token FCM:', error);
      next(error);
    }
  }

  // Desvincular al cerrar sesión (idempotente). Con token: quita SOLO ese dispositivo. Sin token: todos.
  async desregistrarTokenFCM(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { fcmToken } = req.body;

      const resultado = fcmToken
        ? await Usuario.updateOne(
            { _id: req.user._id, $or: [{ 'fcmTokens.token': fcmToken }, { fcmToken }] },
            QUITAR_TOKEN(fcmToken),
          )
        : await Usuario.updateOne({ _id: req.user._id }, QUITAR_TODOS_LOS_TOKENS());

      res.json({
        success: true,
        message: 'Dispositivo desvinculado',
        data: { tokenRemoved: resultado.modifiedCount > 0 },
      });
    } catch (error) {
      next(error);
    }
  }

  // MÉTODO CORREGIDO: Enviar notificación de prueba
  async enviarNotificacionPrueba(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para enviar notificaciones de prueba');
      }

      const { titulo, mensaje, usuarioId, prioridad = 'NORMAL' } = req.body;

      if (!titulo || !mensaje) {
        throw new ApiError(400, 'Título y mensaje son requeridos');
      }

      let targetUser;
      if (usuarioId) {
        // Solo usuarios del mismo colegio (SUPER_ADMIN no tiene colegio: puede elegir cualquiera)
        const filtroDestino: Record<string, unknown> = { _id: usuarioId };
        if (req.user.tipo !== 'SUPER_ADMIN') filtroDestino.escuelaId = req.user.escuelaId;
        targetUser = await Usuario.findOne(filtroDestino).select('_id nombre apellidos fcmToken fcmTokens');
        if (!targetUser) {
          throw new ApiError(404, 'Usuario objetivo no encontrado');
        }
      } else {
        targetUser = await Usuario.findById(req.user._id).select('_id nombre apellidos fcmToken fcmTokens');
      }

      // Fase 4.3: el dispositivo más reciente del arreglo (o el campo antiguo si aún no migró)
      const dispositivos = (targetUser as any)?.fcmTokens || [];
      const tokenDestino: string | undefined =
        dispositivos.length > 0 ? dispositivos[dispositivos.length - 1].token : targetUser?.fcmToken || undefined;
      if (!targetUser || !tokenDestino) {
        throw new ApiError(400, 'El usuario no tiene token FCM registrado');
      }

      logger.debug(`🧪 Enviando notificación de prueba a: ${targetUser.nombre} ${targetUser.apellidos}`);

      const resultado = await pushNotificationService.enviarNotificacion({
        token: tokenDestino,
        titulo,
        mensaje,
        data: {
          tipo: 'test',
          prioridad,
          timestamp: Date.now().toString(),
        },
      });

      await notificacionService.crearNotificacion({
        usuarioId: (targetUser._id as mongoose.Types.ObjectId).toString(),
        titulo: `[PRUEBA] ${titulo}`,
        mensaje,
        tipo: TipoNotificacion.SISTEMA,
        escuelaId: req.user.escuelaId,
        metadata: {
          isPrueba: true,
          enviadoPor: req.user._id,
          enviado: new Date().toISOString(),
        },
        enviarEmail: false,
      });

      res.json({
        success: true,
        message: 'Notificación de prueba enviada',
        data: {
          target: `${targetUser.nombre} ${targetUser.apellidos}`,
          sent: resultado.success,
          messageId: resultado.messageId,
        },
      });
    } catch (error) {
      console.error('❌ Error enviando notificación de prueba:', error);
      next(error);
    }
  }

  // Métodos existentes del controlador original
  async obtenerNotificaciones(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { estado = 'todas', pagina = 1, limite = 20, tipo } = req.query;

      const opciones = {
        pagina: numeroPagina(pagina),
        limite: numeroLimite(limite, 20),
      };

      const filtro: any = {
        usuarioId: req.user._id,
        escuelaId: req.user.escuelaId,
      };

      if (estado !== 'todas') {
        filtro.estado = estado;
      }

      if (tipo) {
        filtro.tipo = tipo;
      }

      const skip = (opciones.pagina - 1) * opciones.limite;
      const notificaciones = await Notificacion.find(filtro)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(opciones.limite)
        .populate('entidadId');

      const total = await Notificacion.countDocuments(filtro);

      const pendientes = await Notificacion.countDocuments({
        usuarioId: req.user._id,
        estado: EstadoNotificacion.PENDIENTE,
      });

      res.json({
        success: true,
        data: notificaciones,
        meta: {
          total,
          pendientes,
          pagina: opciones.pagina,
          limite: opciones.limite,
          totalPaginas: Math.ceil(total / opciones.limite),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async marcarComoLeida(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;
      const notificacion = await notificacionService.marcarComoLeida(id, req.user._id);

      if (!notificacion) {
        throw new ApiError(404, 'Notificación no encontrada');
      }

      res.json({
        success: true,
        data: notificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async marcarTodasComoLeidas(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const cantidadActualizada = await notificacionService.marcarTodasComoLeidas(req.user._id);

      res.json({
        success: true,
        message: `${cantidadActualizada} notificaciones marcadas como leídas`,
        data: { cantidadActualizada },
      });
    } catch (error) {
      next(error);
    }
  }

  async archivarNotificacion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;
      const notificacion = await notificacionService.archivarNotificacion(id, req.user._id);

      if (!notificacion) {
        throw new ApiError(404, 'Notificación no encontrada');
      }

      res.json({
        success: true,
        data: notificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async crearNotificacion(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tiene permisos para crear notificaciones');
      }

      const {
        usuarioId,
        titulo,
        mensaje,
        tipo,
        entidadId,
        entidadTipo,
        metadata,
        enviarEmail = false,
      } = req.body;

      const notificacion = await notificacionService.crearNotificacion({
        usuarioId,
        titulo,
        mensaje,
        tipo,
        escuelaId: req.user.escuelaId,
        entidadId,
        entidadTipo,
        metadata,
        enviarEmail,
      });

      res.status(201).json({
        success: true,
        data: notificacion,
      });
    } catch (error) {
      next(error);
    }
  }

  async crearNotificacionMasiva(req: RequestWithUser, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tiene permisos para crear notificaciones masivas');
      }

      const {
        usuarioIds,
        titulo,
        mensaje,
        tipo,
        entidadId,
        entidadTipo,
        metadata,
        enviarEmail = false,
      } = req.body;

      if (!usuarioIds || !Array.isArray(usuarioIds) || usuarioIds.length === 0) {
        throw new ApiError(400, 'Debe especificar al menos un usuario destinatario');
      }

      const notificaciones = await notificacionService.crearNotificacionMasiva({
        usuarioIds,
        titulo,
        mensaje,
        tipo,
        escuelaId: req.user.escuelaId,
        entidadId,
        entidadTipo,
        metadata,
        enviarEmail,
      });

      res.status(201).json({
        success: true,
        message: `${notificaciones.length} notificaciones creadas exitosamente`,
        data: { count: notificaciones.length },
      });
    } catch (error) {
      next(error);
    }
  }
}

const notificacionController = new NotificacionController();
export default notificacionController;