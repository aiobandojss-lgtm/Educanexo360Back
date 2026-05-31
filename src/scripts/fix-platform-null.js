// Migración: eliminar platform: null de usuarios existentes
// Causa: el campo platform tiene enum ['ios', 'android'] pero se guardó null como default
// Fix: $unset platform en todos los documentos donde platform === null
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error('ERROR: La variable MONGODB_URI no está definida.');
  process.exit(1);
}

async function fixPlatformNull() {
  try {
    console.log('Conectando a MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Conexión establecida');

    const db = mongoose.connection.db;
    const usuarios = db.collection('usuarios');

    // Contar afectados antes
    const count = await usuarios.countDocuments({ platform: null });
    console.log(`\n📊 Usuarios con platform: null → ${count}`);

    if (count === 0) {
      console.log('✅ No hay documentos que corregir.');
      return;
    }

    // Eliminar el campo platform de los documentos con null
    const result = await usuarios.updateMany(
      { platform: null },
      { $unset: { platform: '' } },
    );

    console.log(`✅ Documentos corregidos: ${result.modifiedCount}`);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('Conexión cerrada.');
    }
  }
}

fixPlatformNull()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
