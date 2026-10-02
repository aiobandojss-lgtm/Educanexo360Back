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

/** Fecha calendario de Colombia 'YYYY-MM-DD' del instante dado (clave del cupo diario de correo). */
export const fechaColombiaISO = (ahora: Date = new Date()): string =>
  new Date(ahora.getTime() - DESFASE_COLOMBIA_MS).toISOString().slice(0, 10);

/** Hora (0-23) actual en Colombia. */
export const horaColombia = (ahora: Date = new Date()): number =>
  new Date(ahora.getTime() - DESFASE_COLOMBIA_MS).getUTCHours();

/** Instante (UTC) de las 00:00 hora Colombia del día SIGUIENTE, más `minutos`. */
export const inicioDiaSiguienteColombia = (ahora: Date = new Date(), minutos = 0): Date => {
  const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
  return new Date(
    Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), enColombia.getUTCDate() + 1) +
      DESFASE_COLOMBIA_MS +
      minutos * 60 * 1000,
  );
};

/** Instante (UTC) de las 00:00 hora Colombia del día de `ahora`. */
export const inicioDiaColombia = (ahora: Date = new Date()): Date => {
  const enColombia = new Date(ahora.getTime() - DESFASE_COLOMBIA_MS);
  return new Date(
    Date.UTC(enColombia.getUTCFullYear(), enColombia.getUTCMonth(), enColombia.getUTCDate()) +
      DESFASE_COLOMBIA_MS,
  );
};

/**
 * Auditoría H3: fecha y hora SIN zona horaria ("2026-10-20T00:00:00.000", lo que enviaba el APK 1.0.0 con
 * toIso8601String() de una fecha local). Sin zona, `new Date(str)` la interpreta con la zona del SERVIDOR (UTC en
 * producción) y quedaba corrida 5 h. Convención (docs/convencion-fechas.md): sin zona = hora de Colombia.
 * Solo fecha ("2026-10-20") NO entra aquí: sigue siendo medianoche UTC, como se guardan las asistencias.
 */
const ISO_SIN_ZONA = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

/** Convierte lo que manda un cliente en Date: sin zona → hora de Colombia; con Z/offset o solo fecha → igual que siempre. */
export const parsearFechaCliente = (valor: unknown): Date => {
  if (valor instanceof Date) return valor;
  const texto = String(valor ?? '').trim();
  const m = texto.match(ISO_SIN_ZONA);
  if (m) {
    const [, dia, hh, mm, ss = '00', fraccion = ''] = m;
    // Dart puede mandar microsegundos (6 dígitos): se dejan milisegundos
    return new Date(`${dia}T${hh}:${mm}:${ss}.${(fraccion + '000').slice(0, 3)}-05:00`);
  }
  return new Date(texto);
};

/** Si el texto es fecha y hora sin zona, lo devuelve como ISO UTC ("…Z") en hora de Colombia; si no, igual. */
export const normalizarFechaCliente = (texto: string): string => {
  if (!ISO_SIN_ZONA.test(texto.trim())) return texto;
  const fecha = parsearFechaCliente(texto);
  return Number.isNaN(fecha.getTime()) ? texto : fecha.toISOString();
};

/** Fecha legible para notificaciones, siempre en hora de Colombia (no en la zona del servidor). */
export const fechaLegibleColombia = (fecha: Date | string): string =>
  new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });

/** Último instante del día calendario de `fecha` en hora de Colombia (23:59:59.999 COT). */
export const finDelDiaColombia = (fecha: Date): Date => {
  const f = new Date(fecha);
  return new Date(
    Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate() + 1) + DESFASE_COLOMBIA_MS - 1,
  );
};
