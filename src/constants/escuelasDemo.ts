import mongoose from 'mongoose';

/**
 * K6: escuelas de demostración que existen en producción.
 *
 * - DEMO-EDUCANEXO: colegio de pruebas (H6, src/scripts/seed-colegio-demo.js). Su _id lo genera el script, por eso
 *   se identifica por código. Sus cuentas usan @demo.educanexo.invalid y ya no reciben correo (esEmailFicticio).
 * - Escuela de los revisores de Google Play (seed-reviewers.ts / seed-reviewers-COMPASS.js, solo locales): _id fijo
 *   a0a0…a0 (código DEMO-REVIEW). Sus cuentas demo.*@educanexo360.creativebycode.com usan el dominio REAL, así que
 *   el correo se bloquea por escuelaId (ESCUELAS_SIN_CORREO), sin bloquear el dominio. El push y la campanita siguen
 *   funcionando: el revisor los prueba.
 *
 * Ninguna de las dos cuenta en los listados y tableros globales de SUPER_ADMIN (salvo ?incluirDemo=true).
 */
export const CODIGO_ESCUELA_DEMO = 'DEMO-EDUCANEXO';
export const ID_ESCUELA_REVISORES = 'a0a0a0a0a0a0a0a0a0a0a0a0';

/** Escuelas cuyos usuarios nunca reciben correo (por escuelaId). */
export const ESCUELAS_SIN_CORREO: readonly string[] = [ID_ESCUELA_REVISORES];

export const esEscuelaSinCorreo = (escuelaId: unknown): boolean =>
  escuelaId != null && ESCUELAS_SIN_CORREO.includes(String(escuelaId));

/** Filtro de Escuela que deja fuera las dos escuelas demo. */
export const filtroEscuelasSinDemo = () => ({
  $nor: [{ _id: new mongoose.Types.ObjectId(ID_ESCUELA_REVISORES) }, { codigo: CODIGO_ESCUELA_DEMO }],
});

/** ?incluirDemo=true en la query (cualquier otro valor o ausente: false). */
export const incluirDemo = (query: unknown): boolean =>
  !!query && typeof query === 'object' && (query as Record<string, unknown>).incluirDemo === 'true';
