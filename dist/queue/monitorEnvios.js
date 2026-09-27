"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revisarCierre = exports.registrarFallido = exports.registrarEnvioProveedor = exports.estadoMonitor = exports.esperarAvisos = exports.reiniciarMonitor = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const outbox_model_1 = __importDefault(require("../models/outbox.model"));
const INotificacion_1 = require("../interfaces/INotificacion");
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const outbox_1 = require("./outbox");
const logger_1 = require("../utils/logger");
const TIPOS_CORREO = ['email', 'correo-cuenta'];
const VENTANA_MS = 15 * 60 * 1000;
const UMBRAL_FALLIDOS = 10;
const UMBRAL_CONSECUTIVOS = 20;
const CIERRE_SIN_FALLOS_MS = 60 * 60 * 1000;
const NO_SISTEMICO = /Rechazo permanente|Ningún destinatario aceptó|inexistente|Sin destinatarios/i;
let fallidos = [];
let consecutivos = 0;
let ultimoFalloProveedor = 0;
let ultimoFallo = 0;
let episodio = null;
let ultimoEpisodio = null;
let avisoEnCurso = Promise.resolve();
const reiniciarMonitor = () => {
    fallidos = [];
    consecutivos = 0;
    ultimoFalloProveedor = 0;
    ultimoFallo = 0;
    episodio = null;
    ultimoEpisodio = null;
    avisoEnCurso = Promise.resolve();
};
exports.reiniciarMonitor = reiniciarMonitor;
const esperarAvisos = () => avisoEnCurso;
exports.esperarAvisos = esperarAvisos;
const estadoMonitor = (ahora = Date.now()) => ({
    episodioAbierto: episodio
        ? { desde: episodio.desde, motivo: episodio.motivo, escuelas: episodio.escuelas }
        : null,
    ultimoEpisodio,
    fallidosCorreoUltimos15Min: fallidos.filter((f) => ahora - f.t < VENTANA_MS).length,
    fallosSeguidosProveedor: consecutivos,
});
exports.estadoMonitor = estadoMonitor;
const avisar = async (ep) => {
    if (ep.escuelas.length === 0) {
        const ids = await outbox_model_1.default.distinct('escuelaId', {
            tipo: { $in: TIPOS_CORREO },
            escuelaId: { $ne: null },
            $or: [{ estado: 'PROCESANDO' }, { error: { $exists: true }, updatedAt: { $gte: new Date(Date.now() - VENTANA_MS) } }],
        });
        ep.escuelas = ids.map(String);
    }
    const escuelasObj = ep.escuelas.filter((e) => mongoose_1.default.isValidObjectId(e)).map((e) => new mongoose_1.default.Types.ObjectId(e));
    const [superAdmins, admins] = await Promise.all([
        usuario_model_1.default.find({ tipo: 'SUPER_ADMIN', estado: 'ACTIVO' }).select('_id escuelaId').lean(),
        escuelasObj.length > 0
            ? usuario_model_1.default.find({ tipo: 'ADMIN', estado: 'ACTIVO', escuelaId: { $in: escuelasObj } }).select('_id escuelaId').lean()
            : Promise.resolve([]),
    ]);
    const vistos = new Set();
    const destinatarios = [...superAdmins, ...admins].filter((u) => {
        const id = String(u._id);
        if (vistos.has(id))
            return false;
        vistos.add(id);
        return true;
    });
    if (destinatarios.length === 0) {
        logger_1.logger.error(`[Envíos] Episodio de fallos sin destinatarios para avisar: ${ep.motivo}`);
        return;
    }
    const titulo = '⚠️ Problema con el envío de correos';
    const mensaje = `${ep.motivo}. Los correos quedan pendientes y se reintentan; los que fallen definitivamente se pueden ` +
        'reintentar desde la cola de envíos cuando se resuelva (revise el proveedor de correo).';
    const docs = destinatarios
        .map((u) => ({ u, escuelaId: u.escuelaId || escuelasObj[0] }))
        .filter((x) => x.escuelaId)
        .map((x) => ({
        usuarioId: x.u._id,
        titulo,
        mensaje,
        tipo: INotificacion_1.TipoNotificacion.SISTEMA,
        estado: INotificacion_1.EstadoNotificacion.PENDIENTE,
        escuelaId: x.escuelaId,
        metadata: { origen: 'monitor-envios', episodioDesde: ep.desde, motivo: ep.motivo },
    }));
    if (docs.length > 0)
        await notificacion_model_1.default.insertMany(docs);
    const trabajos = pushNotification_service_1.default.construirTrabajosPush({
        usuarioIds: destinatarios.map((u) => String(u._id)),
        contenido: { titulo, mensaje: ep.motivo, data: { tipo: 'sistema', motivo: ep.motivo } },
        prioridad: 'alta',
    });
    if (trabajos.length > 0)
        await (0, outbox_1.encolar)(trabajos);
    logger_1.logger.error(`[Envíos] Episodio de fallos: ${ep.motivo}. Avisados ${destinatarios.length} administrador(es).`);
};
const evaluar = (ahora) => {
    fallidos = fallidos.filter((f) => ahora - f.t < VENTANA_MS);
    if (episodio)
        return;
    let motivo = '';
    if (fallidos.length >= UMBRAL_FALLIDOS)
        motivo = `${fallidos.length} correos fallaron definitivamente en los últimos 15 minutos`;
    else if (consecutivos >= UMBRAL_CONSECUTIVOS)
        motivo = `El proveedor de correo rechazó ${consecutivos} envíos seguidos`;
    if (!motivo)
        return;
    const escuelas = [...new Set(fallidos.map((f) => f.escuelaId).filter(Boolean))];
    episodio = { desde: new Date(ahora), motivo, escuelas };
    const ep = episodio;
    avisoEnCurso = avisar(ep).catch((error) => logger_1.logger.error(`[Envíos] No se pudo avisar del episodio: ${error?.message || error}`));
};
const cerrar = (causa, ahora) => {
    if (!episodio)
        return;
    ultimoEpisodio = { ...episodio, hasta: new Date(ahora), cierre: causa };
    logger_1.logger.info(`[Envíos] Episodio de fallos cerrado (${causa})`);
    episodio = null;
    fallidos = [];
    consecutivos = 0;
};
const registrarEnvioProveedor = (resultado, ahora = Date.now()) => {
    if (resultado === 'exito') {
        consecutivos = 0;
        cerrar('envío exitoso', ahora);
        return;
    }
    if (resultado === 'rechazo')
        return;
    if (ahora - ultimoFalloProveedor > VENTANA_MS)
        consecutivos = 0;
    consecutivos++;
    ultimoFalloProveedor = ahora;
    ultimoFallo = ahora;
    evaluar(ahora);
};
exports.registrarEnvioProveedor = registrarEnvioProveedor;
const registrarFallido = (trabajo, ahora = Date.now()) => {
    if (!TIPOS_CORREO.includes(trabajo.tipo))
        return;
    if (NO_SISTEMICO.test(String(trabajo.error || '')))
        return;
    fallidos.push({ t: ahora, escuelaId: trabajo.escuelaId ? String(trabajo.escuelaId) : undefined });
    ultimoFallo = ahora;
    evaluar(ahora);
};
exports.registrarFallido = registrarFallido;
const revisarCierre = (ahora = Date.now()) => {
    if (episodio && ahora - ultimoFallo >= CIERRE_SIN_FALLOS_MS)
        cerrar('60 min sin fallos', ahora);
};
exports.revisarCierre = revisarCierre;
//# sourceMappingURL=monitorEnvios.js.map