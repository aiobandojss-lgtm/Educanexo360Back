import crypto from 'crypto';
import mongoose from 'mongoose';
import Usuario from '../../models/usuario.model';
import config from '../../config/config';
import { encolar, ReprogramarTrabajo, FalloDefinitivo, ContextoTrabajo } from '../../queue/outbox';
import { reservarCupo, liberarCupo } from './cupo';
import { obtenerProveedor } from './proveedores';
import { renderizarCorreo } from './plantillas';
import { inicioDiaSiguienteColombia } from '../../utils/fechas';
import { enmascararEmail } from '../../utils/enmascarar';
import { esEmailFicticio } from '../email.service';
import { logger } from '../../utils/logger';

/**
 * Correos de CUENTA con prioridad 'critica' (auditoría 4.E): recuperar contraseña, definir contraseña al aprobar
 * una solicitud (4.7) y reenvío del enlace (4.P).
 *
 * - Tienen reserva de cupo propia (EMAIL_RESERVA_CRITICA): las alertas y los mensajes no pueden agotarla.
 * - El token se genera AL ENVIAR: el trabajo solo guarda usuarioId y tipo, así nunca queda un token en claro en
 *   outbox. En la base solo se guarda su hash sha256 (resetPasswordToken) y su vencimiento.
 * - caducaEn: si el correo no puede salir antes (cupo, fallos), el trabajo pasa a FALLIDO registrado en vez de
 *   llegar tarde. Reset: 1 h desde la solicitud. Definir contraseña: 72 h.
 */
export const HORAS_ENLACE_RESET = 1;
export const HORAS_ENLACE_DEFINIR = 72;

export type TipoCorreoCuenta = 'reset' | 'bienvenida' | 'definir';

/** Crea un token de un solo uso para el usuario (guarda su hash y vencimiento) y devuelve el enlace. */
export const crearEnlaceContrasena = async (usuarioId: string, horas: number): Promise<string> => {
  const token = crypto.randomBytes(32).toString('hex');
  await Usuario.updateOne(
    { _id: usuarioId },
    {
      $set: {
        resetPasswordToken: crypto.createHash('sha256').update(token).digest('hex'),
        resetPasswordExpires: new Date(Date.now() + horas * 60 * 60 * 1000),
      },
    },
  );
  return `${config.frontendUrl}/reset-password/${token}`;
};

/** Encola un correo de cuenta (prioridad crítica). Lanza si no se pudo encolar: el llamador decide (p. ej. 503). */
export const encolarCorreoCuenta = async (payload: {
  tipo: TipoCorreoCuenta;
  escuelaId?: string;
  [clave: string]: unknown;
}): Promise<number> => {
  const horas = payload.tipo === 'reset' ? HORAS_ENLACE_RESET : HORAS_ENLACE_DEFINIR;
  return encolar({
    tipo: 'correo-cuenta',
    prioridad: 'critica',
    escuelaId: payload.escuelaId,
    payload: { ...payload, caducaEn: new Date(Date.now() + horas * 60 * 60 * 1000) },
  });
};

/** Reserva cupo crítico; si no hay, aplaza a mañana solo si aún llegaría antes de caducaEn (si no, FALLIDO). */
const reservarCritico = async (caducaEn: Date): Promise<string> => {
  const dia = await reservarCupo('critica');
  if (dia) return dia;
  const manana = inicioDiaSiguienteColombia(new Date(), 5);
  if (manana.getTime() >= caducaEn.getTime()) {
    throw new FalloDefinitivo('Cupo diario de correo agotado y el enlace vencería antes de poder enviarlo');
  }
  throw new ReprogramarTrabajo(manana, 'Cupo diario de correo agotado (reserva crítica incluida); sale mañana');
};

const enviar = async (dia: string, para: { email: string; nombre?: string }, plantilla: string, datos: any) => {
  try {
    const correo = renderizarCorreo(plantilla, datos, para);
    await obtenerProveedor().send({ to: para.email, ...correo });
  } catch (error: any) {
    await liberarCupo('critica', 1, dia);
    if (error?.permanente) {
      throw new FalloDefinitivo(`Rechazo permanente para ${enmascararEmail(para.email)}`);
    }
    throw error;
  }
};

/**
 * Handler del trabajo 'correo-cuenta'.
 * - reset:      { usuarioId }                      → enlace (1 h) al propio usuario.
 * - bienvenida: { acudienteId, estudiantes: [...] } → enlaces (72 h) para el acudiente y cada estudiante nuevo.
 * - definir:    { usuarioId, enviarA: [ids] }       → enlace (72 h) para usuarioId, enviado a cada id de enviarA.
 */
export const procesarCorreoCuenta = async (payload: any, ctx?: Pick<ContextoTrabajo, 'comprobarCancelacion'>): Promise<void> => {
  // Auditoría 4.S: antes de cada envío se revisa si el trabajo fue cancelado por tiempo agotado
  const comprobar = () => ctx?.comprobarCancelacion();
  const caducaEn = new Date(payload.caducaEn || Date.now() + 60 * 60 * 1000);
  if (Date.now() > caducaEn.getTime()) {
    throw new FalloDefinitivo('La solicitud venció antes de poder enviar el correo');
  }

  if (payload.tipo === 'reset') {
    const usuario: any = await Usuario.findOne({ _id: payload.usuarioId, estado: 'ACTIVO' })
      .select('_id email nombre')
      .lean();
    if (!usuario?.email) throw new FalloDefinitivo('Usuario inexistente o inactivo');
    comprobar();
    const dia = await reservarCritico(caducaEn);
    const resetUrl = await crearEnlaceContrasena(String(usuario._id), HORAS_ENLACE_RESET);
    await enviar(dia, usuario, 'reset', { nombre: usuario.nombre, resetUrl, expirationTime: '1 hora' });
    return;
  }

  if (payload.tipo === 'bienvenida') {
    const acudiente: any = await Usuario.findById(payload.acudienteId).select('_id email nombre apellidos').lean();
    if (!acudiente?.email) throw new FalloDefinitivo('Acudiente inexistente');
    comprobar();
    const dia = await reservarCritico(caducaEn);
    const enlace = await crearEnlaceContrasena(String(acudiente._id), HORAS_ENLACE_DEFINIR);
    const estudiantes = [];
    for (const est of payload.estudiantes || []) {
      if (!est.esExistente && est.usuarioId && mongoose.isValidObjectId(est.usuarioId)) {
        estudiantes.push({ ...est, enlace: await crearEnlaceContrasena(String(est.usuarioId), HORAS_ENLACE_DEFINIR) });
      } else {
        estudiantes.push(est);
      }
    }
    const nombre = payload.nombre || `${acudiente.nombre ?? ''} ${acudiente.apellidos ?? ''}`.trim();
    await enviar(dia, { email: acudiente.email, nombre }, 'credenciales', {
      nombre,
      email: acudiente.email,
      enlace,
      horas: HORAS_ENLACE_DEFINIR,
      loginUrl: `${config.frontendUrl}/login`,
      estudiantes,
    });
    return;
  }

  if (payload.tipo === 'definir') {
    // Reenvío del enlace (auditoría 4.P): UN token nuevo (invalida los anteriores) enviado a cada destinatario.
    // Si un envío falla de forma temporal, el reintento genera otro token y reenvía a todos (el último vale).
    const usuario: any = await Usuario.findOne({ _id: payload.usuarioId, estado: 'ACTIVO' })
      .select('_id email nombre apellidos')
      .lean();
    if (!usuario) throw new FalloDefinitivo('Usuario inexistente o inactivo');
    const ids = (Array.isArray(payload.enviarA) ? payload.enviarA : []).filter((id: any) => mongoose.isValidObjectId(id));
    const destinatarios: any[] = await Usuario.find({ _id: { $in: ids }, estado: 'ACTIVO' })
      .select('_id email nombre apellidos')
      .lean();
    const conCorreo = destinatarios.filter((d) => d.email && !esEmailFicticio(d.email));
    if (conCorreo.length === 0) throw new FalloDefinitivo('Sin destinatarios con correo real');
    const dias: string[] = [];
    try {
      for (let i = 0; i < conCorreo.length; i++) dias.push(await reservarCritico(caducaEn));
    } catch (error) {
      // Auditoría 4.Z: si una reserva i>0 falla (sin cupo), se devuelven las que ya se habían tomado
      for (const dia of dias) await liberarCupo('critica', 1, dia);
      throw error;
    }
    const enlace = await crearEnlaceContrasena(String(usuario._id), HORAS_ENLACE_DEFINIR);
    const nombreUsuario = `${usuario.nombre ?? ''} ${usuario.apellidos ?? ''}`.trim();
    for (let i = 0; i < conCorreo.length; i++) {
      const d = conCorreo[i];
      try {
        comprobar();
      } catch (error) {
        for (let j = i; j < conCorreo.length; j++) await liberarCupo('critica', 1, dias[j]);
        throw error;
      }
      const nombre = `${d.nombre ?? ''} ${d.apellidos ?? ''}`.trim();
      try {
        await enviar(dias[i], { email: d.email, nombre }, 'enlace-contrasena', {
          nombre,
          nombreUsuario,
          usuario: usuario.email,
          esPropio: String(d._id) === String(usuario._id),
          enlace,
          horas: HORAS_ENLACE_DEFINIR,
        });
      } catch (error) {
        // Los cupos reservados de los que no alcanzaron a salir se devuelven (el de este ya lo liberó enviar)
        for (let j = i + 1; j < conCorreo.length; j++) await liberarCupo('critica', 1, dias[j]);
        throw error;
      }
    }
    return;
  }

  throw new FalloDefinitivo(`Tipo de correo de cuenta desconocido: ${payload.tipo}`);
};

logger.debug('[Cuentas] módulo de correos de cuenta cargado');
