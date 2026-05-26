import mongoose from 'mongoose';
import Asistencia from '../models/asistencia.model';
import AlertaAsistencia from '../models/alertaAsistencia.model';
import Escuela from '../models/escuela.model';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import Notificacion from '../models/notificacion.model';
import emailService from './email.service';
import { EstadoAsistencia } from '../interfaces/IAsistencia';
import { NivelAlertaAsistencia } from '../interfaces/IAlertaAsistencia';
import { EstadoNotificacion, TipoNotificacion } from '../interfaces/INotificacion';

type DestinatarioAlerta = {
  _id: mongoose.Types.ObjectId;
  email?: string;
  nombre?: string;
  apellidos?: string;
};

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

      if (destinatario.email) {
        await emailService.sendEmail({
          to: destinatario.email,
          subject: titulo,
          html: `
            <p>Estimado/a ${destinatario.nombre ?? 'usuario'},</p>
            <p>${mensaje}</p>
            <p>Ingrese a <strong>EducaNexo360</strong> para revisar el detalle de la alerta.</p>
          `,
        });
      }
    } catch (error) {
      console.error('Error al enviar notificación de alerta de asistencia:', error);
    }
  }

  // Canal 3: FCM / push notifications se puede integrar aquí cuando el frontend móvil lo soporte.
}

export async function triggerAlertasAsistencia(
  estudianteId: string,
  cursoId: string,
  escuelaId: string,
  docenteId: string,
  periodoId?: string,
): Promise<void> {
  const periodoFinal = await obtenerPeriodoIdVigente(escuelaId, periodoId);

  const consultaAsistencias: Record<string, any> = {
    cursoId,
    escuelaId,
    'estudiantes.estudianteId': new mongoose.Types.ObjectId(estudianteId),
  };

  if (periodoFinal !== 'sin-periodo') {
    consultaAsistencias.periodoId = periodoFinal;
  }

  const registros = await Asistencia.find(consultaAsistencias).select('estudiantes');

  const entradas = registros.flatMap((registro: any) =>
    (registro.estudiantes || []).filter(
      (estudiante: any) => estudiante.estudianteId?.toString() === estudianteId,
    ),
  );

  const totalDias = entradas.length;
  if (totalDias === 0) {
    return;
  }

  const diasAusente = entradas.filter((entrada: any) => entrada.estado === EstadoAsistencia.AUSENTE).length;
  const porcentajeAusencias = (diasAusente / totalDias) * 100;

  const UMBRALES: { nivel: NivelAlertaAsistencia; minPct: number }[] = [
    { nivel: 'INMINENTE', minPct: 30 },
    { nivel: 'CRITICO', minPct: 25 },
    { nivel: 'ALERTA', minPct: 15 },
  ];

  const umbralesAplicables = UMBRALES.filter((umbral) => porcentajeAusencias >= umbral.minPct);
  if (umbralesAplicables.length === 0) {
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
        throw error;
      }
    }
  }
}
