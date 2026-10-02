/**
 * Equivalente de src/config/entorno.ts para los scripts de src/scripts (auditoría H7): quita espacios al inicio/fin
 * de las variables de entorno (p. ej. S3_REGION=" us-east-005" copiado del panel). Requerir ANTES de leer
 * process.env. NO carga el .env: los scripts reciben MONGODB_URI y S3_* explícitas.
 */
'use strict';

const recortadas = [];
for (const [nombre, valor] of Object.entries(process.env)) {
  if (typeof valor !== 'string') continue;
  const limpio = valor.trim();
  if (limpio !== valor) {
    process.env[nombre] = limpio;
    recortadas.push(nombre);
  }
}
if (recortadas.length > 0) console.warn(`[Entorno] Se quitaron espacios al inicio/fin de: ${recortadas.join(', ')}`);

module.exports = { recortadas };
