import express from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import {
  loginValidation,
  registerValidation,
  refreshTokenValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} from '../validations/auth.validation';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { rateLimiter } from '../middleware/performance.middleware';

const router = express.Router();

// Límites por endpoint (antes: 20/min por IP para todo /auth, que bloqueaba a un colegio detrás de un mismo WiFi)
const ipDe = (req: express.Request): string => req.ip || req.socket.remoteAddress || 'unknown';
// Login: 10/min por IP+email (freno a fuerza bruta sobre una cuenta) y 300/min por IP (colegio con un solo WiFi)
const limiteLoginPorEmail = rateLimiter(60000, 10, (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  return `${ipDe(req)}|${email}`;
});
const limiteLoginPorIp = rateLimiter(60000, 300);
// Refresh y verificación de sesión: holgado (las APK viejas cierran sesión si reciben 429)
const limiteSesion = rateLimiter(60000, 120);
// Resto de /auth (register, forgot/reset password, logout)
const limiteGeneral = rateLimiter(60000, 60);

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión de usuario
 * @access Public
 */
router.post(
  '/login',
  limiteLoginPorIp,
  limiteLoginPorEmail,
  validate(loginValidation),
  authController.login,
);

/**
 * @route POST /api/auth/register
 * @desc Crear un usuario en la escuela del administrador autenticado
 * @access Private (ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO, SUPER_ADMIN)
 */
router.post(
  '/register',
  limiteGeneral,
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'), // authorize('ADMIN') incluye los roles administrativos
  validate(registerValidation),
  authController.register,
);

/**
 * @route POST /api/auth/refresh-token
 * @desc Refrescar token de acceso
 * @access Public
 */
router.post(
  '/refresh-token',
  limiteSesion,
  validate(refreshTokenValidation),
  authController.refreshToken,
);

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión
 * @access Private
 */
router.post('/logout', limiteGeneral, authController.logout);

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar recuperación de contraseña
 * @access Public
 */
router.post(
  '/forgot-password',
  limiteGeneral,
  validate(forgotPasswordValidation),
  authController.forgotPassword,
);

/**
 * @route POST /api/auth/reset-password
 * @desc Restablecer contraseña con token
 * @access Public
 */
router.post(
  '/reset-password',
  limiteGeneral,
  validate(resetPasswordValidation),
  authController.resetPassword,
);

/**
 * @route GET /api/auth/verify-token
 * @desc Verificar validez del token y devolver información del usuario
 * @access Private (requiere token válido)
 */
router.get('/verify-token', limiteSesion, authenticate, authController.verifyToken);

export default router;
