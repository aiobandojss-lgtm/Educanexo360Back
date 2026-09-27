/**
 * Correo enmascarado para los logs (auditoría 4.H): nunca se registra la dirección completa.
 * 'juan.perez@gmail.com' → 'j***@gmail.com'
 */
export const enmascararEmail = (email: unknown): string => {
  const texto = String(email ?? '');
  const arroba = texto.lastIndexOf('@');
  if (arroba <= 0) return '***';
  return `${texto[0]}***${texto.slice(arroba)}`;
};

/** Reemplaza cualquier dirección de correo dentro de un texto por su versión enmascarada. */
export const enmascararEmailsEnTexto = (texto: unknown): string =>
  String(texto ?? '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => enmascararEmail(m));
