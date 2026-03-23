/**
 * Escapa caracteres especiales de RegEx para prevenir ReDoS.
 * Usar siempre antes de incluir input del usuario en new RegExp() o $regex de MongoDB.
 */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
