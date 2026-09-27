import { body } from 'express-validator';

// Registro del token FCM del dispositivo (Flutter). fcmToken null = desvincular (así cierran sesión
// las APK 1.0.0); platform opcional (por defecto 'android').
export const registrarTokenValidation = [
  body('fcmToken')
    .optional({ values: 'null' })
    .isString()
    .withMessage('Token FCM es requerido')
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Token FCM inválido')
    // Auditoría 4.A: solo el alfabeto de los tokens FCM (base64url y ':'); nada que empiece por '$'
    .matches(/^[A-Za-z0-9:_.-]+$/)
    .withMessage('Token FCM inválido'),
  body('platform').optional().isIn(['ios', 'android']).withMessage('Platform debe ser "ios" o "android"'),
];

// Desvinculación del token FCM al cerrar sesión (Flutter). Con token: solo ese dispositivo.
// Sin token (Fase 4.3): se desvinculan todos los dispositivos del usuario.
export const desregistrarTokenValidation = [
  body('fcmToken')
    .optional({ values: 'null' })
    .isString()
    .withMessage('Token FCM es requerido')
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Token FCM inválido')
    .matches(/^[A-Za-z0-9:_.-]+$/)
    .withMessage('Token FCM inválido'),
];

// Auditoría 4.AN: las campanitas de 'Mensaje' las crea solo el despacho (índice único mensaje_usuario_unico); a mano
// chocarían con él (500) y podrían ocultar la real. Ni React ni Flutter envían entidadTipo a estos endpoints.
export const crearNotificacionValidation = [
  body('entidadTipo').optional().not().equals('Mensaje').withMessage("No se pueden crear notificaciones de tipo 'Mensaje'"),
];
