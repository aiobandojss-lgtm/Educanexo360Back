/**
 * Logger mínimo con niveles (Fase 3.10).
 *
 * LOG_LEVEL = error | warn | info | debug
 *   - Por defecto: 'warn' en producción (NODE_ENV=production) e 'info' en desarrollo.
 *   - Los errores SIEMPRE se registran.
 *   - 'debug' activa los logs detallados (por request, caché, flujos de mensajes); usarlo solo para
 *     diagnosticar: pueden incluir IDs y datos de usuarios.
 */
type Nivel = 'error' | 'warn' | 'info' | 'debug';
const ORDEN: Record<Nivel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const nivelActual = (): number => {
  const configurado = (process.env.LOG_LEVEL || '').toLowerCase() as Nivel;
  if (configurado in ORDEN) return ORDEN[configurado];
  return process.env.NODE_ENV === 'production' ? ORDEN.warn : ORDEN.info;
};

export const logger = {
  error: (...args: unknown[]): void => console.error(...args),
  warn: (...args: unknown[]): void => {
    if (nivelActual() >= ORDEN.warn) console.warn(...args);
  },
  info: (...args: unknown[]): void => {
    if (nivelActual() >= ORDEN.info) console.log(...args);
  },
  debug: (...args: unknown[]): void => {
    if (nivelActual() >= ORDEN.debug) console.log(...args);
  },
};

export default logger;
