/**
 * medir-produccion.js — Auditoría H1: mide tiempos de respuesta REALES de la API desde el PC de quien lo corre
 * (red + servidor + base). SOLO LECTURA: únicamente peticiones GET (más el POST de login); cualquier otro método
 * lo bloquea el propio script. Pensado para correrlo contra PRODUCCIÓN con una cuenta del colegio demo.
 *
 * Variables (nunca en el código; no lee el .env):
 *   MEDIR_URL               base de la API, p. ej. https://<dominio>/educanexo360/api
 *   MEDIR_EMAIL_ACUDIENTE   cuenta ACUDIENTE del colegio demo (con al menos un hijo)
 *   MEDIR_PASSWORD          su contraseña
 *   MEDIR_EMAIL_DOCENTE     (opcional) cuenta DOCENTE del colegio demo: mide también destinatarios como docente
 *   MEDIR_PASSWORD_DOCENTE  (opcional) si es distinta de MEDIR_PASSWORD
 *   MEDIR_REPETICIONES      llamadas por endpoint (7 por defecto)
 *   MEDIR_ESTUDIANTE_ID     (opcional) hijo a consultar; por defecto el primero del acudiente
 *
 * Uso (PowerShell):
 *   $env:MEDIR_URL="https://.../educanexo360/api"; $env:MEDIR_EMAIL_ACUDIENTE="..."; $env:MEDIR_PASSWORD="..."
 *   node src/scripts/medir-produccion.js
 *
 * Qué reporta por endpoint: estado HTTP, la PRIMERA llamada (sin caché del servidor) y, del resto, mediana, p95 y
 * máximo en ms. /health es la línea base: red + servidor sin base de datos. Lo que un endpoint tarde POR ENCIMA de
 * /health es tiempo del servidor y de las consultas a Atlas. No imprime tokens ni contraseñas.
 */
'use strict';
require('./_entorno'); // H7: quita espacios sobrantes de las variables de entorno

const BASE = (process.env.MEDIR_URL || '').replace(/\/+$/, '');
const EMAIL_ACU = process.env.MEDIR_EMAIL_ACUDIENTE;
const PASS = process.env.MEDIR_PASSWORD;
const EMAIL_DOC = process.env.MEDIR_EMAIL_DOCENTE;
const PASS_DOC = process.env.MEDIR_PASSWORD_DOCENTE || PASS;
const REPETICIONES = Math.max(2, parseInt(process.env.MEDIR_REPETICIONES || '7', 10));
const PAUSA_MS = 350; // respeta los límites de peticiones (60/min por prefijo)

if (!BASE || !EMAIL_ACU || !PASS) {
  console.error('❌ Defina MEDIR_URL, MEDIR_EMAIL_ACUDIENTE y MEDIR_PASSWORD (ver el encabezado del script).');
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Única salida a la red: solo GET, salvo el login. */
async function pedir(metodo, ruta, { token, body } = {}) {
  const esLogin = metodo === 'POST' && ruta === '/auth/login';
  if (metodo !== 'GET' && !esLogin) throw new Error(`Bloqueado: el script es de solo lectura (${metodo} ${ruta})`);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const t0 = process.hrtime.bigint();
  const r = await fetch(BASE + ruta, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text(); // se mide hasta recibir la respuesta completa
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null;
  try { json = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
  return { status: r.status, ms, json, bytes: texto.length };
}

const login = async (email, password) => pedir('POST', '/auth/login', { body: { email, password } });

const percentil = (ordenados, p) => ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
const fmt = (n) => (n === undefined ? '-' : `${Math.round(n)}`);

async function medir(nombre, fn, repeticiones = REPETICIONES) {
  const tiempos = [];
  const estados = new Set();
  let bytes = 0;
  for (let i = 0; i < repeticiones; i++) {
    const r = await fn();
    tiempos.push(r.ms);
    estados.add(r.status);
    bytes = r.bytes;
    await dormir(PAUSA_MS);
  }
  const resto = tiempos.slice(1).sort((a, b) => a - b);
  return { nombre, estados: [...estados].join('/'), primera: tiempos[0], mediana: percentil(resto, 50), p95: percentil(resto, 95), max: resto[resto.length - 1], kb: (bytes / 1024).toFixed(1) };
}

async function main() {
  console.log(`\n⏱️  Midiendo ${BASE} (${REPETICIONES} llamadas por endpoint; solo lectura)\n`);
  const filas = [];
  filas.push(await medir('GET /health (línea base: red, sin base de datos)', () => pedir('GET', '/health')));

  // Login: máximo 5 (límite de 10/min por IP y correo)
  filas.push(await medir('POST /auth/login (acudiente)', () => login(EMAIL_ACU, PASS), Math.min(5, REPETICIONES)));
  const sesion = await login(EMAIL_ACU, PASS);
  const token = sesion.json?.data?.tokens?.access?.token;
  if (!token) {
    console.error(`❌ No se pudo iniciar sesión como acudiente (HTTP ${sesion.status}). Revise el correo y la contraseña.`);
    process.exit(1);
  }
  const hijo = process.env.MEDIR_ESTUDIANTE_ID || String(sesion.json?.data?.user?.info_academica?.estudiantes_asociados?.[0] || '');
  const get = (ruta) => () => pedir('GET', ruta, { token });

  filas.push(await medir('GET /mensajes (bandeja)', get('/mensajes?bandeja=recibidos&pagina=1&limite=20')));
  filas.push(await medir('GET /mensajes/destinatarios-disponibles', get('/mensajes/destinatarios-disponibles')));
  filas.push(await medir('GET /mensajes/destinatarios-disponibles?q=a', get('/mensajes/destinatarios-disponibles?q=a')));
  if (hijo) filas.push(await medir('GET /asistencia/estadisticas/estudiante/:id', get(`/asistencia/estadisticas/estudiante/${hijo}`)));
  else console.log('⚠️  El acudiente no tiene hijos asociados: se omite /asistencia/estadisticas/estudiante/:id');
  filas.push(await medir('GET /tareas', get('/tareas')));
  filas.push(await medir('GET /calendario', get('/calendario')));
  filas.push(await medir('GET /anuncios', get('/anuncios')));
  filas.push(await medir('GET /usuarios/me/preferencias', get('/usuarios/me/preferencias')));

  if (EMAIL_DOC) {
    const sDoc = await login(EMAIL_DOC, PASS_DOC);
    const tDoc = sDoc.json?.data?.tokens?.access?.token;
    if (tDoc) {
      filas.push(await medir('GET /mensajes/destinatarios-disponibles (docente)', () => pedir('GET', '/mensajes/destinatarios-disponibles', { token: tDoc })));
      filas.push(await medir('GET /mensajes/destinatarios-disponibles?q=a (docente)', () => pedir('GET', '/mensajes/destinatarios-disponibles?q=a', { token: tDoc })));
    } else console.log(`⚠️  No se pudo iniciar sesión como docente (HTTP ${sDoc.status}): se omiten sus mediciones`);
  }

  const ancho = Math.max(...filas.map((f) => f.nombre.length));
  console.log(`${'Endpoint'.padEnd(ancho)}  HTTP     1ª(ms)  mediana  p95    máx    KB`);
  for (const f of filas) {
    console.log(`${f.nombre.padEnd(ancho)}  ${f.estados.padEnd(7)}  ${fmt(f.primera).padStart(6)}  ${fmt(f.mediana).padStart(7)}  ${fmt(f.p95).padStart(5)}  ${fmt(f.max).padStart(5)}  ${f.kb}`);
  }
  const base = filas[0].mediana;
  const lentos = filas.slice(1).filter((f) => f.mediana - base > 1000);
  console.log(`\nLínea base (/health): mediana ${fmt(base)} ms. ${lentos.length ? `Más de 1 s por encima de la línea base: ${lentos.map((f) => f.nombre).join('; ')}` : 'Ningún endpoint supera la línea base en más de 1 s.'}`);
  console.log('Comparta esta tabla tal cual (no contiene tokens ni contraseñas).');
}

main().catch((e) => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
