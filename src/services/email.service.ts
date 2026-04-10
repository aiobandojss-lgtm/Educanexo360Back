// src/services/email.service.ts

import nodemailer from 'nodemailer';
import path from 'path';
import config from '../config/config';
import fs from 'fs';

// Constante para deshabilitar temporalmente el envío de correos
// Cambiar a false cuando se quiera habilitar nuevamente
const DISABLE_EMAIL_SENDING = false;

// Dominio usado para correos ficticios de estudiantes sin email propio
const DOMINIO_EMAIL_FICTICIO = '@estudiante.educanexo.com';

/**
 * Detecta si un email fue generado automáticamente por el sistema
 * (estudiantes sin correo real). Estos emails no deben recibir notificaciones.
 */
export function esEmailFicticio(email: string): boolean {
  return email.endsWith(DOMINIO_EMAIL_FICTICIO);
}

class EmailService {
  private transporter: nodemailer.Transporter;
  private dailyEmailCount = 0;
  private lastCountReset = new Date();
  private readonly DAILY_LIMIT = 250; // Límite diario para evitar excesos

  constructor() {
    console.log('🔧 Inicializando servicio de correo con configuración:');
    console.log(`🔧 Host: ${config.email.host}`);
    console.log(`🔧 Puerto: ${config.email.port}`);
    console.log(`🔧 Usuario: ${config.email.user}`);
    console.log(`🔧 Seguro: ${config.email.secure}`);
    console.log(`🔧 Remitente: ${config.email.senderName} <${config.email.senderEmail}>`);

    // En producción, usar un servicio real como Sendgrid, Mailgun, etc.
    // Para desarrollo, utilizar servicio fake (ethereal.email)
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
      // Para entornos de desarrollo, opcional
      secure: config.email.secure,
      tls: {
        rejectUnauthorized: config.email.tlsRejectUnauthorized,
      },
    });

    // Verificar conexión al iniciar
    this.verificarConexion();
  }

  // Método para verificar la conexión al servidor SMTP
  private async verificarConexion() {
    try {
      const verificacion = await this.transporter.verify();
      console.log('✅ Conexión al servidor SMTP verificada:', verificacion);
    } catch (error) {
      console.error('❌ Error al verificar conexión SMTP:', error);
      console.error('⚠️ Revisa tu configuración de email en las variables de entorno');

      // Mostrar detalles específicos del error
      const err = error as { code?: string; command?: string; response?: string };
      if (err.code) console.error('Código de error:', err.code);
      if (err.command) console.error('Comando fallido:', err.command);
      if (err.response) console.error('Respuesta del servidor:', err.response);
    }
  }

  async sendEmail(options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    template?: string;
    context?: any;
    attachments?: any[];
  }): Promise<boolean> {
    try {
      console.log('📧 DEPURACIÓN: Intentando enviar email a:', options.to);
      console.log('📧 DEPURACIÓN: Asunto:', options.subject);

      // Verificar límite diario
      if (new Date().getDate() !== this.lastCountReset.getDate()) {
        this.dailyEmailCount = 0;
        this.lastCountReset = new Date();
      }

      if (this.dailyEmailCount >= this.DAILY_LIMIT) {
        console.warn(
          `⚠️ Límite diario de correos (${this.DAILY_LIMIT}) alcanzado. Email no enviado.`,
        );
        return false;
      }

      // Si el envío de correos está deshabilitado, simular envío exitoso
      if (DISABLE_EMAIL_SENDING) {
        console.log(
          '📧 [EMAIL DESHABILITADO] No se envió el correo pero se simula respuesta exitosa',
        );
        console.log('📧 Destinatario:', options.to);
        console.log('📧 Asunto:', options.subject);
        return true; // Simular éxito
      }

      // Si se proporciona una plantilla, cargarla
      let html = options.html;
      if (options.template) {
        try {
          const templatePath = path.join(
            __dirname,
            '../templates/emails',
            `${options.template}.html`,
          );
          console.log('📧 DEPURACIÓN: Buscando plantilla en:', templatePath);

          if (fs.existsSync(templatePath)) {
            html = fs.readFileSync(templatePath, 'utf8');
            console.log('📧 DEPURACIÓN: Plantilla cargada correctamente');

            // Reemplazar variables en la plantilla
            if (options.context) {
              Object.keys(options.context).forEach((key) => {
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                html = html!.replace(regex, options.context[key]);
              });
            }
          } else {
            console.warn('⚠️ Plantilla no encontrada:', templatePath);
          }
        } catch (error) {
          console.error('❌ Error loading email template:', error);
        }
      }

      // Configurar email
      const mailOptions = {
        from: `"${config.email.senderName}" <${config.email.senderEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(',') : options.to,
        subject: options.subject,
        text: options.text || '',
        html: html || '',
        attachments: options.attachments,
      };

      console.log('📧 DEPURACIÓN: Opciones finales del correo:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        textLength: mailOptions.text ? mailOptions.text.length : 0,
        htmlLength: mailOptions.html ? mailOptions.html.length : 0,
        attachmentsCount: mailOptions.attachments ? mailOptions.attachments.length : 0,
      });

      // Enviar email
      console.log('📧 DEPURACIÓN: Enviando correo...');
      const info = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email enviado exitosamente. ID:', info.messageId);
      console.log('✅ Información adicional:', info);

      // Incrementar contador diario
      this.dailyEmailCount++;

      return true;
    } catch (error) {
      console.error('❌ Error detallado al enviar email:');
      console.error(error);

      // Mostrar detalles específicos de error SMTP
      const err = error as {
        message?: string;
        code?: string;
        command?: string;
        response?: string;
        responseCode?: string;
      };
      if (err.code) console.error('Código de error:', err.code);
      if (err.command) console.error('Comando fallido:', err.command);
      if (err.response) console.error('Respuesta del servidor:', err.response);
      if (err.responseCode) console.error('Código de respuesta:', err.responseCode);

      if (err.message && err.message.includes('Invalid login')) {
        console.error(
          '❌ CAUSA PROBABLE: Usuario o contraseña incorrectos. Verifica tus credenciales.',
        );
      } else if (err.message && err.message.includes('certificate')) {
        console.error(
          '❌ CAUSA PROBABLE: Problema con certificados SSL. Intenta configurar EMAIL_TLS_REJECT_UNAUTHORIZED=false',
        );
      } else if ((error as { message?: string }).message?.includes('Greeting')) {
        console.error(
          '❌ CAUSA PROBABLE: Tiempo de espera agotado. El servidor puede estar bloqueando conexiones.',
        );
      } else if ((error as { message?: string }).message?.includes('sender address')) {
        console.error(
          '❌ CAUSA PROBABLE: La dirección del remitente no está verificada o no es válida.',
        );
      }

      return false;
    }
  }

  async sendMensajeNotification(
    to: string,
    mensajeInfo: {
      remitente: string;
      asunto: string;
      fecha: Date;
      tieneAdjuntos: boolean;
      url: string;
    },
  ): Promise<boolean> {
    console.log(`📧 Preparando notificación de mensaje para: ${to}`);

    // Texto simple para clientes que no soportan HTML
    const text =
      `Nuevo mensaje de ${mensajeInfo.remitente}: ${mensajeInfo.asunto}.\n\n` +
      `Recibido: ${mensajeInfo.fecha.toLocaleString()}.\n` +
      `${mensajeInfo.tieneAdjuntos ? 'El mensaje contiene archivos adjuntos.' : ''}\n\n` +
      `Ver mensaje: ${mensajeInfo.url}`;

    // HTML para clientes modernos
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #3f51b5; color: white; padding: 20px; text-align: center;">
          <h1>Nuevo Mensaje</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
          <p>Hola,</p>
          <p>Has recibido un nuevo mensaje en la plataforma EducaNexo360.</p>
          <h3>Detalles del mensaje:</h3>
          <p><strong>De:</strong> ${mensajeInfo.remitente}</p>
          <p><strong>Asunto:</strong> ${mensajeInfo.asunto}</p>
          <p><strong>Fecha:</strong> ${mensajeInfo.fecha.toLocaleString()}</p>
          ${
            mensajeInfo.tieneAdjuntos
              ? '<p><strong>Este mensaje contiene archivos adjuntos.</strong></p>'
              : ''
          }
          <p><a href="${
            mensajeInfo.url
          }" style="display: inline-block; background-color: #3f51b5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Ver Mensaje</a></p>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
          <p>Este es un correo automático, por favor no responda a este mensaje.</p>
          <p>&copy; 2024 EducaNexo360. Todos los derechos reservados.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: `Nuevo mensaje: ${mensajeInfo.asunto}`,
      text,
      html,
    });
  }

  /**
   * Envía un correo electrónico para recuperación de contraseña
   * @param to Dirección de correo del destinatario
   * @param resetInfo Información de recuperación de contraseña
   * @returns Éxito del envío
   */
  async sendPasswordResetEmail(
    to: string,
    resetInfo: {
      nombre: string;
      resetUrl: string;
      expirationTime: string;
    },
  ): Promise<boolean> {
    console.log(`📧 Preparando correo de recuperación de contraseña para: ${to}`);

    // Texto simple para clientes que no soportan HTML
    const text =
      `Hola ${resetInfo.nombre},\n\n` +
      `Has solicitado restablecer tu contraseña en EducaNexo360.\n\n` +
      `Por favor, haz clic en el siguiente enlace para establecer una nueva contraseña:\n` +
      `${resetInfo.resetUrl}\n\n` +
      `Este enlace expirará en ${resetInfo.expirationTime}.\n\n` +
      `Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.\n\n` +
      `Saludos,\n` +
      `El equipo de EducaNexo360`;

    // HTML para clientes modernos
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #4a6da7; color: white; padding: 20px; text-align: center;">
          <h1>Recuperación de Contraseña</h1>
        </div>
        <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
          <p>Hola ${resetInfo.nombre},</p>
          <p>Has solicitado restablecer tu contraseña en la plataforma EducaNexo360.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetInfo.resetUrl}" style="display: inline-block; background-color: #4a6da7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Restablecer Contraseña</a>
          </div>
          
          <p>O copia y pega el siguiente enlace en tu navegador:</p>
          <p style="word-break: break-all; color: #666; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${resetInfo.resetUrl}</p>
          
          <p><strong>Este enlace expirará en ${resetInfo.expirationTime}.</strong></p>
          
          <p>Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.</p>
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
          <p>Este es un correo automático, por favor no responda a este mensaje.</p>
          <p>&copy; 2024 EducaNexo360. Todos los derechos reservados.</p>
        </div>
      </div>
    `;

    return this.sendEmail({
      to,
      subject: 'Recuperación de contraseña - EducaNexo360',
      text,
      html,
    });
  }
}

export default new EmailService();
