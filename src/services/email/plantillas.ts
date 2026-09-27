import { escapeHtml as e, urlSegura } from '../../utils/escapeHtml';

/**
 * Plantillas de correo (Fase 4.4). Se renderizan en el worker, al momento de enviar.
 * TODO dato que viene de usuarios (asunto, remitente, títulos, mensajes, nombres, motivos) se escapa con
 * escapeHtml; los enlaces pasan por urlSegura (solo http/https).
 */
export interface CorreoRenderizado {
  subject: string;
  text: string;
  html?: string;
}

export interface DestinatarioCorreo {
  email: string;
  nombre?: string;
  usuarioId?: string;
}

const fechaCO = (valor: unknown): string => {
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
};

// El asunto va en una cabecera, no en HTML: solo se quitan saltos de línea (evita inyección de cabeceras)
const asuntoSeguro = (valor: unknown): string => String(valor ?? '').replace(/[\r\n]+/g, ' ').slice(0, 250);

const layout = (titulo: string, cuerpo: string, color = '#3f51b5'): string => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background-color: ${color}; color: white; padding: 20px; text-align: center;">
      <h1>${titulo}</h1>
    </div>
    <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
      ${cuerpo}
    </div>
    <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #666;">
      <p>Este es un correo automático, por favor no responda a este mensaje.</p>
      <p>&copy; ${new Date().getFullYear()} EducaNexo360. Todos los derechos reservados.</p>
    </div>
  </div>`;

const boton = (url: string, texto: string, color = '#3f51b5'): string =>
  `<p><a href="${urlSegura(url)}" style="display: inline-block; background-color: ${color}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">${e(texto)}</a></p>`;

type Plantilla = (datos: any, destinatario: DestinatarioCorreo) => CorreoRenderizado;

export const PLANTILLAS: Record<string, Plantilla> = {
  // Nuevo mensaje en la plataforma
  mensaje: (d) => ({
    subject: asuntoSeguro(`Nuevo mensaje: ${d.asunto}`),
    text:
      `Nuevo mensaje de ${d.remitente}: ${d.asunto}.\n\nRecibido: ${fechaCO(d.fecha)}.\n` +
      `${d.tieneAdjuntos ? 'El mensaje contiene archivos adjuntos.' : ''}\n\nVer mensaje: ${d.url}`,
    html: layout(
      'Nuevo Mensaje',
      `<p>Hola,</p>
       <p>Has recibido un nuevo mensaje en la plataforma EducaNexo360.</p>
       <h3>Detalles del mensaje:</h3>
       <p><strong>De:</strong> ${e(d.remitente)}</p>
       <p><strong>Asunto:</strong> ${e(d.asunto)}</p>
       <p><strong>Fecha:</strong> ${e(fechaCO(d.fecha))}</p>
       ${d.tieneAdjuntos ? '<p><strong>Este mensaje contiene archivos adjuntos.</strong></p>' : ''}
       ${boton(d.url, 'Ver Mensaje')}`,
    ),
  }),

  // Recuperación de contraseña
  reset: (d) => ({
    subject: 'Recuperación de contraseña - EducaNexo360',
    text:
      `Hola ${d.nombre},\n\nHas solicitado restablecer tu contraseña en EducaNexo360.\n\n` +
      `Haz clic en el siguiente enlace para establecer una nueva contraseña:\n${d.resetUrl}\n\n` +
      `Este enlace expirará en ${d.expirationTime}.\n\n` +
      `Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.\n\nEl equipo de EducaNexo360`,
    html: layout(
      'Recuperación de Contraseña',
      `<p>Hola ${e(d.nombre)},</p>
       <p>Has solicitado restablecer tu contraseña en la plataforma EducaNexo360.</p>
       <div style="text-align: center; margin: 30px 0;">${boton(d.resetUrl, 'Restablecer Contraseña', '#4a6da7')}</div>
       <p>O copia y pega el siguiente enlace en tu navegador:</p>
       <p style="word-break: break-all; color: #666; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${e(d.resetUrl)}</p>
       <p><strong>Este enlace expirará en ${e(d.expirationTime)}.</strong></p>
       <p>Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.</p>`,
      '#4a6da7',
    ),
  }),

  // Notificación genérica (notificacion.service con enviarEmail)
  notificacion: (d) => ({
    subject: asuntoSeguro(d.titulo),
    text: `${d.titulo}\n\n${d.mensaje}`,
    html: layout(
      e(d.tipoTexto || 'Notificación del sistema'),
      `<h2>${e(d.titulo)}</h2>
       <p>${e(d.mensaje)}</p>
       ${boton(d.url, 'Ver detalles')}`,
    ),
  }),

  // Alerta de asistencia (prioridad alta)
  'alerta-asistencia': (d, dest) => ({
    subject: asuntoSeguro(d.titulo),
    text: `Estimado/a ${dest.nombre || 'usuario'},\n\n${d.mensaje}\n\nIngrese a EducaNexo360 para revisar el detalle de la alerta.`,
    html: layout(
      e(d.titulo),
      `<p>Estimado/a ${e(dest.nombre || 'usuario')},</p>
       <p>${e(d.mensaje)}</p>
       <p>Ingrese a <strong>EducaNexo360</strong> para revisar el detalle de la alerta.</p>`,
      '#c62828',
    ),
  }),

  // Solo texto (avisos de registro): sin HTML, no hay nada que escapar
  texto: (d) => ({ subject: asuntoSeguro(d.subject), text: String(d.text ?? '') }),
};

export const renderizarCorreo = (
  plantilla: string,
  datos: any,
  destinatario: DestinatarioCorreo,
): CorreoRenderizado => {
  const fn = PLANTILLAS[plantilla];
  if (!fn) throw new Error(`Plantilla de correo desconocida: '${plantilla}'`);
  return fn(datos || {}, destinatario);
};
