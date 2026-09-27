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

  // Bienvenida al aprobar una solicitud (Fase 4.7): ENLACES para definir contraseñas, nunca contraseñas
  credenciales: (d) => {
    const estudiantes: any[] = Array.isArray(d.estudiantes) ? d.estudiantes : [];
    const horas = Number(d.horas) || 72;
    const textoEst = estudiantes
      .map((est) =>
        est.esExistente
          ? `- ${est.nombre} (ya tenía cuenta; ahora está asociado a usted). Usuario: ${est.email}. Código: ${est.codigo}.`
          : `- ${est.nombre} (${est.curso || 'curso sin especificar'}). Usuario: ${est.email}. Código: ${est.codigo}.\n  Definir su contraseña: ${est.enlace}`,
      )
      .join('\n');
    const htmlEst = estudiantes
      .map((est) =>
        est.esExistente
          ? `<li><strong>${e(est.nombre)}</strong> — ya tenía cuenta y ahora está asociado a usted.<br>Usuario: ${e(est.email)} · Código: ${e(est.codigo)}</li>`
          : `<li><strong>${e(est.nombre)}</strong> — ${e(est.curso || 'curso sin especificar')}<br>Usuario: ${e(est.email)} · Código: ${e(est.codigo)}<br><a href="${urlSegura(est.enlace)}">Definir la contraseña del estudiante</a></li>`,
      )
      .join('');
    return {
      subject: '🎓 ¡Bienvenido a EducaNexo360! - Active su cuenta',
      text:
        `¡Bienvenido/a ${d.nombre} a EducaNexo360!\n\nSu solicitud de registro fue aprobada.\n\n` +
        `SU CUENTA DE ACUDIENTE\nUsuario: ${d.email}\nDefina su contraseña aquí: ${d.enlace}\n\n` +
        (estudiantes.length ? `ESTUDIANTES ASOCIADOS\n${textoEst}\n\n` : '') +
        `Por seguridad, cada enlace sirve UNA sola vez y vence en ${horas} horas. Si el suyo vence, use ` +
        `"¿Olvidaste tu contraseña?" en ${d.loginUrl}.` +
        (estudiantes.some((est) => !est.esExistente)
          ? ` Si vence el enlace de un estudiante, pida al colegio que reenvíe el enlace (el estudiante no recibe correos).`
          : '') +
        `\n\nEl equipo de EducaNexo360`,
      html: layout(
        '¡Bienvenido a EducaNexo360!',
        `<p>Hola ${e(d.nombre)},</p>
         <p>Su solicitud de registro fue aprobada.</p>
         <h3>Su cuenta de acudiente</h3>
         <p>Usuario: <strong>${e(d.email)}</strong></p>
         ${boton(d.enlace, 'Definir mi contraseña')}
         ${estudiantes.length ? `<h3>Estudiantes asociados</h3><ul>${htmlEst}</ul>` : ''}
         <p style="font-size: 13px; color: #555;">Por seguridad, cada enlace sirve <strong>una sola vez</strong> y vence en
         ${horas} horas. Si el suyo vence, use "¿Olvidaste tu contraseña?" en <a href="${urlSegura(d.loginUrl)}">${e(d.loginUrl)}</a>.${
           estudiantes.some((est) => !est.esExistente)
             ? ' Si vence el enlace de un estudiante, pida al colegio que reenvíe el enlace (el estudiante no recibe correos).'
             : ''
         }</p>`,
      ),
    };
  },

  // Reenvío del enlace para definir contraseña (auditoría 4.P). esPropio: el enlace es para quien lo recibe;
  // si no, es para un estudiante a cargo del acudiente que lo recibe.
  'enlace-contrasena': (d) => {
    const horas = Number(d.horas) || 72;
    const para = d.esPropio ? 'su cuenta' : `la cuenta del estudiante ${d.nombreUsuario}`;
    return {
      subject: 'Defina su contraseña - EducaNexo360',
      text:
        `Hola ${d.nombre},\n\nEl colegio le envía un enlace para definir la contraseña de ${para} en EducaNexo360.\n` +
        `Usuario: ${d.usuario}\n\nDefina la contraseña aquí: ${d.enlace}\n\n` +
        `El enlace sirve UNA sola vez y vence en ${horas} horas. Los enlaces enviados antes para esta cuenta ya no ` +
        `funcionan. Si vence, pida al colegio que lo reenvíe.\n\nEl equipo de EducaNexo360`,
      html: layout(
        'Defina su contraseña',
        `<p>Hola ${e(d.nombre)},</p>
         <p>El colegio le envía un enlace para definir la contraseña de ${d.esPropio ? 'su cuenta' : `la cuenta del estudiante <strong>${e(d.nombreUsuario)}</strong>`} en EducaNexo360.</p>
         <p>Usuario: <strong>${e(d.usuario)}</strong></p>
         ${boton(d.enlace, 'Definir contraseña')}
         <p style="font-size: 13px; color: #555;">El enlace sirve <strong>una sola vez</strong> y vence en ${horas} horas.
         Los enlaces enviados antes para esta cuenta ya no funcionan. Si vence, pida al colegio que lo reenvíe.</p>`,
      ),
    };
  },

  // Resumen diario de mensajes no leídos (Fase 4.5). Cada destinatario trae sus propios items.
  resumen: (d, dest: any) => {
    const items: any[] = Array.isArray(dest.items) ? dest.items : [];
    const total = Number(dest.total) || items.length;
    const faltan = total - items.length;
    const cambiar = d.urlPreferencias
      ? `<p style="font-size: 12px; color: #666;">¿Prefieres otra frecuencia? <a href="${urlSegura(d.urlPreferencias)}">Cambia tu preferencia de correo</a>.</p>`
      : '<p style="font-size: 12px; color: #666;">Puedes cambiar la frecuencia de estos correos desde tu perfil en EducaNexo360.</p>';
    return {
      subject: `Tienes ${total} mensaje${total === 1 ? '' : 's'} sin leer en EducaNexo360`,
      text:
        `Hola ${dest.nombre || ''},\n\nEstos son tus mensajes sin leer de hoy:\n\n` +
        items.map((i) => `- ${i.remitente}: ${i.asunto} (${i.url})`).join('\n') +
        (faltan > 0 ? `\n... y ${faltan} más.` : '') +
        `\n\nVer mensajes: ${d.urlMensajes}`,
      html: layout(
        'Resumen de mensajes',
        `<p>Hola ${e(dest.nombre || '')},</p>
         <p>Estos son tus mensajes sin leer de hoy:</p>
         <ul>${items
           .map((i) => `<li><strong>${e(i.remitente)}</strong>: <a href="${urlSegura(i.url)}">${e(i.asunto)}</a></li>`)
           .join('')}</ul>
         ${faltan > 0 ? `<p>... y ${faltan} más.</p>` : ''}
         ${boton(d.urlMensajes, 'Ver mis mensajes')}
         ${cambiar}`,
      ),
    };
  },

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
