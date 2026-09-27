/**
 * migrar-fcm-tokens.js — Fase 4.3: pasa el token FCM antiguo (fcmToken) al arreglo fcmTokens, deduplica
 * y SOLO ENTONCES crea el índice único parcial { 'fcmTokens.token': 1 } (el schema lo declara con
 * _autoIndex:false para que no se cree al arrancar).
 *
 * Pasos:
 *   1. Tokens antiguos repetidos entre usuarios: se queda el usuario con el registro más reciente
 *      (fcmTokenUpdatedAt, luego updatedAt); a los demás se les quita.
 *   2. Copia fcmToken → fcmTokens (si aún no está), sin pasar de 5 dispositivos.
 *   3. Tokens repetidos en fcmTokens entre usuarios: se queda el más reciente; a los demás se les quita.
 *   4. Crea el índice único parcial (si no existe).
 *
 * NO lee el .env: MONGODB_URI va explícita. Sin --aplicar solo muestra lo que haría.
 *
 * Uso:
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/migrar-fcm-tokens.js            (simulación)
 *   MONGODB_URI="mongodb+srv://..." node src/scripts/migrar-fcm-tokens.js --aplicar  (hacer mongodump antes)
 */
'use strict';
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');
const INDICE = 'fcmTokens_token_unico';
const MAX = 5;

if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

const fecha = (u) => new Date(u.fcmTokenUpdatedAt || u.updatedAt || 0).getTime();

async function main() {
  await mongoose.connect(URI);
  const usuarios = mongoose.connection.db.collection('usuarios');
  console.log(`\n${APLICAR ? '🔧 APLICANDO' : '🔍 SIMULACIÓN (sin cambios; use --aplicar)'} en ${mongoose.connection.name}\n`);

  // 1. Tokens antiguos repetidos
  const repetidosAntiguos = await usuarios
    .aggregate([
      { $match: { fcmToken: { $type: 'string' } } },
      { $group: { _id: '$fcmToken', usuarios: { $push: { _id: '$_id', fcmTokenUpdatedAt: '$fcmTokenUpdatedAt', updatedAt: '$updatedAt' } }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  let quitadosAntiguos = 0;
  for (const grupo of repetidosAntiguos) {
    const perdedores = grupo.usuarios.sort((a, b) => fecha(b) - fecha(a)).slice(1).map((u) => u._id);
    quitadosAntiguos += perdedores.length;
    if (APLICAR) {
      await usuarios.updateMany({ _id: { $in: perdedores }, fcmToken: grupo._id }, { $set: { fcmToken: null } });
    }
  }
  console.log(`1. Tokens antiguos repetidos: ${repetidosAntiguos.length} token(s); se quitan de ${quitadosAntiguos} usuario(s).`);

  // 2. Copiar fcmToken → fcmTokens
  const filtroCopia = {
    fcmToken: { $type: 'string' },
    $expr: { $not: [{ $in: ['$fcmToken', { $ifNull: ['$fcmTokens.token', []] }] }] },
  };
  const porCopiar = await usuarios.countDocuments(filtroCopia);
  if (APLICAR && porCopiar > 0) {
    await usuarios.updateMany(filtroCopia, [
      {
        $set: {
          fcmTokens: {
            $slice: [
              {
                $concatArrays: [
                  { $ifNull: ['$fcmTokens', []] },
                  [
                    {
                      token: '$fcmToken',
                      platform: { $ifNull: ['$platform', 'android'] },
                      updatedAt: { $ifNull: ['$fcmTokenUpdatedAt', '$$NOW'] },
                    },
                  ],
                ],
              },
              -MAX,
            ],
          },
        },
      },
    ]);
  }
  console.log(`2. Usuarios con token antiguo por copiar al arreglo: ${porCopiar}.`);

  // 3. Tokens repetidos en el arreglo entre usuarios
  const repetidosArreglo = await usuarios
    .aggregate([
      { $match: { 'fcmTokens.0': { $exists: true } } },
      { $unwind: '$fcmTokens' },
      { $group: { _id: '$fcmTokens.token', usuarios: { $push: { _id: '$_id', updatedAt: '$fcmTokens.updatedAt' } }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  let quitadosArreglo = 0;
  for (const grupo of repetidosArreglo) {
    const orden = grupo.usuarios.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    const ganador = String(orden[0]._id);
    const perdedores = [...new Set(orden.slice(1).map((u) => String(u._id)))].filter((id) => id !== ganador);
    quitadosArreglo += perdedores.length;
    if (APLICAR && perdedores.length > 0) {
      const ids = perdedores.map((id) => new mongoose.Types.ObjectId(id));
      await usuarios.updateMany({ _id: { $in: ids } }, { $pull: { fcmTokens: { token: grupo._id } } });
      await usuarios.updateMany({ _id: { $in: ids }, fcmToken: grupo._id }, { $set: { fcmToken: null } });
    }
  }
  console.log(`3. Tokens repetidos en fcmTokens: ${repetidosArreglo.length} token(s); se quitan de ${quitadosArreglo} usuario(s).`);

  // 4. Índice único parcial
  const existe = (await usuarios.indexes()).some((i) => i.name === INDICE);
  if (existe) {
    console.log(`4. Índice ${INDICE}: ya existe.`);
  } else if (APLICAR) {
    await usuarios.createIndex(
      { 'fcmTokens.token': 1 },
      { name: INDICE, unique: true, partialFilterExpression: { 'fcmTokens.token': { $type: 'string' } } },
    );
    console.log(`4. Índice ${INDICE}: CREADO (único, parcial por $type string).`);
  } else {
    console.log(`4. Índice ${INDICE}: falta; se creará con --aplicar después de migrar y deduplicar.`);
  }

  await mongoose.disconnect();
  console.log(APLICAR ? '\n✅ Migración aplicada.\n' : '\nℹ️  Simulación terminada. Nada cambió.\n');
}

main().catch(async (err) => {
  console.error('❌ Error en la migración:', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
