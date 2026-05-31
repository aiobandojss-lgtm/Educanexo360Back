"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerAlertasAsistencia = triggerAlertasAsistencia;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const asistencia_model_1 = __importDefault(require("../models/asistencia.model"));
const alertaAsistencia_model_1 = __importDefault(require("../models/alertaAsistencia.model"));
const escuela_model_1 = __importDefault(require("../models/escuela.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const email_service_1 = __importDefault(require("./email.service"));
const IAsistencia_1 = require("../interfaces/IAsistencia");
const INotificacion_1 = require("../interfaces/INotificacion");
const IMensaje_1 = require("../interfaces/IMensaje");
function generarCuerpoMensaje(nivel, nombreEstudiante, nombreCurso, porcentajeAusencias) {
    const descripciones = {
        ALERTA: 'ha alcanzado el 15% de ausencias',
        CRITICO: 'ha superado el 25% de ausencias',
        INMINENTE: 'está en riesgo de reprobación por inasistencia (más del 30%)',
    };
    const umbrales = {
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
async function obtenerOCrearUsuarioSistema() {
    const EMAIL_SISTEMA = 'sistema@educanexo360.com';
    const sistema = await usuario_model_1.default.findOneAndUpdate({ email: EMAIL_SISTEMA }, {
        $setOnInsert: {
            email: EMAIL_SISTEMA,
            password: await bcryptjs_1.default.hash((0, crypto_1.randomUUID)(), 10),
            nombre: 'Sistema',
            apellidos: 'EducaNexo360',
            tipo: 'SUPER_ADMIN',
            estado: 'ACTIVO',
        },
    }, { upsert: true, new: true, select: '_id' });
    return sistema;
}
async function obtenerPeriodoIdVigente(escuelaId, periodoId) {
    if (periodoId) {
        return periodoId;
    }
    const escuela = (await escuela_model_1.default.findById(escuelaId).select('periodos_academicos'));
    const hoy = new Date();
    const periodoActivo = escuela?.periodos_academicos?.find((periodo) => {
        const fechaInicio = new Date(periodo.fecha_inicio);
        const fechaFin = new Date(periodo.fecha_fin);
        return fechaInicio <= hoy && hoy <= fechaFin;
    });
    return periodoActivo?._id?.toString() ?? 'sin-periodo';
}
async function enviarNotificacionesAlerta(params) {
    const { nivel, nombreEstudiante, nombreCurso, porcentajeAusencias, destinatarios, escuelaId, estudianteId, cursoId, periodoId, } = params;
    const etiquetas = {
        ALERTA: 'Alerta de asistencia',
        CRITICO: 'Asistencia crítica',
        INMINENTE: 'Riesgo de inasistencia',
    };
    const titulo = etiquetas[nivel];
    const mensaje = `${nombreEstudiante} en ${nombreCurso} presenta ${porcentajeAusencias.toFixed(1)}% de ausencias.`;
    const destinatariosUnicos = Array.from(new Map(destinatarios.map((destinatario) => [destinatario._id.toString(), destinatario])).values());
    if (destinatariosUnicos.length === 0) {
        return;
    }
    for (const destinatario of destinatariosUnicos) {
        try {
            await notificacion_model_1.default.create({
                usuarioId: destinatario._id,
                titulo,
                mensaje,
                tipo: INotificacion_1.TipoNotificacion.ALERTA_ASISTENCIA,
                estado: INotificacion_1.EstadoNotificacion.PENDIENTE,
                escuelaId,
                metadata: {
                    nivel,
                    porcentajeAusencias,
                    estudianteId,
                    cursoId,
                    periodoId,
                },
            });
        }
        catch (error) {
            console.error('[AlertaAsistencia] Error en Canal 1:', error);
        }
    }
    try {
        const prefijos = {
            ALERTA: '⚠️',
            CRITICO: '🔴',
            INMINENTE: '🚨',
        };
        const prioridades = {
            ALERTA: IMensaje_1.PrioridadMensaje.NORMAL,
            CRITICO: IMensaje_1.PrioridadMensaje.NORMAL,
            INMINENTE: IMensaje_1.PrioridadMensaje.ALTA,
        };
        const sistemaUser = await obtenerOCrearUsuarioSistema();
        await mensaje_model_1.default.create({
            remitente: sistemaUser._id,
            destinatarios: destinatariosUnicos.map((d) => d._id),
            asunto: `${prefijos[nivel]} Alerta ${nivel} — ${nombreEstudiante}`,
            contenido: generarCuerpoMensaje(nivel, nombreEstudiante, nombreCurso, porcentajeAusencias),
            tipo: IMensaje_1.TipoMensaje.INSTITUCIONAL,
            prioridad: prioridades[nivel],
            escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
        });
    }
    catch (errCanal2) {
        console.error('[AlertaAsistencia] Error en Canal 2:', errCanal2);
    }
    for (const destinatario of destinatariosUnicos) {
        if (destinatario.email) {
            try {
                await email_service_1.default.sendEmail({
                    to: destinatario.email,
                    subject: titulo,
                    html: `
            <p>Estimado/a ${destinatario.nombre ?? 'usuario'},</p>
            <p>${mensaje}</p>
            <p>Ingrese a <strong>EducaNexo360</strong> para revisar el detalle de la alerta.</p>
          `,
                });
            }
            catch (error) {
                console.error('[AlertaAsistencia] Error en Canal 3:', error);
            }
        }
    }
}
async function triggerAlertasAsistencia(estudianteId, cursoId, escuelaId, docenteId, periodoId) {
    console.log('[AlertaAsistencia] trigger iniciando para estudianteId:', estudianteId);
    const periodoFinal = await obtenerPeriodoIdVigente(escuelaId, periodoId);
    const registros = await asistencia_model_1.default.find({
        cursoId,
        escuelaId,
        'estudiantes.estudianteId': new mongoose_1.default.Types.ObjectId(estudianteId),
    }).select('estudiantes');
    const entradas = registros.flatMap((registro) => (registro.estudiantes || []).filter((estudiante) => estudiante.estudianteId?.toString() === estudianteId));
    const totalDias = entradas.length;
    console.log('[AlertaAsistencia] registros:', registros.length, '| entradas aplanadas:', totalDias);
    if (totalDias === 0) {
        console.log('[AlertaAsistencia] salida temprana: 0 entradas');
        return;
    }
    const diasAusente = entradas.filter((entrada) => entrada.estado === IAsistencia_1.EstadoAsistencia.AUSENTE).length;
    const porcentajeAusencias = (diasAusente / totalDias) * 100;
    console.log('[AlertaAsistencia] ausentes:', diasAusente, '/', totalDias, '=', porcentajeAusencias.toFixed(1) + '%');
    const UMBRALES = [
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
        usuario_model_1.default.find({
            escuelaId,
            tipo: { $in: ['RECTOR', 'COORDINADOR'] },
            estado: 'ACTIVO',
        }).select('_id email nombre apellidos'),
        usuario_model_1.default.findById(estudianteId).select('nombre apellidos'),
        usuario_model_1.default.findById(docenteId).select('_id email nombre apellidos'),
        curso_model_1.default.findById(cursoId).select('nombre'),
    ]);
    const destinatarios = [
        ...administrativos,
        ...(docente ? [docente] : []),
    ];
    if (destinatarios.length === 0) {
        return;
    }
    const nombreEstudiante = `${estudiante?.nombre ?? ''} ${estudiante?.apellidos ?? ''}`.trim();
    const nombreCurso = curso?.nombre ?? '';
    for (const umbral of umbralesAplicables) {
        console.log('[AlertaAsistencia] intentando crear alerta nivel:', umbral.nivel);
        try {
            await alertaAsistencia_model_1.default.create({
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
        }
        catch (error) {
            if (error?.code !== 11000) {
                console.error('[AlertaAsistencia] error no-11000 en nivel', umbral.nivel, ':', error);
                throw error;
            }
            console.log('[AlertaAsistencia] alerta nivel', umbral.nivel, 'ya existe (11000) — omitida');
        }
    }
}
//# sourceMappingURL=alertaAsistencia.service.js.map