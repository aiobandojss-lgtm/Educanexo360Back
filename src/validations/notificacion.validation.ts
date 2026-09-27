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
    .withMessage('Token FCM inválido'),
];
