/**
 * Paginación segura (Fase 3.4): evita páginas de miles de registros y valores NaN/0/negativos
 * que llegan del cliente (?limite=100000, ?limite=abc).
 */

export const LIMITE_MAXIMO = 100;

// Página >= 1; si no es un número válido usa porDefecto
export const numeroPagina = (valor: unknown, porDefecto = 1): number =>
  Math.max(parseInt(String(valor), 10) || porDefecto, 1);

// Límite entre 1 y maximo; si no es un número válido usa porDefecto
export const numeroLimite = (valor: unknown, porDefecto: number, maximo = LIMITE_MAXIMO): number =>
  Math.min(Math.max(parseInt(String(valor), 10) || porDefecto, 1), maximo);
