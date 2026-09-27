import mongoose from 'mongoose';
import Outbox, { IOutbox, PrioridadTrabajo, ORDEN_PRIORIDAD } from '../models/outbox.model';
import { logger } from '../utils/logger';
import { enmascararEmailsEnTexto } from '../utils/enmascarar';

/**
 * Auditoría 4.W: todo error que se guarda en outbox.error o va al log pasa por aquí. Los proveedores (nodemailer,
 * Brevo) y los handlers pueden incluir direcciones (<usuario@dominio>): quedan enmascaradas (u***@dominio).
 */
const textoError = (error: any, max = 1000): string =>
  enmascararEmailsEnTexto(String(error?.message || error)).slice(0, max);
/** Igual, con el stack (errores inesperados del worker, solo al log). */
const textoErrorConStack = (error: any): string => enmascararEmailsEnTexto(String(error?.stack || error?.message || error));

/**
 * Cola de envíos (outbox) y su worker (Fase 4.1).
 *
 * - encolar(): inserta trabajos (insertMany). Los que traen claveUnica repetida se ignoran (idempotencia).
 * - El worker corre en el MISMO proceso (Passenger, sin Redis) con un setInterval de OUTBOX_INTERVAL_MS:
 *     1. Devuelve a PENDIENTE los PROCESANDO con lockedUntil vencido (el proceso murió a mitad de un trabajo).
 *     2. Toma trabajos uno a uno con findOneAndUpdate atómico (PENDIENTE → PROCESANDO + lockedUntil),
 *        prioridad 'critica' y luego 'alta' primero (campo orden), con concurrencia acotada (OUTBOX_CONCURRENCY).
 *     3. Éxito → HECHO. Error → reintento con backoff exponencial (30 s, 1, 2, 4 min); al llegar a
 *        OUTBOX_MAX_INTENTOS → FALLIDO (se registra el error). HECHO/FALLIDO expiran a los 7 días (TTL).
 * - Entrega "al menos una vez": si el proceso muere después de enviar y antes de marcar HECHO, ese trabajo
 *   se repite. Los lotes registran en `enviados` los ids ya atendidos (ctx.marcarEnviados) para que el
 *   reintento no los repita.
 * - Tareas periódicas (p. ej. el resumen diario): funciones baratas que se evalúan en cada tick.
 *
 * ⚠️ Passenger puede dormir la app sin tráfico: la cola se detiene hasta la siguiente petición. En producción
 *    usar PassengerMinInstances 1 o un cron de cPanel que haga ping a /api/health cada 5 minutos.
 *    Verificación: GET /api/system/outbox (último tick, conteos por estado, PENDIENTE más antiguo).
 */

const num = (clave: string, porDefecto: number): number => {
  const v = parseInt(process.env[clave] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : porDefecto;
};

/**
 * Auditoría 4.S: tiempo máximo de un trabajo. Al vencer, el handler se CANCELA de forma cooperativa (ctx.signal,
 * revisado antes de cada envío) y el trabajo queda PROCESANDO hasta que vence su lock; entonces se retoma desde
 * `enviados`. Para que la ejecución cancelada termine SIEMPRE antes de que otro carril pueda tomarlo:
 *     timeout + EMAIL_TIMEOUT_MS (el envío en curso) + margen <= lockMs
 * Valor por defecto = el máximo seguro; si OUTBOX_TIMEOUT_TRABAJO_MS lo excede se registra un error y se corrige.
 * Duplicado residual (conocido): si el proveedor YA aceptó un correo pero su respuesta llega después de
 * EMAIL_TIMEOUT_MS, el envío se aborta como error, no queda en `enviados` y el reintento lo manda otra vez.
 * EMAIL_TIMEOUT_MS se lee igual que en services/email/proveedores.ts (30 s por defecto).
 */
const calcularTimeoutTrabajo = (lockMs: number) => {
  const envioMs = num('EMAIL_TIMEOUT_MS', 30 * 1000);
  const margenMs = Math.min(5000, Math.floor(lockMs / 10));
  const seguro = lockMs - envioMs - margenMs;
  if (seguro <= 0) {
    logger.error(
      `[Outbox] OUTBOX_LOCK_MS (${lockMs}) debe ser mayor que EMAIL_TIMEOUT_MS (${envioMs}) + margen (${margenMs}); ` +
        `se usa un timeout de trabajo de ${Math.floor(lockMs / 2)} ms`,
    );
    return { timeoutMs: Math.floor(lockMs / 2), envioMs, margenMs };
  }
  const configurado = parseInt(process.env.OUTBOX_TIMEOUT_TRABAJO_MS || '', 10);
  if (Number.isFinite(configurado) && configurado > 0 && configurado > seguro) {
    logger.error(
      `[Outbox] OUTBOX_TIMEOUT_TRABAJO_MS=${configurado} excede el máximo seguro ${seguro} ms ` +
        `(OUTBOX_LOCK_MS ${lockMs} - EMAIL_TIMEOUT_MS ${envioMs} - margen ${margenMs}); se usa ${seguro} ms`,
    );
    return { timeoutMs: seguro, envioMs, margenMs };
  }
  return { timeoutMs: Number.isFinite(configurado) && configurado > 0 ? configurado : seguro, envioMs, margenMs };
};

const LOCK_MS = num('OUTBOX_LOCK_MS', 2 * 60 * 1000);
const TIMEOUT = calcularTimeoutTrabajo(LOCK_MS);

const CFG = {
  intervaloMs: num('OUTBOX_INTERVAL_MS', 5000),
  lote: num('OUTBOX_BATCH', 20), // trabajos máximos por tick
  concurrencia: num('OUTBOX_CONCURRENCY', 5),
  maxIntentos: num('OUTBOX_MAX_INTENTOS', 5),
  lockMs: LOCK_MS,
  backoffBaseMs: num('OUTBOX_BACKOFF_MS', 30 * 1000),
  timeoutTrabajoMs: TIMEOUT.timeoutMs,
  // Espera máxima a que el handler cancelado observe la cancelación (el envío en curso termina o vence)
  esperaCancelacionMs: TIMEOUT.envioMs + TIMEOUT.margenMs,
  retencionMs: 7 * 24 * 60 * 60 * 1000,
};

/** Solo pruebas y diagnóstico: configuración efectiva del worker. */
export const configuracionWorker = () => ({ ...CFG });

export interface NuevoTrabajo {
  tipo: string;
  payload: Record<string, any>;
  prioridad?: PrioridadTrabajo;
  escuelaId?: string | mongoose.Types.ObjectId;
  claveUnica?: string;
  nextRunAt?: Date;
}

export interface ContextoTrabajo {
  /** Ids ya atendidos en intentos anteriores de este trabajo (lotes) */
  enviados: Set<string>;
  /** Registra ids atendidos dentro del trabajo, para no repetirlos si el lote falla a medias */
  marcarEnviados: (ids: string[]) => Promise<void>;
  /** Auditoría 4.S: se aborta cuando el trabajo supera su tiempo máximo */
  signal: AbortSignal;
  /** Lanza TrabajoCancelado si el trabajo fue cancelado: llamarlo ANTES de cada envío (y de reservar cupo) */
  comprobarCancelacion: () => void;
}

export type HandlerTrabajo = (trabajo: IOutbox, ctx: ContextoTrabajo) => Promise<void>;

/**
 * Lanzada por un handler para aplazar el trabajo SIN gastar un intento (p. ej. cupo diario de correo
 * agotado: lo que no cabe queda PENDIENTE para el día siguiente).
 */
export class ReprogramarTrabajo extends Error {
  constructor(public readonly fecha: Date, motivo: string) {
    super(motivo);
    this.name = 'ReprogramarTrabajo';
  }
}

/**
 * Lanzada por un handler cuando reintentar no tiene sentido (p. ej. el enlace ya habría vencido): el trabajo
 * pasa a FALLIDO de inmediato y se registra.
 */
export class FalloDefinitivo extends Error {
  readonly definitivo = true;
  constructor(motivo: string) {
    super(motivo);
    this.name = 'FalloDefinitivo';
  }
}

/** Lanzada por comprobarCancelacion() cuando el trabajo superó su tiempo máximo (auditoría 4.S). */
export class TrabajoCancelado extends Error {
  constructor() {
    super('Trabajo cancelado por tiempo agotado');
    this.name = 'TrabajoCancelado';
  }
}

const handlers = new Map<string, HandlerTrabajo>();
const tareasPeriodicas: { nombre: string; fn: () => Promise<void> }[] = [];

export const registrarHandler = (tipo: string, handler: HandlerTrabajo): void => {
  handlers.set(tipo, handler);
};

export const registrarTareaPeriodica = (nombre: string, fn: () => Promise<void>): void => {
  if (!tareasPeriodicas.some((t) => t.nombre === nombre)) tareasPeriodicas.push({ nombre, fn });
};

/**
 * La idempotencia depende del índice único de claveUnica. Mongoose crea los índices en segundo plano al arrancar:
 * si se insertan claves repetidas ANTES de que exista (colección nueva, primer arranque), se duplican los trabajos
 * y además la creación del índice falla por esos duplicados. Por eso el primer encolar espera a Outbox.init()
 * (una vez por proceso). Si falla, se registra y la cola sigue (sin la garantía hasta corregirlo).
 */
let indicesListos: Promise<void> | null = null;
const asegurarIndices = (): Promise<void> => {
  if (!indicesListos) {
    indicesListos = Outbox.init().then(
      () => undefined,
      (error: any) => {
        logger.error(`[Outbox] No se pudieron crear los índices de outbox (claveUnica): ${textoError(error)}`);
      },
    );
  }
  return indicesListos;
};

/**
 * Encola uno o varios trabajos con un solo insertMany. Los duplicados por claveUnica se ignoran.
 * Devuelve cuántos quedaron encolados.
 */
export const encolar = async (trabajos: NuevoTrabajo | NuevoTrabajo[]): Promise<number> => {
  await asegurarIndices();
  const lista = (Array.isArray(trabajos) ? trabajos : [trabajos]).map((t) => ({
    tipo: t.tipo,
    payload: t.payload,
    prioridad: t.prioridad || 'normal',
    orden: ORDEN_PRIORIDAD[t.prioridad || 'normal'] ?? 2,
    ...(t.escuelaId && mongoose.isValidObjectId(String(t.escuelaId)) && { escuelaId: t.escuelaId }),
    ...(t.claveUnica && { claveUnica: t.claveUnica }),
    nextRunAt: t.nextRunAt || new Date(),
  }));
  if (lista.length === 0) return 0;
  try {
    const insertados = await Outbox.insertMany(lista, { ordered: false });
    return insertados.length;
  } catch (error: any) {
    // ordered:false inserta todos los válidos; solo se toleran duplicados de claveUnica (11000)
    const errores: any[] = error?.writeErrors || [];
    if (errores.length > 0 && errores.every((e) => (e.code ?? e.err?.code) === 11000)) {
      return lista.length - errores.length;
    }
    throw error;
  }
};

// ===== WORKER =====

let timer: NodeJS.Timeout | null = null;
let tickEnCurso: Promise<void> | null = null;
let deteniendo = false;
let ultimoTick: Date | null = null;
let trabajosEnCurso = 0;

// Trabajos con datos sensibles (p. ej. enlace de reset con token): al terminar se borra el payload
const redactar = (trabajo: IOutbox) =>
  trabajo.payload?.sensible ? { payload: { sensible: true, redactado: true } } : {};

const retrasoBackoff = (intentos: number): number =>
  CFG.backoffBaseMs * Math.pow(2, Math.max(intentos - 1, 0));

/**
 * Cierre de un trabajo (auditoría 4.F): solo si SIGUE siendo nuestro (PROCESANDO con el mismo lockedUntil del
 * claim). Si el lock venció y otro proceso lo retomó, este cierre tardío no pisa su estado.
 * Se reintenta hasta 3 veces ante errores de red; si aun así falla se registra y el lock vencido lo retomará.
 */
const cerrarTrabajo = async (trabajo: IOutbox, update: Record<string, unknown>, que: string): Promise<boolean> => {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await Outbox.updateOne(
        { _id: trabajo._id, estado: 'PROCESANDO', lockedUntil: trabajo.lockedUntil },
        update,
      );
      if (r.matchedCount === 0) {
        logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id}: no se marcó ${que} (el lock venció y otro proceso lo retomó)`);
      }
      return r.matchedCount > 0;
    } catch (error: any) {
      if (intento === 3) {
        logger.error(`[Outbox] ${trabajo.tipo} ${trabajo._id}: no se pudo marcar ${que}: ${textoError(error)}`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 200 * intento));
    }
  }
  return false;
};

const ejecutarTrabajo = async (trabajo: IOutbox): Promise<void> => {
  const handler = handlers.get(trabajo.tipo);
  const enviados = new Set<string>(trabajo.enviados || []);
  const cancelacion = new AbortController();
  const ctx: ContextoTrabajo = {
    enviados,
    signal: cancelacion.signal,
    comprobarCancelacion: () => {
      if (cancelacion.signal.aborted) throw new TrabajoCancelado();
    },
    marcarEnviados: async (ids: string[]) => {
      const nuevos = ids.map(String).filter((id) => !enviados.has(id));
      if (nuevos.length === 0) return;
      // Primero la base y DESPUÉS la memoria: si la escritura falla, un reintento de marcar sí la repite (4.J)
      await Outbox.updateOne({ _id: trabajo._id }, { $addToSet: { enviados: { $each: nuevos } } });
      nuevos.forEach((id) => enviados.add(id));
    },
  };

  // 1. El handler (su error decide reintento/aplazamiento/FALLIDO)
  let errorHandler: any = null;
  if (!handler) {
    errorHandler = new Error(`Sin handler para el tipo de trabajo '${trabajo.tipo}'`);
  } else {
    const ejecucion = Promise.resolve().then(() => handler(trabajo, ctx));
    let reloj: NodeJS.Timeout | undefined;
    const resultado = await Promise.race([
      ejecucion.then(
        () => ({ vencido: false, error: null as any }),
        (error: any) => ({ vencido: false, error: error ?? new Error('Error desconocido') }),
      ),
      new Promise<{ vencido: boolean; error: any }>((resolver) => {
        reloj = setTimeout(() => resolver({ vencido: true, error: null }), CFG.timeoutTrabajoMs);
      }),
    ]);
    if (reloj) clearTimeout(reloj);

    if (resultado.vencido) {
      // Auditoría 4.S: se cancela y se espera a que el handler lo observe (a lo sumo el envío en curso).
      cancelacion.abort();
      const aviso = `Tiempo agotado (${CFG.timeoutTrabajoMs} ms): cancelado`;
      logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id}: ${aviso}`);
      let espera: NodeJS.Timeout | undefined;
      const tras = await Promise.race([
        ejecucion.then(
          () => ({ resuelto: true, error: null as any }),
          (error: any) => ({ resuelto: true, error: error ?? new Error('Error desconocido') }),
        ),
        new Promise<{ resuelto: boolean; error: any }>((r) => {
          espera = setTimeout(() => r({ resuelto: false, error: null }), CFG.esperaCancelacionMs);
        }),
      ]);
      if (espera) clearTimeout(espera);
      if (!tras.resuelto) {
        // Sigue corriendo: NO se devuelve a PENDIENTE (otro carril lo tomaría mientras esta ejecución sigue
        // enviando). Queda PROCESANDO hasta que venza su lock; al retomarlo, `enviados` evita repetir lo que salió.
        await Outbox.updateOne(
          { _id: trabajo._id, estado: 'PROCESANDO', lockedUntil: trabajo.lockedUntil },
          { $set: { error: `${aviso}; se retoma al vencer el lock` } },
        ).catch(() => undefined);
        return;
      }
      // Auditoría 4.AI: la ejecución YA terminó (éxito, error o cancelación observada): se cierra con su resultado
      // normal. Antes quedaba PROCESANDO y se reejecutaba (en correo-cuenta, sin 'enviados', salía un 2.º correo
      // que invalidaba el enlace del primero).
      errorHandler = tras.error;
    } else {
      errorHandler = resultado.error;
    }
  }

  // 2. Cierre FUERA del try del handler (auditoría 4.F): un fallo al marcar HECHO no reejecuta el trabajo
  if (!errorHandler) {
    await cerrarTrabajo(
      trabajo,
      {
        $set: { estado: 'HECHO', expireAt: new Date(Date.now() + CFG.retencionMs), ...redactar(trabajo) },
        $unset: { lockedUntil: 1, error: 1 },
      },
      'HECHO',
    );
    return;
  }

  if (errorHandler instanceof ReprogramarTrabajo) {
    // Aplazado sin gastar intento (se devuelve el que se sumó al tomarlo)
    await cerrarTrabajo(
      trabajo,
      {
        $set: { estado: 'PENDIENTE', nextRunAt: errorHandler.fecha, error: textoError(errorHandler) },
        $inc: { intentos: -1 },
        $unset: { lockedUntil: 1 },
      },
      'aplazado',
    );
    logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id} aplazado hasta ${errorHandler.fecha.toISOString()}: ${textoError(errorHandler)}`);
    return;
  }

  const mensaje = textoError(errorHandler);
  if (trabajo.intentos >= CFG.maxIntentos || errorHandler?.definitivo === true) {
    await cerrarTrabajo(
      trabajo,
      {
        $set: {
          estado: 'FALLIDO',
          error: mensaje,
          expireAt: new Date(Date.now() + CFG.retencionMs),
          ...redactar(trabajo),
        },
        $unset: { lockedUntil: 1 },
      },
      'FALLIDO',
    );
    logger.error(`[Outbox] ${trabajo.tipo} ${trabajo._id} FALLIDO tras ${trabajo.intentos} intento(s): ${mensaje}`);
  } else {
    const nextRunAt = new Date(Date.now() + retrasoBackoff(trabajo.intentos));
    await cerrarTrabajo(
      trabajo,
      { $set: { estado: 'PENDIENTE', error: mensaje, nextRunAt }, $unset: { lockedUntil: 1 } },
      'para reintento',
    );
    logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id} intento ${trabajo.intentos} falló (reintento ${nextRunAt.toISOString()}): ${mensaje}`);
  }
};

/**
 * Auditoría 4.AA: los trabajos creados antes del deploy de la 4.E no tienen 'orden' y el sort ascendente los
 * pondría por delante de los 'critica'. Una vez por proceso (primer tick) se completa según su prioridad.
 */
let ordenCompletado = false;
const completarOrdenFaltante = async (): Promise<void> => {
  if (ordenCompletado) return;
  const r = await Outbox.updateMany({ orden: { $exists: false } }, [
    {
      $set: {
        orden: {
          $switch: {
            branches: [
              { case: { $eq: ['$prioridad', 'critica'] }, then: ORDEN_PRIORIDAD.critica },
              { case: { $eq: ['$prioridad', 'alta'] }, then: ORDEN_PRIORIDAD.alta },
            ],
            default: ORDEN_PRIORIDAD.normal,
          },
        },
      },
    },
  ]);
  ordenCompletado = true;
  if (r.modifiedCount > 0) logger.info(`[Outbox] Campo orden completado en ${r.modifiedCount} trabajo(s) previos`);
};

/** Toma atómicamente el siguiente trabajo listo (crítica, luego alta, luego normal). */
const tomarSiguiente = async (): Promise<IOutbox | null> => {
  const ahora = new Date();
  return Outbox.findOneAndUpdate(
    { estado: 'PENDIENTE', nextRunAt: { $lte: ahora } },
    {
      $set: { estado: 'PROCESANDO', lockedUntil: new Date(ahora.getTime() + CFG.lockMs) },
      $inc: { intentos: 1 },
    },
    { sort: { orden: 1, nextRunAt: 1 }, new: true },
  );
};

/**
 * Un ciclo del worker. Exportado para las pruebas (en producción lo llama el setInterval).
 */
export const ejecutarTick = async (): Promise<void> => {
  if (tickEnCurso) return tickEnCurso; // sin ticks solapados
  if (mongoose.connection.readyState !== 1) return;

  tickEnCurso = (async () => {
    ultimoTick = new Date();
    try {
      // 1. Retomar trabajos de un proceso que murió (lock vencido); el intento ya quedó contado.
      //    Si ya agotó los intentos (p. ej. un trabajo que tumba el proceso siempre) pasa a FALLIDO.
      const vencido = { estado: 'PROCESANDO', lockedUntil: { $lt: new Date() } };
      await Outbox.updateMany(
        { ...vencido, intentos: { $gte: CFG.maxIntentos } },
        {
          $set: {
            estado: 'FALLIDO',
            error: 'Proceso interrumpido en cada intento (lock vencido)',
            expireAt: new Date(Date.now() + CFG.retencionMs),
          },
          $unset: { lockedUntil: 1 },
        },
      );
      await Outbox.updateMany(
        { ...vencido, intentos: { $lt: CFG.maxIntentos } },
        { $set: { estado: 'PENDIENTE' }, $unset: { lockedUntil: 1 } },
      );

      await completarOrdenFaltante().catch((err) => logger.error(`[Outbox] completar orden: ${textoError(err)}`));

      // 2. Tareas periódicas (baratas: cada una decide si le toca)
      for (const tarea of tareasPeriodicas) {
        if (deteniendo) break;
        await tarea.fn().catch((err) => logger.error(`[Outbox] tarea periódica ${tarea.nombre}: ${textoError(err)}`));
      }

      // 3. Trabajos con concurrencia acotada: cada "carril" toma el siguiente hasta agotar el lote
      let tomados = 0;
      // Auditoría 4.F: cada carril atrapa sus propios errores y se espera a TODOS (allSettled). Antes, si
      // tomarSiguiente o un update lanzaba, Promise.all rechazaba y el tick terminaba con carriles vivos: el
      // siguiente tick duplicaba la concurrencia y detenerWorker no los esperaba.
      const carril = async (): Promise<void> => {
        while (!deteniendo && tomados < CFG.lote) {
          tomados++;
          let trabajo: IOutbox | null = null;
          try {
            trabajo = await tomarSiguiente();
          } catch (error) {
            logger.error(`[Outbox] Error tomando el siguiente trabajo: ${textoErrorConStack(error)}`);
            return;
          }
          if (!trabajo) return;
          trabajosEnCurso++;
          try {
            await ejecutarTrabajo(trabajo);
          } catch (error) {
            logger.error(`[Outbox] Error inesperado en el trabajo ${trabajo._id}: ${textoErrorConStack(error)}`);
          } finally {
            trabajosEnCurso--;
          }
        }
      };
      await Promise.allSettled(Array.from({ length: CFG.concurrencia }, carril));
    } catch (error) {
      logger.error(`[Outbox] Error en el tick del worker: ${textoErrorConStack(error)}`);
    }
  })().finally(() => {
    tickEnCurso = null;
  });
  return tickEnCurso;
};

/** Arranca el worker (después de conectar Mongo). OUTBOX_DISABLED=true lo desactiva (scripts, pruebas). */
export const iniciarWorker = (): void => {
  if (timer || process.env.OUTBOX_DISABLED === 'true') return;
  deteniendo = false;
  timer = setInterval(() => {
    ejecutarTick().catch((err) => logger.error(`[Outbox] tick: ${textoErrorConStack(err)}`));
  }, CFG.intervaloMs);
  timer.unref();
  logger.info(`[Outbox] Worker iniciado (cada ${CFG.intervaloMs} ms, concurrencia ${CFG.concurrencia})`);
};

/**
 * Apagado limpio (SIGTERM): deja de tomar trabajos y espera los que están en curso (máx. esperaMs).
 * Lo que quede PROCESANDO se retoma al vencer su lock en el siguiente arranque.
 */
export const detenerWorker = async (esperaMs = 8000): Promise<void> => {
  deteniendo = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (tickEnCurso) {
    await Promise.race([tickEnCurso, new Promise((r) => setTimeout(r, esperaMs))]);
  }
};

export const estadoWorker = () => ({
  activo: !!timer && !deteniendo,
  ultimoTick,
  trabajosEnCurso,
  intervaloMs: CFG.intervaloMs,
});
