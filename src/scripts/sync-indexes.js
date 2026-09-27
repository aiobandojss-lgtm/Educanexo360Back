/**
 * sync-indexes.js — Alinea los índices de MongoDB con los declarados en los schemas (Fase 3).
 *
 * Mongoose crea automáticamente los índices NUEVOS al arrancar (autoIndex), pero NO borra los que se
 * quitaron del código. Este script muestra la diferencia y, con --aplicar, borra los sobrantes y crea
 * los faltantes (Model.syncIndexes). En Atlas M0 los índices ocupan parte de los 512 MB.
 *
 * Requiere el código compilado (npm run build). NO lee el .env: MONGODB_URI va explícita.
 *
 * Uso:
 *   Ver diferencias (no cambia nada):
 *     MONGODB_URI="mongodb+srv://..." node src/scripts/sync-indexes.js
 *   Aplicar (hacer mongodump antes en producción):
 *     MONGODB_URI="mongodb+srv://..." node src/scripts/sync-indexes.js --aplicar
 */
'use strict';
const path = require('path');
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');
if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

const MODELOS = [
  'usuario', 'escuela', 'curso', 'asignatura', 'calificacion', 'logro', 'mensaje', 'notificacion',
  'asistencia', 'anuncio', 'tarea', 'calendario', 'invitacion', 'solicitud-registro', 'alertaAsistencia', 'perfilRol',
  // Fase 4
  'outbox', 'emailCupo',
];

const mb = (bytes) => `${(bytes / 1048576).toFixed(2)} MB`;

async function tamañoIndices(db) {
  let total = 0;
  const detalle = [];
  for (const { name } of await db.listCollections({ type: 'collection' }).toArray()) {
    if (name.startsWith('system.')) continue;
    try {
      const [st] = await db.collection(name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
      const tam = st?.storageStats?.totalIndexSize || 0;
      total += tam;
      detalle.push({ coleccion: name, indices: st?.storageStats?.nindexes, tamaño: mb(tam) });
    } catch {
      /* $collStats puede no estar disponible en algunos tiers */
    }
  }
  return { total, detalle };
}

(async () => {
  // autoIndex desactivado: los modelos no deben construir índices por su cuenta mientras se comparan
  await mongoose.connect(URI, { autoIndex: false });
  const db = mongoose.connection.db;
  console.log(`Base: ${db.databaseName} | modo: ${APLICAR ? 'APLICAR' : 'solo diferencias'}\n`);

  const antes = await tamañoIndices(db);
  for (const nombre of MODELOS) {
    let Modelo;
    try {
      const mod = require(path.join(__dirname, '../../dist/models', `${nombre}.model.js`));
      Modelo = mod.default || mod;
    } catch (e) {
      console.warn(`⚠️  No se pudo cargar el modelo ${nombre} (¿falta npm run build?): ${e.message}`);
      continue;
    }
    const diff = await Modelo.diffIndexes();
    if (diff.toDrop.length || diff.toCreate.length) {
      console.log(`📂 ${Modelo.collection.name}`);
      diff.toDrop.forEach((i) => console.log(`   − borrar: ${typeof i === 'string' ? i : JSON.stringify(i)}`));
      diff.toCreate.forEach((i) => console.log(`   + crear:  ${JSON.stringify(i)}`));
      if (APLICAR) {
        await Modelo.syncIndexes();
        console.log('   ✅ sincronizado');
      }
    }
  }

  const despues = await tamañoIndices(db);
  console.log(`\nTamaño total de índices: antes ${mb(antes.total)} → ahora ${mb(despues.total)}`);
  console.table(despues.detalle);
  if (!APLICAR) console.log('\n(No se cambió nada. Ejecute con --aplicar para sincronizar.)');
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ Error:', e); process.exit(1); });
