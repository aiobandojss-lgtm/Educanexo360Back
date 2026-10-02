/**
 * bench-endpoints.js — Mide tiempos de endpoints clave contra un servidor LOCAL sembrado con
 * seed-escala.js (Fase 3; reutilizable en la prueba de carga de la Fase 6).
 *
 * Además activa el profiler de la base LOCAL para contar documentos examinados por endpoint
 * (equivalente a explain(): muestra si la consulta usa índice o recorre la colección).
 *
 * Uso:
 *   BENCH_URL=http://localhost:3999/api MONGODB_URI=mongodb://127.0.0.1:27017/educanexo360_escala \
 *   SEED_PASSWORD=<clave> node src/scripts/bench-endpoints.js [etiqueta]
 *
 * ⚠️ Solo contra bases locales (MONGODB_URI localhost). No lee el .env.
 */
'use strict';
require('./_entorno'); // H7: quita espacios sobrantes de las variables de entorno
const mongoose = require('mongoose');

const BASE = process.env.BENCH_URL || 'http://localhost:3999/api';
const URI = process.env.MONGODB_URI;
const PASSWORD = process.env.SEED_PASSWORD;
const REPETICIONES = parseInt(process.env.BENCH_REPETICIONES || '5', 10);
const ETIQUETA = process.argv[2] || 'medicion';

if (!URI || !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(URI) || !PASSWORD) {
  console.error('❌ Defina MONGODB_URI local (mongodb://127.0.0.1:27017/<base>) y SEED_PASSWORD.');
  process.exit(1);
}

let ipSeq = 1;
const ip = () => `10.77.${Math.floor(ipSeq / 250) % 250}.${(ipSeq++ % 250) + 1}`;

async function llamar(method, ruta, token, body) {
  const headers = { 'X-Forwarded-For': ip() };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const sep = ruta.includes('?') ? '&' : '?';
  // _nc evita que la caché de respuestas GET contamine la medición
  const url = BASE + ruta + (method === 'GET' ? `${sep}_nc=${Math.random().toString(36).slice(2)}` : '');
  const t = process.hrtime.bigint();
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no JSON */ }
  return { status: r.status, ms, bytes: texto.length, json };
}

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

(async () => {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const U = (email) => db.collection('usuarios').findOne({ email });

  const login = async (email) => (await llamar('POST', '/auth/login', null, { email, password: PASSWORD })).json?.data?.tokens?.access?.token;
  const T = {
    admin: await login('admin@escala.test'),
    docente1: await login('docente1@escala.test'),
    estudiante1: await login('estudiante1@escala.test'),
    acudiente1: await login('acudiente1@escala.test'),
  };
  if (Object.values(T).some((t) => !t)) throw new Error('No se pudo iniciar sesión con los usuarios del seed');

  const estudiante1 = await U('estudiante1@escala.test');
  const docente1 = await U('docente1@escala.test');
  const curso1 = await db.collection('cursos').findOne({ director_grupo: docente1._id });
  const masivo = await db.collection('mensajes').findOne({ asunto: /todo el colegio/ });
  const tarea = await db.collection('tareas').findOne({ docenteId: docente1._id });
  const hoy = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const inicioMes = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const inicioAño = iso(new Date(hoy.getFullYear(), 0, 1));

  const casos = [
    ['Bandeja recibidos (acudiente)', 'GET', '/mensajes?bandeja=recibidos&pagina=1&limite=20', T.acudiente1],
    ['Bandeja recibidos (docente)', 'GET', '/mensajes?bandeja=recibidos&pagina=1&limite=20', T.docente1],
    ['Bandeja enviados (admin, masivos)', 'GET', '/mensajes?bandeja=enviados&pagina=1&limite=20', T.admin],
    ['Detalle mensaje masivo (acudiente)', 'GET', `/mensajes/${masivo._id}`, T.acudiente1],
    ['GET /cursos (admin)', 'GET', '/cursos', T.admin],
    ['GET /usuarios (admin, sin filtros)', 'GET', '/usuarios', T.admin],
    ['GET /usuarios?tipo=ESTUDIANTE (admin)', 'GET', '/usuarios?tipo=ESTUDIANTE', T.admin],
    ['/asistencia/resumen mes (admin)', 'GET', `/asistencia/resumen?fechaInicio=${inicioMes}&fechaFin=${iso(hoy)}`, T.admin],
    ['/asistencia/resumen mes (docente)', 'GET', `/asistencia/resumen?fechaInicio=${inicioMes}&fechaFin=${iso(hoy)}`, T.docente1],
    ['/asistencia/resumen sin fechas (admin)', 'GET', '/asistencia/resumen', T.admin],
    ['/asistencia/resumen hijo (acudiente)', 'GET', `/asistencia/resumen?estudianteId=${estudiante1._id}&fechaInicio=${inicioMes}&fechaFin=${iso(hoy)}`, T.acudiente1],
    ['Informe riesgo año (admin)', 'GET', `/asistencia/informes/riesgo?desde=${inicioAño}&hasta=${iso(hoy)}`, T.admin],
    ['Boletín periodo 1 (acudiente)', 'GET', `/boletin/periodo?estudianteId=${estudiante1._id}&periodo=1&año_academico=${hoy.getFullYear()}`, T.acudiente1],
    ['Mis tareas (estudiante)', 'GET', '/tareas/especial/mis-tareas', T.estudiante1],
    ['Detalle tarea (docente)', 'GET', `/tareas/${tarea._id}`, T.docente1],
  ];

  // BENCH_OMITIR="sin fechas,otro" omite casos cuyo nombre contenga esos textos
  // (p. ej. un endpoint que tumba el proceso antes de optimizar)
  const omitir = (process.env.BENCH_OMITIR || '').split(',').map((s) => s.trim()).filter(Boolean);
  const resultados = [];
  for (const [nombre, method, ruta, token] of casos) {
    if (omitir.some((o) => nombre.includes(o))) {
      resultados.push({ endpoint: nombre, status: 'OMITIDO', ms_mediana: '-', kb: '-', consultas: '-', docsExaminados: '-' });
      continue;
    }
    await db.command({ profile: 0 });
    await db.collection('system.profile').drop().catch(() => {});
    await db.command({ profile: 2 });
    const primera = await llamar(method, ruta, token);
    await db.command({ profile: 0 });
    const perfil = await db.collection('system.profile').find({}).toArray();
    const docsExaminados = perfil.reduce((s, p) => s + (p.docsExamined || 0), 0);
    const consultas = perfil.length;
    const tiempos = [primera.ms];
    for (let i = 1; i < REPETICIONES; i++) tiempos.push((await llamar(method, ruta, token)).ms);
    resultados.push({ endpoint: nombre, status: primera.status, ms_mediana: Math.round(mediana(tiempos)), kb: Math.round(primera.bytes / 1024), consultas, docsExaminados });
  }

  // Finalizar asistencia: tiempo de respuesta + latencia del proceso mientras corren las alertas
  const creado = await llamar('POST', '/asistencia', T.docente1, { fecha: iso(hoy), cursoId: String(curso1._id), tipoSesion: 'CLASE', horaInicio: '10:00', horaFin: '11:00' });
  const asistenciaId = creado.json?.data?._id;
  if (asistenciaId) {
    await db.collection('asistencias').updateOne(
      { _id: new mongoose.Types.ObjectId(asistenciaId) },
      { $set: { 'estudiantes.$[].estado': 'AUSENTE' } },
    );
    const fin = await llamar('PATCH', `/asistencia/${asistenciaId}/finalizar`, T.docente1, {});
    const latencias = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) latencias.push((await llamar('GET', '/health')).ms);
    resultados.push({ endpoint: 'Finalizar asistencia (respuesta)', status: fin.status, ms_mediana: Math.round(fin.ms), kb: 0, consultas: '-', docsExaminados: '-' });
    resultados.push({ endpoint: 'Latencia máx. de /health durante alertas', status: 200, ms_mediana: Math.round(Math.max(...latencias)), kb: 0, consultas: '-', docsExaminados: '-' });
  }

  console.log(`\n=== ${ETIQUETA} (mediana de ${REPETICIONES} corridas) ===`);
  console.table(resultados);
  require('fs').writeFileSync(`bench-${ETIQUETA}.json`, JSON.stringify(resultados, null, 2));
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ Error en bench:', e); process.exit(1); });
