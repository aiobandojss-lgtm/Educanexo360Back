"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.simuladoPush = exports.USUARIOS_POR_TRABAJO_PUSH = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const logger_1 = require("../utils/logger");
const outbox_1 = require("../queue/outbox");
exports.USUARIOS_POR_TRABAJO_PUSH = 50;
const TOKENS_POR_MULTICAST = 500;
const ERRORES_TOKEN_INVALIDO = [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
];
const dataComoTexto = (data) => {
    const salida = {};
    Object.entries(data || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null)
            salida[k] = String(v);
    });
    return salida;
};
const construirMensaje = (c) => {
    const data = dataComoTexto(c.data);
    return {
        notification: { title: c.titulo, body: c.mensaje },
        data: { ...data, timestamp: Date.now().toString() },
        android: {
            notification: { channelId: 'educanexo360_messages', priority: 'high', sound: c.sound || 'default' },
            data,
        },
        apns: {
            payload: { aps: { alert: { title: c.titulo, body: c.mensaje }, sound: c.sound || 'default' } },
            headers: { 'apns-priority': '10', 'apns-push-type': 'alert' },
        },
    };
};
exports.simuladoPush = { fallar: false };
const messagingSimulado = {
    async sendEachForMulticast(msg) {
        if (exports.simuladoPush.fallar)
            throw new Error('FCM simulado: fallo forzado');
        const responses = msg.tokens.map((t) => t.startsWith('invalido')
            ? { success: false, error: { code: 'messaging/registration-token-not-registered', message: 'no registrado' } }
            : { success: true, messageId: `sim-${t}` });
        await mongoose_1.default.connection.collection('push_simulado').insertOne({
            tokens: msg.tokens,
            titulo: msg.notification?.title,
            mensaje: msg.notification?.body,
            data: msg.data,
            fecha: new Date(),
        });
        const successCount = responses.filter((r) => r.success).length;
        return { responses, successCount, failureCount: responses.length - successCount };
    },
    async send(msg) {
        const r = await messagingSimulado.sendEachForMulticast({ ...msg, tokens: [msg.token] });
        if (!r.responses[0].success) {
            const e = new Error('no registrado');
            e.code = r.responses[0].error.code;
            throw e;
        }
        return r.responses[0].messageId;
    },
};
class PushNotificationService {
    constructor() {
        this.firebaseInitialized = false;
        this.messaging = null;
        this.initFirebase();
    }
    initFirebase() {
        if (process.env.PUSH_PROVIDER === 'simulado') {
            this.messaging = messagingSimulado;
            this.firebaseInitialized = true;
            logger_1.logger.info('Push en modo simulado (PUSH_PROVIDER=simulado)');
            return;
        }
        if (!process.env.FIREBASE_PROJECT_ID ||
            !process.env.FIREBASE_PRIVATE_KEY ||
            !process.env.FIREBASE_CLIENT_EMAIL) {
            logger_1.logger.info('Firebase no configurado — notificaciones push desactivadas');
            return;
        }
        try {
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
            logger_1.logger.info('Firebase Admin SDK inicializado correctamente');
        }
        catch (error) {
            console.error('Error inicializando Firebase Admin SDK — notificaciones push desactivadas:', error);
            this.firebaseInitialized = false;
        }
    }
    get disponible() {
        return this.firebaseInitialized;
    }
    async encolarPush(opciones) {
        const trabajos = this.construirTrabajosPush(opciones);
        return trabajos.length === 0 ? 0 : (0, outbox_1.encolar)(trabajos);
    }
    construirTrabajosPush(opciones) {
        const ids = [...new Set(opciones.usuarioIds.map(String))].filter((id) => mongoose_1.default.isValidObjectId(id));
        if (ids.length === 0)
            return [];
        const trabajos = [];
        for (let i = 0; i < ids.length; i += exports.USUARIOS_POR_TRABAJO_PUSH) {
            trabajos.push({
                tipo: 'push',
                prioridad: opciones.prioridad || 'normal',
                escuelaId: opciones.escuelaId,
                payload: {
                    usuarioIds: ids.slice(i, i + exports.USUARIOS_POR_TRABAJO_PUSH),
                    titulo: opciones.contenido.titulo,
                    mensaje: opciones.contenido.mensaje,
                    data: dataComoTexto(opciones.contenido.data),
                    ...(opciones.contenido.sound && { sound: opciones.contenido.sound }),
                },
            });
        }
        return trabajos;
    }
    async idsConDispositivo(filtro) {
        const usuarios = await usuario_model_1.default.find({
            ...filtro,
            estado: 'ACTIVO',
            $or: [{ 'fcmTokens.0': { $exists: true } }, { fcmToken: { $type: 'string' } }],
        }, { _id: 1 }).lean();
        return usuarios.map((u) => String(u._id));
    }
    async encolarPushFiltro(filtro, contenido, opciones = {}) {
        const usuarioIds = await this.idsConDispositivo(filtro);
        return this.encolarPush({ usuarioIds, contenido, ...opciones });
    }
    async obtenerTokens(usuarioIds) {
        if (usuarioIds.length === 0)
            return [];
        const usuarios = await usuario_model_1.default.find({ _id: { $in: usuarioIds }, estado: 'ACTIVO' }, { fcmTokens: 1, fcmToken: 1 }).lean();
        const tokens = new Set();
        usuarios.forEach((u) => {
            (u.fcmTokens || []).forEach((t) => t?.token && tokens.add(t.token));
            if (typeof u.fcmToken === 'string' && u.fcmToken)
                tokens.add(u.fcmToken);
        });
        return [...tokens];
    }
    async enviarMulticast(tokens, contenido) {
        if (!this.firebaseInitialized || tokens.length === 0)
            return { exitos: 0, fallos: 0, invalidos: 0 };
        const mensaje = construirMensaje(contenido);
        const invalidos = [];
        let exitos = 0;
        let fallos = 0;
        for (let i = 0; i < tokens.length; i += TOKENS_POR_MULTICAST) {
            const bloque = tokens.slice(i, i + TOKENS_POR_MULTICAST);
            const respuesta = await this.messaging.sendEachForMulticast({ tokens: bloque, ...mensaje });
            exitos += respuesta.successCount || 0;
            fallos += respuesta.failureCount || 0;
            (respuesta.responses || []).forEach((r, idx) => {
                if (!r.success && ERRORES_TOKEN_INVALIDO.includes(r.error?.code))
                    invalidos.push(bloque[idx]);
            });
        }
        if (invalidos.length > 0)
            await this.limpiarTokensInvalidos(invalidos);
        return { exitos, fallos, invalidos: invalidos.length };
    }
    async limpiarTokensInvalidos(tokens) {
        if (tokens.length === 0)
            return;
        try {
            await usuario_model_1.default.updateMany({ 'fcmTokens.token': { $in: tokens } }, { $pull: { fcmTokens: { token: { $in: tokens } } } });
            await usuario_model_1.default.updateMany({ fcmToken: { $in: tokens } }, { $set: { fcmToken: null, fcmTokenUpdatedAt: new Date() } });
        }
        catch (error) {
            console.error('Error limpiando tokens inválidos:', error);
        }
    }
    async enviarNotificacion(datos) {
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
        }
        catch (error) {
            console.error('Error enviando push notification:', error);
            if (ERRORES_TOKEN_INVALIDO.includes(error.code)) {
                await this.limpiarTokensInvalidos([datos.token]);
            }
            return { success: false, error: error.message };
        }
    }
    async enviarNotificacionMasiva(datos) {
        try {
            const r = await this.enviarMulticast(datos.tokens || [], { titulo: datos.titulo, mensaje: datos.mensaje, data: datos.data });
            return { success: this.firebaseInitialized, successCount: r.exitos, failureCount: r.fallos };
        }
        catch (error) {
            console.error('Error enviando notificación masiva:', error);
            return { success: false, successCount: 0, failureCount: datos.tokens?.length ?? 0, errors: [error.message] };
        }
    }
    async notificarNuevoMensaje(destinatarioId, remitenteNombre, asunto, mensajeId, prioridad = 'NORMAL') {
        try {
            const titulo = prioridad === 'ALTA' ? `🔴 Mensaje importante de ${remitenteNombre}` : `💬 Nuevo mensaje de ${remitenteNombre}`;
            const n = await this.encolarPush({
                usuarioIds: [destinatarioId],
                contenido: { titulo, mensaje: asunto, data: { tipo: 'mensaje', mensajeId, prioridad, remitente: remitenteNombre } },
                prioridad: prioridad === 'ALTA' ? 'alta' : 'normal',
            });
            return n > 0;
        }
        catch (error) {
            console.error('Error notificando nuevo mensaje:', error);
            return false;
        }
    }
    async notificarMensajeUrgente(destinatarioId, remitenteNombre, asunto, mensajeId) {
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
        }
        catch (error) {
            console.error('Error notificando mensaje urgente:', error);
            return false;
        }
    }
    async obtenerEstadisticas() {
        try {
            const [porPlataforma, totales] = await Promise.all([
                usuario_model_1.default.aggregate([
                    { $match: { 'fcmTokens.0': { $exists: true }, estado: 'ACTIVO' } },
                    { $unwind: '$fcmTokens' },
                    { $group: { _id: '$fcmTokens.platform', count: { $sum: 1 } } },
                ]),
                usuario_model_1.default.aggregate([
                    { $match: { 'fcmTokens.0': { $exists: true } } },
                    { $project: { n: { $size: '$fcmTokens' }, activo: { $eq: ['$estado', 'ACTIVO'] } } },
                    { $group: { _id: null, total: { $sum: '$n' }, activos: { $sum: { $cond: ['$activo', '$n', 0] } } } },
                ]),
            ]);
            const tokensPorPlataforma = { ios: 0, android: 0 };
            porPlataforma.forEach((p) => {
                if (p._id === 'ios')
                    tokensPorPlataforma.ios = p.count;
                if (p._id === 'android')
                    tokensPorPlataforma.android = p.count;
            });
            return { totalTokens: totales[0]?.total || 0, tokensPorPlataforma, tokensActivos: totales[0]?.activos || 0 };
        }
        catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { totalTokens: 0, tokensPorPlataforma: { ios: 0, android: 0 }, tokensActivos: 0 };
        }
    }
}
exports.default = new PushNotificationService();
//# sourceMappingURL=pushNotification.service.js.map