import { body } from 'express-validator';

// Registro del token FCM del dispositivo (Flutter)
export const registrarTokenValidation = [
  body('fcmToken')
    .isString()
    .withMessage('Token FCM es requerido')
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Token FCM inválido'),
  body('platform').isIn(['ios', 'android']).withMessage('Platform debe ser "ios" o "android"'),
];

// Desvinculación del token FCM al cerrar sesión (Flutter)
export const desregistrarTokenValidation = [
  body('fcmToken')
    .isString()
    .withMessage('Token FCM es requerido')
    .trim()
    .isLength({ min: 1, max: 4096 })
    .withMessage('Token FCM inválido'),
];
