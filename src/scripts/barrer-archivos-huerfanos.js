/**
 * barrer-archivos-huerfanos.js — Fase 5.5: busca archivos que ya ningún documento referencia.
 *
 *   - GridFS: archivos de los buckets uploads, tareas_referencias, tareas_entregas y anuncios_adjuntos cuyo _id
 *     (fileId) no aparece en ningún documento, y chunks sin archivo (subidas cortadas, auditoría 3.S).
 *   - S3 (si se definen S3_BUCKET y credenciales): objetos '<bucket>/<fileId>' cuya clave no referencia nadie.
 *
 * Referencias (mantener en sincronía con src/utils/referenciasArchivos.ts):
 *   uploads            mensajes.adjuntos (incluye copias a acudientes), eventocalendarios.archivoAdjunto
 *   tareas_referencias tareas.archivosReferencia
 *   tareas_entregas    tareas.entregas.archivos, tareas.entregas.historial.archivos
 *   anuncios_adjuntos  anuncios.archivosAdjuntos
 *
 * Seguridad: por defecto SIMULACIÓN (solo cuenta). Con --aplicar borra. Solo se consideran huérfanos los archivos con
 * más de --min-horas (24 por defecto) para no tocar subidas en curso (también los chunks sin archivo, por la fecha
 * del ObjectId de su files_id). NO lee el .env: MONGODB_URI (y S3_*) explícitas.
 *
 * Uso:
 *   MONGODB_URI="..." node src/scripts/barrer-archivos-huerfanos.js                  (simulación)
 *   MONGODB_URI="..." S3_BUCKET=... S3_ENDPOINT=... S3_REGION=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *     node src/scripts/barrer-archivos-huerfanos.js --aplicar                        (mongodump antes)
 */
'use strict';
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');
const argHoras = process.argv.find((a) => a.startsWith('--min-horas='));
const MIN_HORAS = argHoras ? Number(argHoras.split('=')[1]) : 24;
if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

const REFERENCIAS = {
  uploads: [
    ['mensajes', 'adjuntos'],
    ['eventocalendarios', 'archivoAdjunto'],
  ],
  tareas_referencias: [['tareas', 'archivosReferencia']],
  tareas_entregas: [
    ['tareas', 'entregas.archivos'],
    ['tareas', 'entregas.historial.archivos'], // 5.C9: evidencia de entregas calificadas reemplazadas
  ],
  anuncios_adjuntos: [['anuncios', 'archivosAdjuntos']],
};
const mb = (b) => (b / 1024 / 1024).toFixed(2);

/** fileIds (string) y claves S3 referenciados, por bucket */
async function referencias(db) {
  const porBucket = {};
  for (const [bucket, rutas] of Object.entries(REFERENCIAS)) {
    const ids = new Set();
    const claves = new Set();
    for (const [coleccion, campo] of rutas) {
      const partes = campo.split('.');
      const cursor = db.collection(coleccion).find({}, { projection: { [campo]: 1 } });
      for await (const doc of cursor) {
        // aplanar arreglos anidados (entregas.archivos) y subdocumento único (archivoAdjunto)
        let valores = [doc];
        for (const p of partes) valores = valores.flatMap((v) => (v && v[p] !== undefined ? [].concat(v[p]) : []));
        for (const ref of valores) {
          if (!ref || !ref.fileId) continue;
          ids.add(String(ref.fileId));
          claves.add(ref.clave || `${bucket}/${ref.fileId}`);
        }
      }
    }
    porBucket[bucket] = { ids, claves };
  }
  return porBucket;
}

async function barrerGridFS(db, refs, limite) {
  const total = { archivos: 0, bytes: 0, chunksHuerfanos: 0 };
  for (const bucket of Object.keys(REFERENCIAS)) {
    const b = new GridFSBucket(db, { bucketName: bucket });
    const huerfanos = [];
    for await (const f of db.collection(`${bucket}.files`).find({}, { projection: { _id: 1, length: 1, uploadDate: 1 } })) {
      if (refs[bucket].ids.has(String(f._id))) continue;
      if (f.uploadDate && f.uploadDate > limite) continue;
      huerfanos.push(f);
    }
    // chunks cuyo archivo no existe (subida cortada). 5.C2: GridFS escribe el documento .files AL FINAL, así que una
    // subida en curso también tiene chunks sin archivo; se respeta --min-horas con la fecha del ObjectId de files_id
    // (si files_id no es un ObjectId no hay fecha fiable y no se toca)
    const conArchivo = new Set((await db.collection(`${bucket}.files`).distinct('_id')).map(String));
    const idsChunks = (await db.collection(`${bucket}.chunks`).distinct('files_id')).filter(
      (id) => !conArchivo.has(String(id)) && typeof id?.getTimestamp === 'function' && id.getTimestamp() <= limite,
    );
    const bytes = huerfanos.reduce((t, f) => t + (f.length || 0), 0);
    console.log(`  GridFS ${bucket}: ${huerfanos.length} archivo(s) huérfano(s) (${mb(bytes)} MB); ${idsChunks.length} grupo(s) de chunks sin archivo`);
    if (APLICAR) {
      for (const f of huerfanos) await b.delete(f._id).catch(() => undefined);
      if (idsChunks.length) await db.collection(`${bucket}.chunks`).deleteMany({ files_id: { $in: idsChunks } });
    }
    total.archivos += huerfanos.length;
    total.bytes += bytes;
    total.chunksHuerfanos += idsChunks.length;
  }
  return total;
}

async function barrerS3(refs, limite) {
  if (!process.env.S3_BUCKET) {
    console.log('  S3: sin S3_BUCKET, se omite');
    return { objetos: 0, bytes: 0 };
  }
  const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const cliente = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const total = { objetos: 0, bytes: 0 };
  for (const bucket of Object.keys(REFERENCIAS)) {
    const huerfanos = [];
    let token;
    do {
      const r = await cliente.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: `${bucket}/`, ContinuationToken: token }));
      for (const o of r.Contents || []) {
        if (refs[bucket].claves.has(o.Key)) continue;
        if (o.LastModified && o.LastModified > limite) continue;
        huerfanos.push(o);
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    const bytes = huerfanos.reduce((t, o) => t + (o.Size || 0), 0);
    console.log(`  S3 ${bucket}/: ${huerfanos.length} objeto(s) huérfano(s) (${mb(bytes)} MB)`);
    if (APLICAR) for (const o of huerfanos) await cliente.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: o.Key }));
    total.objetos += huerfanos.length;
    total.bytes += bytes;
  }
  return total;
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log(`\n${APLICAR ? '🔧 APLICANDO (se borran)' : '🔍 SIMULACIÓN (sin cambios; use --aplicar)'} en ${mongoose.connection.name}; antigüedad mínima ${MIN_HORAS} h\n`);
  const limite = new Date(Date.now() - MIN_HORAS * 3600 * 1000);
  const refs = await referencias(db);
  const g = await barrerGridFS(db, refs, limite);
  const s = await barrerS3(refs, limite);
  console.log(`\nTotal: GridFS ${g.archivos} archivo(s) (${mb(g.bytes)} MB) y ${g.chunksHuerfanos} grupo(s) de chunks; S3 ${s.objetos} objeto(s) (${mb(s.bytes)} MB)${APLICAR ? ' — BORRADOS' : ''}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Error:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
