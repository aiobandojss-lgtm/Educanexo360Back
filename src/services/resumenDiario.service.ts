import mongoose from 'mongoose';
import Notificacion from '../models/notificacion.model';
import Usuario from '../models/usuario.model';
import Mensaje from '../models/mensaje.model';
import { TipoNotificacion } from '../interfaces/INotificacion';
import { encolar, NuevoTrabajo, ContextoTrabajo } from '../queue/outbox';
import { esEmailFicticio, DESTINATARIOS_POR_TRABAJO } from './email.service';
import { preferenciaEmail } from '../utils/preferencias';
import { fechaColombiaISO, horaColombia } from '../utils/fechas';
import config from '../config/config';
import { logger } from '../utils/logger';
import { claveDeLote } from '../utils/claveLote';

/**
 * Resumen diario de mensajes por correo (Fase 4.5).
 *
 * - Todos los días a las RESUMEN_HORA (18 por defecto, hora Colombia) el worker encola UNA vez el trabajo
 *   'resumen-diario' del día (claveUnica 'resumen:YYYY-MM-DD'; idempotente aunque el proceso se reinicie). Antes
 *   de esa hora recupera el de ayer si no alcanzó a salir (auditoría 4.C).
 * - Incluye SOLO los mensajes cuyo correo inmediato se OMITIÓ por la preferencia 'resumen' (notificaciones
 *   marcadas con metadata.resumen) y que el usuario todavía no ha leído. Auditoría 4.B: se toma por MARCAS, no
 *   por día calendario: todo lo marcado de las últimas 48 h, y al encolar el correo del usuario sus marcas se
 *   quitan (metadata.resumenEnviadoEn). Así lo que llega después de las 18:00 va en el resumen siguiente.
 * - No se envía resumen vacío. Quien cambió a 'ninguno' no lo recibe.
 * - Un correo por usuario, en trabajos de correo de ~50 destinatarios (plantilla 'resumen').
 */
const MAX_ITEMS_POR_CORREO = 30;
const VENTANA_MARCAS_MS = 48 * 60 * 60 * 1000;

const horaResumen = (): number => {
  const h = parseInt(process.env.RESUMEN_HORA || '', 10);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 18;
};

const diasEncolados = new Set<string>();

/**
 * Tarea periódica del worker. Desde la hora configurada encola el resumen de HOY; antes de esa hora encola el de
 * AYER (auditoría 4.C): si el proceso estuvo dormido (Passenger sin tráfico) de las 17:00 a las 07:00 del día
 * siguiente, el resumen que no salió a las 18:00 sale en el primer tick. Idempotente por claveUnica
 * 'resumen:YYYY-MM-DD' (si ya se encoló, encolar lo ignora); en memoria se recuerda para no escribir cada tick.
 * Devuelve true si intentó encolar un día que no tenía registrado.
 */
export const encolarResumenSiCorresponde = async (ahora: Date = new Date()): Promise<boolean> => {
  // Solo pruebas o mantenimiento: sin resumen automático (los acudientes con 'resumen' no recibirían nada)
  if (process.env.RESUMEN_DIARIO_DESACTIVADO === 'true') return false;
  const dia =
    horaColombia(ahora) >= horaResumen()
      ? fechaColombiaISO(ahora)
      : fechaColombiaISO(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
  if (diasEncolados.has(dia)) return false;
  await encolar({ tipo: 'resumen-diario', payload: { dia }, claveUnica: `resumen:${dia}` });
  diasEncolados.add(dia);
  if (diasEncolados.size > 7) diasEncolados.delete(diasEncolados.values().next().value as string);
  return true;
};

/** Solo pruebas: olvida los días encolados en memoria. */
export const reiniciarEstadoResumen = (): void => {
  diasEncolados.clear();
};

/**
 * Handler 'resumen-diario': arma y encola los correos de resumen pendientes. Devuelve cuántos correos encoló.
 * 'dia' identifica la corrida (claveUnica de los trabajos de correo); el contenido sale de las marcas.
 */
export const procesarResumenDiario = async (
  dia: string,
  ahora: Date = new Date(),
  ctx?: Pick<ContextoTrabajo, 'comprobarCancelacion'>,
): Promise<number> => {
  // Auditoría 4.AJ: entre pasos se revisa si el trabajo fue cancelado por tiempo agotado
  const comprobar = () => ctx?.comprobarCancelacion();
  // 1. Notificaciones aún marcadas para el resumen (últimas 48 h), agrupadas por usuario
  const grupos = await Notificacion.aggregate([
    {
      $match: {
        'metadata.resumen': true,
        tipo: TipoNotificacion.MENSAJE,
        createdAt: { $gte: new Date(ahora.getTime() - VENTANA_MARCAS_MS) },
      },
    },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$usuarioId',
        notifIds: { $push: '$_id' },
        items: { $push: { mensajeId: '$entidadId', titulo: '$titulo', remitente: '$metadata.remitente', fecha: '$createdAt' } },
      },
    },
  ]);
  if (grupos.length === 0) return 0;
  comprobar();

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
  const notifsPorUsuario = new Map(grupos.map((g: any) => [String(g._id), g.notifIds]));
  // Marcas ya atendidas: las del usuario con correo encolado y las de quien ya leyó todo (nunca irían)
  const atendidas: { ids: any[]; enviado: boolean }[] = [];

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
    if (pendientes.length === 0) {
      atendidas.push({ ids: notifsPorUsuario.get(String(u._id)) || [], enviado: false });
      continue;
    }
    atendidas.push({ ids: notifsPorUsuario.get(String(u._id)) || [], enviado: true });
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
        // Auditoría 4.AC: clave por QUIÉNES van en el lote; una clave repetida implica el mismo lote (mismas marcas)
        claveUnica: claveDeLote(`resumen:${dia}:${escuelaId}`, lote.map((d: any) => d.usuarioId)),
        payload: {
          plantilla: 'resumen',
          datos: { dia, urlMensajes: `${config.frontendUrl}/mensajes`, urlPreferencias: process.env.EMAIL_PREFERENCIAS_URL || '' },
          destinatarios: lote,
        },
      });
    }
  }
  comprobar();
  if (trabajos.length > 0) await encolar(trabajos);

  // 5. Quitar las marcas SOLO después de encolar: es la marca por usuario (auditoría 4.AK) que excluye del
  //    siguiente intento a quien ya tiene su resumen encolado. Si este paso falla, el reintento arma los mismos
  //    lotes (mismos hashes → se ignoran); solo si además cambió la membresía puede repetirse un correo.
  const idsEnviados = atendidas.filter((a) => a.enviado).flatMap((a) => a.ids);
  const idsLeidos = atendidas.filter((a) => !a.enviado).flatMap((a) => a.ids);
  if (idsEnviados.length > 0) {
    await Notificacion.updateMany(
      { _id: { $in: idsEnviados } },
      { $unset: { 'metadata.resumen': '' }, $set: { 'metadata.resumenEnviadoEn': ahora } },
    );
  }
  if (idsLeidos.length > 0) {
    await Notificacion.updateMany({ _id: { $in: idsLeidos } }, { $unset: { 'metadata.resumen': '' } });
  }
  logger.info(`[Resumen] ${dia}: ${correos} correo(s) de resumen encolados en ${trabajos.length} trabajo(s)`);
  return correos;
};
