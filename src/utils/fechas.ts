/**
 * Fechas en hora de Colombia (UTC-5, sin horario de verano).
 *
 * Las fechas de calendario ('YYYY-MM-DD') se guardan como medianoche UTC; para decidir "qué día/mes es hoy"
 * o "hasta cuándo va un día" hay que razonar en hora de Colombia.
 */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000; // UTC-5

/** Primer instante (UTC) del mes actual según la hora de Colombia, como medianoche UTC del día 1. */
export const inicioMesColombia = (ahora: Date = new Date()): Date => {
  const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
  return new Date(Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), 1));
};

/** Último instante del día calendario de `fecha` en hora de Colombia (23:59:59.999 COT). */
export const finDelDiaColombia = (fecha: Date): Date => {
  const f = new Date(fecha);
  return new Date(
    Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + 1) + DESFASE_COLOMBIA_MS - 1,
  );
};
