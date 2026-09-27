// src/services/email.service.ts

import { logger } from '../utils/logger';
import { encolar } from '../queue/outbox';
import { obtenerProveedor } from './email/proveedores';
import { reservarCupo, liberarCupo } from './email/cupo';
import { renderizarCorreo, DestinatarioCorreo } from './email/plantillas';

// Dominio usado para correos ficticios de estudiantes sin email propio
const DOMINIO_EMAIL_FICTICIO = '@estudiante.educanexo.com';

// Destinatarios por trabajo de correo en la cola (Fase 4, ajuste del orquestador: lotes de ~50)
export const DESTINATARIOS_POR_TRABAJO = 50;

/**
 * Detecta si un email fue generado automáticamente por el sistema
 * (estudiantes sin correo real). Estos emails no deben recibir notificaciones.
 */
export function esEmailFicticio(email: string): boolean {
  return String(email || '').toLowerCase().endsWith(DOMINIO_EMAIL_FICTICIO);
}

/**
 * Encola correos (Fase 4.4): el envío lo hace el worker de la cola, con reintentos, cupo diario y el
 * proveedor configurado (EMAIL_PROVIDER). Agrupa los destinatarios en trabajos de ~50.
 * - Se descartan los correos vacíos y los ficticios de estudiantes.
 * - `sensible`: el payload se borra del trabajo al terminar (p. ej. enlaces de reset con token).
 * Devuelve cuántos trabajos se encolaron. Lanza si no se pudo encolar (el llamador decide).
 */
export const encolarCorreo = async (opciones: {
  destinatarios: DestinatarioCorreo[];
  plantilla: string;
  datos: Record<string, any>;
  prioridad?: 'alta' | 'normal';
  escuelaId?: string;
  sensible?: boolean;
}): Promise<number> => {
  const vistos = new Set<string>();
  const validos = opciones.destinatarios.filter((d) => {
    const email = String(d?.email || '').trim().toLowerCase();
    if (!email || esEmailFicticio(email) || vistos.has(email)) return false;
    vistos.add(email);
    return true;
  });
  if (validos.length === 0) return 0;

  const trabajos = [];
  for (let i = 0; i < validos.length; i += DESTINATARIOS_POR_TRABAJO) {
    trabajos.push({
      tipo: 'email',
      prioridad: opciones.prioridad || 'normal',
      escuelaId: opciones.escuelaId,
      payload: {
        plantilla: opciones.plantilla,
        datos: opciones.datos,
        destinatarios: validos.slice(i, i + DESTINATARIOS_POR_TRABAJO).map((d) => ({
          email: d.email,
          ...(d.nombre && { nombre: d.nombre }),
          ...(d.usuarioId && { usuarioId: String(d.usuarioId) }),
        })),
        ...(opciones.sensible && { sensible: true }),
      },
    });
  }
  return encolar(trabajos as any);
};

/**
 * Envía UN correo ahora mismo por el proveedor, descontando del cupo diario.
 * Devuelve false si no hay cupo (el llamador decide: la cola lo aplaza). Lanza si el proveedor falla
 * (el cupo reservado se devuelve).
 */
export const enviarCorreoAhora = async (opciones: {
  destinatario: DestinatarioCorreo;
  plantilla: string;
  datos: Record<string, any>;
  prioridad: 'alta' | 'normal';
}): Promise<boolean> => {
  const correo = renderizarCorreo(opciones.plantilla, opciones.datos, opciones.destinatario);
  if (!(await reservarCupo(opciones.prioridad))) return false;
  try {
    await obtenerProveedor().send({ to: opciones.destinatario.email, ...correo });
    return true;
  } catch (error) {
    await liberarCupo(opciones.prioridad);
    throw error;
  }
};

/**
 * API anterior, conservada por compatibilidad. Ya no hay tope en memoria: el cupo es el diario persistido.
 * Nuevo código: usar encolarCorreo (con reintentos) en lugar de estos métodos.
 */
class EmailService {
  /** Envío directo de un correo con asunto/texto/html ya armados. true si salió. */
  async sendEmail(options: { to: string | string[]; subject: string; text?: string; html?: string }): Promise<boolean> {
    const destinos = (Array.isArray(options.to) ? options.to : [options.to]).filter(Boolean);
    let ok = true;
    for (const to of destinos) {
      try {
        if (!(await reservarCupo('normal'))) {
          logger.warn(`[Email] Cupo diario agotado: no se envió "${options.subject}" a ${to}`);
          ok = false;
          continue;
        }
        try {
          await obtenerProveedor().send({ to, subject: options.subject, text: options.text, html: options.html });
        } catch (error) {
          await liberarCupo('normal');
          throw error;
        }
      } catch (error: any) {
        logger.error(`[Email] Error enviando "${options.subject}" a ${to}:`, error?.message || error);
        ok = false;
      }
    }
    return ok;
  }

  /** Notificación de nuevo mensaje (plantilla 'mensaje', escapada). true si salió. */
  async sendMensajeNotification(
    to: string,
    mensajeInfo: { remitente: string; asunto: string; fecha: Date; tieneAdjuntos: boolean; url: string },
  ): Promise<boolean> {
    try {
      const ok = await enviarCorreoAhora({ destinatario: { email: to }, plantilla: 'mensaje', datos: mensajeInfo, prioridad: 'normal' });
      if (!ok) logger.warn(`[Email] Cupo diario agotado: no se envió la notificación de mensaje a ${to}`);
      return ok;
    } catch (error: any) {
      logger.error(`[Email] Error enviando notificación de mensaje a ${to}:`, error?.message || error);
      return false;
    }
  }
}

export default new EmailService();
