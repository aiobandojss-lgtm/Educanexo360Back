/**
 * Registro de los handlers de la cola de envíos (Fase 4). Se importa una vez desde app.ts.
 * Cada tipo de trabajo registra aquí su handler con registrarHandler(tipo, fn) de ./outbox.
 */
import { registrarHandler, ReprogramarTrabajo } from './outbox';
import { esEmailFicticio } from '../services/email.service';
import { obtenerProveedor } from '../services/email/proveedores';
import { reservarCupo, liberarCupo, cupoDeHoy } from '../services/email/cupo';
import { renderizarCorreo } from '../services/email/plantillas';
import { inicioDiaSiguienteColombia } from '../utils/fechas';
import pushNotificationService from '../services/pushNotification.service';

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

    if (!(await reservarCupo(prioridad))) {
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
      await ctx.marcarEnviados([clave]);
    } catch (error: any) {
      await liberarCupo(prioridad);
      errores.push(`${clave}: ${String(error?.message || error).slice(0, 150)}`);
    }
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
