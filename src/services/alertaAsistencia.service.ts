import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import Asistencia from '../models/asistencia.model';
import AlertaAsistencia from '../models/alertaAsistencia.model';
import Escuela from '../models/escuela.model';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import Notificacion from '../models/notificacion.model';
import Mensaje from '../models/mensaje.model';
import { encolarCorreo } from './email.service';
import pushNotificationService from './pushNotification.service';
import { escapeHtml } from '../utils/escapeHtml';
import { logger } from '../utils/logger';
import { EstadoAsistencia } from '../interfaces/IAsistencia';
import { NivelAlertaAsistencia } from '../interfaces/IAlertaAsistencia';
import { EstadoNotificacion, TipoNotificacion } from '../interfaces/INotificacion';
import { TipoMensaje, PrioridadMensaje } from '../interfaces/IMensaje';
import { finDelDiaColombia } from '../utils/fechas';

type DestinatarioAlerta = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  nombre?: string;
  apellidos?: string;
};

function generarCuerpoMensaje(
  nivel: NivelAlertaAsistencia,
  nombreEstudiante: string,
  nombreCurso: string,
  porcentajeAusencias: number,
): string {
  const descripciones: Record<NivelAlertaAsistencia, string> = {
    ALERTA: 'ha alcanzado el 15% de inasistencia general en el periodo',
    CRITICO: 'ha superado el 25% de inasistencia general en el periodo',
    INMINENTE: 'está en riesgo de reprobación por inasistencia general en el periodo (más del 30%)',
  };
  const umbrales: Record<NivelAlertaAsistencia, string> = {
    ALERTA: '15%',
    CRITICO: '25%',
    INMINENTE: '30%',
  };
  // Nombres escapados (Fase 4.4): el cuerpo es HTML que la web muestra en la bandeja
  return `
<p>El estudiante <strong>${escapeHtml(nombreEstudiante)}</strong> del curso <strong>${escapeHtml(nombreCurso)}</strong> ${descripciones[nivel]}.</p>

<p>
  <strong>Inasistencia general en el periodo (todas las asignaturas del curso):</strong> ${porcentajeAusencias.toFixed(1)}%<br>
  <strong>Umbral superado:</strong> ${umbrales[nivel]}
</p>

<p>Por favor revise el módulo <strong>Asistencia → Informes → Riesgo</strong> para más detalles.</p>
  `.trim();
}

let usuarioSistemaCache: { _id: mongoose.Types.ObjectId } | null = null;

async function obtenerOCrearUsuarioSistema(): Promise<{ _id: mongoose.Types.ObjectId }> {
  const EMAIL_SISTEMA = 'sistema@educanexo360.com';
  if (usuarioSistemaCache) return usuarioSistemaCache;

  // bcrypt solo si hay que crearlo (antes se calculaba en CADA llamada: CPU bloqueando el proceso)
  const existente = await Usuario.findOne({ email: EMAIL_SISTEMA }).select('_id').lean();
  if (existente) {
    usuarioSistemaCache = { _id: existente._id as mongoose.Types.ObjectId };
    return usuarioSistemaCache;
  }

  // findOneAndUpdate con upsert atómico — evita race condition cuando varios triggers
  // corren en paralelo para el mismo registro de asistencia.
  // Pre-save hook no corre con findOneAndUpdate, por eso hasheamos el password aquí.
  const sistema = await Usuario.findOneAndUpdate(
    { email: EMAIL_SISTEMA },
    {
      $setOnInsert: {
        email: EMAIL_SISTEMA,
        password: await bcrypt.hash(randomUUID(), 10),
        nombre: 'Sistema',
        apellidos: 'EducaNexo360',
        tipo: 'SUPER_ADMIN',
        estado: 'ACTIVO',
      },
    },
    { upsert: true, new: true, select: '_id' },
  );
  usuarioSistemaCache = sistema as any;
  return sistema as any;
}

// Periodo vigente (o el indicado) con su rango de fechas, para calcular el porcentaje SOLO de ese periodo
async function obtenerPeriodoVigente(
  escuelaId: string,
  periodoId?: string,
): Promise<{ id: string; desde: Date; hastaExclusivo: Date } | null> {
  const escuela = (await Escuela.findById(escuelaId).select('periodos_academicos').lean()) as any;
  const periodos: any[] = escuela?.periodos_academicos || [];
  const hoy = new Date();
  const periodo = periodoId
    ? periodos.find((p) => String(p._id) === String(periodoId))
    : // hasta el FIN del día de fecha_fin (hora Colombia): el último día del periodo no cae en 'sin-periodo'
      periodos.find((p) => new Date(p.fecha_inicio) <= hoy && hoy <= finDelDiaColombia(new Date(p.fecha_fin)));
  // H5: sin periodo no se evalúa (antes 'sin-periodo' sin filtro de fechas: todo el histórico)
  if (!periodo) return null;
  // Las asistencias guardan la fecha como medianoche UTC, pero la web guarda los periodos en hora local
  // (new Date(año, 3, 1) = 05:00Z). Ambos límites se normalizan por FECHA CALENDARIO con las partes UTC,
  // así sirve si el periodo se guardó a 00:00Z o a 05:00Z (auditoría 3.V; antes el primer día de cada
  // periodo no caía en ninguno). El rango termina (exclusivo) en la medianoche UTC del día siguiente a
  // fecha_fin (3.N); finDelDiaColombia solo decide arriba si "hoy" cae en el periodo.
  const inicio = new Date(periodo.fecha_inicio);
  const fin = new Date(periodo.fecha_fin);
  return {
    id: String(periodo._id),
    desde: new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate())),
    hastaExclusivo: new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate() + 1)),
  };
}

async function enviarNotificacionesAlerta(params: {
  nivel: NivelAlertaAsistencia;
  nombreEstudiante: string;
  nombreCurso: string;
  porcentajeAusencias: number;
  destinatarios: DestinatarioAlerta[];
  escuelaId: string;
  estudianteId: string;
  cursoId: string;
  periodoId: string;
}): Promise<void> {
  const {
    nivel,
    nombreEstudiante,
    nombreCurso,
    porcentajeAusencias,
    destinatarios,
    escuelaId,
    estudianteId,
    cursoId,
    periodoId,
  } = params;

  const etiquetas: Record<NivelAlertaAsistencia, string> = {
    ALERTA: 'Alerta de asistencia',
    CRITICO: 'Asistencia crítica',
    INMINENTE: 'Riesgo de inasistencia',
  };

  const titulo = etiquetas[nivel];
  const mensaje = `${nombreEstudiante} en ${nombreCurso} presenta ${porcentajeAusencias.toFixed(
    1,
  )}% de inasistencia general en el periodo.`;

  const destinatariosUnicos = Array.from(
    new Map(destinatarios.map((destinatario) => [destinatario._id.toString(), destinatario])).values(),
  );

  if (destinatariosUnicos.length === 0) {
    return;
  }

  // Canal 1: Notificación interna (campanita) — un solo insertMany (Fase 4.6; antes create en loop)
  try {
    await Notificacion.insertMany(
      destinatariosUnicos.map((destinatario) => ({
        usuarioId: destinatario._id,
        titulo,
        mensaje,
        tipo: TipoNotificacion.ALERTA_ASISTENCIA,
        estado: EstadoNotificacion.PENDIENTE,
        escuelaId,
        metadata: {
          nivel,
          porcentajeAusencias,
          estudianteId,
          cursoId,
          periodoId,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    console.error('[AlertaAsistencia] Error en Canal 1:', error);
  }

  // Canal 2: Mensaje en bandeja de recibidos
  let mensajeAlertaId: string | undefined;
  try {
    const prefijos: Record<NivelAlertaAsistencia, string> = {
      ALERTA: '⚠️',
      CRITICO: '🔴',
      INMINENTE: '🚨',
    };
    const prioridades: Record<NivelAlertaAsistencia, PrioridadMensaje> = {
      ALERTA: PrioridadMensaje.NORMAL,
      CRITICO: PrioridadMensaje.NORMAL,
      INMINENTE: PrioridadMensaje.ALTA,
    };
    const sistemaUser = await obtenerOCrearUsuarioSistema();
    mensajeAlertaId = await Mensaje.create({
      remitente: sistemaUser._id,
      destinatarios: destinatariosUnicos.map((d) => d._id),
      asunto: `${prefijos[nivel]} Alerta ${nivel} — ${nombreEstudiante}`,
      contenido: generarCuerpoMensaje(nivel, nombreEstudiante, nombreCurso, porcentajeAusencias),
      tipo: TipoMensaje.INSTITUCIONAL,
      prioridad: prioridades[nivel],
      escuelaId: new mongoose.Types.ObjectId(escuelaId),
    }).then((m: any) => String(m._id));
  } catch (errCanal2) {
    console.error('[AlertaAsistencia] Error en Canal 2:', errCanal2);
  }

  // Canal 3: Email por la cola con prioridad ALTA (Fase 4.4): usa el cupo reservado, se reintenta y la
  // plantilla escapa nombres y mensaje. Antes era un envío secuencial por destinatario.
  try {
    await encolarCorreo({
      destinatarios: destinatariosUnicos
        .filter((d) => d.email)
        .map((d) => ({ email: d.email as string, nombre: d.nombre, usuarioId: String(d._id) })),
      plantilla: 'alerta-asistencia',
      datos: { titulo, mensaje },
      prioridad: 'alta',
      escuelaId,
    });
  } catch (error) {
    console.error('[AlertaAsistencia] Error en Canal 3:', error);
  }

  // Canal 4: push por la cola con prioridad ALTA (Fase 4.3). Abre el mensaje de la alerta en la app
  // (tipo 'mensaje', que la app ya sabe enrutar).
  try {
    await pushNotificationService.encolarPush({
      usuarioIds: destinatariosUnicos.map((d) => String(d._id)),
      contenido: {
        titulo,
        mensaje,
        data: { tipo: 'mensaje', ...(mensajeAlertaId && { mensajeId: mensajeAlertaId }), prioridad: 'ALTA' },
      },
      prioridad: 'alta',
      escuelaId,
    });
  } catch (error) {
    console.error('[AlertaAsistencia] Error en Canal 4:', error);
  }
}

// Mínimo de clases registradas en el periodo antes de evaluar umbrales: al inicio del periodo 1 ausencia
// de 1 clase = 100% y disparaba todas las alertas (configurable con ALERTA_MIN_CLASES)
export const MIN_CLASES_ALERTA = Math.max(parseInt(process.env.ALERTA_MIN_CLASES || '8', 10) || 8, 1);

// Rango de cada nivel para no repetir alertas de nivel igual o menor en el mismo periodo
const RANGO_NIVEL: Record<string, number> = { ALERTA: 1, CRITICO: 2, INMINENTE: 3 };

const UMBRALES: { nivel: NivelAlertaAsistencia; minPct: number }[] = [
  { nivel: 'INMINENTE', minPct: 30 },
  { nivel: 'CRITICO', minPct: 25 },
  { nivel: 'ALERTA', minPct: 15 },
];

// Ejecuta tareas con concurrencia acotada (evita lanzar decenas de promesas a la vez)
async function conConcurrencia<T>(items: T[], limite: number, tarea: (item: T) => Promise<void>) {
  let indice = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (indice < items.length) {
      const item = items[indice++];
      await tarea(item).catch((error) => console.error('[AlertaAsistencia]', error));
    }
  });
  await Promise.all(trabajadores);
}

/**
 * Evalúa las alertas de inasistencia de los estudiantes de un curso al finalizar un registro.
 *
 * Reglas (H5, decisión de Aymer):
 * - Porcentaje = INASISTENCIA GENERAL en el periodo vigente: ausencias sobre todas las clases registradas del curso,
 *   de TODAS las asignaturas, contando solo registros FINALIZADOS (los borradores no cuentan).
 * - Sin periodo vigente no se genera alerta (se registra un warn con escuela y curso).
 * - Destinatarios: el DIRECTOR DE GRUPO del curso + rector(es) + coordinadores activos. Ya no el docente que finalizó
 *   el registro (recibía alertas de inasistencia de otras materias). docenteId queda solo por compatibilidad.
 * Una sola agregación por curso filtrada por el periodo vigente (antes: una consulta por estudiante
 * sobre todo el histórico, bcrypt por alerta y todos los estudiantes en paralelo sin límite).
 */
export async function procesarAlertasAsistenciaCurso(params: {
  estudianteIds: string[];
  cursoId: string;
  escuelaId: string;
  docenteId: string;
  periodoId?: string;
}): Promise<void> {
  const { cursoId, escuelaId } = params;
  const estudianteIds = [...new Set(params.estudianteIds)].filter((id) => mongoose.isValidObjectId(id));
  if (estudianteIds.length === 0) return;

  const periodo = await obtenerPeriodoVigente(escuelaId, params.periodoId);
  if (!periodo) {
    logger.warn(`[AlertaAsistencia] Sin periodo vigente (escuela ${escuelaId}, curso ${cursoId}): no se generan alertas`);
    return;
  }

  const match: any = {
    cursoId: new mongoose.Types.ObjectId(cursoId),
    escuelaId: new mongoose.Types.ObjectId(escuelaId),
    finalizado: true, // H5: los borradores no cuentan
    fecha: { $gte: periodo.desde, $lt: periodo.hastaExclusivo },
  };

  const conteos = await Asistencia.aggregate([
    { $match: match },
    { $project: { estudiantes: { estudianteId: 1, estado: 1 } } },
    { $unwind: '$estudiantes' },
    { $match: { 'estudiantes.estudianteId': { $in: estudianteIds.map((id) => new mongoose.Types.ObjectId(id)) } } },
    {
      $group: {
        _id: '$estudiantes.estudianteId',
        total: { $sum: 1 },
        ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', EstadoAsistencia.AUSENTE] }, 1, 0] } },
      },
    },
  ]);

  // Alertas ya emitidas en el periodo: nivel máximo por estudiante
  const idsConClases = conteos.filter((c: any) => c.total >= MIN_CLASES_ALERTA).map((c: any) => c._id);
  const previas = idsConClases.length
    ? await AlertaAsistencia.find({ estudianteId: { $in: idsConClases }, periodoId: periodo.id })
        .select('estudianteId nivel')
        .lean()
    : [];
  const nivelPrevio = new Map<string, number>();
  previas.forEach((a: any) => {
    const k = String(a.estudianteId);
    nivelPrevio.set(k, Math.max(nivelPrevio.get(k) || 0, RANGO_NIVEL[a.nivel] || 0));
  });

  const enRiesgo = conteos
    // Sin suficientes clases en el periodo no se evalúa (evita 100% con 1 ausencia de 1 clase)
    .filter((c: any) => c.total >= MIN_CLASES_ALERTA)
    .map((c: any) => ({ estudianteId: String(c._id), porcentaje: (c.ausentes / c.total) * 100 }))
    .map((c) => {
      // Solo el nivel MÁS ALTO alcanzado, y solo si supera el máximo ya alertado en el periodo
      const alcanzado = UMBRALES.find((u) => c.porcentaje >= u.minPct); // UMBRALES va de mayor a menor
      const previo = nivelPrevio.get(c.estudianteId) || 0;
      const umbrales = alcanzado && RANGO_NIVEL[alcanzado.nivel] > previo ? [alcanzado] : [];
      return { ...c, umbrales };
    })
    .filter((c) => c.umbrales.length > 0);
  if (enRiesgo.length === 0) return;

  // Datos comunes una sola vez para todo el curso
  const [administrativos, curso, estudiantes] = await Promise.all([
    Usuario.find({ escuelaId, tipo: { $in: ['RECTOR', 'COORDINADOR'] }, estado: 'ACTIVO' })
      .select('_id email nombre apellidos')
      .lean(),
    Curso.findOne({ _id: cursoId, escuelaId }).select('nombre director_grupo').lean(),
    Usuario.find({ _id: { $in: enRiesgo.map((e) => e.estudianteId) }, escuelaId }).select('nombre apellidos').lean(),
  ]);
  const idDirector = (curso as any)?.director_grupo;
  const director = idDirector
    ? await Usuario.findOne({ _id: idDirector, escuelaId, estado: 'ACTIVO' }).select('_id email nombre apellidos').lean()
    : null;

  // Sin repetir (un coordinador puede ser también director de grupo)
  const destinatarios = Array.from(
    new Map(
      [...(director ? [director] : []), ...(administrativos as any[])].map((d: any) => [String(d._id), d as DestinatarioAlerta]),
    ).values(),
  );
  if (destinatarios.length === 0) {
    // Curso sin director de grupo y escuela sin rector ni coordinadores activos: la alerta no tiene a quién llegar
    logger.warn(`[AlertaAsistencia] Sin destinatarios (escuela ${escuelaId}, curso ${cursoId}): asigne director de grupo, rector o coordinadores`);
    return;
  }

  const nombres = new Map((estudiantes as any[]).map((e) => [String(e._id), `${e.nombre ?? ''} ${e.apellidos ?? ''}`.trim()]));
  const nombreCurso = (curso as any)?.nombre ?? '';

  await conConcurrencia(enRiesgo, 5, async ({ estudianteId, porcentaje, umbrales }) => {
    for (const umbral of umbrales) {
      try {
        await AlertaAsistencia.create({
          estudianteId,
          cursoId,
          escuelaId,
          nivel: umbral.nivel,
          porcentajeAusencias: porcentaje,
          periodoId: periodo.id,
          notificadosIds: destinatarios.map((destinatario) => destinatario._id),
        });

        await enviarNotificacionesAlerta({
          nivel: umbral.nivel,
          nombreEstudiante: nombres.get(estudianteId) || '',
          nombreCurso,
          porcentajeAusencias: porcentaje,
          destinatarios,
          escuelaId,
          estudianteId,
          cursoId,
          periodoId: periodo.id,
        });
      } catch (error: any) {
        // 11000: la alerta de ese nivel ya existe para el periodo → se omite
        if (error?.code !== 11000) throw error;
      }
    }
  });
}

// Compatibilidad: evaluación de un solo estudiante (usa la versión por curso)
export async function triggerAlertasAsistencia(
  estudianteId: string,
  cursoId: string,
  escuelaId: string,
  docenteId: string,
  periodoId?: string,
): Promise<void> {
  await procesarAlertasAsistenciaCurso({ estudianteIds: [estudianteId], cursoId, escuelaId, docenteId, periodoId });
}
