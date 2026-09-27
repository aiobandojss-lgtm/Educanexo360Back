/**
 * Preferencia de correo de mensajes (Fase 4.5).
 *
 * - 'inmediato': un correo por cada mensaje recibido.
 * - 'resumen': un solo correo diario (18:00 hora Colombia) con los mensajes no leídos del día.
 * - 'ninguno': sin correos de mensajes normales.
 *
 * Siempre salen de inmediato, sin importar la preferencia: los mensajes de prioridad ALTA, las alertas de
 * asistencia y los correos de cuenta (reset de contraseña, credenciales, solicitudes de registro).
 * Por defecto (sin preferencia guardada): ACUDIENTE → 'resumen'; los demás roles → 'inmediato'.
 */
export type PreferenciaEmail = 'inmediato' | 'resumen' | 'ninguno';
export const PREFERENCIAS_EMAIL: PreferenciaEmail[] = ['inmediato', 'resumen', 'ninguno'];

export const preferenciaEmailPorDefecto = (tipo?: string): PreferenciaEmail =>
  tipo === 'ACUDIENTE' ? 'resumen' : 'inmediato';

export const preferenciaEmail = (usuario: { tipo?: string; preferencias?: { email?: string } } | null | undefined): PreferenciaEmail => {
  const guardada = usuario?.preferencias?.email as PreferenciaEmail | undefined;
  return guardada && PREFERENCIAS_EMAIL.includes(guardada) ? guardada : preferenciaEmailPorDefecto(usuario?.tipo);
};
