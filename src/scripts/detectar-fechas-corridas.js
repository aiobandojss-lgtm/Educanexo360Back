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
 * K4 (22-nov):
 *   - Null guard: los documentos con la fecha nula, ausente o que no es fecha se OMITEN y se cuentan aparte. Antes
 *     new Date(null) daba 1970-01-01T00:00Z (falsos SEGURO/PROBABLE), una tarea con fechaLimite null hacía caer el
 *     script (mas5(null).getTime()) y una fecha guardada como texto hacía fallar el conteo de asistencias ($hour).
 *   - Conteos estimados: cada hallazgo se muestra como "X de Y" con el total de la colección (estimatedDocumentCount,
 *     que lee los metadatos sin recorrer la colección; con --escuela, countDocuments de esa escuela), y los conteos
 *     que salen de un criterio heurístico van marcados como ESTIMADOS.
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

const H5 = 5 * 3600e3;

// K4: solo un Date real y válido cuenta como fecha (null, undefined, textos y fechas inválidas se omiten)
const esFechaValida = (d) => d instanceof Date && !isNaN(d.getTime());
const iso = (d) => (esFechaValida(d) ? d.toISOString() : '-');
const horaUTC = (d) => d.getUTCHours();
const minUTC = (d) => d.getUTCMinutes();
const horaColombia = (d) => new Date(d.getTime() - H5).getUTCHours();
const mas5 = (d) => (esFechaValida(d) ? new Date(d.getTime() + H5) : null);

// Criterios (funciones puras, probadas en src/__tests__/k4-detectar-fechas-corridas.test.ts)
const esSeguroTodoElDia = (e) => esFechaValida(e.fechaInicio) && horaUTC(e.fechaInicio) === 0 && minUTC(e.fechaInicio) === 0;
const esEventoProbable = (e) => esFechaValida(e.fechaInicio) && horaColombia(e.fechaInicio) <= 5;
const esTareaProbable = (t) => {
  if (!esFechaValida(t.fechaLimite)) return false;
  const h = horaUTC(t.fechaLimite);
  const m = minUTC(t.fechaLimite);
  return (h === 23 && m === 59) || (h === 0 && m === 0);
};
// Entregas marcadas ATRASADA que con la fecha límite corregida (+5 h) habrían llegado a tiempo
const contarAtrasadasInjustas = (tareas) => {
  let total = 0;
  for (const t of tareas) {
    const corregida = mas5(t.fechaLimite);
    if (!corregida) continue;
    total += (t.entregas || []).filter(
      (e) => e && e.estado === 'ATRASADA' && esFechaValida(e.fechaEntrega) && e.fechaEntrega.getTime() <= corregida.getTime(),
    ).length;
  }
  return total;
};
const deTotal = (n, total) => `${n} de ${total}`;

async function main() {
  const URI = process.env.MONGODB_URI;
  const argEscuela = process.argv.find((a) => a.startsWith('--escuela='));
  const argMuestra = process.argv.find((a) => a.startsWith('--muestra='));
  const MUESTRA = argMuestra ? Math.max(0, parseInt(argMuestra.split('=')[1], 10) || 0) : 10;
  if (!URI) {
    console.error('❌ Defina MONGODB_URI (este script no lee el .env).');
    process.exit(1);
  }
  const escuelaId = argEscuela ? argEscuela.split('=')[1] : null;
  if (escuelaId !== null && !mongoose.isValidObjectId(escuelaId)) {
    console.error(`❌ --escuela no es un ID válido: "${escuelaId}"`);
    process.exit(1);
  }

  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const filtroEscuela = escuelaId ? { escuelaId: new mongoose.Types.ObjectId(escuelaId) } : {};
  // Total de la colección: estimado por metadatos (barato) o, con --escuela, exacto para esa escuela
  const total = (coleccion) =>
    escuelaId ? db.collection(coleccion).countDocuments(filtroEscuela) : db.collection(coleccion).estimatedDocumentCount();
  const sinFecha = (coleccion, campo, extra = {}) =>
    db.collection(coleccion).countDocuments({ ...filtroEscuela, ...extra, [campo]: { $not: { $type: 'date' } } });

  console.log(`\n🔍 SIMULACIÓN (solo lectura) en ${mongoose.connection.name}${escuelaId ? ` — escuela ${escuelaId}` : ''}\n`);

  const [totalEventos, totalTareas, totalAsistencias] = await Promise.all([
    total('eventocalendarios'),
    total('tareas'),
    total('asistencias'),
  ]);
  console.log(
    `Totales${escuelaId ? ' de la escuela' : ' (estimados)'}: eventos ${totalEventos}, tareas ${totalTareas}, asistencias ${totalAsistencias}`,
  );
  const [eventosSinFecha, tareasSinFecha, asistenciasSinFecha] = await Promise.all([
    sinFecha('eventocalendarios', 'fechaInicio'),
    sinFecha('tareas', 'fechaLimite'),
    sinFecha('asistencias', 'fecha'),
  ]);
  console.log(
    `Omitidos por fecha nula, ausente o que no es fecha: eventos ${eventosSinFecha}, tareas ${tareasSinFecha}, asistencias ${asistenciasSinFecha}\n`,
  );

  // Eventos de todo el día: distribución de la hora UTC de inicio (evidencia de la zona del servidor)
  const todoElDia = await db
    .collection('eventocalendarios')
    .find({ ...filtroEscuela, todoElDia: true, fechaInicio: { $type: 'date' } }, { projection: { titulo: 1, fechaInicio: 1, fechaFin: 1, escuelaId: 1, createdAt: 1 } })
    .toArray();
  const porHora = {};
  todoElDia.filter((e) => esFechaValida(e.fechaInicio)).forEach((e) => {
    const h = `${String(horaUTC(e.fechaInicio)).padStart(2, '0')}:${String(minUTC(e.fechaInicio)).padStart(2, '0')}Z`;
    porHora[h] = (porHora[h] || 0) + 1;
  });
  console.log(`Eventos de todo el día: ${deTotal(todoElDia.length, totalEventos)}. Hora de inicio (UTC): ${Object.entries(porHora).sort().map(([h, n]) => `${h}=${n}`).join(', ') || '-'}`);
  console.log('  (05:00Z = convención de la web; 00:00Z = creado por el APK 1.0.0 con el servidor en UTC)\n');

  const seguros = todoElDia.filter(esSeguroTodoElDia);
  const conHora = await db
    .collection('eventocalendarios')
    .find({ ...filtroEscuela, todoElDia: { $ne: true }, fechaInicio: { $type: 'date' } }, { projection: { titulo: 1, fechaInicio: 1, fechaFin: 1, escuelaId: 1 } })
    .toArray();
  const eventosProbables = conHora.filter(esEventoProbable);

  const tareas = await db
    .collection('tareas')
    .find({ ...filtroEscuela, fechaLimite: { $type: 'date' } }, { projection: { titulo: 1, fechaLimite: 1, escuelaId: 1, entregas: 1 } })
    .toArray();
  const tareasProbables = tareas.filter(esTareaProbable);
  const atrasadasInjustas = contarAtrasadasInjustas(tareasProbables);

  // $type: 'date' antes del $expr: $hour sobre un texto hace fallar la consulta completa
  const asistenciasRaras = await db.collection('asistencias').countDocuments({
    ...filtroEscuela,
    fecha: { $type: 'date' },
    $expr: { $or: [{ $ne: [{ $hour: '$fecha' }, 0] }, { $ne: [{ $minute: '$fecha' }, 0] }] },
  });

  const listar = (titulo, docs, totalColeccion, fmt) => {
    console.log(`${titulo}: ${deTotal(docs.length, totalColeccion)}`);
    docs.slice(0, MUESTRA).forEach((d) => console.log(`  - ${fmt(d)}`));
    if (docs.length > MUESTRA) console.log(`  … y ${docs.length - MUESTRA} más`);
    console.log('');
  };
  console.log('Los conteos SEGURO y PROBABLE son ESTIMADOS (criterios heurísticos): revise la muestra antes de aprobar.\n');
  listar('SEGURO  — eventos de todo el día con inicio 00:00Z', seguros, totalEventos, (e) => `${e._id} escuela ${e.escuelaId} "${e.titulo}": ${iso(e.fechaInicio)} → ${iso(e.fechaFin)}  ⇒ propuesto ${iso(mas5(e.fechaInicio))} → ${iso(mas5(e.fechaFin))}`);
  listar('PROBABLE (estimado) — eventos con hora que en Colombia empiezan entre 00:00 y 05:59', eventosProbables, totalEventos, (e) => `${e._id} escuela ${e.escuelaId} "${e.titulo}": ${iso(e.fechaInicio)} (${horaColombia(e.fechaInicio)}:${String(minUTC(e.fechaInicio)).padStart(2, '0')} en Colombia)  ⇒ propuesto ${iso(mas5(e.fechaInicio))}`);
  listar('PROBABLE (estimado) — tareas con fecha límite a las 23:59Z o 00:00Z', tareasProbables, totalTareas, (t) => `${t._id} escuela ${t.escuelaId} "${t.titulo}": ${iso(t.fechaLimite)}  ⇒ propuesto ${iso(mas5(t.fechaLimite))}`);
  console.log(`Entregas ATRASADA que con la fecha límite corregida habrían llegado a tiempo (estimado): ${atrasadasInjustas}`);
  console.log(`Control — asistencias que no están a medianoche UTC: ${deTotal(asistenciasRaras, totalAsistencias)} (esperado 0)\n`);
  console.log('No se modificó nada. Para corregir, apruebe primero la lista y se preparará un script aparte (con mongodump previo).');
  await mongoose.disconnect();
}

module.exports = { esFechaValida, mas5, esSeguroTodoElDia, esEventoProbable, esTareaProbable, contarAtrasadasInjustas };

// Solo se ejecuta al llamarlo directamente (node src/scripts/detectar-fechas-corridas.js), no al importarlo en pruebas
if (require.main === module) {
  main().catch(async (error) => {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
