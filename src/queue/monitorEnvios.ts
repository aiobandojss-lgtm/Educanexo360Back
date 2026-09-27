import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import Notificacion from '../models/notificacion.model';
import Outbox, { IOutbox } from '../models/outbox.model';
import { TipoNotificacion, EstadoNotificacion } from '../interfaces/INotificacion';
import pushNotificationService from '../services/pushNotification.service';
import { encolar } from './outbox';
import { logger } from '../utils/logger';

/**
 * Detector de fallos sistémicos del envío de correo (auditoría 4.AG).
 *
 * Un bloqueo del proveedor (cuenta suspendida, IP en lista negra, cupo del hosting) dejaba todo en FALLIDO sin que
 * nadie se enterara. Se abre un EPISODIO cuando, en una ventana de 15 min, hay:
 *   - >= 10 trabajos de correo ('email' / 'correo-cuenta') en FALLIDO, o
 *   - >= 20 fallos seguidos del proveedor (sin ningún envío exitoso entre medio).
 * Al abrirse se avisa UNA vez por campanita (tipo SISTEMA) + push —nunca por correo— a los SUPER_ADMIN activos y
 * a los ADMIN de los colegios afectados. El episodio se cierra con un envío exitoso o tras 60 min sin fallos; solo
 * entonces puede volver a avisar.
 *
 * Estado en memoria (un solo proceso Passenger): un reinicio en medio de un episodio puede avisar de nuevo.
 * Las señales llegan por observadores que conecta queue/handlers.ts (sin imports circulares).
 */
const TIPOS_CORREO = ['email', 'correo-cuenta'];
const VENTANA_MS = 15 * 60 * 1000;
const UMBRAL_FALLIDOS = 10;
const UMBRAL_CONSECUTIVOS = 20;
const CIERRE_SIN_FALLOS_MS = 60 * 60 * 1000;
// FALLIDO que NO indican un problema del proveedor (dirección inexistente, datos que ya no existen)
const NO_SISTEMICO = /Rechazo permanente|Ningún destinatario aceptó|inexistente|Sin destinatarios/i;

interface Episodio {
  desde: Date;
  motivo: string;
  escuelas: string[];
}

let fallidos: { t: number; escuelaId?: string }[] = [];
let consecutivos = 0;
let ultimoFalloProveedor = 0;
let ultimoFallo = 0;
let episodio: Episodio | null = null;
let ultimoEpisodio: (Episodio & { hasta: Date; cierre: string }) | null = null;
let avisoEnCurso: Promise<void> = Promise.resolve();

/** Solo pruebas. */
export const reiniciarMonitor = (): void => {
  fallidos = [];
  consecutivos = 0;
  ultimoFalloProveedor = 0;
  ultimoFallo = 0;
  episodio = null;
  ultimoEpisodio = null;
  avisoEnCurso = Promise.resolve();
};

/** Solo pruebas: espera a que termine el aviso en curso (si lo hay). */
export const esperarAvisos = (): Promise<void> => avisoEnCurso;

/** Estado para GET /api/system/outbox (SUPER_ADMIN). */
export const estadoMonitor = (ahora: number = Date.now()) => ({
  episodioAbierto: episodio
    ? { desde: episodio.desde, motivo: episodio.motivo, escuelas: episodio.escuelas }
    : null,
  ultimoEpisodio,
  fallidosCorreoUltimos15Min: fallidos.filter((f) => ahora - f.t < VENTANA_MS).length,
  fallosSeguidosProveedor: consecutivos,
});

const avisar = async (ep: Episodio): Promise<void> => {
  // Abierto por fallos seguidos del proveedor: los colegios afectados son los de los trabajos de correo en curso o
  // con error en la ventana (el proveedor no sabe de qué colegio es cada correo)
  if (ep.escuelas.length === 0) {
    const ids = await Outbox.distinct('escuelaId', {
      tipo: { $in: TIPOS_CORREO },
      escuelaId: { $ne: null },
      $or: [{ estado: 'PROCESANDO' }, { error: { $exists: true }, updatedAt: { $gte: new Date(Date.now() - VENTANA_MS) } }],
    });
    ep.escuelas = ids.map(String);
  }
  const escuelasObj = ep.escuelas.filter((e) => mongoose.isValidObjectId(e)).map((e) => new mongoose.Types.ObjectId(e));
  const [superAdmins, admins] = await Promise.all([
    Usuario.find({ tipo: 'SUPER_ADMIN', estado: 'ACTIVO' }).select('_id escuelaId').lean(),
    escuelasObj.length > 0
      ? Usuario.find({ tipo: 'ADMIN', estado: 'ACTIVO', escuelaId: { $in: escuelasObj } }).select('_id escuelaId').lean()
      : Promise.resolve([] as any[]),
  ]);
  const vistos = new Set<string>();
  const destinatarios = [...superAdmins, ...admins].filter((u: any) => {
    const id = String(u._id);
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  if (destinatarios.length === 0) {
    logger.error(`[Envíos] Episodio de fallos sin destinatarios para avisar: ${ep.motivo}`);
    return;
  }
  const titulo = '⚠️ Problema con el envío de correos';
  const mensaje =
    `${ep.motivo}. Los correos quedan pendientes y se reintentan; los que fallen definitivamente se pueden ` +
    'reintentar desde la cola de envíos cuando se resuelva (revise el proveedor de correo).';
  // Campanita: la notificación exige colegio; el SUPER_ADMIN sin colegio usa el primero afectado (si no hay, solo push)
  const docs = destinatarios
    .map((u: any) => ({ u, escuelaId: u.escuelaId || escuelasObj[0] }))
    .filter((x) => x.escuelaId)
    .map((x) => ({
      usuarioId: x.u._id,
      titulo,
      mensaje,
      tipo: TipoNotificacion.SISTEMA,
      estado: EstadoNotificacion.PENDIENTE,
      escuelaId: x.escuelaId,
      // entidadTipo es un enum del modelo: el origen va en metadata
      metadata: { origen: 'monitor-envios', episodioDesde: ep.desde, motivo: ep.motivo },
    }));
  if (docs.length > 0) await Notificacion.insertMany(docs);
  const trabajos = pushNotificationService.construirTrabajosPush({
    usuarioIds: destinatarios.map((u: any) => String(u._id)),
    contenido: { titulo, mensaje: ep.motivo, data: { tipo: 'sistema', motivo: ep.motivo } },
    prioridad: 'alta',
  });
  if (trabajos.length > 0) await encolar(trabajos);
  logger.error(`[Envíos] Episodio de fallos: ${ep.motivo}. Avisados ${destinatarios.length} administrador(es).`);
};

const evaluar = (ahora: number): void => {
  fallidos = fallidos.filter((f) => ahora - f.t < VENTANA_MS);
  if (episodio) return; // un aviso por episodio
  let motivo = '';
  if (fallidos.length >= UMBRAL_FALLIDOS) motivo = `${fallidos.length} correos fallaron definitivamente en los últimos 15 minutos`;
  else if (consecutivos >= UMBRAL_CONSECUTIVOS) motivo = `El proveedor de correo rechazó ${consecutivos} envíos seguidos`;
  if (!motivo) return;
  const escuelas = [...new Set(fallidos.map((f) => f.escuelaId).filter(Boolean) as string[])];
  episodio = { desde: new Date(ahora), motivo, escuelas };
  const ep = episodio;
  avisoEnCurso = avisar(ep).catch((error) => logger.error(`[Envíos] No se pudo avisar del episodio: ${error?.message || error}`));
};

const cerrar = (causa: string, ahora: number): void => {
  if (!episodio) return;
  ultimoEpisodio = { ...episodio, hasta: new Date(ahora), cierre: causa };
  logger.info(`[Envíos] Episodio de fallos cerrado (${causa})`);
  episodio = null;
  fallidos = [];
  consecutivos = 0;
};

/** Observador del proveedor: cada envío individual. 'rechazo' = dirección rechazada (el proveedor funciona). */
export const registrarEnvioProveedor = (resultado: 'exito' | 'fallo' | 'rechazo', ahora: number = Date.now()): void => {
  if (resultado === 'exito') {
    consecutivos = 0;
    cerrar('envío exitoso', ahora);
    return;
  }
  if (resultado === 'rechazo') return;
  if (ahora - ultimoFalloProveedor > VENTANA_MS) consecutivos = 0;
  consecutivos++;
  ultimoFalloProveedor = ahora;
  ultimoFallo = ahora;
  evaluar(ahora);
};

/** Observador de la cola: un trabajo terminó en FALLIDO. */
export const registrarFallido = (trabajo: Pick<IOutbox, 'tipo' | 'error' | 'escuelaId'>, ahora: number = Date.now()): void => {
  if (!TIPOS_CORREO.includes(trabajo.tipo)) return;
  if (NO_SISTEMICO.test(String(trabajo.error || ''))) return;
  fallidos.push({ t: ahora, escuelaId: trabajo.escuelaId ? String(trabajo.escuelaId) : undefined });
  ultimoFallo = ahora;
  evaluar(ahora);
};

/** Tarea periódica: cierra el episodio tras 60 min sin fallos. */
export const revisarCierre = (ahora: number = Date.now()): void => {
  if (episodio && ahora - ultimoFallo >= CIERRE_SIN_FALLOS_MS) cerrar('60 min sin fallos', ahora);
};
