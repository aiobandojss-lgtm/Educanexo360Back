"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MIN_CLASES_ALERTA = void 0;
exports.procesarAlertasAsistenciaCurso = procesarAlertasAsistenciaCurso;
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
const fechas_1 = require("../utils/fechas");
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
let usuarioSistemaCache = null;
async function obtenerOCrearUsuarioSistema() {
    const EMAIL_SISTEMA = 'sistema@educanexo360.com';
    if (usuarioSistemaCache)
        return usuarioSistemaCache;
    const existente = await usuario_model_1.default.findOne({ email: EMAIL_SISTEMA }).select('_id').lean();
    if (existente) {
        usuarioSistemaCache = { _id: existente._id };
        return usuarioSistemaCache;
    }
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
    usuarioSistemaCache = sistema;
    return sistema;
}
async function obtenerPeriodoVigente(escuelaId, periodoId) {
    const escuela = (await escuela_model_1.default.findById(escuelaId).select('periodos_academicos').lean());
    const periodos = escuela?.periodos_academicos || [];
    const hoy = new Date();
    const periodo = periodoId
        ? periodos.find((p) => String(p._id) === String(periodoId))
        :
            periodos.find((p) => new Date(p.fecha_inicio) <= hoy && hoy <= (0, fechas_1.finDelDiaColombia)(new Date(p.fecha_fin)));
    if (!periodo)
        return { id: periodoId || 'sin-periodo' };
    const inicio = new Date(periodo.fecha_inicio);
    const fin = new Date(periodo.fecha_fin);
    return {
        id: String(periodo._id),
        desde: new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth(), inicio.getUTCDate())),
        hastaExclusivo: new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), fin.getUTCDate() + 1)),
    };
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
exports.MIN_CLASES_ALERTA = Math.max(parseInt(process.env.ALERTA_MIN_CLASES || '8', 10) || 8, 1);
const RANGO_NIVEL = { ALERTA: 1, CRITICO: 2, INMINENTE: 3 };
const UMBRALES = [
    { nivel: 'INMINENTE', minPct: 30 },
    { nivel: 'CRITICO', minPct: 25 },
    { nivel: 'ALERTA', minPct: 15 },
];
async function conConcurrencia(items, limite, tarea) {
    let indice = 0;
    const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
        while (indice < items.length) {
            const item = items[indice++];
            await tarea(item).catch((error) => console.error('[AlertaAsistencia]', error));
        }
    });
    await Promise.all(trabajadores);
}
async function procesarAlertasAsistenciaCurso(params) {
    const { cursoId, escuelaId, docenteId } = params;
    const estudianteIds = [...new Set(params.estudianteIds)].filter((id) => mongoose_1.default.isValidObjectId(id));
    if (estudianteIds.length === 0)
        return;
    const periodo = await obtenerPeriodoVigente(escuelaId, params.periodoId);
    const match = {
        cursoId: new mongoose_1.default.Types.ObjectId(cursoId),
        escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
    };
    if (periodo.desde && periodo.hastaExclusivo)
        match.fecha = { $gte: periodo.desde, $lt: periodo.hastaExclusivo };
    const conteos = await asistencia_model_1.default.aggregate([
        { $match: match },
        { $project: { estudiantes: { estudianteId: 1, estado: 1 } } },
        { $unwind: '$estudiantes' },
        { $match: { 'estudiantes.estudianteId': { $in: estudianteIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } } },
        {
            $group: {
                _id: '$estudiantes.estudianteId',
                total: { $sum: 1 },
                ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', IAsistencia_1.EstadoAsistencia.AUSENTE] }, 1, 0] } },
            },
        },
    ]);
    const idsConClases = conteos.filter((c) => c.total >= exports.MIN_CLASES_ALERTA).map((c) => c._id);
    const previas = idsConClases.length
        ? await alertaAsistencia_model_1.default.find({ estudianteId: { $in: idsConClases }, periodoId: periodo.id })
            .select('estudianteId nivel')
            .lean()
        : [];
    const nivelPrevio = new Map();
    previas.forEach((a) => {
        const k = String(a.estudianteId);
        nivelPrevio.set(k, Math.max(nivelPrevio.get(k) || 0, RANGO_NIVEL[a.nivel] || 0));
    });
    const enRiesgo = conteos
        .filter((c) => c.total >= exports.MIN_CLASES_ALERTA)
        .map((c) => ({ estudianteId: String(c._id), porcentaje: (c.ausentes / c.total) * 100 }))
        .map((c) => {
        const alcanzado = UMBRALES.find((u) => c.porcentaje >= u.minPct);
        const previo = nivelPrevio.get(c.estudianteId) || 0;
        const umbrales = alcanzado && RANGO_NIVEL[alcanzado.nivel] > previo ? [alcanzado] : [];
        return { ...c, umbrales };
    })
        .filter((c) => c.umbrales.length > 0);
    if (enRiesgo.length === 0)
        return;
    const [administrativos, docente, curso, estudiantes] = await Promise.all([
        usuario_model_1.default.find({ escuelaId, tipo: { $in: ['RECTOR', 'COORDINADOR'] }, estado: 'ACTIVO' })
            .select('_id email nombre apellidos')
            .lean(),
        usuario_model_1.default.findOne({ _id: docenteId, escuelaId }).select('_id email nombre apellidos').lean(),
        curso_model_1.default.findOne({ _id: cursoId, escuelaId }).select('nombre').lean(),
        usuario_model_1.default.find({ _id: { $in: enRiesgo.map((e) => e.estudianteId) }, escuelaId }).select('nombre apellidos').lean(),
    ]);
    const destinatarios = [
        ...administrativos,
        ...(docente ? [docente] : []),
    ];
    if (destinatarios.length === 0)
        return;
    const nombres = new Map(estudiantes.map((e) => [String(e._id), `${e.nombre ?? ''} ${e.apellidos ?? ''}`.trim()]));
    const nombreCurso = curso?.nombre ?? '';
    await conConcurrencia(enRiesgo, 5, async ({ estudianteId, porcentaje, umbrales }) => {
        for (const umbral of umbrales) {
            try {
                await alertaAsistencia_model_1.default.create({
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
            }
            catch (error) {
                if (error?.code !== 11000)
                    throw error;
            }
        }
    });
}
async function triggerAlertasAsistencia(estudianteId, cursoId, escuelaId, docenteId, periodoId) {
    await procesarAlertasAsistenciaCurso({ estudianteIds: [estudianteId], cursoId, escuelaId, docenteId, periodoId });
}
//# sourceMappingURL=alertaAsistencia.service.js.map