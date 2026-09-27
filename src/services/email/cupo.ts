import CupoCorreoModelo from '../../models/emailCupo.model';
import { fechaColombiaISO } from '../../utils/fechas';

/**
 * Cupo diario de correo persistido en Mongo (Fase 4.4). Reemplaza el tope en memoria de 250/día, que se
 * perdía al reiniciar y descartaba correos en silencio.
 *
 * - Un documento por día calendario de Colombia (_id 'YYYY-MM-DD') con el total enviado.
 * - EMAIL_DAILY_LIMIT (por defecto 250): tope total del día (ajústelo al plan del proveedor).
 * - EMAIL_RESERVA_ALTA (por defecto 20): cupo reservado para prioridad alta (reset de contraseña, alertas,
 *   cuentas). Los correos normales solo usan hasta EMAIL_DAILY_LIMIT - EMAIL_RESERVA_ALTA.
 * - La reserva es atómica (findOneAndUpdate con condición + upsert): sin carreras entre trabajos en paralelo.
 * - Lo que no cabe NO se descarta: la cola lo aplaza al día siguiente (ReprogramarTrabajo) y lo registra.
 */
// El modelo vive en src/models/emailCupo.model.ts (así sync-indexes también lo revisa)
export const CupoCorreo = CupoCorreoModelo;

const num = (clave: string, d: number) => {
  const v = parseInt(process.env[clave] || '', 10);
  return Number.isFinite(v) && v >= 0 ? v : d;
};

export const limitesCupo = () => {
  const limite = num('EMAIL_DAILY_LIMIT', 250);
  const reservaAlta = Math.min(num('EMAIL_RESERVA_ALTA', 20), limite);
  return { limite, reservaAlta };
};

/**
 * Reserva `cantidad` correos del cupo de hoy. Devuelve false si no hay cupo para esa prioridad.
 */
export const reservarCupo = async (prioridad: 'alta' | 'normal', cantidad = 1): Promise<boolean> => {
  const { limite, reservaAlta } = limitesCupo();
  const tope = prioridad === 'alta' ? limite : limite - reservaAlta;
  if (cantidad > tope) return false;
  const dia = fechaColombiaISO();
  const filtro = { _id: dia, enviados: { $lte: tope - cantidad } };
  const inc = { $inc: { enviados: cantidad, ...(prioridad === 'alta' && { altaEnviados: cantidad }) } };
  try {
    await CupoCorreo.findOneAndUpdate(
      filtro,
      { ...inc, $setOnInsert: { expireAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) } },
      { upsert: true, new: true },
    );
    return true;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // 11000 = el documento del día YA existe: o no hay cupo, o dos trabajos crearon el día a la vez (la primera
    // reserva del día en paralelo). Se reintenta SIN upsert: solo es "sin cupo" si de verdad no cabe.
    const r = await CupoCorreo.findOneAndUpdate(filtro, inc, { new: true });
    return !!r;
  }
};

/** Devuelve cupo reservado si el envío falló (el proveedor no lo aceptó). */
export const liberarCupo = async (prioridad: 'alta' | 'normal', cantidad = 1): Promise<void> => {
  await CupoCorreo.updateOne(
    { _id: fechaColombiaISO() },
    { $inc: { enviados: -cantidad, ...(prioridad === 'alta' && { altaEnviados: -cantidad }) } },
  );
};

export const cupoDeHoy = async () => {
  const doc: any = await CupoCorreo.findById(fechaColombiaISO()).lean();
  return { dia: fechaColombiaISO(), enviados: doc?.enviados || 0, altaEnviados: doc?.altaEnviados || 0, ...limitesCupo() };
};
