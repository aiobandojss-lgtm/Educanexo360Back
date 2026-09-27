/**
 * Escape de HTML para plantillas de correo y contenido generado por el sistema (Fase 4.4).
 * TODO dato de usuario (asunto, remitente, título, mensaje, nombres, motivos...) pasa por aquí antes de
 * interpolarse en HTML: evita inyectar etiquetas, enlaces o scripts en los correos.
 */
const MAPA: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (valor: unknown): string =>
  String(valor ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);

/**
 * URL segura para un atributo href: solo http/https (bloquea javascript:, data:, etc.), escapada.
 * Si no es válida devuelve '#'.
 */
export const urlSegura = (valor: unknown): string => {
  try {
    const url = new URL(String(valor ?? ''));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '#';
    return escapeHtml(url.toString());
  } catch {
    return '#';
  }
};
