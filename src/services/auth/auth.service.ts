import Usuario from '../../models/usuario.model';
import ApiError from '../../utils/ApiError';
import { SignOptions, sign, verify } from 'jsonwebtoken';
import axios from 'axios';
import config from '../../config/config';
import crypto from 'crypto';
import { jwtConfig } from '../../config/jwt.config';

interface JwtPayload {
  sub: string;
  tipo: string;
  escuelaId?: string; // Hecho opcional para SUPER_ADMIN
}

// Para peticiones HTTP utilizamos un cliente axios simple
// ya que este servicio corre en el backend y no necesita los interceptores
const apiClient = axios.create({
  baseURL: config.frontendUrl || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});

class AuthService {
  private generateTokens(user: any) {
    // Crear el payload con las propiedades básicas
    const payload: JwtPayload = {
      sub: user._id.toString(),
      tipo: user.tipo,
    };

    // Añadir escuelaId solo si existe (para usuarios que no son SUPER_ADMIN)
    if (user.escuelaId) {
      payload.escuelaId = user.escuelaId.toString();
    }

    const defaultAccessExpiry = '1d';
    const defaultRefreshExpiry = '7d';

    return {
      access: {
        token: sign(payload, jwtConfig.secret, {
          expiresIn: process.env.JWT_EXPIRES_IN || defaultAccessExpiry,
        } as SignOptions),
        expires: process.env.JWT_EXPIRES_IN || defaultAccessExpiry,
      },
      refresh: {
        token: sign(
          payload,
          jwtConfig.refreshSecret,
          {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || defaultRefreshExpiry,
          } as SignOptions,
        ),
        expires: process.env.REFRESH_TOKEN_EXPIRES_IN || defaultRefreshExpiry,
      },
    };
  }

  async login(email: string, password: string) {
    // Convertir email a minúsculas para búsqueda insensible a mayúsculas
    const emailLowerCase = email.toLowerCase();
    console.log(`Intentando login con email: ${emailLowerCase}`);

    // Buscar usuario por email
    const user = await Usuario.findOne({ email: emailLowerCase });

    if (!user) {
      console.log(`Usuario no encontrado para email: ${emailLowerCase}`);
      throw new ApiError(401, 'Credenciales inválidas');
    }

    console.log(`Usuario encontrado: ${user._id} (${user.tipo}), estado: ${user.estado}`);

    // Verificar que el usuario esté activo
    if (user.estado !== 'ACTIVO') {
      console.log(`Usuario con estado inactivo: ${user.estado}`);
      throw new ApiError(401, 'Usuario inactivo');
    }

    // Verificar contraseña
    console.log('Verificando contraseña...');
    try {
      const isPasswordMatch = await user.compararPassword(password);

      if (!isPasswordMatch) {
        console.log('Contraseña incorrecta');
        throw new ApiError(401, 'Credenciales inválidas');
      }

      console.log('Contraseña correcta, login exitoso');
    } catch (error) {
      console.error('Error durante la validación de contraseña:', error);
      throw new ApiError(401, 'Error en la validación de credenciales');
    }

    // Si llegamos aquí, la autenticación fue exitosa
    console.log('Generando tokens de autenticación');
    const tokens = this.generateTokens(user);

    return {
      user,
      tokens,
    };
  }

  async refreshAuth(refreshToken: string) {
    try {
      const decoded = verify(
        refreshToken,
        jwtConfig.refreshSecret,
      ) as JwtPayload;

      const user = await Usuario.findById(decoded.sub);
      if (!user) {
        throw new ApiError(401, 'Usuario no encontrado');
      }

      return this.generateTokens(user);
    } catch (error) {
      throw new ApiError(401, 'Por favor autentíquese nuevamente');
    }
  }

  async register(userData: {
    email: string;
    password: string;
    nombre: string;
    apellidos: string;
    tipo: string;
    escuelaId: string;
  }) {
    const existingUser = await Usuario.findOne({ email: userData.email });
    if (existingUser) {
      throw new ApiError(400, 'El email ya está registrado');
    }

    const user = await Usuario.create(userData);
    const tokens = this.generateTokens(user);

    return {
      user,
      tokens,
    };
  }

  /**
   * Solicita una recuperación de contraseña para el email proporcionado
   * @param email Email del usuario
   * @returns Mensaje de confirmación
   */
  async requestPasswordReset(email: string) {
    try {
      // Verificar si el usuario existe
      const user = await Usuario.findOne({ email });

      // Si el usuario no existe, por seguridad fingimos que todo fue bien
      if (!user) {
        return {
          success: true,
          message: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña',
        };
      }
      // Generar token aleatorio
      const resetToken = crypto.randomBytes(32).toString('hex');

      // Guardar token hasheado en la base de datos
      const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Token válido por 1 hora
      const resetPasswordExpires = new Date(Date.now() + 3600000);

      // Actualizar usuario
      user.resetPasswordToken = resetPasswordToken;
      user.resetPasswordExpires = resetPasswordExpires;
      await user.save();

      // Aquí normalmente enviaríamos un email con el token
      // Para pruebas, simplemente retornamos el token en la respuesta
      // (En producción no deberías mostrar el token)
      return {
        success: true,
        message: 'Se han enviado instrucciones a tu correo electrónico',
        token: resetToken, // Eliminar en producción
      };
    } catch (error) {
      console.error('Error en requestPasswordReset:', error);
      throw new ApiError(500, 'Error al procesar la solicitud');
    }
  }

  /**
   * Restablece la contraseña usando un token de recuperación
   * @param token Token de recuperación
   * @param password Nueva contraseña
   * @returns Mensaje de confirmación
   */
  async resetPassword(token: string, password: string) {
    try {
      // Convertir token a hash para comparar con el almacenado
      const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

      // Buscar usuario con el token y que no haya expirado
      const user = await Usuario.findOne({
        resetPasswordToken,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        throw new ApiError(400, 'Token inválido o expirado');
      }

      // Actualizar contraseña
      user.password = password;

      // Eliminar token de recuperación
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;

      await user.save();

      return {
        success: true,
        message: 'Contraseña restablecida exitosamente',
      };
    } catch (error) {
      console.error('Error en resetPassword:', error);
      throw error;
    }
  }
}

export default new AuthService();
