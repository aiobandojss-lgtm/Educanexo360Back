/**
 * migrar-archivos-s3.js — Fase 5.3: copia los archivos de GridFS a S3 (Backblaze B2, R2 o AWS) y actualiza las
 * referencias de los documentos. Reanudable e idempotente.
 *
 * Modos (NO lee el .env: MONGODB_URI y S3_* van explícitas):
 *   (sin flags)      SIMULACIÓN: archivos y MB por bucket, ya migrados, pendientes y sin referencia. No cambia nada.
 *   --aplicar        copia por lotes (--lote=N, 20 por defecto). Por cada archivo pendiente:
 *                      1. si en S3 ya existe '<bucket>/<fileId>' con el mismo tamaño y sha256 → no lo vuelve a subir
 *                         (reanudar tras un corte); mismo tamaño con otro sha256 → lo vuelve a subir;
 *                      2. si no, lo sube en stream calculando sha256;
 *                      3. VERIFICA descargándolo de S3: tamaño y sha256 (y md5 si GridFS lo guardó) iguales al origen;
 *                      4. solo entonces actualiza TODAS las referencias a ese fileId (mensajes y sus copias a
 *                         acudientes, eventos, tareas y sus entregas, anuncios): { almacen:'s3', clave, sha256 }.
 *                    Un fallo en un archivo se registra y se sigue con el resto (sus referencias no cambian).
 *   --borrar-gridfs  (corrida APARTE, después de verificar la migración) borra de GridFS los archivos cuyas
 *                    referencias están TODAS en S3 y cuyo objeto existe en S3 con el mismo tamaño. Hacer mongodump antes.
 *                    Se niega si hay trabajos 'copias-acudientes' PENDIENTE/PROCESANDO (llevan referencias viejas).
 *                    Referencias viejas que queden (p. ej. copias reintentadas) se leen de S3 por la misma clave: el
 *                    servidor, con S3_* configuradas, busca en S3 '<bucket>/<fileId>' si ya no está en GridFS.
 *
 * Buckets y referencias (mantener en sincronía con src/utils/referenciasArchivos.ts):
 *   uploads            mensajes.adjuntos, eventocalendarios.archivoAdjunto
 *   tareas_referencias tareas.archivosReferencia
 *   tareas_entregas    tareas.entregas[].archivos, tareas.entregas[].historial[].archivos
 *   anuncios_adjuntos  anuncios.archivosAdjuntos
 *
 * Espacio en Atlas M0: tras --borrar-gridfs, dataSize (tamaño lógico) baja de inmediato; storageSize (disco) puede no
 * bajar enseguida porque WiredTiger reutiliza el espacio liberado, y M0 no permite compact. Revisar la consola de Atlas.
 *
 * Uso:
 *   MONGODB_URI="..." S3_ENDPOINT=... S3_REGION=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *     node src/scripts/migrar-archivos-s3.js                 (simulación)
 *     node src/scripts/migrar-archivos-s3.js --aplicar --bucket=<S3_BUCKET>       (copiar y actualizar referencias)
 *     node src/scripts/migrar-archivos-s3.js --borrar-gridfs --bucket=<S3_BUCKET> (liberar GridFS, con mongodump previo)
 *   --bucket=<nombre> es obligatorio en --aplicar y --borrar-gridfs y debe ser igual a S3_BUCKET (confirmación).
 *   --aplicar primero prueba las credenciales (escribe, lee y borra un objeto '_prueba-migracion/...'); si falla, no
 *   copia nada. El servidor debe quedar con las MISMAS variables S3_* que la corrida.
 */
'use strict';
const crypto = require('crypto');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');
const BORRAR = process.argv.includes('--borrar-gridfs');
const argLote = process.argv.find((a) => a.startsWith('--lote='));
const LOTE = argLote ? Math.max(1, Number(argLote.split('=')[1])) : 20;

if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}
if (APLICAR && BORRAR) {
  console.error('❌ --aplicar y --borrar-gridfs van en corridas separadas: primero migre y verifique, después libere GridFS.');
  process.exit(1);
}
for (const v of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
  if (!process.env[v]) {
    console.error(`❌ Falta la variable ${v}.`);
    process.exit(1);
  }
}
// Auditoría 5.C4: en los modos que escriben se confirma el bucket a mano (evita migrar a un bucket equivocado por
// una variable vieja en la terminal: las referencias quedarían apuntando a un bucket que el servidor no usa)
const argBucket = process.argv.find((a) => a.startsWith('--bucket='));
if ((APLICAR || BORRAR) && (!argBucket || argBucket.slice('--bucket='.length) !== process.env.S3_BUCKET)) {
  console.error(`❌ Confirme el bucket destino con --bucket=<nombre>, igual a S3_BUCKET ('${process.env.S3_BUCKET}').`);
  process.exit(1);
}
const AVISO_SERVIDOR =
  'ℹ️  El servidor debe tener EXACTAMENTE las mismas S3_ENDPOINT, S3_REGION, S3_BUCKET y credenciales que esta corrida: ' +
  'las referencias migradas apuntan a este bucket.';

// [colección, ruta del arreglo o subdocumento, cómo se escribe cada campo, arrayFilters para un fileId]
const soloArchivo = (id) => [{ 'a.fileId': id }];
const REFERENCIAS = {
  uploads: [
    { col: 'mensajes', filtro: 'adjuntos.fileId', set: (c) => `adjuntos.$[a].${c}`, arrayFilters: soloArchivo },
    { col: 'eventocalendarios', filtro: 'archivoAdjunto.fileId', set: (c) => `archivoAdjunto.${c}`, arrayFilters: null },
  ],
  tareas_referencias: [{ col: 'tareas', filtro: 'archivosReferencia.fileId', set: (c) => `archivosReferencia.$[a].${c}`, arrayFilters: soloArchivo }],
  // Auditoría 5.C7: $[e] con filtro (no $[]): con $[] una entrega vieja sin 'archivos' hacía fallar el update de toda la tarea
  tareas_entregas: [
    {
      col: 'tareas',
      filtro: 'entregas.archivos.fileId',
      set: (c) => `entregas.$[e].archivos.$[a].${c}`,
      arrayFilters: (id) => [{ 'e.archivos.fileId': id }, { 'a.fileId': id }],
    },
    // 5.C9: evidencia de entregas calificadas que el estudiante reemplazó
    {
      col: 'tareas',
      filtro: 'entregas.historial.archivos.fileId',
      set: (c) => `entregas.$[e].historial.$[h].archivos.$[a].${c}`,
      arrayFilters: (id) => [{ 'e.historial.archivos.fileId': id }, { 'h.archivos.fileId': id }, { 'a.fileId': id }],
    },
  ],
  anuncios_adjuntos: [{ col: 'anuncios', filtro: 'archivosAdjuntos.fileId', set: (c) => `archivosAdjuntos.$[a].${c}`, arrayFilters: soloArchivo }],
};
const mb = (b) => (b / 1024 / 1024).toFixed(2);

const clienteS3 = () => {
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
};

/** Estado de las referencias de un fileId: cuántas hay y cuántas ya apuntan a S3 con su clave */
async function estadoReferencias(db, bucket, fileId, clave) {
  let total = 0;
  let enS3 = 0;
  for (const r of REFERENCIAS[bucket]) {
    const docs = await db.collection(r.col).find({ [r.filtro]: fileId }).toArray();
    for (const d of docs) {
      const campos = r.filtro.split('.').slice(0, -1);
      let refs = [d];
      for (const p of campos) refs = refs.flatMap((x) => (x && x[p] !== undefined ? [].concat(x[p]) : []));
      for (const ref of refs.filter((x) => x && String(x.fileId) === String(fileId))) {
        total++;
        if (ref.almacen === 's3' && ref.clave === clave) enS3++;
      }
    }
  }
  return { total, enS3 };
}

async function cabecera(s3, clave) {
  const { HeadObjectCommand } = require('@aws-sdk/client-s3');
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave }));
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound') return null;
    throw e;
  }
}

async function hashDeS3(s3, clave) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave }));
  const sha = crypto.createHash('sha256');
  const md5 = crypto.createHash('md5');
  let n = 0;
  for await (const t of r.Body) {
    sha.update(t);
    md5.update(t);
    n += t.length;
  }
  return { sha256: sha.digest('hex'), md5: md5.digest('hex'), tamaño: n };
}

async function subir(s3, gfs, f, clave) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { PassThrough } = require('stream');
  const sha = crypto.createHash('sha256');
  const origen = gfs.openDownloadStream(f._id);
  const cuerpo = new PassThrough();
  // Si el origen falla a mitad, se aborta el PutObject (si no, esperaría para siempre el resto del cuerpo)
  const control = new AbortController();
  origen.on('data', (t) => sha.update(t));
  origen.on('error', (e) => {
    cuerpo.destroy(e);
    control.abort();
  });
  origen.pipe(cuerpo);
  const meta = f.metadata || {};
  const tipo = meta.contentType || f.contentType || 'application/octet-stream';
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: clave,
      Body: cuerpo,
      ContentLength: f.length,
      ContentType: tipo,
      Metadata: { nombre: encodeURIComponent(meta.originalName || f.filename || ''), migradodegridfs: 'si' },
    }),
    { abortSignal: control.signal },
  );
  return sha.digest('hex');
}

/**
 * Auditoría 5.C4: antes de copiar nada se prueba que las credenciales pueden escribir, leer y borrar en el bucket
 * (un objeto de prueba que se elimina al final). Falla → no se migra.
 */
async function probarCredenciales(s3) {
  const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const clave = `_prueba-migracion/${crypto.randomBytes(8).toString('hex')}`;
  const cuerpo = Buffer.from('prueba de credenciales');
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave, Body: cuerpo, ContentLength: cuerpo.length }));
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave }));
    const partes = [];
    for await (const t of r.Body) partes.push(t);
    if (!Buffer.concat(partes).equals(cuerpo)) throw new Error('el objeto de prueba se leyó distinto');
  } finally {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: clave }));
  }
}

async function actualizarReferencias(db, bucket, fileId, clave, sha256) {
  let n = 0;
  for (const r of REFERENCIAS[bucket]) {
    const set = { [r.set('almacen')]: 's3', [r.set('clave')]: clave, [r.set('sha256')]: sha256 };
    const res = await db.collection(r.col).updateMany({ [r.filtro]: fileId }, { $set: set }, r.arrayFilters ? { arrayFilters: r.arrayFilters(fileId) } : {});
    n += res.modifiedCount;
  }
  return n;
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  if (BORRAR) {
    // Auditoría 5.C3: esos trabajos guardan una copia de los adjuntos con la referencia VIEJA (GridFS); si se procesan
    // después de borrar GridFS, la copia al acudiente apuntaría a un archivo inexistente. Se espera a que terminen.
    const copias = (estados) => db.collection('outbox').countDocuments({ tipo: 'copias-acudientes', estado: { $in: estados } });
    const enCurso = await copias(['PENDIENTE', 'PROCESANDO']);
    if (enCurso > 0) {
      console.error(`❌ Hay ${enCurso} trabajo(s) 'copias-acudientes' PENDIENTE/PROCESANDO en la cola: sus copias usarán las referencias viejas de GridFS. Espere a que terminen y vuelva a correr --borrar-gridfs.`);
      await mongoose.disconnect();
      process.exit(1);
    }
    const fallidos = await copias(['FALLIDO']);
    if (fallidos > 0) console.log(`⚠️  ${fallidos} trabajo(s) 'copias-acudientes' FALLIDO: si se reintentan, sus adjuntos se leerán de S3 por la misma clave (respaldo de lectura del servidor).`);
  }
  const modo = APLICAR ? '🔧 MIGRANDO (copiar + verificar + actualizar referencias)' : BORRAR ? '🗑️  LIBERANDO GridFS (solo lo ya migrado)' : '🔍 SIMULACIÓN (sin cambios)';
  console.log(`\n${modo} en ${mongoose.connection.name} → bucket S3 '${process.env.S3_BUCKET}'\n`);
  const antes = await db.stats();
  const s3 = clienteS3();
  if (APLICAR) {
    try {
      await probarCredenciales(s3);
      console.log('✅ Credenciales S3: escritura, lectura y borrado en el bucket OK');
    } catch (e) {
      // el mensaje del SDK no incluye el secreto
      console.error(`❌ Prueba de credenciales S3 fallida (no se copió nada): ${String(e?.name || '')} ${String(e?.message || e).slice(0, 200)}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(AVISO_SERVIDOR + '\n');
  }
  const rep = { archivos: 0, bytes: 0, yaMigrados: 0, pendientes: 0, sinReferencia: 0, copiados: 0, yaEnS3: 0, bytesCopiados: 0, fallidos: [], borrados: 0, bytesLiberados: 0, refsActualizadas: 0 };

  for (const bucket of Object.keys(REFERENCIAS)) {
    const gfs = new GridFSBucket(db, { bucketName: bucket });
    const archivos = await db.collection(`${bucket}.files`).find({}).sort({ _id: 1 }).toArray();
    let b = { n: 0, bytes: 0, migrados: 0, pendientes: 0, sinRef: 0 };
    for (let i = 0; i < archivos.length; i += LOTE) {
      for (const f of archivos.slice(i, i + LOTE)) {
        const clave = `${bucket}/${f._id}`;
        b.n++;
        b.bytes += f.length || 0;
        const est = await estadoReferencias(db, bucket, f._id, clave);
        if (est.total === 0) {
          b.sinRef++;
          continue; // huérfano de GridFS: no se migra (ver barrer-archivos-huerfanos.js)
        }
        const migrado = est.enS3 === est.total;
        if (migrado) b.migrados++;
        else b.pendientes++;

        if (BORRAR) {
          if (!migrado) continue;
          const h = await cabecera(s3, clave);
          if (!h || Number(h.ContentLength) !== Number(f.length)) {
            rep.fallidos.push(`${clave}: no se borra de GridFS (en S3 falta o el tamaño no coincide)`);
            continue;
          }
          await gfs.delete(f._id);
          rep.borrados++;
          rep.bytesLiberados += f.length || 0;
          continue;
        }
        if (!APLICAR || migrado) continue;

        try {
          // Origen: sha256 (y md5) de GridFS
          const shaO = crypto.createHash('sha256');
          const md5O = crypto.createHash('md5');
          let leidos = 0;
          for await (const t of gfs.openDownloadStream(f._id)) {
            shaO.update(t);
            md5O.update(t);
            leidos += t.length;
          }
          const origen = { sha256: shaO.digest('hex'), md5: md5O.digest('hex') };
          // GridFS con chunks faltantes puede leerse "vacío" sin error: se exige el tamaño exacto antes de subir
          if (leidos !== Number(f.length)) throw new Error(`contenido incompleto en GridFS (${leidos} de ${f.length} bytes; faltan chunks)`);
          if (f.md5 && f.md5 !== origen.md5) throw new Error('el md5 guardado en GridFS no coincide con su contenido');

          const h = await cabecera(s3, clave);
          let destino = null;
          if (h && Number(h.ContentLength) === Number(f.length)) {
            // corte anterior: si el contenido coincide no se vuelve a subir. Auditoría 5.C7: mismo tamaño con otro
            // contenido (subida anterior corrupta o escritura ajena) → se sube de nuevo en vez de fallar para siempre
            destino = await hashDeS3(s3, clave);
            if (destino.sha256 === origen.sha256) rep.yaEnS3++;
            else destino = null;
          }
          if (!destino) {
            await subir(s3, gfs, f, clave);
            rep.copiados++;
            rep.bytesCopiados += f.length || 0;
            destino = await hashDeS3(s3, clave);
          }
          if (destino.tamaño !== Number(f.length) || destino.sha256 !== origen.sha256) {
            throw new Error(`verificación fallida (tamaño ${destino.tamaño}/${f.length}, sha256 distinto=${destino.sha256 !== origen.sha256})`);
          }
          rep.refsActualizadas += await actualizarReferencias(db, bucket, f._id, clave, origen.sha256);
          b.migrados++;
          b.pendientes--;
        } catch (e) {
          rep.fallidos.push(`${clave}: ${String(e?.message || e).slice(0, 200)}`);
        }
      }
    }
    console.log(`  ${bucket}: ${b.n} archivo(s), ${mb(b.bytes)} MB — migrados ${b.migrados}, pendientes ${b.pendientes}, sin referencia ${b.sinRef}`);
    rep.archivos += b.n;
    rep.bytes += b.bytes;
    rep.yaMigrados += b.migrados;
    rep.pendientes += b.pendientes;
    rep.sinReferencia += b.sinRef;
  }

  const despues = await db.stats();
  console.log(`\nTotal GridFS: ${rep.archivos} archivo(s), ${mb(rep.bytes)} MB; migrados ${rep.yaMigrados}; pendientes ${rep.pendientes}; sin referencia ${rep.sinReferencia}`);
  if (APLICAR) console.log(`Copiados ${rep.copiados} (${mb(rep.bytesCopiados)} MB); ya estaban en S3 ${rep.yaEnS3}; referencias actualizadas ${rep.refsActualizadas}`);
  if (APLICAR || BORRAR) console.log(AVISO_SERVIDOR);
  if (BORRAR) console.log(`Borrados de GridFS ${rep.borrados} (${mb(rep.bytesLiberados)} MB liberados)`);
  console.log(`Fallidos: ${rep.fallidos.length}`);
  rep.fallidos.slice(0, 20).forEach((f) => console.log(`  - ${f}`));
  console.log(`Base: dataSize ${mb(antes.dataSize)} → ${mb(despues.dataSize)} MB; storageSize ${mb(antes.storageSize)} → ${mb(despues.storageSize)} MB`);
  await mongoose.disconnect();
  if (rep.fallidos.length) process.exitCode = 2;
}

main().catch(async (error) => {
  console.error('❌ Error:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
