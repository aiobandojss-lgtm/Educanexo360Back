import mongoose from 'mongoose';
import Notificacion from '../models/notificacion.model';
import Usuario from '../models/usuario.model';
import Mensaje from '../models/mensaje.model';
import { TipoNotificacion } from '../interfaces/INotificacion';
import { encolar, NuevoTrabajo } from '../queue/outbox';
import { esEmailFicticio, DESTINATARIOS_POR_TRABAJO } from './email.service';
import { preferenciaEmail } from '../utils/preferencias';
import { fechaColombiaISO, horaColombia } from '../utils/fechas';
import config from '../config/config';
import { logger } from '../utils/logger';

/**
 * Resumen diario de mensajes por correo (Fase 4.5).
 *
 * - Todos los días a las RESUMEN_HORA (18 por defecto, hora Colombia) el worker encola UNA vez el trabajo
 *   'resumen-diario' del día (claveUnica 'resumen:YYYY-MM-DD'; idempotente aunque el proceso se reinicie).
 * - Incluye SOLO los mensajes del día cuyo correo inmediato se OMITIÓ por la preferencia 'resumen'
 *   (notificaciones marcadas con metadata.resumen) y que el usuario todavía no ha leído.
 * - No se envía resumen vacío. Quien cambió a 'ninguno' no lo recibe.
 * - Un correo por usuario, en trabajos de correo de ~50 destinatarios (plantilla 'resumen').
 */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const MAX_ITEMS_POR_CORREO = 30;

const horaResumen = (): number => {
  const h = parseInt(process.env.RESUMEN_HORA || '', 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 18;
};

let ultimoDiaEncolado: string | null = null;

/** Tarea periódica del worker: encola el resumen del día a partir de la hora configurada (una vez). */
export const encolarResumenSiCorresponde = async (ahora: Date = new Date()): Promise<boolean> => {
  const dia = fechaColombiaISO(ahora);
  if (ultimoDiaEncolado === dia || horaColombia(ahora) < horaResumen()) return false;
  await encolar({ tipo: 'resumen-diario', payload: { dia }, claveUnica: `resumen:${dia}` });
  ultimoDiaEncolado = dia; // si ya existía (reinicio), encolar lo ignoró por claveUnica
  return true;
};

/** Solo pruebas: olvida el día encolado en memoria. */
export const reiniciarEstadoResumen = (): void => {
  ultimoDiaEncolado = null;
};

/** Rango [inicio, fin) del día calendario de Colombia 'YYYY-MM-DD'. */
const rangoDia = (dia: string): { desde: Date; hasta: Date } => {
  const [y, m, d] = dia.split('-').map(Number);
  const desde = new Date(Date.UTC(y, m - 1, d) + DESFASE_COLOMBIA_MS);
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60 * 1000) };
};

/**
 * Handler 'resumen-diario': arma y encola los correos de resumen del día. Devuelve cuántos correos encoló.
 */
export const procesarResumenDiario = async (dia: string): Promise<number> => {
  const { desde, hasta } = rangoDia(dia);

  // 1. Notificaciones del día que se reservaron para el resumen, agrupadas por usuario
  const grupos = await Notificacion.aggregate([
    {
      $match: {
        'metadata.resumen': true,
        tipo: TipoNotificacion.MENSAJE,
        createdAt: { $gte: desde, $lt: hasta },
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$usuarioId',
        items: { $push: { mensajeId: '$entidadId', titulo: '$titulo', remitente: '$metadata.remitente', fecha: '$createdAt' } },
      },
    },
  ]);
  if (grupos.length === 0) return 0;

  // 2. Usuarios activos y mensajes ya leídos (2 consultas)
  const usuarioIds = grupos.map((g: any) => g._id);
  const mensajeIds = [...new Set(grupos.flatMap((g: any) => g.items.map((i: any) => String(i.mensajeId))))]
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const [usuarios, mensajes] = await Promise.all([
    Usuario.find({ _id: { $in: usuarioIds }, estado: 'ACTIVO' })
      .select('_id email nombre tipo preferencias escuelaId')
      .sort({ _id: 1 })
      .lean(),
    Mensaje.find({ _id: { $in: mensajeIds } }).select('_id asunto lecturas.usuarioId').lean(),
  ]);
  const leidos = new Set<string>();
  const asuntos = new Map<string, string>();
  mensajes.forEach((m: any) => {
    asuntos.set(String(m._id), m.asunto);
    (m.lecturas || []).forEach((l: any) => leidos.add(`${m._id}:${l.usuarioId}`));
  });
  const itemsPorUsuario = new Map(grupos.map((g: any) => [String(g._id), g.items]));

  // 3. Un correo por usuario con al menos un mensaje sin leer (nunca vacío)
  const porEscuela = new Map<string, any[]>();
  for (const u of usuarios as any[]) {
    if (!u.email || esEmailFicticio(u.email) || preferenciaEmail(u) === 'ninguno') continue;
    const pendientes = (itemsPorUsuario.get(String(u._id)) || [])
      .filter((i: any) => asuntos.has(String(i.mensajeId)) && !leidos.has(`${i.mensajeId}:${u._id}`))
      .map((i: any) => ({
        asunto: asuntos.get(String(i.mensajeId)),
        remitente: i.remitente,
        fecha: i.fecha,
        url: `${config.frontendUrl}/mensajes/${i.mensajeId}`,
      }));
    if (pendientes.length === 0) continue;
    const escuela = String(u.escuelaId);
    if (!porEscuela.has(escuela)) porEscuela.set(escuela, []);
    porEscuela.get(escuela)!.push({
      email: u.email,
      nombre: u.nombre,
      usuarioId: String(u._id),
      total: pendientes.length,
      items: pendientes.slice(0, MAX_ITEMS_POR_CORREO),
    });
  }

  // 4. Trabajos de correo (~50 por trabajo), idempotentes por día/colegio/lote si el handler se reintenta
  const trabajos: NuevoTrabajo[] = [];
  let correos = 0;
  for (const [escuelaId, destinatarios] of porEscuela) {
    for (let i = 0; i < destinatarios.length; i += DESTINATARIOS_POR_TRABAJO) {
      const lote = destinatarios.slice(i, i + DESTINATARIOS_POR_TRABAJO);
      correos += lote.length;
      trabajos.push({
        tipo: 'email',
        prioridad: 'normal',
        escuelaId,
        claveUnica: `resumen:${dia}:${escuelaId}:${i / DESTINATARIOS_POR_TRABAJO}`,
        payload: {
          plantilla: 'resumen',
          datos: { dia, urlMensajes: `${config.frontendUrl}/mensajes`, urlPreferencias: process.env.EMAIL_PREFERENCIAS_URL || '' },
          destinatarios: lote,
        },
      });
    }
  }
  if (trabajos.length > 0) await encolar(trabajos);
  logger.info(`[Resumen] ${dia}: ${correos} correo(s) de resumen encolados en ${trabajos.length} trabajo(s)`);
  return correos;
};
