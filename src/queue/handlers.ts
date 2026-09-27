/**
 * Registro de los handlers de la cola de envíos (Fase 4). Se importa una vez desde app.ts.
 * Cada tipo de trabajo registra aquí su handler con registrarHandler(tipo, fn) de ./outbox.
 */
import { registrarHandler, registrarTareaPeriodica, ReprogramarTrabajo, encolar, registrarObservadorFallido } from './outbox';
import { registrarEnvioProveedor, registrarFallido, revisarCierre } from './monitorEnvios';
import { encolarResumenSiCorresponde, procesarResumenDiario } from '../services/resumenDiario.service';
import { esEmailFicticio } from '../services/email.service';
import { obtenerProveedor, registrarObservadorEnvios } from '../services/email/proveedores';
import { reservarCupo, liberarCupo, cupoDeHoy } from '../services/email/cupo';
import { renderizarCorreo } from '../services/email/plantillas';
import { inicioDiaSiguienteColombia } from '../utils/fechas';
import pushNotificationService, { MAX_REINTENTOS_TOKENS } from '../services/pushNotification.service';
import mensajeService from '../services/mensaje.service';
import Mensaje from '../models/mensaje.model';
import { logger } from '../utils/logger';
import { enmascararEmail, enmascararEmailsEnTexto } from '../utils/enmascarar';
import { procesarCorreoCuenta } from '../services/email/cuentas';

// Auditoría 4.AG: detector de fallos sistémicos del correo (episodios con aviso por campanita + push)
registrarObservadorEnvios((resultado) => registrarEnvioProveedor(resultado));
registrarObservadorFallido((trabajo) => registrarFallido(trabajo));
registrarTareaPeriodica('monitor-envios', async () => revisarCierre());

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
    ctx.comprobarCancelacion(); // auditoría 4.S: antes de reservar cupo y enviar
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
        `Cupo diario de correo agotado (${cupo.enviados}/${cupo.limite}, reservas alta ${cupo.reservaAlta} y crítica ${cupo.reservaCritica}); ` +
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
 * - Auditoría 4.I: los tokens con error TRANSITORIO de FCM (no disponible, límite de tasa) se reintentan en un
 *   trabajo 'push' nuevo solo con esos tokens (payload.tokens), con backoff y máximo MAX_REINTENTOS_TOKENS veces.
 *   La claveUnica '<trabajo>:tokens' evita encolarlo dos veces si este trabajo se reintenta.
 */
registrarHandler('push', async (trabajo, ctx) => {
  const { usuarioIds = [], tokens: tokensDirectos, titulo, mensaje, data, sound, reintentoTokens = 0 } = trabajo.payload || {};
  if (!pushNotificationService.disponible) return;
  const contenido = { titulo, mensaje, data, sound };

  let tokens: string[];
  let pendientes: string[] = [];
  // Usuarios destino del push: en el reintento de tokens viajan en payload.usuarioIds (auditoría 4.AB)
  let destinatarios: string[] = (usuarioIds as string[]).map(String);
  if (Array.isArray(tokensDirectos)) {
    // Reintento de tokens transitorios. Auditoría 4.AB: se re-verifica que cada token SIGA siendo de alguno de los
    // usuarios originales (un teléfono compartido pudo cambiar de cuenta entre intentos: el nuevo usuario no debe
    // recibir el push del anterior). Sin usuarios de referencia no se envía.
    if (ctx.enviados.has('tokens')) return;
    const vigentes = new Set(destinatarios.length > 0 ? await pushNotificationService.obtenerTokens(destinatarios) : []);
    tokens = tokensDirectos.filter((t: any) => typeof t === 'string' && t && vigentes.has(t));
    if (tokens.length === 0) {
      await ctx.marcarEnviados(['tokens']);
      return;
    }
  } else {
    destinatarios = [];
    pendientes = (usuarioIds as string[]).map(String).filter((id) => !ctx.enviados.has(id));
    if (pendientes.length === 0) return;
    tokens = await pushNotificationService.obtenerTokens(pendientes);
    destinatarios = pendientes;
  }

  ctx.comprobarCancelacion(); // auditoría 4.S
  const { transitorios } = await pushNotificationService.enviarMulticast(tokens, contenido);
  if (transitorios.length > 0) {
    if (reintentoTokens < MAX_REINTENTOS_TOKENS) {
      const base = parseInt(process.env.PUSH_REINTENTO_BASE_MS || '', 10) || 60000;
      await encolar({
        tipo: 'push',
        prioridad: trabajo.prioridad,
        escuelaId: trabajo.escuelaId ? String(trabajo.escuelaId) : undefined,
        claveUnica: `${trabajo._id}:tokens`,
        nextRunAt: new Date(Date.now() + base * 2 ** reintentoTokens),
        payload: { ...contenido, tokens: transitorios, usuarioIds: destinatarios, reintentoTokens: reintentoTokens + 1 },
      });
    } else {
      logger.warn(`[Push] ${transitorios.length} dispositivo(s) sin entregar tras ${MAX_REINTENTOS_TOKENS} reintentos (error temporal de FCM)`);
    }
  }
  await ctx.marcarEnviados(pendientes.length > 0 ? pendientes : ['tokens']);
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
    ctx.comprobarCancelacion(); // auditoría 4.S
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
    // Auditoría 4.N: la copia pudo quedar guardada sin su despacho (se cayó al encolarlo). Se asegura su
    // 'despachar-mensaje' (misma claveUnica, idempotente); si no se puede encolar, el trabajo se reintenta.
    const copia: any = await Mensaje.findOne({
      'copiaDe.mensajeId': mensajeOriginalId,
      'copiaDe.estudianteId': estudianteId,
    })
      .select('_id prioridad')
      .lean();
    if (copia) {
      await mensajeService.encolarDespacho(String(copia._id), usuario, copia.prioridad, { lanzarError: true });
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
/**
 * 'despachar-mensaje' (auditoría 4.D): campanita + correo + push de un mensaje, idempotente y con reintentos.
 */
registrarHandler('despachar-mensaje', async (trabajo, ctx) => {
  const { mensajeId, remitente } = trabajo.payload || {};
  await mensajeService.procesarDespacho(String(mensajeId), remitente || {}, ctx); // ctx: auditoría 4.AJ
});

/**
 * 'correo-cuenta' (auditoría 4.E): reset/definir contraseña con prioridad crítica. El token se crea al enviar.
 */
registrarHandler('correo-cuenta', async (trabajo, ctx) => {
  await procesarCorreoCuenta(trabajo.payload || {}, ctx);
});

registrarHandler('resumen-diario', async (trabajo, ctx) => {
  await procesarResumenDiario(String(trabajo.payload?.dia), new Date(), ctx); // ctx: auditoría 4.AJ
});
