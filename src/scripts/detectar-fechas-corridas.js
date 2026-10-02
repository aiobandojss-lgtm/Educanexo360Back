/**
 * detectar-fechas-corridas.js — Auditoría H3 (c): SIMULACIÓN de solo lectura. Lista los documentos de la base que
 * probablemente quedaron corridos 5 horas por el APK 1.0.0 (enviaba fechas locales sin zona horaria y el servidor,
 * en UTC, las guardó como si fueran UTC). NO modifica nada: no tiene modo de aplicar. Una corrección, si se aprueba,
 * irá en un script aparte.
 *
 * Convención correcta (docs/convencion-fechas.md, la que ya usa la web):
 *   - evento de todo el día: inicio 00:00 de Colombia = 05:00Z; fin 23:59 de Colombia = 04:59Z del día siguiente;
 *   - evento con hora y fecha límite de tarea: hora de Colombia convertida a UTC.
 *
 * Criterios:
 *   SEGURO    evento todoElDia con inicio a las 00:00Z (la web nunca guarda eso: el APK mandó "00:00" sin zona)
 *   PROBABLE  evento con hora cuyo inicio, en hora de Colombia, cae entre 00:00 y 05:59 (un evento de las 8:00 del APK
 *             quedó a las 3:00 a. m.)
 *   PROBABLE  tarea con fecha límite exactamente a las 23:59Z o 00:00Z (el APK mandó "23:59"/"00:00" sin zona; en
 *             Colombia vence a las 18:59/19:00). Se cuentan también las entregas ATRASADA que dejarían de serlo.
 *   Control   asistencias que no están a medianoche UTC (esperado: 0; web y app mandan solo la fecha).
 * Corrección propuesta en todos los casos: +5 h.
 *
 * Importante: el criterio supone que el servidor de producción corre en UTC. La distribución de horas de los eventos
 * de todo el día que imprime el script lo confirma (si hay eventos a las 00:00Z, el servidor estaba en UTC).
 *
 * Uso:  MONGODB_URI="..." node src/scripts/detectar-fechas-corridas.js [--escuela=<id>] [--muestra=10]
 * No lee el .env.
 */
'use strict';
require('./_entorno'); // H7: quita espacios sobrantes de las variables de entorno
const mongoose = require('mongoose');

const URI = process.env.MONGODB_URI;
const argEscuela = process.argv.find((a) => a.startsWith('--escuela='));
const argMuestra = process.argv.find((a) => a.startsWith('--muestra='));
const MUESTRA = argMuestra ? Math.max(0, parseInt(argMuestra.split('=')[1], 10)) : 10;
if (!URI) {
  console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
  process.exit(1);
}

const H5 = 5 * 3600e3;
const iso = (d) => (d ? new Date(d).toISOString() : '-');
const horaUTC = (d) => new Date(d).getUTCHours();
const minUTC = (d) => new Date(d).getUTCMinutes();
const horaColombia = (d) => new Date(new Date(d).getTime() - H5).getUTCHours();
const mas5 = (d) => (d ? new Date(new Date(d).getTime() + H5) : d);

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const filtroEscuela = argEscuela ? { escuelaId: new mongoose.Types.ObjectId(argEscuela.split('=')[1]) } : {};
  console.log(`\n🔍 SIMULACIÓN (solo lectura) en ${mongoose.connection.name}${argEscuela ? ` — escuela ${argEscuela.split('=')[1]}` : ''}\n`);

  // Eventos de todo el día: distribución de la hora UTC de inicio (evidencia de la zona del servidor)
  const todoElDia = await db.collection('eventocalendarios').find({ ...filtroEscuela, todoElDia: true }, { projection: { titulo: 1, fechaInicio: 1, fechaFin: 1, escuelaId: 1, createdAt: 1 } }).toArray();
  const porHora = {};
  todoElDia.forEach((e) => { const h = `${String(horaUTC(e.fechaInicio)).padStart(2, '0')}:${String(minUTC(e.fechaInicio)).padStart(2, '0')}Z`; porHora[h] = (porHora[h] || 0) + 1; });
  console.log(`Eventos de todo el día: ${todoElDia.length}. Hora de inicio (UTC): ${Object.entries(porHora).sort().map(([h, n]) => `${h}=${n}`).join(', ') || '-'}`);
  console.log('  (05:00Z = convención de la web; 00:00Z = creado por el APK 1.0.0 con el servidor en UTC)\n');

  const seguros = todoElDia.filter((e) => horaUTC(e.fechaInicio) === 0 && minUTC(e.fechaInicio) === 0);
  const conHora = await db.collection('eventocalendarios').find({ ...filtroEscuela, todoElDia: { $ne: true } }, { projection: { titulo: 1, fechaInicio: 1, fechaFin: 1, escuelaId: 1 } }).toArray();
  const eventosProbables = conHora.filter((e) => e.fechaInicio && horaColombia(e.fechaInicio) <= 5);

  const tareas = await db.collection('tareas').find({ ...filtroEscuela, fechaLimite: { $exists: true } }, { projection: { titulo: 1, fechaLimite: 1, escuelaId: 1, entregas: 1 } }).toArray();
  const tareasProbables = tareas.filter((t) => { const h = horaUTC(t.fechaLimite); const m = minUTC(t.fechaLimite); return (h === 23 && m === 59) || (h === 0 && m === 0); });
  // Entregas marcadas ATRASADA que con la fecha corregida (+5 h) habrían llegado a tiempo
  let atrasadasInjustas = 0;
  for (const t of tareasProbables) {
    const corregida = mas5(t.fechaLimite).getTime();
    atrasadasInjustas += (t.entregas || []).filter((e) => e.estado === 'ATRASADA' && e.fechaEntrega && new Date(e.fechaEntrega).getTime() <= corregida).length;
  }

  const asistenciasRaras = await db.collection('asistencias').countDocuments({
    ...filtroEscuela,
    $expr: { $or: [{ $ne: [{ $hour: '$fecha' }, 0] }, { $ne: [{ $minute: '$fecha' }, 0] }] },
  });

  const listar = (titulo, docs, fmt) => {
    console.log(`${titulo}: ${docs.length}`);
    docs.slice(0, MUESTRA).forEach((d) => console.log(`  - ${fmt(d)}`));
    if (docs.length > MUESTRA) console.log(`  … y ${docs.length - MUESTRA} más`);
    console.log('');
  };
  listar('SEGURO  — eventos de todo el día con inicio 00:00Z', seguros, (e) => `${e._id} escuela ${e.escuelaId} "${e.titulo}": ${iso(e.fechaInicio)} → ${iso(e.fechaFin)}  ⇒ propuesto ${iso(mas5(e.fechaInicio))} → ${iso(mas5(e.fechaFin))}`);
  listar('PROBABLE — eventos con hora que en Colombia empiezan entre 00:00 y 05:59', eventosProbables, (e) => `${e._id} escuela ${e.escuelaId} "${e.titulo}": ${iso(e.fechaInicio)} (${horaColombia(e.fechaInicio)}:${String(minUTC(e.fechaInicio)).padStart(2, '0')} en Colombia)  ⇒ propuesto ${iso(mas5(e.fechaInicio))}`);
  listar('PROBABLE — tareas con fecha límite a las 23:59Z o 00:00Z', tareasProbables, (t) => `${t._id} escuela ${t.escuelaId} "${t.titulo}": ${iso(t.fechaLimite)}  ⇒ propuesto ${iso(mas5(t.fechaLimite))}`);
  console.log(`Entregas ATRASADA que con la fecha límite corregida habrían llegado a tiempo: ${atrasadasInjustas}`);
  console.log(`Control — asistencias que no están a medianoche UTC: ${asistenciasRaras} (esperado 0)\n`);
  console.log('No se modificó nada. Para corregir, apruebe primero la lista y se preparará un script aparte (con mongodump previo).');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ Error:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
