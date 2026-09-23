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

const router = express.Router();

/**
 * @route POST /api/auth/login
 * @desc Iniciar sesión de usuario
 * @access Public
 */
router.post('/login', validate(loginValidation), authController.login);

/**
 * @route POST /api/auth/register
 * @desc Crear un usuario en la escuela del administrador autenticado
 * @access Private (ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO, SUPER_ADMIN)
 */
router.post(
  '/register',
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
router.post('/refresh-token', validate(refreshTokenValidation), authController.refreshToken);

/**
 * @route POST /api/auth/logout
 * @desc Cerrar sesión
 * @access Private
 */
router.post('/logout', authController.logout);

/**
 * @route POST /api/auth/forgot-password
 * @desc Solicitar recuperación de contraseña
 * @access Public
 */
router.post('/forgot-password', validate(forgotPasswordValidation), authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @desc Restablecer contraseña con token
 * @access Public
 */
router.post('/reset-password', validate(resetPasswordValidation), authController.resetPassword);

/**
 * @route GET /api/auth/verify-token
 * @desc Verificar validez del token y devolver información del usuario
 * @access Private (requiere token válido)
 */
router.get('/verify-token', authenticate, authController.verifyToken);

export default router;
