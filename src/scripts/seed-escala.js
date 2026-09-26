/**
 * seed-escala.js — Genera un colegio GRANDE para medir rendimiento (Fase 3) y
 * para la prueba de carga (Fase 6).
 *
 * ⚠️ SOLO BASES LOCALES: se niega a correr si MONGODB_URI no apunta a localhost/127.0.0.1.
 *    No lee el .env (evita apuntar a producción por error).
 *
 * Uso (desde la raíz del backend):
 *   MONGODB_URI=mongodb://127.0.0.1:27017/educanexo360_escala SEED_PASSWORD=<clave> node src/scripts/seed-escala.js
 *   (PowerShell: $env:MONGODB_URI='...'; $env:SEED_PASSWORD='...'; node src/scripts/seed-escala.js)
 *
 * Variables opcionales (por defecto el tamaño pedido en la Fase 3):
 *   ESCALA_ESTUDIANTES=2000 ESCALA_ACUDIENTES=2600 ESCALA_DOCENTES=90 ESCALA_CURSOS=60
 *   ESCALA_MENSAJES=50000 ESCALA_MASIVOS=20 ESCALA_ASISTENCIAS=100000 ESCALA_NOTIFICACIONES=60000
 *
 * Usuarios de prueba generados (misma contraseña SEED_PASSWORD):
 *   admin@escala.test, rector@escala.test, docente1..N@escala.test,
 *   estudiante1..N@escala.test, acudiente1..N@escala.test (acudiente1 es acudiente de estudiante1)
 *
 * La base se BORRA completa antes de sembrar.
 */
'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const URI = process.env.MONGODB_URI;
const PASSWORD = process.env.SEED_PASSWORD;
const n = (clave, porDefecto) => parseInt(process.env[clave] || String(porDefecto), 10);

const CFG = {
  estudiantes: n('ESCALA_ESTUDIANTES', 2000),
  acudientes: n('ESCALA_ACUDIENTES', 2600),
  docentes: n('ESCALA_DOCENTES', 90),
  cursos: n('ESCALA_CURSOS', 60),
  asignaturasPorCurso: 8,
  mensajes: n('ESCALA_MENSAJES', 50000),
  masivos: n('ESCALA_MASIVOS', 20),
  asistencias: n('ESCALA_ASISTENCIAS', 100000),
  notificaciones: n('ESCALA_NOTIFICACIONES', 60000),
  tareasPorAsignatura: 5,
  anuncios: 200,
};

if (!URI || !/^mongodb:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(URI)) {
  console.error('❌ ABORTADO: MONGODB_URI debe apuntar a una base LOCAL (mongodb://127.0.0.1:27017/<base>).');
  process.exit(1);
}
if (!PASSWORD) {
  console.error('❌ ABORTADO: defina SEED_PASSWORD (contraseña de los usuarios de prueba).');
  process.exit(1);
}

const oid = () => new mongoose.Types.ObjectId();
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];
const entre = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const haceDias = (dias) => new Date(Date.now() - dias * 86400000 - Math.floor(Math.random() * 86400000));
const NOMBRES = ['Ana', 'Luis', 'María', 'Juan', 'Sofía', 'Mateo', 'Valentina', 'Santiago', 'Isabella', 'Samuel', 'Camila', 'Nicolás', 'Daniela', 'Andrés', 'Laura', 'Felipe'];
const APELLIDOS = ['Gómez', 'Rodríguez', 'López', 'Martínez', 'García', 'Pérez', 'Sánchez', 'Ramírez', 'Torres', 'Díaz', 'Vargas', 'Castro', 'Rojas', 'Moreno'];
const nombre = () => azar(NOMBRES);
const apellidos = () => `${azar(APELLIDOS)} ${azar(APELLIDOS)}`;

async function insertarPorLotes(coleccion, docs, tam = 2000) {
  for (let i = 0; i < docs.length; i += tam) {
    await coleccion.insertMany(docs.slice(i, i + tam), { ordered: false });
  }
}

(async () => {
  const t0 = Date.now();
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log(`🧹 Borrando base local "${db.databaseName}"...`);
  await db.dropDatabase();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const ahora = new Date();
  const año = ahora.getFullYear();

  // ---------- Escuela ----------
  const escuelaId = oid();
  const periodos = [1, 2, 3, 4].map((numero) => ({
    _id: oid(),
    numero,
    nombre: `Periodo ${numero}`,
    fecha_inicio: new Date(año, (numero - 1) * 3, 1),
    fecha_fin: new Date(año, numero * 3 - 1, 28),
  }));
  await db.collection('escuelas').insertOne({
    _id: escuelaId, codigo: 'ESCALA-01', nombre: 'Colegio Escala', direccion: 'Calle 1', telefono: '3000000000',
    email: 'colegio@escala.test', estado: 'ACTIVO',
    configuracion: { periodos_academicos: 4, escala_calificacion: { minima: 0, maxima: 5 }, logros_por_periodo: 3 },
    periodos_academicos: periodos, createdAt: ahora, updatedAt: ahora,
  });

  // ---------- Usuarios ----------
  const usuarios = [];
  const mkUsuario = (email, tipo, extra = {}) => {
    const u = { _id: oid(), email, password: hash, nombre: nombre(), apellidos: apellidos(), tipo, estado: 'ACTIVO',
      escuelaId, permisos: [], perfil: { telefono: '300' + entre(1000000, 9999999) }, createdAt: ahora, updatedAt: ahora, ...extra };
    usuarios.push(u);
    return u;
  };
  const admin = mkUsuario('admin@escala.test', 'ADMIN');
  mkUsuario('rector@escala.test', 'RECTOR');
  const coordinadores = [1, 2].map((i) => mkUsuario(`coordinador${i}@escala.test`, 'COORDINADOR'));
  for (let i = 1; i <= 6; i++) mkUsuario(`administrativo${i}@escala.test`, 'ADMINISTRATIVO');
  const docentes = Array.from({ length: CFG.docentes }, (_, i) => mkUsuario(`docente${i + 1}@escala.test`, 'DOCENTE'));
  const estudiantes = Array.from({ length: CFG.estudiantes }, (_, i) =>
    mkUsuario(`estudiante${i + 1}@escala.test`, 'ESTUDIANTE', { info_academica: { codigo_estudiante: `EST-${i + 1}` } }));
  // acudiente i (i < estudiantes) → estudiante i; los restantes son segundo acudiente de los primeros estudiantes
  const acudientes = Array.from({ length: CFG.acudientes }, (_, i) =>
    mkUsuario(`acudiente${i + 1}@escala.test`, 'ACUDIENTE', {
      info_academica: { estudiantes_asociados: [estudiantes[i % estudiantes.length]._id] },
    }));
  await insertarPorLotes(db.collection('usuarios'), usuarios);
  console.log(`👥 Usuarios: ${usuarios.length}`);

  // ---------- Cursos y asignaturas ----------
  const cursos = [];
  const porCurso = Math.ceil(estudiantes.length / CFG.cursos);
  for (let c = 0; c < CFG.cursos; c++) {
    const grado = String(6 + (c % 6));
    const grupo = String.fromCharCode(65 + Math.floor(c / 6));
    cursos.push({ _id: oid(), nombre: `${grado}°${grupo}`, nivel: 'BASICA', grado, grupo, jornada: 'MAÑANA', año_academico: String(año),
      escuelaId, director_grupo: docentes[c % docentes.length]._id,
      estudiantes: estudiantes.slice(c * porCurso, (c + 1) * porCurso).map((e) => e._id), estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora });
  }
  await db.collection('cursos').insertMany(cursos);
  const MATERIAS = ['Matemáticas', 'Español', 'Ciencias', 'Sociales', 'Inglés', 'Artes', 'Educación Física', 'Tecnología'];
  const asignaturas = [];
  cursos.forEach((curso, c) => MATERIAS.slice(0, CFG.asignaturasPorCurso).forEach((m, k) => asignaturas.push({
    _id: oid(), nombre: m, descripcion: m, cursoId: curso._id, docenteId: docentes[(c * CFG.asignaturasPorCurso + k) % docentes.length]._id,
    escuelaId, estado: 'ACTIVO', intensidad_horaria: 4, createdAt: ahora, updatedAt: ahora,
  })));
  await db.collection('asignaturas').insertMany(asignaturas);
  console.log(`🏫 Cursos: ${cursos.length}, asignaturas: ${asignaturas.length}`);

  // ---------- Mensajes ----------
  const acudientesDe = new Map();
  acudientes.forEach((a) => a.info_academica.estudiantes_asociados.forEach((e) => {
    const k = String(e); if (!acudientesDe.has(k)) acudientesDe.set(k, []); acudientesDe.get(k).push(a._id);
  }));
  const mkMensaje = (remitente, destinatarios, extra = {}) => {
    const creado = extra.createdAt || haceDias(entre(0, 365));
    const participantes = [remitente, ...destinatarios];
    return { _id: oid(), remitente, destinatarios, destinatariosCc: [], asunto: extra.asunto || 'Mensaje de prueba',
      contenido: extra.contenido || 'Contenido del mensaje de prueba para medir rendimiento.', adjuntos: [], tipo: extra.tipo || 'INDIVIDUAL',
      prioridad: 'NORMAL', estado: 'ENVIADO', escuelaId, esRespuesta: false, eliminadoPorRemitente: false, etiquetas: [],
      estadosUsuarios: participantes.map((u) => ({ usuarioId: u, estado: 'ENVIADO', fechaAccion: creado })),
      lecturas: destinatarios.filter(() => Math.random() < 0.6).map((u) => ({ usuarioId: u, fechaLectura: creado })),
      cursoIds: extra.cursoIds || [], esCopiaAcudiente: false, createdAt: creado, updatedAt: creado, fechaAccion: creado };
  };
  const mensajes = [];
  const todos = [...estudiantes, ...acudientes].map((u) => u._id);
  for (let i = 0; i < CFG.masivos; i++) {
    mensajes.push(mkMensaje(admin._id, todos, { tipo: 'GRUPAL', asunto: `Circular ${i + 1} para todo el colegio`, cursoIds: cursos.map((c) => c._id), createdAt: haceDias(i * 7) }));
  }
  const grupales = Math.min(600, Math.floor(CFG.mensajes * 0.012));
  for (let i = 0; i < grupales; i++) {
    const curso = azar(cursos);
    const dest = [...curso.estudiantes, ...curso.estudiantes.flatMap((e) => acudientesDe.get(String(e)) || [])];
    mensajes.push(mkMensaje(curso.director_grupo, dest, { tipo: 'GRUPAL', asunto: `Aviso para ${curso.nombre}`, cursoIds: [curso._id] }));
  }
  while (mensajes.length < CFG.mensajes) {
    const r = Math.random();
    if (r < 0.4) mensajes.push(mkMensaje(azar(docentes)._id, [azar(acudientes)._id]));
    else if (r < 0.8) mensajes.push(mkMensaje(azar(acudientes)._id, [azar(docentes)._id]));
    else if (r < 0.9) mensajes.push(mkMensaje(azar(docentes)._id, [azar(estudiantes)._id]));
    else mensajes.push(mkMensaje(azar(coordinadores)._id, [azar(docentes)._id]));
  }
  await insertarPorLotes(db.collection('mensajes'), mensajes, 500);
  console.log(`✉️  Mensajes: ${mensajes.length} (masivos: ${CFG.masivos}, grupales: ${grupales})`);

  // ---------- Notificaciones ----------
  const notifs = [];
  for (let i = 0; i < CFG.notificaciones; i++) {
    const m = azar(mensajes);
    const creado = m.createdAt;
    notifs.push({ _id: oid(), usuarioId: azar(m.destinatarios), titulo: `Nuevo mensaje: ${m.asunto}`, mensaje: 'Has recibido un nuevo mensaje',
      tipo: 'MENSAJE', estado: Math.random() < 0.5 ? 'LEIDA' : 'PENDIENTE', entidadId: m._id, entidadTipo: 'Mensaje', escuelaId,
      metadata: {}, createdAt: creado, updatedAt: creado });
  }
  await insertarPorLotes(db.collection('notificacions'), notifs);
  console.log(`🔔 Notificaciones: ${notifs.length}`);

  // ---------- Asistencias (documentos por sesión de clase) ----------
  const ESTADOS = ['PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'PRESENTE', 'AUSENTE', 'TARDANZA', 'JUSTIFICADO'];
  const asignaturasDe = new Map();
  asignaturas.forEach((a) => { const k = String(a.cursoId); if (!asignaturasDe.has(k)) asignaturasDe.set(k, []); asignaturasDe.get(k).push(a); });
  const sesionesPorCurso = Math.ceil(CFG.asistencias / cursos.length);
  let totalAsis = 0;
  for (const curso of cursos) {
    const lote = [];
    for (let s = 0; s < sesionesPorCurso && totalAsis < CFG.asistencias; s++, totalAsis++) {
      const asig = azar(asignaturasDe.get(String(curso._id)));
      const fecha = haceDias(Math.floor((s / sesionesPorCurso) * 700));
      fecha.setHours(0, 0, 0, 0);
      const periodo = periodos.find((p) => fecha >= p.fecha_inicio && fecha <= p.fecha_fin);
      lote.push({ _id: oid(), fecha, cursoId: curso._id, asignaturaId: asig._id, docenteId: asig.docenteId, escuelaId,
        periodoId: periodo ? periodo._id : undefined, tipoSesion: 'CLASE', horaInicio: '07:00', horaFin: '08:00',
        estudiantes: curso.estudiantes.map((e) => ({ _id: oid(), estudianteId: e, estado: azar(ESTADOS), registradoPor: asig.docenteId, fechaRegistro: fecha })),
        observacionesGenerales: '', finalizado: true, createdAt: fecha, updatedAt: fecha });
    }
    await insertarPorLotes(db.collection('asistencias'), lote, 1000);
  }
  console.log(`📋 Asistencias: ${totalAsis}`);

  // ---------- Logros y calificaciones (boletín) ----------
  const logros = [];
  const calificaciones = [];
  const TIPOS_LOGRO = ['COGNITIVO', 'PROCEDIMENTAL', 'ACTITUDINAL'];
  for (const asig of asignaturas) {
    const curso = cursos.find((c) => String(c._id) === String(asig.cursoId));
    for (const p of [1, 2, 3, 4]) {
      const ls = TIPOS_LOGRO.map((tipo) => ({ _id: oid(), nombre: `Logro ${tipo} P${p}`, descripcion: 'Logro de prueba', tipo, porcentaje: tipo === 'COGNITIVO' ? 40 : 30,
        asignaturaId: asig._id, cursoId: asig.cursoId, escuelaId, periodo: p, año_academico: String(año), estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora }));
      logros.push(...ls);
      if (p <= 2) {
        for (const e of curso.estudiantes) {
          calificaciones.push({ _id: oid(), estudianteId: e, asignaturaId: asig._id, cursoId: asig.cursoId, escuelaId, periodo: p, año_academico: String(año),
            calificaciones_logros: ls.map((l) => ({ logroId: l._id, calificacion: entre(20, 50) / 10, observacion: '', fecha_calificacion: ahora })),
            promedio_periodo: entre(20, 50) / 10, observaciones: '', createdAt: ahora, updatedAt: ahora });
        }
      }
    }
  }
  await insertarPorLotes(db.collection('logros'), logros);
  await insertarPorLotes(db.collection('calificacions'), calificaciones);
  console.log(`🎓 Logros: ${logros.length}, calificaciones: ${calificaciones.length}`);

  // ---------- Tareas con entregas ----------
  const tareas = [];
  for (const asig of asignaturas) {
    const curso = cursos.find((c) => String(c._id) === String(asig.cursoId));
    for (let t = 0; t < CFG.tareasPorAsignatura; t++) {
      const limite = haceDias(entre(-30, 120));
      tareas.push({ _id: oid(), titulo: `Tarea ${t + 1} de ${asig.nombre}`, descripcion: 'Descripción de la tarea', docenteId: asig.docenteId,
        asignaturaId: asig._id, cursoId: asig.cursoId, fechaLimite: limite, calificacionMaxima: 5, escuelaId, estado: limite > ahora ? 'ACTIVA' : 'CERRADA',
        tipo: 'INDIVIDUAL', prioridad: 'MEDIA', permiteTardias: true, archivosReferencia: [], vistas: [],
        entregas: curso.estudiantes.map((e) => {
          const r = Math.random();
          return r < 0.5
            ? { _id: oid(), estudianteId: e, estado: 'CALIFICADA', archivos: [], fechaEntrega: limite, calificacion: entre(20, 50) / 10, comentarioEstudiante: 'Entrega' }
            : r < 0.8 ? { _id: oid(), estudianteId: e, estado: 'ENTREGADA', archivos: [], fechaEntrega: limite, comentarioEstudiante: 'Entrega' }
              : { _id: oid(), estudianteId: e, estado: 'PENDIENTE', archivos: [] };
        }),
        createdAt: haceDias(entre(120, 200)), updatedAt: ahora });
    }
  }
  await insertarPorLotes(db.collection('tareas'), tareas, 500);
  console.log(`📝 Tareas: ${tareas.length}`);

  // ---------- Anuncios ----------
  const anuncios = Array.from({ length: CFG.anuncios }, (_, i) => ({ _id: oid(), titulo: `Anuncio ${i + 1}`, contenido: 'Contenido del anuncio',
    creador: admin._id, escuelaId, fechaPublicacion: haceDias(i), estaPublicado: i % 10 !== 0, paraEstudiantes: true, paraDocentes: true,
    paraPadres: true, destacado: i < 5, archivosAdjuntos: [], lecturas: [], createdAt: haceDias(i), updatedAt: ahora }));
  await db.collection('anuncios').insertMany(anuncios);

  const stats = await db.stats();
  console.log(`\n✅ Seed de escala listo en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`   Datos: ${(stats.dataSize / 1048576).toFixed(1)} MB | Almacenamiento: ${(stats.storageSize / 1048576).toFixed(1)} MB | Índices: ${(stats.indexSize / 1048576).toFixed(1)} MB`);
  console.log(`   IDs útiles: curso1=${cursos[0]._id} estudiante1=${estudiantes[0]._id} masivo1=${mensajes[0]._id}`);
  await mongoose.disconnect();
})().catch((e) => { console.error('❌ Error en seed de escala:', e); process.exit(1); });
