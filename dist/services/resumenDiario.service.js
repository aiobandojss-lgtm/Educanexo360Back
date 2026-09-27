"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.procesarResumenDiario = exports.reiniciarEstadoResumen = exports.encolarResumenSiCorresponde = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const INotificacion_1 = require("../interfaces/INotificacion");
const outbox_1 = require("../queue/outbox");
const email_service_1 = require("./email.service");
const preferencias_1 = require("../utils/preferencias");
const fechas_1 = require("../utils/fechas");
const config_1 = __importDefault(require("../config/config"));
const logger_1 = require("../utils/logger");
const claveLote_1 = require("../utils/claveLote");
const MAX_ITEMS_POR_CORREO = 30;
const VENTANA_MARCAS_MS = 48 * 60 * 60 * 1000;
const horaResumen = () => {
    const h = parseInt(process.env.RESUMEN_HORA || '', 10);
    return Number.isFinite(h) && h >= 0 && h <= 23 ? h : 18;
};
const diasEncolados = new Set();
const encolarResumenSiCorresponde = async (ahora = new Date()) => {
    if (process.env.RESUMEN_DIARIO_DESACTIVADO === 'true')
        return false;
    const dia = (0, fechas_1.horaColombia)(ahora) >= horaResumen()
        ? (0, fechas_1.fechaColombiaISO)(ahora)
        : (0, fechas_1.fechaColombiaISO)(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
    if (diasEncolados.has(dia))
        return false;
    await (0, outbox_1.encolar)({ tipo: 'resumen-diario', payload: { dia }, claveUnica: `resumen:${dia}` });
    diasEncolados.add(dia);
    if (diasEncolados.size > 7)
        diasEncolados.delete(diasEncolados.values().next().value);
    return true;
};
exports.encolarResumenSiCorresponde = encolarResumenSiCorresponde;
const reiniciarEstadoResumen = () => {
    diasEncolados.clear();
};
exports.reiniciarEstadoResumen = reiniciarEstadoResumen;
const procesarResumenDiario = async (dia, ahora = new Date(), ctx) => {
    const comprobar = () => ctx?.comprobarCancelacion();
    const grupos = await notificacion_model_1.default.aggregate([
        {
            $match: {
                'metadata.resumen': true,
                tipo: INotificacion_1.TipoNotificacion.MENSAJE,
                createdAt: { $gte: new Date(ahora.getTime() - VENTANA_MARCAS_MS) },
            },
        },
        { $sort: { createdAt: 1 } },
        {
            $group: {
                _id: '$usuarioId',
                notifIds: { $push: '$_id' },
                items: { $push: { mensajeId: '$entidadId', titulo: '$titulo', remitente: '$metadata.remitente', fecha: '$createdAt' } },
            },
        },
    ]);
    if (grupos.length === 0)
        return 0;
    comprobar();
    const usuarioIds = grupos.map((g) => g._id);
    const mensajeIds = [...new Set(grupos.flatMap((g) => g.items.map((i) => String(i.mensajeId))))]
        .filter((id) => mongoose_1.default.isValidObjectId(id))
        .map((id) => new mongoose_1.default.Types.ObjectId(id));
    const [usuarios, mensajes] = await Promise.all([
        usuario_model_1.default.find({ _id: { $in: usuarioIds }, estado: 'ACTIVO' })
            .select('_id email nombre tipo preferencias escuelaId')
            .sort({ _id: 1 })
            .lean(),
        mensaje_model_1.default.find({ _id: { $in: mensajeIds } }).select('_id asunto lecturas.usuarioId').lean(),
    ]);
    const leidos = new Set();
    const asuntos = new Map();
    mensajes.forEach((m) => {
        asuntos.set(String(m._id), m.asunto);
        (m.lecturas || []).forEach((l) => leidos.add(`${m._id}:${l.usuarioId}`));
    });
    const itemsPorUsuario = new Map(grupos.map((g) => [String(g._id), g.items]));
    const notifsPorUsuario = new Map(grupos.map((g) => [String(g._id), g.notifIds]));
    const atendidas = [];
    const porEscuela = new Map();
    for (const u of usuarios) {
        if (!u.email || (0, email_service_1.esEmailFicticio)(u.email) || (0, preferencias_1.preferenciaEmail)(u) === 'ninguno')
            continue;
        const pendientes = (itemsPorUsuario.get(String(u._id)) || [])
            .filter((i) => asuntos.has(String(i.mensajeId)) && !leidos.has(`${i.mensajeId}:${u._id}`))
            .map((i) => ({
            asunto: asuntos.get(String(i.mensajeId)),
            remitente: i.remitente,
            fecha: i.fecha,
            url: `${config_1.default.frontendUrl}/mensajes/${i.mensajeId}`,
        }));
        if (pendientes.length === 0) {
            atendidas.push({ ids: notifsPorUsuario.get(String(u._id)) || [], enviado: false });
            continue;
        }
        atendidas.push({ ids: notifsPorUsuario.get(String(u._id)) || [], enviado: true });
        const escuela = String(u.escuelaId);
        if (!porEscuela.has(escuela))
            porEscuela.set(escuela, []);
        porEscuela.get(escuela).push({
            email: u.email,
            nombre: u.nombre,
            usuarioId: String(u._id),
            total: pendientes.length,
            items: pendientes.slice(0, MAX_ITEMS_POR_CORREO),
        });
    }
    const trabajos = [];
    let correos = 0;
    for (const [escuelaId, destinatarios] of porEscuela) {
        for (let i = 0; i < destinatarios.length; i += email_service_1.DESTINATARIOS_POR_TRABAJO) {
            const lote = destinatarios.slice(i, i + email_service_1.DESTINATARIOS_POR_TRABAJO);
            correos += lote.length;
            trabajos.push({
                tipo: 'email',
                prioridad: 'normal',
                escuelaId,
                claveUnica: (0, claveLote_1.claveDeLote)(`resumen:${dia}:${escuelaId}`, lote.map((d) => d.usuarioId)),
                payload: {
                    plantilla: 'resumen',
                    datos: { dia, urlMensajes: `${config_1.default.frontendUrl}/mensajes`, urlPreferencias: process.env.EMAIL_PREFERENCIAS_URL || '' },
                    destinatarios: lote,
                },
            });
        }
    }
    comprobar();
    if (trabajos.length > 0)
        await (0, outbox_1.encolar)(trabajos);
    const idsEnviados = atendidas.filter((a) => a.enviado).flatMap((a) => a.ids);
    const idsLeidos = atendidas.filter((a) => !a.enviado).flatMap((a) => a.ids);
    if (idsEnviados.length > 0) {
        await notificacion_model_1.default.updateMany({ _id: { $in: idsEnviados } }, { $unset: { 'metadata.resumen': '' }, $set: { 'metadata.resumenEnviadoEn': ahora } });
    }
    if (idsLeidos.length > 0) {
        await notificacion_model_1.default.updateMany({ _id: { $in: idsLeidos } }, { $unset: { 'metadata.resumen': '' } });
    }
    logger_1.logger.info(`[Resumen] ${dia}: ${correos} correo(s) de resumen encolados en ${trabajos.length} trabajo(s)`);
    return correos;
};
exports.procesarResumenDiario = procesarResumenDiario;
//# sourceMappingURL=resumenDiario.service.js.map