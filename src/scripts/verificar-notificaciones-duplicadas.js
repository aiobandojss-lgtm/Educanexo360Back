/**
 * verificar-notificaciones-duplicadas.js — auditoría 4.Y: antes de desplegar la versión con el índice único
 * { entidadId, usuarioId } (entidadTipo 'Mensaje') en notificacions, busca campanitas repetidas del mismo mensaje
 * para el mismo usuario. Si las hay, Mongoose NO puede crear el índice al arrancar (queda registrado en el log) y
 * la idempotencia en la base quedaría sin efecto.
 *
 * - Sin --aplicar (por defecto): SIMULACIÓN, solo cuenta y muestra ejemplos.
 * - Con --aplicar: de cada grupo repetido conserva UNA y borra las demás. Auditoría 4.AM: se prefiere cualquier
 *   estado distinto de PENDIENTE (ARCHIVADA antes que LEIDA, para no des-archivar ni volver a mostrar como no
 *   leída); si todas están PENDIENTE, la más antigua. Hacer mongodump ANTES.
 *
 * En el deploy: correrlo INMEDIATAMENTE antes del reinicio con la versión nueva y verificar después que el índice
 * mensaje_usuario_unico existe (sync-indexes.js en simulación o db.notificacions.getIndexes()).
 *
 * NO lee el .env: MONGODB_URI va explícita.
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/verificar-notificaciones-duplicadas.js            (simulación)
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/verificar-notificaciones-duplicadas.js --aplicar  (tras mongodump)
 */
'use strict';
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');

if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const col = mongoose.connection.db.collection('notificacions');
  console.log(`\n${APLICAR ? '🔧 APLICANDO' : '🔍 SIMULACIÓN (sin cambios; use --aplicar)'} en ${mongoose.connection.name}\n`);

  const grupos = await col
    .aggregate(
      [
        { $match: { entidadTipo: 'Mensaje', entidadId: { $ne: null }, usuarioId: { $ne: null } } },
        {
          $group: {
            _id: { entidadId: '$entidadId', usuarioId: '$usuarioId' },
            docs: { $push: { _id: '$_id', estado: '$estado', createdAt: '$createdAt' } },
            n: { $sum: 1 },
          },
        },
        { $match: { n: { $gt: 1 } } },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  const sobrantes = grupos.reduce((t, g) => t + g.n - 1, 0);
  console.log(`Grupos (mensaje, usuario) repetidos: ${grupos.length}; notificaciones sobrantes: ${sobrantes}`);
  grupos.slice(0, 5).forEach((g) => console.log(`  - mensaje ${g._id.entidadId}, usuario ${g._id.usuarioId}: ${g.n}`));

  if (APLICAR && grupos.length > 0) {
    let borradas = 0;
    // ARCHIVADA > LEIDA > PENDIENTE (cualquier otro estado cuenta como no pendiente); empate → la más antigua
    const peso = (estado) => (estado === 'ARCHIVADA' ? 3 : estado === 'LEIDA' ? 2 : estado === 'PENDIENTE' ? 0 : 1);
    for (const g of grupos) {
      const orden = g.docs.sort(
        (a, b) =>
          peso(b.estado) - peso(a.estado) ||
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );
      const borrar = orden.slice(1).map((d) => d._id);
      const r = await col.deleteMany({ _id: { $in: borrar } });
      borradas += r.deletedCount;
    }
    console.log(`\n✅ Borradas ${borradas} notificación(es) repetida(s). Ya se puede desplegar (el índice se crea al arrancar).`);
  } else if (grupos.length === 0) {
    console.log('\n✅ Sin duplicados: el índice único se creará al arrancar la nueva versión.');
  } else {
    console.log('\n⚠️  Hay duplicados: hacer mongodump y correr con --aplicar ANTES de desplegar.');
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Error:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
