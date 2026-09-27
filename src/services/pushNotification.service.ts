import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import { logger } from '../utils/logger';
import { encolar, NuevoTrabajo } from '../queue/outbox';

/**
 * Notificaciones push (FCM) — Fase 4.3.
 *
 * - Varios dispositivos por usuario: fcmTokens[] (máx. 5) + fcmToken (último, compatibilidad).
 * - encolarPush(): los envíos pasan por la cola en trabajos de ~50 usuarios (nada de FCM dentro del request).
 * - El worker lee los tokens de esos usuarios en UNA consulta y envía con sendEachForMulticast en bloques
 *   de 500; los tokens inválidos se limpian con un solo $pull.
 * - PUSH_PROVIDER=simulado (pruebas): no llama a Firebase; guarda en la colección push_simulado y trata los
 *   tokens que empiezan por 'invalido' como no registrados.
 * - Los datos (data) que recibe la app no cambian: tipo, mensajeId, tareaId, anuncioId, eventoId...
 */

interface NotificacionData {
  token: string;
  titulo: string;
  mensaje: string;
  data?: Record<string, string>;
  imageUrl?: string;
  sound?: string;
  badge?: number;
}

interface NotificacionMasiva {
  tokens: string[];
  titulo: string;
  mensaje: string;
  data?: Record<string, string>;
}

export interface ContenidoPush {
  titulo: string;
  mensaje: string;
  data?: Record<string, unknown>;
  sound?: string;
}

// Usuarios por trabajo de push en la cola (ajuste del orquestador: lotes de ~50)
export const USUARIOS_POR_TRABAJO_PUSH = 50;
// Límite de FCM por llamada a sendEachForMulticast
const TOKENS_POR_MULTICAST = 500;

// Solo estos dos códigos significan que el token ya no sirve (invalid-argument puede ser otra cosa)
const ERRORES_TOKEN_INVALIDO = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
];

// FCM exige que todos los valores de data sean string
const dataComoTexto = (data?: Record<string, unknown>): Record<string, string> => {
  const salida: Record<string, string> = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) salida[k] = String(v);
  });
  return salida;
};

// Mensaje FCM con la MISMA forma que antes (canal Android, prioridad alta, APNs)
const construirMensaje = (c: ContenidoPush) => {
  const data = dataComoTexto(c.data);
  return {
    notification: { title: c.titulo, body: c.mensaje },
    data: { ...data, timestamp: Date.now().toString() },
    android: {
      notification: { channelId: 'educanexo360_messages', priority: 'high' as const, sound: c.sound || 'default' },
      data,
    },
    apns: {
      payload: { aps: { alert: { title: c.titulo, body: c.mensaje }, sound: c.sound || 'default' } },
      headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
    },
  };
};

// Simulador de FCM para pruebas (nada sale a internet)
export const simuladoPush = { fallar: false };
const messagingSimulado = {
  async sendEachForMulticast(msg: any) {
    if (simuladoPush.fallar) throw new Error('FCM simulado: fallo forzado');
    const responses = msg.tokens.map((t: string) =>
      t.startsWith('invalido')
        ? { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'no registrado' } }
        : { success: true, messageId: `sim-${t}` },
    );
    await mongoose.connection.collection('push_simulado').insertOne({
      tokens: msg.tokens,
      titulo: msg.notification?.title,
      mensaje: msg.notification?.body,
      data: msg.data,
      fecha: new Date(),
    });
    const successCount = responses.filter((r: any) => r.success).length;
    return { responses, successCount, failureCount: responses.length - successCount };
  },
  async send(msg: any) {
    const r = await messagingSimulado.sendEachForMulticast({ ...msg, tokens: [msg.token] });
    if (!r.responses[0].success) {
      const e: any = new Error('no registrado');
      e.code = r.responses[0].error.code;
      throw e;
    }
    return r.responses[0].messageId;
  },
};

class PushNotificationService {
  private firebaseInitialized = false;
  private messaging: any = null;

  constructor() {
    this.initFirebase();
  }

  private initFirebase(): void {
    if (process.env.PUSH_PROVIDER === 'simulado') {
      this.messaging = messagingSimulado;
      this.firebaseInitialized = true;
      logger.info('Push en modo simulado (PUSH_PROVIDER=simulado)');
      return;
    }

    // Si faltan las variables de entorno criticas, desactivar silenciosamente
    if (
      !process.env.FIREBASE_PROJECT_ID ||
      !process.env.FIREBASE_PRIVATE_KEY ||
      !process.env.FIREBASE_CLIENT_EMAIL
    ) {
      logger.info('Firebase no configurado — notificaciones push desactivadas');
      return;
    }

    try {
      // Importar firebase-admin solo cuando las credenciales estan disponibles
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const admin = require('firebase-admin');

      if (!admin.apps.length) {
        const serviceAccount = {
          type: 'service_account',
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: 'https://accounts.google.com/o/oauth2/auth',
          token_uri: 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
        };

        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
      }

      this.messaging = admin.messaging();
      this.firebaseInitialized = true;
      logger.info('Firebase Admin SDK inicializado correctamente');
    } catch (error) {
      console.error('Error inicializando Firebase Admin SDK — notificaciones push desactivadas:', error);
      this.firebaseInitialized = false;
    }
  }

  get disponible(): boolean {
    return this.firebaseInitialized;
  }

  /**
   * Encola push para los usuarios dados, en trabajos de ~50 usuarios (Fase 4.3). Devuelve los trabajos.
   */
  async encolarPush(opciones: {
    usuarioIds: (string | mongoose.Types.ObjectId)[];
    contenido: ContenidoPush;
    prioridad?: 'alta' | 'normal';
    escuelaId?: string;
  }): Promise<number> {
    const trabajos = this.construirTrabajosPush(opciones);
    return trabajos.length === 0 ? 0 : encolar(trabajos);
  }

  /** Arma (sin insertar) los trabajos de push en lotes de ~50 usuarios (Fase 4.2: un solo insertMany). */
  construirTrabajosPush(opciones: {
    usuarioIds: (string | mongoose.Types.ObjectId)[];
    contenido: ContenidoPush;
    prioridad?: 'alta' | 'normal';
    escuelaId?: string;
  }): NuevoTrabajo[] {
    const ids = [...new Set(opciones.usuarioIds.map(String))].filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return [];
    const trabajos: NuevoTrabajo[] = [];
    for (let i = 0; i < ids.length; i += USUARIOS_POR_TRABAJO_PUSH) {
      trabajos.push({
        tipo: 'push',
        prioridad: opciones.prioridad || 'normal',
        escuelaId: opciones.escuelaId,
        payload: {
          usuarioIds: ids.slice(i, i + USUARIOS_POR_TRABAJO_PUSH),
          titulo: opciones.contenido.titulo,
          mensaje: opciones.contenido.mensaje,
          data: dataComoTexto(opciones.contenido.data),
          ...(opciones.contenido.sound && { sound: opciones.contenido.sound }),
        },
      });
    }
    return trabajos;
  }

  /**
   * Ids de los usuarios ACTIVOS que cumplen el filtro y tienen al menos un dispositivo (arreglo o campo
   * antiguo). Evita encolar trabajos para usuarios sin app.
   */
  async idsConDispositivo(filtro: Record<string, unknown>): Promise<string[]> {
    const usuarios = await Usuario.find(
      {
        ...filtro,
        estado: 'ACTIVO',
        $or: [{ 'fcmTokens.0': { $exists: true } }, { fcmToken: { $type: 'string' } }],
      },
      { _id: 1 },
    ).lean();
    return usuarios.map((u: any) => String(u._id));
  }

  /** Encola un push para los usuarios que cumplen el filtro y tienen dispositivo. Fire-and-forget seguro. */
  async encolarPushFiltro(
    filtro: Record<string, unknown>,
    contenido: ContenidoPush,
    opciones: { prioridad?: 'alta' | 'normal'; escuelaId?: string } = {},
  ): Promise<number> {
    const usuarioIds = await this.idsConDispositivo(filtro);
    return this.encolarPush({ usuarioIds, contenido, ...opciones });
  }

  /** Tokens (sin repetir) de los usuarios ACTIVOS dados, en UNA consulta: fcmTokens[] + fcmToken antiguo. */
  async obtenerTokens(usuarioIds: string[]): Promise<string[]> {
    if (usuarioIds.length === 0) return [];
    const usuarios = await Usuario.find(
      { _id: { $in: usuarioIds }, estado: 'ACTIVO' },
      { fcmTokens: 1, fcmToken: 1 },
    ).lean();
    const tokens = new Set<string>();
    usuarios.forEach((u: any) => {
      // Solo strings (auditoría 4.A): un token no-string haría fallar sendEachForMulticast para todo el lote
      (u.fcmTokens || []).forEach((t: any) => typeof t?.token === 'string' && t.token && tokens.add(t.token));
      if (typeof u.fcmToken === 'string' && u.fcmToken) tokens.add(u.fcmToken);
    });
    return [...tokens];
  }

  /**
   * Envía el mismo push a muchos tokens: bloques de 500 con sendEachForMulticast y limpieza de inválidos.
   * Lanza si FCM falla por completo (la cola reintenta el trabajo).
   */
  async enviarMulticast(tokens: string[], contenido: ContenidoPush): Promise<{ exitos: number; fallos: number; invalidos: number }> {
    if (!this.firebaseInitialized || tokens.length === 0) return { exitos: 0, fallos: 0, invalidos: 0 };
    const mensaje = construirMensaje(contenido);
    const invalidos: string[] = [];
    let exitos = 0;
    let fallos = 0;
    for (let i = 0; i < tokens.length; i += TOKENS_POR_MULTICAST) {
      const bloque = tokens.slice(i, i + TOKENS_POR_MULTICAST);
      const respuesta = await this.messaging.sendEachForMulticast({ tokens: bloque, ...mensaje });
      exitos += respuesta.successCount || 0;
      fallos += respuesta.failureCount || 0;
      (respuesta.responses || []).forEach((r: any, idx: number) => {
        if (!r.success && ERRORES_TOKEN_INVALIDO.includes(r.error?.code)) invalidos.push(bloque[idx]);
      });
    }
    if (invalidos.length > 0) await this.limpiarTokensInvalidos(invalidos);
    return { exitos, fallos, invalidos: invalidos.length };
  }

  /** Quita tokens inválidos de TODOS los usuarios con un solo $pull (y del campo antiguo). */
  async limpiarTokensInvalidos(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    try {
      await Usuario.updateMany(
        { 'fcmTokens.token': { $in: tokens } },
        { $pull: { fcmTokens: { token: { $in: tokens } } } },
      );
      await Usuario.updateMany(
        { fcmToken: { $in: tokens } },
        { $set: { fcmToken: null, fcmTokenUpdatedAt: new Date() } },
      );
    } catch (error) {
      console.error('Error limpiando tokens inválidos:', error);
    }
  }

  // Envío directo a UN token (endpoint de prueba /test-push). El resto de envíos van por la cola.
  async enviarNotificacion(datos: NotificacionData): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.firebaseInitialized) {
      return { success: false, error: 'Firebase no inicializado' };
    }
    try {
      if (!datos.token || !datos.titulo || !datos.mensaje) {
        throw new Error('Token, título y mensaje son requeridos');
      }
      const base = construirMensaje({ titulo: datos.titulo, mensaje: datos.mensaje, data: datos.data, sound: datos.sound });
      const message = {
        token: datos.token,
        ...base,
        notification: { ...base.notification, ...(datos.imageUrl && { imageUrl: datos.imageUrl }) },
      };
      const response = await this.messaging.send(message);
      return { success: true, messageId: response };
    } catch (error: any) {
      console.error('Error enviando push notification:', error);
      if (ERRORES_TOKEN_INVALIDO.includes(error.code)) {
        await this.limpiarTokensInvalidos([datos.token]);
      }
      return { success: false, error: error.message };
    }
  }

  // Compatibilidad: envío masivo directo (bloques de 500). Preferir encolarPush.
  async enviarNotificacionMasiva(datos: NotificacionMasiva): Promise<{
    success: boolean;
    successCount: number;
    failureCount: number;
    errors?: string[];
  }> {
    try {
      const r = await this.enviarMulticast(datos.tokens || [], { titulo: datos.titulo, mensaje: datos.mensaje, data: datos.data });
      return { success: this.firebaseInitialized, successCount: r.exitos, failureCount: r.fallos };
    } catch (error: any) {
      console.error('Error enviando notificación masiva:', error);
      return { success: false, successCount: 0, failureCount: datos.tokens?.length ?? 0, errors: [error.message] };
    }
  }

  // Nuevo mensaje: ahora ENCOLA (antes: 1 consulta + 1 llamada a FCM por destinatario dentro del request)
  async notificarNuevoMensaje(
    destinatarioId: string,
    remitenteNombre: string,
    asunto: string,
    mensajeId: string,
    prioridad: 'ALTA' | 'NORMAL' | 'BAJA' = 'NORMAL',
  ): Promise<boolean> {
    try {
      const titulo =
        prioridad === 'ALTA' ? `🔴 Mensaje importante de ${remitenteNombre}` : `💬 Nuevo mensaje de ${remitenteNombre}`;
      const n = await this.encolarPush({
        usuarioIds: [destinatarioId],
        contenido: { titulo, mensaje: asunto, data: { tipo: 'mensaje', mensajeId, prioridad, remitente: remitenteNombre } },
        prioridad: prioridad === 'ALTA' ? 'alta' : 'normal',
      });
      return n > 0;
    } catch (error) {
      console.error('Error notificando nuevo mensaje:', error);
      return false;
    }
  }

  // Mensaje urgente: ahora ENCOLA (mismos datos que antes: tipo 'urgente', sonido 'emergency')
  async notificarMensajeUrgente(
    destinatarioId: string,
    remitenteNombre: string,
    asunto: string,
    mensajeId: string,
  ): Promise<boolean> {
    try {
      const n = await this.encolarPush({
        usuarioIds: [destinatarioId],
        contenido: {
          titulo: `🚨 URGENTE: ${remitenteNombre}`,
          mensaje: asunto,
          data: { tipo: 'urgente', mensajeId, prioridad: 'ALTA', remitente: remitenteNombre },
          sound: 'emergency',
        },
        prioridad: 'alta',
      });
      return n > 0;
    } catch (error) {
      console.error('Error notificando mensaje urgente:', error);
      return false;
    }
  }

  // 📊 OBTENER ESTADÍSTICAS DE TOKENS (dispositivos registrados)
  async obtenerEstadisticas(): Promise<{
    totalTokens: number;
    tokensPorPlataforma: { ios: number; android: number };
    tokensActivos: number;
  }> {
    try {
      const [porPlataforma, totales] = await Promise.all([
        Usuario.aggregate([
          { $match: { 'fcmTokens.0': { $exists: true }, estado: 'ACTIVO' } },
          { $unwind: '$fcmTokens' },
          { $group: { _id: '$fcmTokens.platform', count: { $sum: 1 } } },
        ]),
        Usuario.aggregate([
          { $match: { 'fcmTokens.0': { $exists: true } } },
          { $project: { n: { $size: '$fcmTokens' }, activo: { $eq: ['$estado', 'ACTIVO'] } } },
          { $group: { _id: null, total: { $sum: '$n' }, activos: { $sum: { $cond: ['$activo', '$n', 0] } } } },
        ]),
      ]);
      const tokensPorPlataforma = { ios: 0, android: 0 };
      porPlataforma.forEach((p: any) => {
        if (p._id === 'ios') tokensPorPlataforma.ios = p.count;
        if (p._id === 'android') tokensPorPlataforma.android = p.count;
      });
      return { totalTokens: totales[0]?.total || 0, tokensPorPlataforma, tokensActivos: totales[0]?.activos || 0 };
    } catch (error) {
      console.error('Error obteniendo estadísticas:', error);
      return { totalTokens: 0, tokensPorPlataforma: { ios: 0, android: 0 }, tokensActivos: 0 };
    }
  }
}

export default new PushNotificationService();
