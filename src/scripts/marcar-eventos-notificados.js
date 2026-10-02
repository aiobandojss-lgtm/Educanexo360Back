/**
 * marcar-eventos-notificados.js — Extra de la auditoría 3.Y: pone notificadoEn = createdAt en los eventos
 * ACTIVO que no lo tienen (creados antes de 3.Y). Así, si un evento antiguo se alterna
 * ACTIVO → PENDIENTE → ACTIVO, NO manda un push repetido al colegio.
 *
 * ⚠️ NO se corre en producción sin aprobación de Aymer.
 *
 * NO lee el .env: MONGODB_URI va explícita. Sin --aplicar solo muestra cuántos cambiaría (simulación).
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/marcar-eventos-notificados.js            (simulación)
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/marcar-eventos-notificados.js --aplicar  (mongodump antes)
 */
'use strict';
require('./_entorno'); // H7: quita espacios sobrantes de las variables de entorno
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');

if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  // Colección del modelo EventoCalendario (nombre por defecto de Mongoose)
  const nombres = (await db.listCollections().toArray()).map((c) => c.name);
  const coleccion = nombres.includes('eventocalendarios') ? 'eventocalendarios' : null;
  if (!coleccion) {
    console.log('No existe la colección eventocalendarios: nada que hacer.');
    await mongoose.disconnect();
    return;
  }
  const eventos = db.collection(coleccion);
  const filtro = { estado: 'ACTIVO', notificadoEn: { $exists: false } };
  const total = await eventos.countDocuments(filtro);
  console.log(`\n${APLICAR ? '🔧 APLICANDO' : '🔍 SIMULACIÓN (sin cambios; use --aplicar)'} en ${mongoose.connection.name}`);
  console.log(`Eventos ACTIVO sin notificadoEn: ${total}`);

  if (APLICAR && total > 0) {
    // notificadoEn = createdAt (o la fecha actual si el evento no tiene createdAt)
    const r = await eventos.updateMany(filtro, [{ $set: { notificadoEn: { $ifNull: ['$createdAt', '$$NOW'] } } }]);
    console.log(`✅ Marcados: ${r.modifiedCount}`);
  }
  await mongoose.disconnect();
  if (!APLICAR) console.log('ℹ️  Simulación terminada. Nada cambió.\n');
}

main().catch(async (err) => {
  console.error('❌ Error:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
