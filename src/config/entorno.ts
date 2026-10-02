import dotenv from 'dotenv';

/**
 * Variables de entorno sin espacios sobrantes (auditoría H7).
 *
 * Un deploy falló porque S3_REGION tenía un espacio al inicio (" us-east-005"): al copiar valores en el panel de
 * cPanel es fácil arrastrar espacios, y un espacio rompe regiones, endpoints, credenciales, URLs de CORS y flags
 * comparados con === 'true'.
 *
 * Este módulo DEBE ser el primer import de app.ts: varios módulos leen process.env al importarse, así que el recorte
 * tiene que ocurrir antes. Recorta TODAS las variables (también las que lee el SDK de AWS por su cuenta, como
 * AWS_ACCESS_KEY_ID). Los scripts de src/scripts usan el equivalente src/scripts/_entorno.js.
 */
export const normalizarEntorno = (entorno: NodeJS.ProcessEnv = process.env): string[] => {
  const recortadas: string[] = [];
  for (const [nombre, valor] of Object.entries(entorno)) {
    if (typeof valor !== 'string') continue;
    const limpio = valor.trim();
    if (limpio !== valor) {
      entorno[nombre] = limpio;
      recortadas.push(nombre);
    }
  }
  return recortadas;
};

// dotenv no pisa variables ya definidas (las del panel de cPanel mandan), igual que antes
dotenv.config();

/** Nombres (nunca valores) de las variables que traían espacios al arrancar. */
export const variablesRecortadas = normalizarEntorno();

if (variablesRecortadas.length > 0) {
  // stderr (stderr.log en cPanel): ayuda a encontrar el valor mal copiado sin exponerlo
  console.warn(`[Entorno] Se quitaron espacios al inicio/fin de: ${variablesRecortadas.join(', ')}`);
}
