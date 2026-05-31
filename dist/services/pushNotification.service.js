"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
class PushNotificationService {
    constructor() {
        this.firebaseInitialized = false;
        this.messaging = null;
        this.initFirebase();
    }
    initFirebase() {
        if (!process.env.FIREBASE_PROJECT_ID ||
            !process.env.FIREBASE_PRIVATE_KEY ||
            !process.env.FIREBASE_CLIENT_EMAIL) {
            console.log('Firebase no configurado — notificaciones push desactivadas');
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
            this.messaging = require('firebase-admin').messaging();
            this.firebaseInitialized = true;
            console.log('Firebase Admin SDK inicializado correctamente');
        }
        catch (error) {
            console.error('Error inicializando Firebase Admin SDK — notificaciones push desactivadas:', error);
            this.firebaseInitialized = false;
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
            const message = {
                token: datos.token,
                notification: {
                    title: datos.titulo,
                    body: datos.mensaje,
                    ...(datos.imageUrl && { imageUrl: datos.imageUrl }),
                },
                data: {
                    ...(datos.data || {}),
                    timestamp: Date.now().toString(),
                },
                android: {
                    notification: {
                        channelId: 'educanexo360_messages',
                        priority: 'high',
                        sound: datos.sound || 'default',
                        ...(datos.badge && { notificationCount: datos.badge }),
                    },
                    data: datos.data || {},
                },
                apns: {
                    payload: {
                        aps: {
                            alert: {
                                title: datos.titulo,
                                body: datos.mensaje,
                            },
                            sound: datos.sound || 'default',
                            ...(datos.badge && { badge: datos.badge }),
                        },
                    },
                    headers: {
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    },
                },
            };
            const response = await this.messaging.send(message);
            return { success: true, messageId: response };
        }
        catch (error) {
            console.error('Error enviando push notification:', error);
            if (error.code === 'messaging/registration-token-not-registered' ||
                error.code === 'messaging/invalid-registration-token') {
                await this.limpiarTokenInvalido(datos.token);
            }
            return { success: false, error: error.message };
        }
    }
    async enviarNotificacionMasiva(datos) {
        if (!this.firebaseInitialized) {
            return { success: false, successCount: 0, failureCount: datos.tokens?.length ?? 0, errors: ['Firebase no inicializado'] };
        }
        try {
            if (!datos.tokens || datos.tokens.length === 0) {
                throw new Error('Al menos un token es requerido');
            }
            const message = {
                notification: { title: datos.titulo, body: datos.mensaje },
                data: { ...(datos.data || {}), timestamp: Date.now().toString() },
                android: { notification: { channelId: 'educanexo360_messages', priority: 'high' } },
                apns: { payload: { aps: { alert: { title: datos.titulo, body: datos.mensaje }, sound: 'default' } } },
            };
            const response = await this.messaging.sendEachForMulticast({ tokens: datos.tokens, ...message });
            if (response.responses) {
                for (let i = 0; i < response.responses.length; i++) {
                    const resp = response.responses[i];
                    if (!resp.success && resp.error) {
                        const errorCode = resp.error.code;
                        if (errorCode === 'messaging/registration-token-not-registered' ||
                            errorCode === 'messaging/invalid-registration-token') {
                            await this.limpiarTokenInvalido(datos.tokens[i]);
                        }
                    }
                }
            }
            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
                errors: response.responses
                    ?.filter((r) => !r.success)
                    .map((r) => r.error?.message)
                    .filter(Boolean),
            };
        }
        catch (error) {
            console.error('Error enviando notificación masiva:', error);
            return { success: false, successCount: 0, failureCount: datos.tokens.length, errors: [error.message] };
        }
    }
    async notificarNuevoMensaje(destinatarioId, remitenteNombre, asunto, mensajeId, prioridad = 'NORMAL') {
        if (!this.firebaseInitialized)
            return false;
        try {
            const destinatario = (await usuario_model_1.default.findById(destinatarioId).select('fcmToken'));
            if (!destinatario?.fcmToken)
                return false;
            const titulo = prioridad === 'ALTA'
                ? `🔴 Mensaje importante de ${remitenteNombre}`
                : `💬 Nuevo mensaje de ${remitenteNombre}`;
            const resultado = await this.enviarNotificacion({
                token: destinatario.fcmToken,
                titulo,
                mensaje: asunto,
                data: { tipo: 'mensaje', mensajeId, prioridad, remitente: remitenteNombre },
            });
            return resultado.success;
        }
        catch (error) {
            console.error('Error notificando nuevo mensaje:', error);
            return false;
        }
    }
    async notificarMensajeUrgente(destinatarioId, remitenteNombre, asunto, mensajeId) {
        if (!this.firebaseInitialized)
            return false;
        try {
            const destinatario = (await usuario_model_1.default.findById(destinatarioId).select('fcmToken'));
            if (!destinatario?.fcmToken)
                return false;
            const resultado = await this.enviarNotificacion({
                token: destinatario.fcmToken,
                titulo: `🚨 URGENTE: ${remitenteNombre}`,
                mensaje: asunto,
                data: { tipo: 'urgente', mensajeId, prioridad: 'ALTA', remitente: remitenteNombre },
                sound: 'emergency',
            });
            return resultado.success;
        }
        catch (error) {
            console.error('Error notificando mensaje urgente:', error);
            return false;
        }
    }
    async limpiarTokenInvalido(token) {
        try {
            await usuario_model_1.default.updateOne({ fcmToken: token }, { $unset: { fcmToken: 1, fcmTokenUpdatedAt: 1 } });
        }
        catch (error) {
            console.error('Error limpiando token inválido:', error);
        }
    }
    async obtenerEstadisticas() {
        if (!this.firebaseInitialized) {
            return { totalTokens: 0, tokensPorPlataforma: { ios: 0, android: 0 }, tokensActivos: 0 };
        }
        try {
            const estadisticas = await usuario_model_1.default.aggregate([
                { $match: { fcmToken: { $exists: true, $ne: null }, estado: 'ACTIVO' } },
                { $group: { _id: '$platform', count: { $sum: 1 } } },
            ]);
            const totalTokens = await usuario_model_1.default.countDocuments({ fcmToken: { $exists: true, $ne: null } });
            const tokensActivos = await usuario_model_1.default.countDocuments({ fcmToken: { $exists: true, $ne: null }, estado: 'ACTIVO' });
            const tokensPorPlataforma = estadisticas.reduce((acc, curr) => {
                if (curr._id === 'ios')
                    acc.ios = curr.count;
                if (curr._id === 'android')
                    acc.android = curr.count;
                return acc;
            }, { ios: 0, android: 0 });
            return { totalTokens, tokensPorPlataforma, tokensActivos };
        }
        catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { totalTokens: 0, tokensPorPlataforma: { ios: 0, android: 0 }, tokensActivos: 0 };
        }
    }
}
exports.default = new PushNotificationService();
//# sourceMappingURL=pushNotification.service.js.map