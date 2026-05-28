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
import emailService from './email.service';
import { EstadoAsistencia } from '../interfaces/IAsistencia';
import { NivelAlertaAsistencia } from '../interfaces/IAlertaAsistencia';
import { EstadoNotificacion, TipoNotificacion } from '../interfaces/INotificacion';
import { TipoMensaje, PrioridadMensaje } from '../interfaces/IMensaje';

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
    ALERTA: 'ha alcanzado el 15% de ausencias',
    CRITICO: 'ha superado el 25% de ausencias',
    INMINENTE: 'está en riesgo de reprobación por inasistencia (más del 30%)',
  };
  const umbrales: Record<NivelAlertaAsistencia, string> = {
    ALERTA: '15%',
    CRITICO: '25%',
    INMINENTE: '30%',
  };
  return `
<p>El estudiante <strong>${nombreEstudiante}</strong> del curso <strong>${nombreCurso}</strong> ${descripciones[nivel]}.</p>

<p>
  <strong>Porcentaje actual de ausencias:</strong> ${porcentajeAusencias.toFixed(1)}%<br>
  <strong>Umbral superado:</strong> ${umbrales[nivel]}
</p>

<p>Por favor revise el módulo <strong>Asistencia → Informes → Riesgo</strong> para más detalles.</p>
  `.trim();
}

async function obtenerOCrearUsuarioSistema(): Promise<{ _id: mongoose.Types.ObjectId }> {
  const EMAIL_SISTEMA = 'sistema@educanexo360.com';
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
  return sistema as any;
}

async function obtenerPeriodoIdVigente(escuelaId: string, periodoId?: string): Promise<string> {
  if (periodoId) {
    return periodoId;
  }

  const escuela = (await Escuela.findById(escuelaId).select('periodos_academicos')) as any;
  const hoy = new Date();
  const periodoActivo = escuela?.periodos_academicos?.find((periodo: any) => {
    const fechaInicio = new Date(periodo.fecha_inicio);
    const fechaFin = new Date(periodo.fecha_fin);
    return fechaInicio <= hoy && hoy <= fechaFin;
  });

  return periodoActivo?._id?.toString() ?? 'sin-periodo';
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
  )}% de ausencias.`;

  const destinatariosUnicos = Array.from(
    new Map(destinatarios.map((destinatario) => [destinatario._id.toString(), destinatario])).values(),
  );

  if (destinatariosUnicos.length === 0) {
    return;
  }

  // Canal 1: Notificación interna (campanita)
  for (const destinatario of destinatariosUnicos) {
    try {
      await Notificacion.create({
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
      });
    } catch (error) {
      console.error('[AlertaAsistencia] Error en Canal 1:', error);
    }
  }

  // Canal 2: Mensaje en bandeja de recibidos
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
    await Mensaje.create({
      remitente: sistemaUser._id,
      destinatarios: destinatariosUnicos.map((d) => d._id),
      asunto: `${prefijos[nivel]} Alerta ${nivel} — ${nombreEstudiante}`,
      contenido: generarCuerpoMensaje(nivel, nombreEstudiante, nombreCurso, porcentajeAusencias),
      tipo: TipoMensaje.INSTITUCIONAL,
      prioridad: prioridades[nivel],
      escuelaId: new mongoose.Types.ObjectId(escuelaId),
    });
  } catch (errCanal2) {
    console.error('[AlertaAsistencia] Error en Canal 2:', errCanal2);
  }

  // Canal 3: Email
  for (const destinatario of destinatariosUnicos) {
    if (destinatario.email) {
      try {
        await emailService.sendEmail({
          to: destinatario.email,
          subject: titulo,
          html: `
            <p>Estimado/a ${destinatario.nombre ?? 'usuario'},</p>
            <p>${mensaje}</p>
            <p>Ingrese a <strong>EducaNexo360</strong> para revisar el detalle de la alerta.</p>
          `,
        });
      } catch (error) {
        console.error('[AlertaAsistencia] Error en Canal 3:', error);
      }
    }
  }

  // Canal 4: FCM / push notifications — pendiente cuando Flutter integre Firebase.
}

export async function triggerAlertasAsistencia(
  estudianteId: string,
  cursoId: string,
  escuelaId: string,
  docenteId: string,
  periodoId?: string,
): Promise<void> {
  console.log('[AlertaAsistencia] trigger iniciando para estudianteId:', estudianteId);

  const periodoFinal = await obtenerPeriodoIdVigente(escuelaId, periodoId);

  const registros = await Asistencia.find({
    cursoId,
    escuelaId,
    'estudiantes.estudianteId': new mongoose.Types.ObjectId(estudianteId),
  }).select('estudiantes');

  const entradas = registros.flatMap((registro: any) =>
    (registro.estudiantes || []).filter(
      (estudiante: any) => estudiante.estudianteId?.toString() === estudianteId,
    ),
  );

  const totalDias = entradas.length;
  console.log('[AlertaAsistencia] registros:', registros.length, '| entradas aplanadas:', totalDias);

  if (totalDias === 0) {
    console.log('[AlertaAsistencia] salida temprana: 0 entradas');
    return;
  }

  const diasAusente = entradas.filter((entrada: any) => entrada.estado === EstadoAsistencia.AUSENTE).length;
  const porcentajeAusencias = (diasAusente / totalDias) * 100;
  console.log('[AlertaAsistencia] ausentes:', diasAusente, '/', totalDias, '=', porcentajeAusencias.toFixed(1) + '%');

  const UMBRALES: { nivel: NivelAlertaAsistencia; minPct: number }[] = [
    { nivel: 'INMINENTE', minPct: 30 },
    { nivel: 'CRITICO', minPct: 25 },
    { nivel: 'ALERTA', minPct: 15 },
  ];

  const umbralesAplicables = UMBRALES.filter((umbral) => porcentajeAusencias >= umbral.minPct);
  console.log('[AlertaAsistencia] umbrales aplicables:', umbralesAplicables.map(u => u.nivel));

  if (umbralesAplicables.length === 0) {
    console.log('[AlertaAsistencia] salida temprana: porcentaje no supera ningún umbral');
    return;
  }

  const [administrativos, estudiante, docente, curso] = await Promise.all([
    Usuario.find({
      escuelaId,
      tipo: { $in: ['RECTOR', 'COORDINADOR'] },
      estado: 'ACTIVO',
    }).select('_id email nombre apellidos'),
    Usuario.findById(estudianteId).select('nombre apellidos'),
    Usuario.findById(docenteId).select('_id email nombre apellidos'),
    Curso.findById(cursoId).select('nombre'),
  ]);

  const destinatarios = [
    ...(administrativos as DestinatarioAlerta[]),
    ...(docente ? [docente as DestinatarioAlerta] : []),
  ];

  if (destinatarios.length === 0) {
    return;
  }

  const nombreEstudiante = `${(estudiante as any)?.nombre ?? ''} ${(estudiante as any)?.apellidos ?? ''}`.trim();
  const nombreCurso = (curso as any)?.nombre ?? '';

  for (const umbral of umbralesAplicables) {
    console.log('[AlertaAsistencia] intentando crear alerta nivel:', umbral.nivel);
    try {
      await AlertaAsistencia.create({
        estudianteId,
        cursoId,
        escuelaId,
        nivel: umbral.nivel,
        porcentajeAusencias,
        periodoId: periodoFinal,
        notificadosIds: destinatarios.map((destinatario) => destinatario._id),
      });
      console.log('[AlertaAsistencia] alerta creada:', umbral.nivel);

      await enviarNotificacionesAlerta({
        nivel: umbral.nivel,
        nombreEstudiante,
        nombreCurso,
        porcentajeAusencias,
        destinatarios,
        escuelaId,
        estudianteId,
        cursoId,
        periodoId: periodoFinal,
      });
    } catch (error: any) {
      if (error?.code !== 11000) {
        console.error('[AlertaAsistencia] error no-11000 en nivel', umbral.nivel, ':', error);
        throw error;
      }
      console.log('[AlertaAsistencia] alerta nivel', umbral.nivel, 'ya existe (11000) — omitida');
    }
  }
}
