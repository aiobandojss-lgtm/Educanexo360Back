/**
 * Registro de los handlers de la cola de envíos (Fase 4). Se importa una vez desde app.ts.
 * Cada tipo de trabajo registra aquí su handler con registrarHandler(tipo, fn) de ./outbox.
 */
import { registrarHandler, registrarTareaPeriodica, ReprogramarTrabajo } from './outbox';
import { encolarResumenSiCorresponde, procesarResumenDiario } from '../services/resumenDiario.service';
import { esEmailFicticio } from '../services/email.service';
import { obtenerProveedor } from '../services/email/proveedores';
import { reservarCupo, liberarCupo, cupoDeHoy } from '../services/email/cupo';
import { renderizarCorreo } from '../services/email/plantillas';
import { inicioDiaSiguienteColombia } from '../utils/fechas';
import pushNotificationService from '../services/pushNotification.service';
import mensajeService from '../services/mensaje.service';
import Mensaje from '../models/mensaje.model';
import { logger } from '../utils/logger';
import { enmascararEmail, enmascararEmailsEnTexto } from '../utils/enmascarar';

/** Marca un id como atendido reintentando ante fallos de red (el envío ya ocurrió: nunca se reenvía por esto). */
const marcarConReintentos = async (ctx: { marcarEnviados: (ids: string[]) => Promise<void> }, id: string) => {
  for (let intento = 1; ; intento++) {
    try {
      await ctx.marcarEnviados([id]);
      return;
    } catch (error) {
      if (intento >= 3) throw error;
      await new Promise((r) => setTimeout(r, 200 * intento));
    }
  }
};

/**
 * 'email': un lote de hasta ~50 destinatarios con la misma plantilla.
 * - Cada destinatario atendido se registra en `enviados` (por email): un reintento no lo repite.
 * - Sin cupo diario → el trabajo se aplaza a mañana 00:05 (hora Colombia) SIN gastar intento; nada se
 *   descarta en silencio.
 * - Si el proveedor falla con algún destinatario, se sigue con los demás y al final el trabajo falla para
 *   reintentar SOLO los que no salieron (backoff; FALLIDO al agotar intentos).
 */
registrarHandler('email', async (trabajo, ctx) => {
  const { destinatarios = [], plantilla, datos } = trabajo.payload || {};
  const prioridad = trabajo.prioridad;
  const errores: string[] = [];

  for (const dest of destinatarios as { email: string; nombre?: string }[]) {
    const clave = String(dest?.email || '').trim().toLowerCase();
    if (!clave || ctx.enviados.has(clave)) continue;
    if (esEmailFicticio(clave)) {
      await ctx.marcarEnviados([clave]);
      continue;
    }

    const diaCupo = await reservarCupo(prioridad);
    if (!diaCupo) {
      const cupo = await cupoDeHoy();
      const pendientes = destinatarios.length - ctx.enviados.size;
      throw new ReprogramarTrabajo(
        inicioDiaSiguienteColombia(new Date(), 5),
        `Cupo diario de correo agotado (${cupo.enviados}/${cupo.limite}, reserva alta ${cupo.reservaAlta}); ` +
          `${pendientes} correo(s) quedan para mañana`,
      );
    }

    try {
      const correo = renderizarCorreo(plantilla, datos, dest);
      await obtenerProveedor().send({ to: dest.email, ...correo });
    } catch (error: any) {
      await liberarCupo(prioridad, 1, diaCupo);
      if (error?.permanente) {
        // Rechazo permanente (dirección inexistente/rechazada, auditoría 4.H): no se reintenta, se da por atendido
        logger.warn(`[Email] Rechazo permanente para ${enmascararEmail(clave)}: ${enmascararEmailsEnTexto(String(error?.message || error).slice(0, 150))}`);
        await marcarConReintentos(ctx, clave);
        continue;
      }
      // En el error del trabajo (se guarda en outbox y va al log) el correo va enmascarado
      errores.push(`${enmascararEmail(clave)}: ${enmascararEmailsEnTexto(String(error?.message || error).slice(0, 150))}`);
      continue;
    }
    // El correo YA salió (auditoría 4.J): si marcarlo falla se reintenta SOLO el marcado; no se libera cupo ni
    // se reenvía. Si ni así se puede, el trabajo falla (un reintento podría repetir ESTE correo: al menos una vez).
    await marcarConReintentos(ctx, clave);
  }

  if (errores.length > 0) {
    throw new Error(`${errores.length} correo(s) no salieron: ${errores.slice(0, 3).join(' | ')}`);
  }
});

/**
 * 'push': un lote de hasta ~50 usuarios con el mismo contenido (Fase 4.3).
 * - Los tokens de esos usuarios se leen en UNA consulta; se envía con sendEachForMulticast en bloques de 500
 *   (con ≤50 usuarios × ≤5 dispositivos es una sola llamada) y los inválidos se limpian con un $pull.
 * - Todo o nada por lote: si FCM falla, el trabajo se reintenta; los usuarios ya atendidos quedan en
 *   `enviados` y no se repiten.
 * - Sin Firebase configurado el trabajo termina sin enviar (push desactivado, como antes).
 */
registrarHandler('push', async (trabajo, ctx) => {
  const { usuarioIds = [], titulo, mensaje, data, sound } = trabajo.payload || {};
  const pendientes = (usuarioIds as string[]).map(String).filter((id) => !ctx.enviados.has(id));
  if (pendientes.length === 0 || !pushNotificationService.disponible) return;

  const tokens = await pushNotificationService.obtenerTokens(pendientes);
  await pushNotificationService.enviarMulticast(tokens, { titulo, mensaje, data, sound });
  await ctx.marcarEnviados(pendientes);
});

/**
 * 'copias-acudientes': genera las copias a acudientes de un mensaje (Fase 4.2), hasta ~50 estudiantes por
 * trabajo. Idempotente: si la copia de (mensaje, estudiante) ya existe (copiaDe + índice único) se omite, así
 * un reintento no la duplica. Cada copia pasa por crearMensaje, que encola sus propias notificaciones.
 */
registrarHandler('copias-acudientes', async (trabajo, ctx) => {
  const { mensajeOriginalId, estudianteIds = [], datos, usuario } = trabajo.payload || {};
  for (const estudianteId of (estudianteIds as string[]).map(String)) {
    if (ctx.enviados.has(estudianteId)) continue;
    const yaExiste = await Mensaje.exists({
      'copiaDe.mensajeId': mensajeOriginalId,
      'copiaDe.estudianteId': estudianteId,
    });
    if (!yaExiste) {
      try {
        await mensajeService.enviarCopiaAcudientes(estudianteId, datos, usuario, {
          mensajeId: mensajeOriginalId,
          estudianteId,
        });
      } catch (error: any) {
        const duplicada = /E11000/.test(String(error?.message || ''));
        const permanente = error?.statusCode >= 400 && error?.statusCode < 500; // p. ej. sin acudientes válidos
        if (!duplicada && !permanente) throw error; // temporal: el trabajo se reintenta sin repetir los hechos
        if (permanente) logger.warn(`[Copias] Estudiante ${estudianteId}: ${error.message} (se omite)`);
      }
    }
    await ctx.marcarEnviados([estudianteId]);
  }
});

/**
 * Resumen diario (Fase 4.5): la tarea periódica encola una vez al día 'resumen-diario' desde las 18:00
 * (hora Colombia); el handler arma los correos (solo lo omitido por la preferencia 'resumen', nunca vacíos).
 */
registrarTareaPeriodica('resumen-diario', async () => {
  await encolarResumenSiCorresponde();
});
registrarHandler('resumen-diario', async (trabajo) => {
  await procesarResumenDiario(String(trabajo.payload?.dia));
});
