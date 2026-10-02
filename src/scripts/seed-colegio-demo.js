/**
 * seed-colegio-demo.js — Auditoría H6: "Colegio Demo EducaNexo", una escuela AISLADA para pruebas en producción y
 * demostraciones (p. ej. a la Secretaría de Educación).
 *
 * Crea: 1 ADMIN, 1 RECTOR, 2 DOCENTES, 2 cursos con asignaturas, 6 ESTUDIANTES y 4 ACUDIENTES (uno con 2 hijos) y
 * datos de ejemplo (mensajes, anuncios, eventos, tareas con entregas, asistencias de las últimas semanas), con fechas
 * relativas a hoy y periodos académicos del año en curso.
 *
 * Seguridad:
 *   - TODO va acotado a esta escuela (escuelaId). --borrar elimina SOLO esta escuela y sus datos (también sus archivos
 *     en GridFS y en S3), nunca otra: la escuela se identifica por su código y se exige confirmarlo.
 *   - Correos @demo.educanexo.invalid: el dominio .invalid está reservado (RFC 2606) y nunca recibe correo; además
 *     esEmailFicticio los excluye de todo envío. Los datos se escriben directo en la base, sin la cola: no se envían
 *     correos ni push. Los usuarios demo no tienen dispositivos registrados.
 *   - Contraseña SOLO por DEMO_PASSWORD (nunca en el código ni en el repo). No lee el .env.
 *   - Idempotente: si la escuela ya existe, --aplicar no crea nada (use --borrar y luego --aplicar para recrearla).
 *
 * Uso:
 *   MONGODB_URI="..." node src/scripts/seed-colegio-demo.js                                   (simulación)
 *   MONGODB_URI="..." DEMO_PASSWORD="..." node src/scripts/seed-colegio-demo.js --aplicar      (crear)
 *   MONGODB_URI="..." [S3_*] node src/scripts/seed-colegio-demo.js --borrar --confirmar=DEMO-EDUCANEXO
 *
 * Al final informa cuánto ocupan los datos de la escuela (dataSize) y el total de la base (límite de Atlas M0: 512 MB).
 */
'use strict';
require('./_entorno'); // H7: quita espacios sobrantes de las variables de entorno
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { GridFSBucket } = require('mongodb');

const URI = process.env.MONGODB_URI;
const APLICAR = process.argv.includes('--aplicar');
const BORRAR = process.argv.includes('--borrar');
const CODIGO = 'DEMO-EDUCANEXO';
const NOMBRE = 'Colegio Demo EducaNexo';
const DOMINIO = 'demo.educanexo.invalid';
const confirmado = process.argv.includes(`--confirmar=${CODIGO}`);

if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}
if (APLICAR && BORRAR) {
  console.error('❌ --aplicar y --borrar van en corridas separadas.');
  process.exit(1);
}
if (APLICAR && (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 10)) {
  console.error('❌ Defina DEMO_PASSWORD (mínimo 10 caracteres) para --aplicar. Nunca la ponga en el código.');
  process.exit(1);
}
if (BORRAR && !confirmado) {
  console.error(`❌ --borrar elimina la escuela demo y TODOS sus datos. Confirme con --confirmar=${CODIGO}`);
  process.exit(1);
}

const oid = () => new mongoose.Types.ObjectId();
const mb = (b) => (b / 1024 / 1024).toFixed(2);
const DIA = 864e5;

// Colecciones que nunca se recorren al borrar por escuelaId (archivos se borran por sus referencias)
const esColeccionDeArchivos = (n) => n.endsWith('.files') || n.endsWith('.chunks') || n.startsWith('system.');

/** Tamaño (bytes y documentos) de los datos de una escuela en cada colección con escuelaId. */
async function tamañoEscuela(db, escuelaId) {
  const colecciones = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !esColeccionDeArchivos(n));
  let docs = 0;
  let bytes = 0;
  const detalle = [];
  for (const nombre of colecciones) {
    const filtro = nombre === 'escuelas' ? { _id: escuelaId } : { escuelaId };
    const [r] = await db.collection(nombre).aggregate([{ $match: filtro }, { $group: { _id: null, n: { $sum: 1 }, b: { $sum: { $bsonSize: '$$ROOT' } } } }]).toArray();
    if (r && r.n) {
      docs += r.n;
      bytes += r.b;
      detalle.push(`${nombre}: ${r.n}`);
    }
  }
  return { docs, bytes, detalle };
}

/** Referencias de archivo de la escuela, por bucket (mismas rutas que la migración y el barrido de huérfanos). */
async function archivosEscuela(db, escuelaId) {
  const refs = [];
  const tomar = (bucket, lista) => (lista || []).forEach((r) => r && r.fileId && refs.push({ bucket, ...r }));
  for (const m of await db.collection('mensajes').find({ escuelaId }, { projection: { adjuntos: 1 } }).toArray()) tomar('uploads', m.adjuntos);
  for (const e of await db.collection('eventocalendarios').find({ escuelaId }, { projection: { archivoAdjunto: 1 } }).toArray()) tomar('uploads', [e.archivoAdjunto]);
  for (const a of await db.collection('anuncios').find({ escuelaId }, { projection: { archivosAdjuntos: 1 } }).toArray()) tomar('anuncios_adjuntos', a.archivosAdjuntos);
  for (const t of await db.collection('tareas').find({ escuelaId }, { projection: { archivosReferencia: 1, entregas: 1 } }).toArray()) {
    tomar('tareas_referencias', t.archivosReferencia);
    for (const en of t.entregas || []) {
      tomar('tareas_entregas', en.archivos);
      for (const h of en.historial || []) tomar('tareas_entregas', h.archivos);
    }
  }
  return refs;
}

async function borrar(db, escuela) {
  const escuelaId = escuela._id;
  const refs = await archivosEscuela(db, escuelaId);
  const enS3 = refs.filter((r) => r.almacen === 's3' && r.clave);
  const enGridFS = refs.filter((r) => r.almacen !== 's3');
  if (enS3.length && !process.env.S3_BUCKET) {
    console.error(`❌ La escuela demo tiene ${enS3.length} archivo(s) en S3: defina las variables S3_* (las mismas del servidor) para borrarlos también.`);
    process.exit(1);
  }
  // 1) Archivos (antes que los documentos que los referencian)
  for (const r of enGridFS) await new GridFSBucket(db, { bucketName: r.bucket }).delete(new mongoose.Types.ObjectId(String(r.fileId))).catch(() => undefined);
  if (enS3.length) {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      ...(process.env.S3_ENDPOINT && { endpoint: process.env.S3_ENDPOINT }),
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    for (const r of enS3) await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: r.clave }));
  }
  console.log(`  Archivos borrados: ${enGridFS.length} de GridFS, ${enS3.length} de S3`);
  // 2) Todo documento con escuelaId de la demo, en cualquier colección; al final la escuela
  const colecciones = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !esColeccionDeArchivos(n) && n !== 'escuelas');
  for (const nombre of colecciones) {
    const r = await db.collection(nombre).deleteMany({ escuelaId });
    if (r.deletedCount) console.log(`  ${nombre}: ${r.deletedCount} borrado(s)`);
  }
  await db.collection('escuelas').deleteOne({ _id: escuelaId, codigo: CODIGO });
  console.log(`  escuelas: 1 borrada (${NOMBRE})`);
}

/** Datos de la escuela demo (fechas relativas a hoy). */
function construir(hash) {
  const ahora = new Date();
  const año = ahora.getUTCFullYear();
  const escuelaId = oid();
  // Medianoche UTC de hace n días (así se guardan las fechas de asistencia)
  const diaUTC = (n) => new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - n));
  // Instante a las hh:mm hora de Colombia, dentro de n días (convención: docs/convencion-fechas.md)
  const horaColombia = (n, hh, mm = 0) => new Date(diaUTC(-n).getTime() + (hh + 5) * 3600e3 + mm * 60e3);
  const periodos = [1, 2, 3, 4].map((n) => ({
    _id: oid(), numero: n, nombre: `Periodo ${n}`, porcentaje: 25,
    fecha_inicio: new Date(Date.UTC(año, (n - 1) * 3, 1)),
    fecha_fin: new Date(Date.UTC(año, n * 3, 0)),
  }));
  const escuela = {
    _id: escuelaId, codigo: CODIGO, nombre: NOMBRE, direccion: 'Calle Demo 123', telefono: '6010000000',
    email: `colegio@${DOMINIO}`, estado: 'ACTIVO',
    configuracion: { periodos_academicos: 4, escala_calificacion: { minima: 1, maxima: 5 }, logros_por_periodo: 3 },
    periodos_academicos: periodos, createdAt: ahora, updatedAt: ahora,
  };
  const persona = (email, tipo, nombre, apellidos, extra = {}) => ({
    _id: oid(), email: `${email}@${DOMINIO}`, password: hash, nombre, apellidos, tipo, estado: 'ACTIVO', escuelaId,
    permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora, ...extra,
  });
  const admin = persona('admin', 'ADMIN', 'Laura Patricia', 'Gómez Salazar');
  const rector = persona('rector', 'RECTOR', 'Hernán Darío', 'Restrepo Vélez');
  const doc1 = persona('docente1', 'DOCENTE', 'Andrea Carolina', 'Moreno Pinzón');
  const doc2 = persona('docente2', 'DOCENTE', 'Julián Andrés', 'Rojas Cárdenas');
  const est = [
    ['estudiante1', 'Sofía', 'Martínez Ríos'], ['estudiante2', 'Mateo', 'Hernández Gil'], ['estudiante3', 'Valentina', 'López Cruz'],
    ['estudiante4', 'Samuel', 'Ramírez Peña'], ['estudiante5', 'Isabella', 'Castro Núñez'], ['estudiante6', 'Tomás', 'Vargas Ortiz'],
  ].map(([e, n, a], i) => persona(e, 'ESTUDIANTE', n, a, { info_academica: { codigo_estudiante: `DEMO-${String(i + 1).padStart(3, '0')}` } }));
  const acu = [
    persona('acudiente1', 'ACUDIENTE', 'Claudia Marcela', 'Martínez Ríos', { info_academica: { estudiantes_asociados: [est[0]._id, est[3]._id] } }), // 2 hijos, uno en cada curso
    persona('acudiente2', 'ACUDIENTE', 'Jorge Iván', 'Hernández Mesa', { info_academica: { estudiantes_asociados: [est[1]._id] } }),
    persona('acudiente3', 'ACUDIENTE', 'Patricia', 'López Arango', { info_academica: { estudiantes_asociados: [est[2]._id] } }),
    persona('acudiente4', 'ACUDIENTE', 'Ricardo', 'Castro Mejía', { info_academica: { estudiantes_asociados: [est[4]._id] } }),
  ];
  const c1 = { _id: oid(), nombre: 'TERCERO A', nivel: 'PRIMARIA', grado: 'Tercero', grupo: 'A', jornada: 'MATUTINA', año_academico: String(año), escuelaId, director_grupo: doc1._id, estudiantes: est.slice(0, 3).map((e) => e._id), estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora };
  const c2 = { _id: oid(), nombre: 'QUINTO A', nivel: 'PRIMARIA', grado: 'Quinto', grupo: 'A', jornada: 'MATUTINA', año_academico: String(año), escuelaId, director_grupo: doc2._id, estudiantes: est.slice(3).map((e) => e._id), estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora };
  const asig = (nombre, curso, docente) => ({ _id: oid(), nombre, descripcion: `${nombre} - ${curso.grado} ${año}`, cursoId: curso._id, docenteId: docente._id, escuelaId, intensidad_horaria: 4, estado: 'ACTIVO', periodos: periodos.map(({ _id, ...p }) => p), createdAt: ahora, updatedAt: ahora });
  const asignaturas = [asig('Matemáticas', c1, doc1), asig('Español', c1, doc2), asig('Matemáticas', c2, doc1), asig('Ciencias Naturales', c2, doc2)];
  const [mat3, esp3, mat5, cie5] = asignaturas;

  const mensaje = (remitente, destinatarios, asunto, contenido, diasAtras) => ({
    _id: oid(), remitente: remitente._id, destinatarios: destinatarios.map((d) => d._id), destinatariosCc: [], asunto, contenido,
    tipo: destinatarios.length > 1 ? 'GRUPAL' : 'INDIVIDUAL', estado: 'ENVIADO', prioridad: 'NORMAL', escuelaId, adjuntos: [],
    lecturas: [], estadosUsuarios: [], createdAt: new Date(ahora.getTime() - diasAtras * DIA), updatedAt: new Date(ahora.getTime() - diasAtras * DIA),
  });
  const mensajes = [
    mensaje(admin, [doc1, doc2], 'Bienvenidos al Colegio Demo', '<p>Este es un colegio de demostración de EducaNexo360. Los datos son ficticios.</p>', 6),
    mensaje(doc1, acu.slice(0, 3), 'Salida pedagógica de Tercero A', '<p>Les recordamos que el viernes tenemos salida pedagógica al museo. Enviar la autorización firmada.</p>', 3),
    mensaje(acu[0], [doc1], 'Re: Salida pedagógica de Tercero A', '<p>Gracias, profesora. Sofía lleva la autorización mañana.</p>', 2),
    mensaje(rector, [admin, doc1, doc2], 'Reunión de docentes', '<p>Reunión de docentes el próximo martes a las 2:00 p. m. en la sala de profesores.</p>', 1),
  ];
  const anuncio = (titulo, contenido, diasAtras, destacado = false) => ({
    _id: oid(), titulo, contenido, creador: admin._id, escuelaId, fechaPublicacion: new Date(ahora.getTime() - diasAtras * DIA),
    estaPublicado: true, paraEstudiantes: true, paraDocentes: true, paraPadres: true, destacado, archivosAdjuntos: [], lecturas: [],
    createdAt: new Date(ahora.getTime() - diasAtras * DIA), updatedAt: ahora,
  });
  const anuncios = [
    anuncio('Bienvenidos al Colegio Demo EducaNexo', 'Este colegio es de demostración: todos los nombres y datos son ficticios.', 7, true),
    anuncio('Entrega de boletines', 'La entrega de boletines del periodo será el próximo viernes de 7:00 a. m. a 12:00 m.', 2),
  ];
  const evento = (titulo, descripcion, fechaInicio, fechaFin, todoElDia, tipo) => ({
    _id: oid(), titulo, descripcion, fechaInicio, fechaFin, todoElDia, lugar: 'Colegio Demo', tipo, estado: 'ACTIVO', creadorId: admin._id,
    escuelaId, invitados: [], recordatorios: [], createdAt: ahora, updatedAt: ahora,
  });
  const eventos = [
    // Todo el día según la convención: 00:00 a 23:59 de Colombia expresado en UTC
    evento('Jornada pedagógica (sin clases)', 'Jornada de planeación institucional.', horaColombia(5, 0), horaColombia(5, 23, 59), true, 'INSTITUCIONAL'),
    evento('Reunión de padres de familia', 'Socialización de resultados del periodo.', horaColombia(8, 18), horaColombia(8, 20), false, 'INSTITUCIONAL'),
    evento('Feria de ciencias', 'Exposición de proyectos de Quinto A.', horaColombia(12, 8), horaColombia(12, 12), false, 'ACADEMICO'),
  ];
  const entrega = (e, estado, extra = {}) => ({ _id: oid(), estudianteId: e._id, estado, archivos: [], intentos: estado === 'PENDIENTE' ? 0 : 1, ...extra });
  const tarea = (titulo, descripcion, asignatura, curso, docente, fechaLimite, entregas) => ({
    _id: oid(), titulo, descripcion, docenteId: docente._id, asignaturaId: asignatura._id, cursoId: curso._id, estudiantesIds: curso.estudiantes,
    fechaLimite, tipo: 'INDIVIDUAL', prioridad: 'MEDIA', permiteTardias: true, calificacionMaxima: 5, archivosReferencia: [], vistas: [],
    entregas, estado: 'ACTIVA', escuelaId, createdAt: ahora, updatedAt: ahora,
  });
  const tareas = [
    tarea('Taller de fracciones', 'Resolver los ejercicios 1 a 10 de la guía.', mat3, c1, doc1, horaColombia(4, 23, 59), [
      entrega(est[0], 'CALIFICADA', { fechaEntrega: new Date(ahora.getTime() - DIA), calificacion: 4.5, comentarioDocente: 'Muy buen trabajo.', fechaCalificacion: ahora }),
      entrega(est[1], 'ENTREGADA', { fechaEntrega: new Date(ahora.getTime() - DIA / 2) }),
      entrega(est[2], 'PENDIENTE'),
    ]),
    tarea('Lectura: El principito', 'Leer los capítulos 1 a 3 y escribir un resumen.', esp3, c1, doc2, horaColombia(7, 23, 59), est.slice(0, 3).map((e) => entrega(e, 'PENDIENTE'))),
    tarea('El ciclo del agua', 'Elaborar una maqueta del ciclo del agua.', cie5, c2, doc2, horaColombia(6, 23, 59), [
      entrega(est[3], 'ENTREGADA', { fechaEntrega: new Date(ahora.getTime() - DIA) }),
      entrega(est[4], 'PENDIENTE'),
      entrega(est[5], 'PENDIENTE'),
    ]),
    tarea('Problemas de multiplicación', 'Resolver los problemas de la página 45.', mat5, c2, doc1, horaColombia(3, 23, 59), est.slice(3).map((e) => entrega(e, 'PENDIENTE'))),
  ];
  // Asistencias finalizadas de los últimos 10 días hábiles: casi todos presentes, alguna ausencia o tardanza
  const asistencias = [];
  for (let n = 1, habiles = 0; habiles < 10; n++) {
    const fecha = diaUTC(n);
    const dia = fecha.getUTCDay();
    if (dia === 0 || dia === 6) continue;
    habiles++;
    for (const [curso, asignatura, docente] of [[c1, mat3, doc1], [c2, mat5, doc1]]) {
      asistencias.push({
        _id: oid(), fecha, cursoId: curso._id, asignaturaId: asignatura._id, docenteId: docente._id, escuelaId, tipoSesion: 'CLASE',
        horaInicio: '07:00', horaFin: '08:00', finalizado: true,
        estudiantes: curso.estudiantes.map((e, i) => ({ estudianteId: e, estado: (habiles + i) % 9 === 0 ? 'AUSENTE' : (habiles + i) % 7 === 0 ? 'TARDANZA' : 'PRESENTE' })),
        createdAt: ahora, updatedAt: ahora,
      });
    }
  }
  return {
    escuela, cursos: [c1, c2], asignaturas,
    usuarios: [admin, rector, doc1, doc2, ...est, ...acu],
    mensajes, anuncios, eventos, tareas, asistencias,
    cuentas: { admin: admin.email, rector: rector.email, docentes: [doc1.email, doc2.email], estudiantes: est.map((e) => e.email), acudientes: acu.map((a) => a.email) },
  };
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const modo = APLICAR ? '🔧 CREANDO' : BORRAR ? '🗑️  BORRANDO' : '🔍 SIMULACIÓN (sin cambios; use --aplicar o --borrar)';
  console.log(`\n${modo} — ${NOMBRE} (${CODIGO}) en la base ${mongoose.connection.name}\n`);
  const existente = await db.collection('escuelas').findOne({ codigo: CODIGO });
  const antes = await db.stats();

  if (BORRAR) {
    if (!existente) console.log('  La escuela demo no existe: nada que borrar.');
    else {
      if (existente.nombre !== NOMBRE) {
        console.error(`❌ La escuela con código ${CODIGO} se llama "${existente.nombre}", no "${NOMBRE}": no se borra nada.`);
        process.exit(1);
      }
      await borrar(db, existente);
    }
  } else if (existente) {
    const t = await tamañoEscuela(db, existente._id);
    console.log(`  La escuela demo YA existe (${t.docs} documentos, ${mb(t.bytes)} MB): ${APLICAR ? 'no se crea nada (idempotente).' : ''}`);
    console.log(`  ${t.detalle.join(', ')}`);
  } else {
    const datos = construir(APLICAR ? await bcrypt.hash(process.env.DEMO_PASSWORD, 10) : 'simulacion');
    const resumen = `  ${datos.usuarios.length} usuarios (1 ADMIN, 1 RECTOR, 2 DOCENTES, 6 ESTUDIANTES, 4 ACUDIENTES), ${datos.cursos.length} cursos, ${datos.asignaturas.length} asignaturas, ` +
      `${datos.mensajes.length} mensajes, ${datos.anuncios.length} anuncios, ${datos.eventos.length} eventos, ${datos.tareas.length} tareas, ${datos.asistencias.length} asistencias`;
    if (!APLICAR) console.log(`  Se crearía:\n${resumen}`);
    else {
      await db.collection('escuelas').insertOne(datos.escuela);
      await db.collection('usuarios').insertMany(datos.usuarios);
      await db.collection('cursos').insertMany(datos.cursos);
      await db.collection('asignaturas').insertMany(datos.asignaturas);
      await db.collection('mensajes').insertMany(datos.mensajes);
      await db.collection('anuncios').insertMany(datos.anuncios);
      await db.collection('eventocalendarios').insertMany(datos.eventos);
      await db.collection('tareas').insertMany(datos.tareas);
      await db.collection('asistencias').insertMany(datos.asistencias);
      console.log(`  Creado:\n${resumen}`);
      console.log(`\n  Cuentas (contraseña: la de DEMO_PASSWORD):\n    ADMIN ${datos.cuentas.admin} · RECTOR ${datos.cuentas.rector}\n    DOCENTES ${datos.cuentas.docentes.join(', ')}\n    ACUDIENTES ${datos.cuentas.acudientes.join(', ')} (acudiente1 tiene 2 hijos)\n    ESTUDIANTES ${datos.cuentas.estudiantes.join(', ')}`);
      const t = await tamañoEscuela(db, datos.escuela._id);
      console.log(`\n  Tamaño de la escuela demo: ${t.docs} documentos, ${mb(t.bytes)} MB`);
    }
  }
  const despues = await db.stats();
  console.log(`\n  Base completa: dataSize ${mb(antes.dataSize)} → ${mb(despues.dataSize)} MB; storageSize ${mb(despues.storageSize)} MB (límite de Atlas M0: 512 MB)`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Error:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
