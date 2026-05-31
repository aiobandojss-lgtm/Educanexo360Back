// Migración: poblar cursoIds en mensajes GRUPAL/INSTITUCIONAL históricos
// Problema: mensajes masivos creados antes del campo cursoIds quedan con cursoIds: []
// Fix: para cada mensaje sin cursoIds, buscar el curso que contiene la mayoría de sus destinatarios

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('ERROR: La variable MONGODB_URI no está definida.');
  process.exit(1);
}

async function migrateCursoIds() {
  await mongoose.connect(mongoUri);
  console.log('✅ Conectado a MongoDB');

  const db = mongoose.connection.db;
  const mensajes = db.collection('mensajes');
  const cursos = db.collection('cursos');

  // Buscar mensajes GRUPAL/INSTITUCIONAL con cursoIds vacío
  const cursor = mensajes.find({
    tipo: { $in: ['GRUPAL', 'INSTITUCIONAL'] },
    cursoIds: { $size: 0 },
    asunto: { $not: /^\[COPIA\]/i },
  });

  let procesados = 0;
  let actualizados = 0;
  let sinCurso = 0;

  while (await cursor.hasNext()) {
    const msg = await cursor.next();
    procesados++;

    if (!msg.destinatarios || msg.destinatarios.length === 0) {
      sinCurso++;
      continue;
    }

    // Buscar el curso que tenga la mayor intersección con los destinatarios
    const curso = await cursos.findOne({
      estudiantes: { $in: msg.destinatarios },
    });

    if (curso) {
      await mensajes.updateOne(
        { _id: msg._id },
        { $set: { cursoIds: [curso._id] } }
      );
      actualizados++;
      console.log(`  ✓ Mensaje "${msg.asunto?.substring(0, 40)}" → curso "${curso.nombre}"`);
    } else {
      sinCurso++;
      console.log(`  ⚠ Mensaje "${msg.asunto?.substring(0, 40)}" — sin curso encontrado`);
    }
  }

  console.log('\n📊 Resumen:');
  console.log(`   Procesados: ${procesados}`);
  console.log(`   Actualizados: ${actualizados}`);
  console.log(`   Sin curso encontrado: ${sinCurso}`);

  await mongoose.disconnect();
  console.log('✅ Migración completada');
}

migrateCursoIds().catch((err) => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
