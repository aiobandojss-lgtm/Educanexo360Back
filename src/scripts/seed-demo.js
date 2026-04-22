'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌ ERROR: La variable MONGODB_URI no está definida en .env');
  process.exit(1);
}

const ESC1_ID = new mongoose.Types.ObjectId('67cbd7457b538a736df6c31f'); // Centro Docente
const ESC2_ID = new mongoose.Types.ObjectId('67ccaf317bb6eedc21de542c'); // Colegio San José

async function limpiarColecciones(db) {
  const colecciones = [
    'usuarios', 'cursos', 'asignaturas', 'calificaciones',
    'anuncios', 'logros', 'mensajes', 'notificaciones',
    'invitaciones', 'asistencias', 'tareas', 'eventocalendarios',
  ];
  console.log('\n🗑️  Limpiando colecciones...');
  for (const col of colecciones) {
    const res = await db.collection(col).deleteMany({});
    console.log(`   ${col}: ${res.deletedCount} eliminados`);
  }
}

async function seedEscuela1(db, pass) {
  console.log('\n🏫 Insertando datos — Centro Docente rep de colombia...');

  const adminId  = new mongoose.Types.ObjectId();
  const rectorId = new mongoose.Types.ObjectId();
  const coordId  = new mongoose.Types.ObjectId();
  const doc1Id   = new mongoose.Types.ObjectId(); // Matemáticas
  const doc2Id   = new mongoose.Types.ObjectId(); // Español
  const doc3Id   = new mongoose.Types.ObjectId(); // Ciencias Naturales

  const c1Id = new mongoose.Types.ObjectId(); // Jardín A
  const c2Id = new mongoose.Types.ObjectId(); // Transición A
  const c3Id = new mongoose.Types.ObjectId(); // Primero A
  const c4Id = new mongoose.Types.ObjectId(); // Segundo A
  const c5Id = new mongoose.Types.ObjectId(); // Tercero A

  // asigIds[0-2]  → Jardín A:      Mat, Esp, Cien
  // asigIds[3-5]  → Transición A:  Mat, Esp, Cien
  // asigIds[6-8]  → Primero A:     Mat, Esp, Cien
  // asigIds[9-11] → Segundo A:     Mat, Esp, Cien
  // asigIds[12-14]→ Tercero A:     Mat, Esp, Cien
  const asigIds = Array.from({ length: 15 }, () => new mongoose.Types.ObjectId());

  // est[0-1] Jardín A | est[2-3] Transición A | est[4-5] Primero A
  // est[6-7] Segundo A | est[8-9] Tercero A
  const estIds  = Array.from({ length: 10 }, () => new mongoose.Types.ObjectId());
  const acudIds = Array.from({ length: 7  }, () => new mongoose.Types.ObjectId());

  const ahora = new Date();

  const periodos2026 = [
    { numero: 1, nombre: 'Primer Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-01-15'), fecha_fin: new Date('2026-03-31') },
    { numero: 2, nombre: 'Segundo Periodo', porcentaje: 25, fecha_inicio: new Date('2026-04-01'), fecha_fin: new Date('2026-06-30') },
    { numero: 3, nombre: 'Tercer Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-07-15'), fecha_fin: new Date('2026-09-30') },
    { numero: 4, nombre: 'Cuarto Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-10-01'), fecha_fin: new Date('2026-11-30') },
  ];

  // ─── USUARIOS PLANTA ─────────────────────────────────────────────────────────
  await db.collection('usuarios').insertMany([
    {
      _id: adminId,
      email: 'admin@educanexo360.creativebycode.com',
      password: pass, nombre: 'Carlos Andrés', apellidos: 'Morales Rincón',
      tipo: 'ADMIN', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: rectorId,
      email: 'rector.cdrc@demo.com',
      password: pass, nombre: 'Gloria Patricia', apellidos: 'Vargas Ospina',
      tipo: 'RECTOR', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: coordId,
      email: 'coordinador.cdrc@demo.com',
      password: pass, nombre: 'Juan Pablo', apellidos: 'Herrera Díaz',
      tipo: 'COORDINADOR', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc1Id,
      email: 'docente1@educanexo360.creativebycode.com',
      password: pass, nombre: 'Andrés Felipe', apellidos: 'Gutiérrez Pinto',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[0],  cursoId: c1Id },
          { asignaturaId: asigIds[3],  cursoId: c2Id },
          { asignaturaId: asigIds[6],  cursoId: c3Id },
          { asignaturaId: asigIds[9],  cursoId: c4Id },
          { asignaturaId: asigIds[12], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc2Id,
      email: 'docente2@educanexo360.creativebycode.com',
      password: pass, nombre: 'María Fernanda', apellidos: 'Castillo López',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[1],  cursoId: c1Id },
          { asignaturaId: asigIds[4],  cursoId: c2Id },
          { asignaturaId: asigIds[7],  cursoId: c3Id },
          { asignaturaId: asigIds[10], cursoId: c4Id },
          { asignaturaId: asigIds[13], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc3Id,
      email: 'docente.ciencias.cdrc@demo.com',
      password: pass, nombre: 'Roberto Carlos', apellidos: 'Mendoza Torres',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[2],  cursoId: c1Id },
          { asignaturaId: asigIds[5],  cursoId: c2Id },
          { asignaturaId: asigIds[8],  cursoId: c3Id },
          { asignaturaId: asigIds[11], cursoId: c4Id },
          { asignaturaId: asigIds[14], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
  ]);
  console.log('   ✅ Usuarios planta insertados (6)');

  // ─── CURSOS ──────────────────────────────────────────────────────────────────
  await db.collection('cursos').insertMany([
    { _id: c1Id, nombre: 'JARDIN',    nivel: 'PREESCOLAR', grado: 'Jardín',    grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC1_ID, director_grupo: doc2Id, estudiantes: [estIds[0], estIds[1]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c2Id, nombre: 'TRANSICION',nivel: 'PREESCOLAR', grado: 'Transición',grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC1_ID, director_grupo: doc2Id, estudiantes: [estIds[2], estIds[3]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c3Id, nombre: 'PRIMERO',   nivel: 'PRIMARIA',   grado: 'Primero',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC1_ID, director_grupo: doc1Id, estudiantes: [estIds[4], estIds[5]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c4Id, nombre: 'SEGUNDO',   nivel: 'PRIMARIA',   grado: 'Segundo',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC1_ID, director_grupo: doc1Id, estudiantes: [estIds[6], estIds[7]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c5Id, nombre: 'TERCERO',   nivel: 'PRIMARIA',   grado: 'Tercero',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC1_ID, director_grupo: doc3Id, estudiantes: [estIds[8], estIds[9]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
  ]);
  console.log('   ✅ Cursos insertados (5)');

  // ─── ASIGNATURAS ─────────────────────────────────────────────────────────────
  const cursosAsig = [
    { cId: c1Id, offset: 0  },
    { cId: c2Id, offset: 3  },
    { cId: c3Id, offset: 6  },
    { cId: c4Id, offset: 9  },
    { cId: c5Id, offset: 12 },
  ];
  const materias = [
    { nombre: 'Matemáticas',       docenteId: doc1Id, intensidad: 4 },
    { nombre: 'Español',           docenteId: doc2Id, intensidad: 4 },
    { nombre: 'Ciencias Naturales',docenteId: doc3Id, intensidad: 3 },
  ];
  const asignaturas = [];
  for (const { cId, offset } of cursosAsig) {
    for (let i = 0; i < materias.length; i++) {
      const m = materias[i];
      asignaturas.push({
        _id: asigIds[offset + i],
        nombre: m.nombre,
        descripcion: `${m.nombre} - año académico 2026`,
        cursoId: cId, docenteId: m.docenteId, escuelaId: ESC1_ID,
        intensidad_horaria: m.intensidad, estado: 'ACTIVO',
        periodos: periodos2026, createdAt: ahora, updatedAt: ahora,
      });
    }
  }
  await db.collection('asignaturas').insertMany(asignaturas);
  console.log('   ✅ Asignaturas insertadas (15)');

  // ─── ESTUDIANTES ─────────────────────────────────────────────────────────────
  const estudiantesData = [
    { _id: estIds[0], nombre: 'Sofía Alejandra',   apellidos: 'Ramírez Cruz',   cursoId: c1Id, codigo: 'EST-C1-001' },
    { _id: estIds[1], nombre: 'Mateo Sebastián',   apellidos: 'López Herrera',  cursoId: c1Id, codigo: 'EST-C1-002' },
    { _id: estIds[2], nombre: 'Valeria',            apellidos: 'Ortiz Pérez',    cursoId: c2Id, codigo: 'EST-C2-001' },
    { _id: estIds[3], nombre: 'Samuel Esteban',    apellidos: 'García Mora',    cursoId: c2Id, codigo: 'EST-C2-002' },
    { _id: estIds[4], nombre: 'Isabella Mariana',  apellidos: 'Castillo Ruiz',  cursoId: c3Id, codigo: 'EST-C3-001' },
    { _id: estIds[5], nombre: 'Tomás Alejandro',   apellidos: 'Muñoz Vargas',   cursoId: c3Id, codigo: 'EST-C3-002' },
    { _id: estIds[6], nombre: 'Camila Andrea',     apellidos: 'Torres Jiménez', cursoId: c4Id, codigo: 'EST-C4-001' },
    { _id: estIds[7], nombre: 'Julián David',      apellidos: 'Gómez Ríos',     cursoId: c4Id, codigo: 'EST-C4-002' },
    { _id: estIds[8], nombre: 'Mariana Valentina', apellidos: 'Suárez Parra',   cursoId: c5Id, codigo: 'EST-C5-001' },
    { _id: estIds[9], nombre: 'Santiago Felipe',   apellidos: 'Ávila Blanco',   cursoId: c5Id, codigo: 'EST-C5-002' },
  ];
  await db.collection('usuarios').insertMany(
    estudiantesData.map(e => ({
      _id: e._id,
      email: `${e.codigo.toLowerCase().replace(/-/g, '.')}.cdrc@demo.com`,
      password: pass, nombre: e.nombre, apellidos: e.apellidos,
      tipo: 'ESTUDIANTE', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [], info_academica: { codigo_estudiante: e.codigo },
      createdAt: ahora, updatedAt: ahora,
    }))
  );
  console.log('   ✅ Estudiantes insertados (10)');

  // ─── ACUDIENTES ──────────────────────────────────────────────────────────────
  // 3 con 2 hijos | 4 con 1 hijo
  const acudientesData = [
    { _id: acudIds[0], email: 'acudiente1@educanexo360.creativebycode.com', nombre: 'Marcela',      apellidos: 'Ramírez Cruz',   hijos: [estIds[0], estIds[4]] }, // Jardín + Primero
    { _id: acudIds[1], email: 'acudiente2@educanexo360.creativebycode.com', nombre: 'Jorge Armando',apellidos: 'Ortiz Méndez',   hijos: [estIds[2], estIds[6]] }, // Transición + Segundo
    { _id: acudIds[2], email: 'acud03.cdrc@demo.com',                        nombre: 'Claudia',      apellidos: 'Torres Ríos',    hijos: [estIds[1], estIds[8]] }, // Jardín + Tercero
    { _id: acudIds[3], email: 'acud04.cdrc@demo.com',                        nombre: 'Hernando',     apellidos: 'García Mora',    hijos: [estIds[3]] },
    { _id: acudIds[4], email: 'acud05.cdrc@demo.com',                        nombre: 'Patricia',     apellidos: 'Muñoz Vargas',   hijos: [estIds[5]] },
    { _id: acudIds[5], email: 'acud06.cdrc@demo.com',                        nombre: 'Ricardo',      apellidos: 'Gómez Suárez',   hijos: [estIds[7]] },
    { _id: acudIds[6], email: 'acud07.cdrc@demo.com',                        nombre: 'Esperanza',    apellidos: 'Ávila Parra',    hijos: [estIds[9]] },
  ];
  await db.collection('usuarios').insertMany(
    acudientesData.map(a => ({
      _id: a._id, email: a.email, password: pass,
      nombre: a.nombre, apellidos: a.apellidos,
      tipo: 'ACUDIENTE', estado: 'ACTIVO', escuelaId: ESC1_ID,
      permisos: [], info_academica: { estudiantes_asociados: a.hijos },
      createdAt: ahora, updatedAt: ahora,
    }))
  );
  console.log('   ✅ Acudientes insertados (7) — 3 con 2 hijos, 4 con 1 hijo');

  return { adminId, rectorId, coordId, doc1Id, doc2Id, doc3Id,
           c1Id, c2Id, c3Id, c4Id, c5Id, estIds, acudIds };
}

async function seedEscuela2(db, pass) {
  console.log('\n🏫 Insertando datos — Colegio San José...');

  const adminId  = new mongoose.Types.ObjectId();
  const rectorId = new mongoose.Types.ObjectId();
  const coordId  = new mongoose.Types.ObjectId();
  const doc1Id   = new mongoose.Types.ObjectId(); // Matemáticas
  const doc2Id   = new mongoose.Types.ObjectId(); // Español
  const doc3Id   = new mongoose.Types.ObjectId(); // Ciencias Naturales

  const c1Id = new mongoose.Types.ObjectId(); // Jardín A
  const c2Id = new mongoose.Types.ObjectId(); // Transición A
  const c3Id = new mongoose.Types.ObjectId(); // Primero A
  const c4Id = new mongoose.Types.ObjectId(); // Segundo A
  const c5Id = new mongoose.Types.ObjectId(); // Tercero A

  const asigIds = Array.from({ length: 15 }, () => new mongoose.Types.ObjectId());
  const estIds  = Array.from({ length: 10 }, () => new mongoose.Types.ObjectId());
  const acudIds = Array.from({ length: 7  }, () => new mongoose.Types.ObjectId());

  const ahora = new Date();

  const periodos2026 = [
    { numero: 1, nombre: 'Primer Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-01-15'), fecha_fin: new Date('2026-03-31') },
    { numero: 2, nombre: 'Segundo Periodo', porcentaje: 25, fecha_inicio: new Date('2026-04-01'), fecha_fin: new Date('2026-06-30') },
    { numero: 3, nombre: 'Tercer Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-07-15'), fecha_fin: new Date('2026-09-30') },
    { numero: 4, nombre: 'Cuarto Periodo',  porcentaje: 25, fecha_inicio: new Date('2026-10-01'), fecha_fin: new Date('2026-11-30') },
  ];

  // ─── PLANTA ──────────────────────────────────────────────────────────────────
  await db.collection('usuarios').insertMany([
    {
      _id: adminId,
      email: 'admin.csj@demo.com',
      password: pass, nombre: 'Luisa Fernanda', apellidos: 'Reyes Molina',
      tipo: 'ADMIN', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: rectorId,
      email: 'rector.csj@demo.com',
      password: pass, nombre: 'Ernesto', apellidos: 'Ramírez Acosta',
      tipo: 'RECTOR', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: coordId,
      email: 'coordinador.csj@demo.com',
      password: pass, nombre: 'Patricia', apellidos: 'Salazar Rojas',
      tipo: 'COORDINADOR', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [], info_academica: {}, createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc1Id,
      email: 'docente.mat.csj@demo.com',
      password: pass, nombre: 'Fernando', apellidos: 'Díaz Navarro',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[0],  cursoId: c1Id },
          { asignaturaId: asigIds[3],  cursoId: c2Id },
          { asignaturaId: asigIds[6],  cursoId: c3Id },
          { asignaturaId: asigIds[9],  cursoId: c4Id },
          { asignaturaId: asigIds[12], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc2Id,
      email: 'docente.esp.csj@demo.com',
      password: pass, nombre: 'Liliana', apellidos: 'Mora Quintero',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[1],  cursoId: c1Id },
          { asignaturaId: asigIds[4],  cursoId: c2Id },
          { asignaturaId: asigIds[7],  cursoId: c3Id },
          { asignaturaId: asigIds[10], cursoId: c4Id },
          { asignaturaId: asigIds[13], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: doc3Id,
      email: 'docente.cien.csj@demo.com',
      password: pass, nombre: 'Gustavo', apellidos: 'Pedraza Soto',
      tipo: 'DOCENTE', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [],
      info_academica: {
        asignaturas_asignadas: [
          { asignaturaId: asigIds[2],  cursoId: c1Id },
          { asignaturaId: asigIds[5],  cursoId: c2Id },
          { asignaturaId: asigIds[8],  cursoId: c3Id },
          { asignaturaId: asigIds[11], cursoId: c4Id },
          { asignaturaId: asigIds[14], cursoId: c5Id },
        ],
      },
      createdAt: ahora, updatedAt: ahora,
    },
  ]);
  console.log('   ✅ Usuarios planta insertados (6)');

  // ─── CURSOS ──────────────────────────────────────────────────────────────────
  await db.collection('cursos').insertMany([
    { _id: c1Id, nombre: 'JARDIN',    nivel: 'PREESCOLAR', grado: 'Jardín',    grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC2_ID, director_grupo: doc2Id, estudiantes: [estIds[0], estIds[1]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c2Id, nombre: 'TRANSICION',nivel: 'PREESCOLAR', grado: 'Transición',grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC2_ID, director_grupo: doc2Id, estudiantes: [estIds[2], estIds[3]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c3Id, nombre: 'PRIMERO',   nivel: 'PRIMARIA',   grado: 'Primero',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC2_ID, director_grupo: doc1Id, estudiantes: [estIds[4], estIds[5]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c4Id, nombre: 'SEGUNDO',   nivel: 'PRIMARIA',   grado: 'Segundo',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC2_ID, director_grupo: doc1Id, estudiantes: [estIds[6], estIds[7]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
    { _id: c5Id, nombre: 'TERCERO',   nivel: 'PRIMARIA',   grado: 'Tercero',   grupo: 'A', jornada: 'MATUTINA', año_academico: '2026', escuelaId: ESC2_ID, director_grupo: doc3Id, estudiantes: [estIds[8], estIds[9]], estado: 'ACTIVO', createdAt: ahora, updatedAt: ahora },
  ]);
  console.log('   ✅ Cursos insertados (5)');

  // ─── ASIGNATURAS ─────────────────────────────────────────────────────────────
  const cursosAsig = [
    { cId: c1Id, offset: 0  }, { cId: c2Id, offset: 3  }, { cId: c3Id, offset: 6  },
    { cId: c4Id, offset: 9  }, { cId: c5Id, offset: 12 },
  ];
  const materias = [
    { nombre: 'Matemáticas',       docenteId: doc1Id, intensidad: 4 },
    { nombre: 'Español',           docenteId: doc2Id, intensidad: 4 },
    { nombre: 'Ciencias Naturales',docenteId: doc3Id, intensidad: 3 },
  ];
  const asignaturas = [];
  for (const { cId, offset } of cursosAsig) {
    for (let i = 0; i < materias.length; i++) {
      const m = materias[i];
      asignaturas.push({
        _id: asigIds[offset + i],
        nombre: m.nombre,
        descripcion: `${m.nombre} - año académico 2026`,
        cursoId: cId, docenteId: m.docenteId, escuelaId: ESC2_ID,
        intensidad_horaria: m.intensidad, estado: 'ACTIVO',
        periodos: periodos2026, createdAt: ahora, updatedAt: ahora,
      });
    }
  }
  await db.collection('asignaturas').insertMany(asignaturas);
  console.log('   ✅ Asignaturas insertadas (15)');

  // ─── ESTUDIANTES ─────────────────────────────────────────────────────────────
  const estudiantesData = [
    { _id: estIds[0], nombre: 'Luna Daniela',     apellidos: 'Rodríguez Franco', cursoId: c1Id, codigo: 'EST-C1-001' },
    { _id: estIds[1], nombre: 'Nicolás Andrés',   apellidos: 'Peña Castro',      cursoId: c1Id, codigo: 'EST-C1-002' },
    { _id: estIds[2], nombre: 'Alejandra Sofía',  apellidos: 'Cárdenas Vega',    cursoId: c2Id, codigo: 'EST-C2-001' },
    { _id: estIds[3], nombre: 'Emilio José',      apellidos: 'Fuentes Lara',     cursoId: c2Id, codigo: 'EST-C2-002' },
    { _id: estIds[4], nombre: 'Gabriela María',   apellidos: 'Sánchez Dávila',   cursoId: c3Id, codigo: 'EST-C3-001' },
    { _id: estIds[5], nombre: 'Diego Armando',    apellidos: 'Morales Cruz',     cursoId: c3Id, codigo: 'EST-C3-002' },
    { _id: estIds[6], nombre: 'Daniela Paola',    apellidos: 'Velasco Mejía',    cursoId: c4Id, codigo: 'EST-C4-001' },
    { _id: estIds[7], nombre: 'Sebastián Eduardo',apellidos: 'Núñez Barrios',    cursoId: c4Id, codigo: 'EST-C4-002' },
    { _id: estIds[8], nombre: 'Andrea Milena',    apellidos: 'Guerrero Pinto',   cursoId: c5Id, codigo: 'EST-C5-001' },
    { _id: estIds[9], nombre: 'Kevin Esteban',    apellidos: 'Ocampo Serrano',   cursoId: c5Id, codigo: 'EST-C5-002' },
  ];
  await db.collection('usuarios').insertMany(
    estudiantesData.map(e => ({
      _id: e._id,
      email: `${e.codigo.toLowerCase().replace(/-/g, '.')}.csj@demo.com`,
      password: pass, nombre: e.nombre, apellidos: e.apellidos,
      tipo: 'ESTUDIANTE', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [], info_academica: { codigo_estudiante: e.codigo },
      createdAt: ahora, updatedAt: ahora,
    }))
  );
  console.log('   ✅ Estudiantes insertados (10)');

  // ─── ACUDIENTES ──────────────────────────────────────────────────────────────
  const acudientesData = [
    { _id: acudIds[0], email: 'acud01.csj@demo.com', nombre: 'Rosa Elena',    apellidos: 'Rodríguez Mora',  hijos: [estIds[0], estIds[4]] },
    { _id: acudIds[1], email: 'acud02.csj@demo.com', nombre: 'Andrés',        apellidos: 'Cárdenas Torres', hijos: [estIds[2], estIds[6]] },
    { _id: acudIds[2], email: 'acud03.csj@demo.com', nombre: 'Natalia',       apellidos: 'Peña Guzmán',     hijos: [estIds[1], estIds[8]] },
    { _id: acudIds[3], email: 'acud04.csj@demo.com', nombre: 'César',         apellidos: 'Fuentes Mendoza', hijos: [estIds[3]] },
    { _id: acudIds[4], email: 'acud05.csj@demo.com', nombre: 'Beatriz',       apellidos: 'Sánchez Ibáñez',  hijos: [estIds[5]] },
    { _id: acudIds[5], email: 'acud06.csj@demo.com', nombre: 'Oscar',         apellidos: 'Núñez Barrera',   hijos: [estIds[7]] },
    { _id: acudIds[6], email: 'acud07.csj@demo.com', nombre: 'Diana',         apellidos: 'Ocampo Cruz',     hijos: [estIds[9]] },
  ];
  await db.collection('usuarios').insertMany(
    acudientesData.map(a => ({
      _id: a._id, email: a.email, password: pass,
      nombre: a.nombre, apellidos: a.apellidos,
      tipo: 'ACUDIENTE', estado: 'ACTIVO', escuelaId: ESC2_ID,
      permisos: [], info_academica: { estudiantes_asociados: a.hijos },
      createdAt: ahora, updatedAt: ahora,
    }))
  );
  console.log('   ✅ Acudientes insertados (7)');

  return { adminId };
}

async function seedAnuncios(db, adminId1, adminId2) {
  console.log('\n📢 Insertando anuncios...');
  const ahora = new Date();

  const anunciosPorEscuela = (escuelaId, creadorId, sufijo) => [
    {
      _id: new mongoose.Types.ObjectId(),
      titulo: 'Reunión general de padres de familia',
      contenido: `Estimados padres y acudientes, los invitamos a la reunión general del ${sufijo} el próximo viernes 8 de mayo a las 6:00 p.m. en el auditorio principal. Su presencia es muy importante.`,
      creador: creadorId, escuelaId,
      fechaPublicacion: new Date('2026-04-28'),
      estaPublicado: true, paraEstudiantes: false, paraDocentes: false, paraPadres: true,
      destacado: true, archivosAdjuntos: [], lecturas: [], createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      titulo: 'Cierre del primer período académico',
      contenido: `Informamos a la comunidad educativa del ${sufijo} que el cierre del primer período académico 2026 se realizará el 31 de marzo. Los docentes deben entregar sus informes de notas antes del 28 de marzo.`,
      creador: creadorId, escuelaId,
      fechaPublicacion: new Date('2026-03-15'),
      estaPublicado: true, paraEstudiantes: false, paraDocentes: true, paraPadres: false,
      destacado: false, archivosAdjuntos: [], lecturas: [], createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      titulo: 'Jornada deportiva interescolar',
      contenido: `¡Estudiantes del ${sufijo}, este sábado 16 de mayo los esperamos en la jornada deportiva interescolar! Habrá competencias de fútbol, baloncesto y atletismo. Llevar ropa deportiva.`,
      creador: creadorId, escuelaId,
      fechaPublicacion: new Date('2026-05-10'),
      estaPublicado: true, paraEstudiantes: true, paraDocentes: false, paraPadres: false,
      destacado: false, archivosAdjuntos: [], lecturas: [], createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      titulo: 'Actualización del calendario académico 2026',
      contenido: `Se informa a toda la comunidad del ${sufijo} la actualización del calendario académico. Las vacaciones de mitad de año serán del 27 de junio al 13 de julio. El regreso a clases es el 14 de julio.`,
      creador: creadorId, escuelaId,
      fechaPublicacion: new Date('2026-04-20'),
      estaPublicado: true, paraEstudiantes: true, paraDocentes: true, paraPadres: true,
      destacado: true, archivosAdjuntos: [], lecturas: [], createdAt: ahora, updatedAt: ahora,
    },
    {
      _id: new mongoose.Types.ObjectId(),
      titulo: 'Jornada pedagógica — sin clases',
      contenido: `El próximo lunes 4 de mayo no habrá clases en el ${sufijo} por jornada pedagógica institucional. Los docentes deben asistir a las 7:00 a.m. para el trabajo de planeación curricular.`,
      creador: creadorId, escuelaId,
      fechaPublicacion: new Date('2026-04-28'),
      estaPublicado: true, paraEstudiantes: true, paraDocentes: true, paraPadres: true,
      destacado: false, archivosAdjuntos: [], lecturas: [], createdAt: ahora, updatedAt: ahora,
    },
  ];

  const todos = [
    ...anunciosPorEscuela(ESC1_ID, adminId1, 'Centro Docente'),
    ...anunciosPorEscuela(ESC2_ID, adminId2, 'Colegio San José'),
  ];
  await db.collection('anuncios').insertMany(todos);
  console.log(`   ✅ Anuncios insertados (${todos.length})`);
}

async function seedEventos(db, creadorId1, creadorId2) {
  console.log('\n📅 Insertando eventos de calendario...');
  const ahora = new Date();

  const definicionEventos = [
    // MAYO 2026
    { titulo: 'Día del Maestro',                          descripcion: 'Celebración del Día del Maestro con acto cultural y reconocimientos al personal docente.',                                     fechaInicio: new Date('2026-05-15T08:00:00'), fechaFin: new Date('2026-05-15T12:00:00'), todoElDia: false, lugar: 'Auditorio principal',          tipo: 'INSTITUCIONAL', color: '#e91e63' },
    { titulo: 'Entrega de boletines — Período 1',         descripcion: 'Entrega oficial de boletines del primer período a padres de familia y estudiantes.',                                            fechaInicio: new Date('2026-05-20T07:00:00'), fechaFin: new Date('2026-05-20T17:00:00'), todoElDia: false, lugar: 'Salones de clase',             tipo: 'ACADEMICO',     color: '#1976d2' },
    { titulo: 'Reunión de padres de familia',             descripcion: 'Reunión informativa con padres de familia para socializar resultados del primer período y compromisos del segundo.',            fechaInicio: new Date('2026-05-22T18:00:00'), fechaFin: new Date('2026-05-22T20:00:00'), todoElDia: false, lugar: 'Auditorio',                    tipo: 'INSTITUCIONAL', color: '#388e3c' },
    { titulo: 'Izada de bandera — Mayo',                  descripcion: 'Acto cívico mensual con participación de todos los grados.',                                                                    fechaInicio: new Date('2026-05-29T07:00:00'), fechaFin: new Date('2026-05-29T08:00:00'), todoElDia: false, lugar: 'Patio central',                tipo: 'INSTITUCIONAL', color: '#f57c00' },
    // JUNIO 2026
    { titulo: 'Semana Cultural Institucional',            descripcion: 'Semana de expresión artística y cultural con presentaciones de todos los grados.',                                             fechaInicio: new Date('2026-06-15T07:00:00'), fechaFin: new Date('2026-06-19T17:00:00'), todoElDia: true,  lugar: 'Instalaciones del colegio',    tipo: 'CULTURAL',      color: '#7b1fa2' },
    { titulo: 'Jornada Deportiva',                        descripcion: 'Torneo interno de fútbol, baloncesto y atletismo para los estudiantes.',                                                        fechaInicio: new Date('2026-06-25T07:00:00'), fechaFin: new Date('2026-06-25T14:00:00'), todoElDia: false, lugar: 'Cancha y patio deportivo',     tipo: 'DEPORTIVO',     color: '#00796b' },
    { titulo: 'Cierre primer semestre',                   descripcion: 'Último día de clases del primer semestre. Entrega de informes a coordinación.',                                                 fechaInicio: new Date('2026-06-26T07:00:00'), fechaFin: new Date('2026-06-26T13:00:00'), todoElDia: false, lugar: 'Salones',                      tipo: 'ACADEMICO',     color: '#1976d2' },
    { titulo: 'Inicio vacaciones de mitad de año',        descripcion: 'Inicio del período de vacaciones de mitad de año. Regreso el 14 de julio.',                                                    fechaInicio: new Date('2026-06-27T00:00:00'), fechaFin: new Date('2026-07-13T23:59:00'), todoElDia: true,  lugar: '',                             tipo: 'INSTITUCIONAL', color: '#455a64' },
    // JULIO 2026
    { titulo: 'Regreso a clases — Segundo semestre',      descripcion: 'Inicio del segundo semestre académico 2026. Todos los estudiantes deben presentarse a las 7:00 a.m.',                          fechaInicio: new Date('2026-07-14T07:00:00'), fechaFin: new Date('2026-07-14T13:00:00'), todoElDia: false, lugar: 'Instalaciones del colegio',    tipo: 'ACADEMICO',     color: '#1976d2' },
    { titulo: 'Reunión de docentes — Planeación',         descripcion: 'Jornada de planeación curricular para el segundo semestre. Obligatoria para todos los docentes.',                              fechaInicio: new Date('2026-07-14T14:00:00'), fechaFin: new Date('2026-07-14T18:00:00'), todoElDia: false, lugar: 'Sala de profesores',           tipo: 'INSTITUCIONAL', color: '#f57c00' },
    { titulo: 'Feria de Ciencias',                        descripcion: 'Exposición de proyectos científicos elaborados por los estudiantes. Abierta a la comunidad.',                                  fechaInicio: new Date('2026-07-24T08:00:00'), fechaFin: new Date('2026-07-24T15:00:00'), todoElDia: false, lugar: 'Patio principal',               tipo: 'ACADEMICO',     color: '#00897b' },
    { titulo: 'Elección de Personero Estudiantil',        descripcion: 'Proceso democrático de elección del personero estudiantil para el período 2026-2027.',                                         fechaInicio: new Date('2026-07-28T08:00:00'), fechaFin: new Date('2026-07-28T11:00:00'), todoElDia: false, lugar: 'Aulas de votación',            tipo: 'INSTITUCIONAL', color: '#c62828' },
  ];

  const todos = [
    ...definicionEventos.map(e => ({ _id: new mongoose.Types.ObjectId(), ...e, estado: 'PENDIENTE', creadorId: creadorId1, escuelaId: ESC1_ID, invitados: [], recordatorios: [], createdAt: ahora, updatedAt: ahora })),
    ...definicionEventos.map(e => ({ _id: new mongoose.Types.ObjectId(), ...e, estado: 'PENDIENTE', creadorId: creadorId2, escuelaId: ESC2_ID, invitados: [], recordatorios: [], createdAt: ahora, updatedAt: ahora })),
  ];
  await db.collection('eventocalendarios').insertMany(todos);
  console.log(`   ✅ Eventos insertados (${todos.length})`);
}

async function seed() {
  console.log('🔗 Conectando a MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Conectado\n');
  const db = mongoose.connection.db;

  await limpiarColecciones(db);

  const pass = await bcrypt.hash('Demo2026*', 10);
  console.log('🔑 Hash de contraseña generado');

  const ids1 = await seedEscuela1(db, pass);
  const ids2 = await seedEscuela2(db, pass);

  await seedAnuncios(db, ids1.adminId, ids2.adminId);
  await seedEventos(db, ids1.adminId, ids2.adminId);

  await mongoose.disconnect();
  console.log('\n✅ Seed completado exitosamente');
  console.log('\n📋 Credenciales de acceso (contraseña: Demo2026*):');
  console.log('   ADMIN Centro Docente : admin@educanexo360.creativebycode.com');
  console.log('   DOCENTE Matemáticas  : docente1@educanexo360.creativebycode.com');
  console.log('   DOCENTE Español      : docente2@educanexo360.creativebycode.com');
  console.log('   ACUDIENTE (2 hijos)  : acudiente1@educanexo360.creativebycode.com');
  console.log('   ACUDIENTE (2 hijos)  : acudiente2@educanexo360.creativebycode.com');
  console.log('   ADMIN Colegio SJ     : admin.csj@demo.com');
}

seed().catch(err => {
  console.error('❌ Error durante el seed:', err);
  process.exit(1);
});
