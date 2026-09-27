import CupoCorreoModelo from '../../models/emailCupo.model';
import { fechaColombiaISO } from '../../utils/fechas';

/**
 * Cupo diario de correo persistido en Mongo (Fase 4.4). Reemplaza el tope en memoria de 250/día, que se
 * perdía al reiniciar y descartaba correos en silencio.
 *
 * - Un documento por día calendario de Colombia (_id 'YYYY-MM-DD') con el total enviado.
 * - EMAIL_DAILY_LIMIT (por defecto 250): tope total del día (ajústelo al plan del proveedor).
 * - EMAIL_RESERVA_CRITICA (por defecto 20, auditoría 4.E): reservado para lo CRÍTICO (reset y definir contraseña,
 *   cuentas). Ni lo normal ni lo alto lo consumen: la crítica puede usar hasta EMAIL_DAILY_LIMIT.
 * - EMAIL_RESERVA_ALTA (por defecto 20): reservado para prioridad alta (alertas, mensajes ALTA). La alta usa hasta
 *   EMAIL_DAILY_LIMIT - EMAIL_RESERVA_CRITICA; lo normal hasta EMAIL_DAILY_LIMIT - ambas reservas.
 * - La reserva es atómica (findOneAndUpdate con condición + upsert): sin carreras entre trabajos en paralelo.
 * - Lo que no cabe NO se descarta: la cola lo aplaza al día siguiente (ReprogramarTrabajo) y lo registra.
 */
// El modelo vive en src/models/emailCupo.model.ts (así sync-indexes también lo revisa)
export const CupoCorreo = CupoCorreoModelo;

const num = (clave: string, d: number) => {
  const v = parseInt(process.env[clave] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : d;
};

export type PrioridadCorreo = 'critica' | 'alta' | 'normal';

export const limitesCupo = () => {
  const limite = num('EMAIL_DAILY_LIMIT', 250);
  const reservaCritica = Math.min(num('EMAIL_RESERVA_CRITICA', 20), limite);
  const reservaAlta = Math.min(num('EMAIL_RESERVA_ALTA', 20), limite - reservaCritica);
  return { limite, reservaAlta, reservaCritica };
};

/** Tope del día para cada prioridad. */
export const topeCupo = (prioridad: PrioridadCorreo): number => {
  const { limite, reservaAlta, reservaCritica } = limitesCupo();
  if (prioridad === 'critica') return limite;
  if (prioridad === 'alta') return limite - reservaCritica;
  return limite - reservaCritica - reservaAlta;
};

/**
 * Reserva `cantidad` correos del cupo de hoy. Devuelve el DÍA de la reserva ('YYYY-MM-DD') o null si no hay
 * cupo para esa prioridad. Ese día es el que hay que pasar a liberarCupo (auditoría 4.K).
 */
export const reservarCupo = async (prioridad: PrioridadCorreo, cantidad = 1): Promise<string | null> => {
  const tope = topeCupo(prioridad);
  if (cantidad > tope) return null;
  const dia = fechaColombiaISO();
  const filtro = { _id: dia, enviados: { $lte: tope - cantidad } };
  const inc = { $inc: { enviados: cantidad, ...(prioridad !== 'normal' && { [`${prioridad}Enviados`]: cantidad }) } };
  try {
    await CupoCorreo.findOneAndUpdate(
      filtro,
      { ...inc, $setOnInsert: { expireAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) } },
      { upsert: true, new: true },
    );
    return dia;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // 11000 = el documento del día YA existe: o no hay cupo, o dos trabajos crearon el día a la vez (la primera
    // reserva del día en paralelo). Se reintenta SIN upsert: solo es "sin cupo" si de verdad no cabe.
    const r = await CupoCorreo.findOneAndUpdate(filtro, inc, { new: true });
    return r ? dia : null;
  }
};

/**
 * Devuelve cupo reservado si el envío falló. Se libera en el día DE LA RESERVA (auditoría 4.K): reservar a las
 * 23:59:59 y fallar a las 00:00 descontaba del día siguiente.
 */
export const liberarCupo = async (prioridad: PrioridadCorreo, cantidad: number, dia: string): Promise<void> => {
  await CupoCorreo.updateOne(
    { _id: dia },
    { $inc: { enviados: -cantidad, ...(prioridad !== 'normal' && { [`${prioridad}Enviados`]: -cantidad }) } },
  );
};

export const cupoDeHoy = async () => {
  const doc: any = await CupoCorreo.findById(fechaColombiaISO()).lean();
  return {
    dia: fechaColombiaISO(),
    enviados: doc?.enviados || 0,
    altaEnviados: doc?.altaEnviados || 0,
    criticaEnviados: doc?.criticaEnviados || 0,
    ...limitesCupo(),
  };
};
