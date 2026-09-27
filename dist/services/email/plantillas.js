"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderizarCorreo = exports.PLANTILLAS = void 0;
const escapeHtml_1 = require("../../utils/escapeHtml");
const fechaCO = (valor) => {
    const d = new Date(String(valor));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { timeZone: 'America/Bogota' });
};
const asuntoSeguro = (valor) => String(valor ?? '').replace(/[\r\n]+/g, ' ').slice(0, 250);
const layout = (titulo, cuerpo, color = '#3f51b5') => `
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
const boton = (url, texto, color = '#3f51b5') => `<p><a href="${(0, escapeHtml_1.urlSegura)(url)}" style="display: inline-block; background-color: ${color}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px;">${(0, escapeHtml_1.escapeHtml)(texto)}</a></p>`;
exports.PLANTILLAS = {
    mensaje: (d) => ({
        subject: asuntoSeguro(`Nuevo mensaje: ${d.asunto}`),
        text: `Nuevo mensaje de ${d.remitente}: ${d.asunto}.\n\nRecibido: ${fechaCO(d.fecha)}.\n` +
            `${d.tieneAdjuntos ? 'El mensaje contiene archivos adjuntos.' : ''}\n\nVer mensaje: ${d.url}`,
        html: layout('Nuevo Mensaje', `<p>Hola,</p>
       <p>Has recibido un nuevo mensaje en la plataforma EducaNexo360.</p>
       <h3>Detalles del mensaje:</h3>
       <p><strong>De:</strong> ${(0, escapeHtml_1.escapeHtml)(d.remitente)}</p>
       <p><strong>Asunto:</strong> ${(0, escapeHtml_1.escapeHtml)(d.asunto)}</p>
       <p><strong>Fecha:</strong> ${(0, escapeHtml_1.escapeHtml)(fechaCO(d.fecha))}</p>
       ${d.tieneAdjuntos ? '<p><strong>Este mensaje contiene archivos adjuntos.</strong></p>' : ''}
       ${boton(d.url, 'Ver Mensaje')}`),
    }),
    reset: (d) => ({
        subject: 'Recuperación de contraseña - EducaNexo360',
        text: `Hola ${d.nombre},\n\nHas solicitado restablecer tu contraseña en EducaNexo360.\n\n` +
            `Haz clic en el siguiente enlace para establecer una nueva contraseña:\n${d.resetUrl}\n\n` +
            `Este enlace expirará en ${d.expirationTime}.\n\n` +
            `Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.\n\nEl equipo de EducaNexo360`,
        html: layout('Recuperación de Contraseña', `<p>Hola ${(0, escapeHtml_1.escapeHtml)(d.nombre)},</p>
       <p>Has solicitado restablecer tu contraseña en la plataforma EducaNexo360.</p>
       <div style="text-align: center; margin: 30px 0;">${boton(d.resetUrl, 'Restablecer Contraseña', '#4a6da7')}</div>
       <p>O copia y pega el siguiente enlace en tu navegador:</p>
       <p style="word-break: break-all; color: #666; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">${(0, escapeHtml_1.escapeHtml)(d.resetUrl)}</p>
       <p><strong>Este enlace expirará en ${(0, escapeHtml_1.escapeHtml)(d.expirationTime)}.</strong></p>
       <p>Si no has solicitado restablecer tu contraseña, puedes ignorar este correo.</p>`, '#4a6da7'),
    }),
    notificacion: (d) => ({
        subject: asuntoSeguro(d.titulo),
        text: `${d.titulo}\n\n${d.mensaje}`,
        html: layout((0, escapeHtml_1.escapeHtml)(d.tipoTexto || 'Notificación del sistema'), `<h2>${(0, escapeHtml_1.escapeHtml)(d.titulo)}</h2>
       <p>${(0, escapeHtml_1.escapeHtml)(d.mensaje)}</p>
       ${boton(d.url, 'Ver detalles')}`),
    }),
    'alerta-asistencia': (d, dest) => ({
        subject: asuntoSeguro(d.titulo),
        text: `Estimado/a ${dest.nombre || 'usuario'},\n\n${d.mensaje}\n\nIngrese a EducaNexo360 para revisar el detalle de la alerta.`,
        html: layout((0, escapeHtml_1.escapeHtml)(d.titulo), `<p>Estimado/a ${(0, escapeHtml_1.escapeHtml)(dest.nombre || 'usuario')},</p>
       <p>${(0, escapeHtml_1.escapeHtml)(d.mensaje)}</p>
       <p>Ingrese a <strong>EducaNexo360</strong> para revisar el detalle de la alerta.</p>`, '#c62828'),
    }),
    credenciales: (d) => {
        const estudiantes = Array.isArray(d.estudiantes) ? d.estudiantes : [];
        const horas = Number(d.horas) || 72;
        const textoEst = estudiantes
            .map((est) => est.esExistente
            ? `- ${est.nombre} (ya tenía cuenta; ahora está asociado a usted). Usuario: ${est.email}. Código: ${est.codigo}.`
            : `- ${est.nombre} (${est.curso || 'curso sin especificar'}). Usuario: ${est.email}. Código: ${est.codigo}.\n  Definir su contraseña: ${est.enlace}`)
            .join('\n');
        const htmlEst = estudiantes
            .map((est) => est.esExistente
            ? `<li><strong>${(0, escapeHtml_1.escapeHtml)(est.nombre)}</strong> — ya tenía cuenta y ahora está asociado a usted.<br>Usuario: ${(0, escapeHtml_1.escapeHtml)(est.email)} · Código: ${(0, escapeHtml_1.escapeHtml)(est.codigo)}</li>`
            : `<li><strong>${(0, escapeHtml_1.escapeHtml)(est.nombre)}</strong> — ${(0, escapeHtml_1.escapeHtml)(est.curso || 'curso sin especificar')}<br>Usuario: ${(0, escapeHtml_1.escapeHtml)(est.email)} · Código: ${(0, escapeHtml_1.escapeHtml)(est.codigo)}<br><a href="${(0, escapeHtml_1.urlSegura)(est.enlace)}">Definir la contraseña del estudiante</a></li>`)
            .join('');
        return {
            subject: '🎓 ¡Bienvenido a EducaNexo360! - Active su cuenta',
            text: `¡Bienvenido/a ${d.nombre} a EducaNexo360!\n\nSu solicitud de registro fue aprobada.\n\n` +
                `SU CUENTA DE ACUDIENTE\nUsuario: ${d.email}\nDefina su contraseña aquí: ${d.enlace}\n\n` +
                (estudiantes.length ? `ESTUDIANTES ASOCIADOS\n${textoEst}\n\n` : '') +
                `Por seguridad, cada enlace sirve UNA sola vez y vence en ${horas} horas. Si el suyo vence, use ` +
                `"¿Olvidaste tu contraseña?" en ${d.loginUrl}.` +
                (estudiantes.some((est) => !est.esExistente)
                    ? ` Si vence el enlace de un estudiante, pida al colegio que reenvíe el enlace (el estudiante no recibe correos).`
                    : '') +
                `\n\nEl equipo de EducaNexo360`,
            html: layout('¡Bienvenido a EducaNexo360!', `<p>Hola ${(0, escapeHtml_1.escapeHtml)(d.nombre)},</p>
         <p>Su solicitud de registro fue aprobada.</p>
         <h3>Su cuenta de acudiente</h3>
         <p>Usuario: <strong>${(0, escapeHtml_1.escapeHtml)(d.email)}</strong></p>
         ${boton(d.enlace, 'Definir mi contraseña')}
         ${estudiantes.length ? `<h3>Estudiantes asociados</h3><ul>${htmlEst}</ul>` : ''}
         <p style="font-size: 13px; color: #555;">Por seguridad, cada enlace sirve <strong>una sola vez</strong> y vence en
         ${horas} horas. Si el suyo vence, use "¿Olvidaste tu contraseña?" en <a href="${(0, escapeHtml_1.urlSegura)(d.loginUrl)}">${(0, escapeHtml_1.escapeHtml)(d.loginUrl)}</a>.${estudiantes.some((est) => !est.esExistente)
                ? ' Si vence el enlace de un estudiante, pida al colegio que reenvíe el enlace (el estudiante no recibe correos).'
                : ''}</p>`),
        };
    },
    'enlace-contrasena': (d) => {
        const horas = Number(d.horas) || 72;
        const para = d.esPropio ? 'su cuenta' : `la cuenta del estudiante ${d.nombreUsuario}`;
        return {
            subject: 'Defina su contraseña - EducaNexo360',
            text: `Hola ${d.nombre},\n\nEl colegio le envía un enlace para definir la contraseña de ${para} en EducaNexo360.\n` +
                `Usuario: ${d.usuario}\n\nDefina la contraseña aquí: ${d.enlace}\n\n` +
                `El enlace sirve UNA sola vez y vence en ${horas} horas. Los enlaces enviados antes para esta cuenta ya no ` +
                `funcionan. Si vence, pida al colegio que lo reenvíe.\n\nEl equipo de EducaNexo360`,
            html: layout('Defina su contraseña', `<p>Hola ${(0, escapeHtml_1.escapeHtml)(d.nombre)},</p>
         <p>El colegio le envía un enlace para definir la contraseña de ${d.esPropio ? 'su cuenta' : `la cuenta del estudiante <strong>${(0, escapeHtml_1.escapeHtml)(d.nombreUsuario)}</strong>`} en EducaNexo360.</p>
         <p>Usuario: <strong>${(0, escapeHtml_1.escapeHtml)(d.usuario)}</strong></p>
         ${boton(d.enlace, 'Definir contraseña')}
         <p style="font-size: 13px; color: #555;">El enlace sirve <strong>una sola vez</strong> y vence en ${horas} horas.
         Los enlaces enviados antes para esta cuenta ya no funcionan. Si vence, pida al colegio que lo reenvíe.</p>`),
        };
    },
    resumen: (d, dest) => {
        const items = Array.isArray(dest.items) ? dest.items : [];
        const total = Number(dest.total) || items.length;
        const faltan = total - items.length;
        const cambiar = d.urlPreferencias
            ? `<p style="font-size: 12px; color: #666;">¿Prefieres otra frecuencia? <a href="${(0, escapeHtml_1.urlSegura)(d.urlPreferencias)}">Cambia tu preferencia de correo</a>.</p>`
            : '<p style="font-size: 12px; color: #666;">Puedes cambiar la frecuencia de estos correos desde tu perfil en EducaNexo360.</p>';
        return {
            subject: `Tienes ${total} mensaje${total === 1 ? '' : 's'} sin leer en EducaNexo360`,
            text: `Hola ${dest.nombre || ''},\n\nEstos son tus mensajes sin leer de hoy:\n\n` +
                items.map((i) => `- ${i.remitente}: ${i.asunto} (${i.url})`).join('\n') +
                (faltan > 0 ? `\n... y ${faltan} más.` : '') +
                `\n\nVer mensajes: ${d.urlMensajes}`,
            html: layout('Resumen de mensajes', `<p>Hola ${(0, escapeHtml_1.escapeHtml)(dest.nombre || '')},</p>
         <p>Estos son tus mensajes sin leer de hoy:</p>
         <ul>${items
                .map((i) => `<li><strong>${(0, escapeHtml_1.escapeHtml)(i.remitente)}</strong>: <a href="${(0, escapeHtml_1.urlSegura)(i.url)}">${(0, escapeHtml_1.escapeHtml)(i.asunto)}</a></li>`)
                .join('')}</ul>
         ${faltan > 0 ? `<p>... y ${faltan} más.</p>` : ''}
         ${boton(d.urlMensajes, 'Ver mis mensajes')}
         ${cambiar}`),
        };
    },
    texto: (d) => ({ subject: asuntoSeguro(d.subject), text: String(d.text ?? '') }),
};
const renderizarCorreo = (plantilla, datos, destinatario) => {
    const fn = exports.PLANTILLAS[plantilla];
    if (!fn)
        throw new Error(`Plantilla de correo desconocida: '${plantilla}'`);
    return fn(datos || {}, destinatario);
};
exports.renderizarCorreo = renderizarCorreo;
//# sourceMappingURL=plantillas.js.map