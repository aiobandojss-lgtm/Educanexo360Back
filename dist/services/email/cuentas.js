"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.procesarCorreoCuenta = exports.encolarCorreoCuenta = exports.VENTANA_DEFINIR_MS = exports.VENTANA_RESET_MS = exports.crearEnlaceContrasena = exports.HORAS_ENLACE_DEFINIR = exports.HORAS_ENLACE_RESET = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../../models/usuario.model"));
const config_1 = __importDefault(require("../../config/config"));
const outbox_1 = require("../../queue/outbox");
const cupo_1 = require("./cupo");
const proveedores_1 = require("./proveedores");
const plantillas_1 = require("./plantillas");
const fechas_1 = require("../../utils/fechas");
const enmascarar_1 = require("../../utils/enmascarar");
const email_service_1 = require("../email.service");
const logger_1 = require("../../utils/logger");
exports.HORAS_ENLACE_RESET = 1;
exports.HORAS_ENLACE_DEFINIR = 72;
const nuevoEnlace = () => {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    return {
        hash: crypto_1.default.createHash('sha256').update(token).digest('hex'),
        url: `${config_1.default.frontendUrl}/reset-password/${token}`,
    };
};
const guardarEnlace = async (usuarioId, hash, horas) => {
    await usuario_model_1.default.updateOne({ _id: usuarioId }, { $set: { resetPasswordToken: hash, resetPasswordExpires: new Date(Date.now() + horas * 60 * 60 * 1000) } });
};
const crearEnlaceContrasena = async (usuarioId, horas) => {
    const enlace = nuevoEnlace();
    await guardarEnlace(usuarioId, enlace.hash, horas);
    return enlace.url;
};
exports.crearEnlaceContrasena = crearEnlaceContrasena;
exports.VENTANA_RESET_MS = 10 * 60 * 1000;
exports.VENTANA_DEFINIR_MS = 5 * 60 * 1000;
const claveCorreoCuenta = (payload) => {
    const bloque = (ms) => Math.floor(Date.now() / ms);
    if (payload.tipo === 'reset' && payload.usuarioId)
        return `reset:${payload.usuarioId}:${bloque(exports.VENTANA_RESET_MS)}`;
    if (payload.tipo === 'definir' && payload.usuarioId)
        return `definir:${payload.usuarioId}:${bloque(exports.VENTANA_DEFINIR_MS)}`;
    return undefined;
};
const encolarCorreoCuenta = async (payload) => {
    const horas = payload.tipo === 'reset' ? exports.HORAS_ENLACE_RESET : exports.HORAS_ENLACE_DEFINIR;
    const claveUnica = claveCorreoCuenta(payload);
    return (0, outbox_1.encolar)({
        tipo: 'correo-cuenta',
        prioridad: 'critica',
        escuelaId: payload.escuelaId,
        ...(claveUnica && { claveUnica }),
        payload: { ...payload, caducaEn: new Date(Date.now() + horas * 60 * 60 * 1000) },
    });
};
exports.encolarCorreoCuenta = encolarCorreoCuenta;
const reservarCritico = async (caducaEn) => {
    const dia = await (0, cupo_1.reservarCupo)('critica');
    if (dia)
        return dia;
    const manana = (0, fechas_1.inicioDiaSiguienteColombia)(new Date(), 5);
    if (manana.getTime() >= caducaEn.getTime()) {
        throw new outbox_1.FalloDefinitivo('Cupo diario de correo agotado y el enlace vencería antes de poder enviarlo');
    }
    throw new outbox_1.ReprogramarTrabajo(manana, 'Cupo diario de correo agotado (reserva crítica incluida); sale mañana');
};
const enviar = async (dia, para, plantilla, datos) => {
    try {
        const correo = (0, plantillas_1.renderizarCorreo)(plantilla, datos, para);
        await (0, proveedores_1.obtenerProveedor)().send({ to: para.email, ...correo });
    }
    catch (error) {
        await (0, cupo_1.liberarCupo)('critica', 1, dia);
        if (error?.permanente) {
            throw new outbox_1.FalloDefinitivo(`Rechazo permanente para ${(0, enmascarar_1.enmascararEmail)(para.email)}`);
        }
        throw error;
    }
};
const procesarCorreoCuenta = async (payload, ctx) => {
    const comprobar = () => ctx?.comprobarCancelacion();
    const caducaEn = new Date(payload.caducaEn || Date.now() + 60 * 60 * 1000);
    if (Date.now() > caducaEn.getTime()) {
        throw new outbox_1.FalloDefinitivo('La solicitud venció antes de poder enviar el correo');
    }
    if (payload.tipo === 'reset') {
        const usuario = await usuario_model_1.default.findOne({ _id: payload.usuarioId, estado: 'ACTIVO' })
            .select('_id email nombre')
            .lean();
        if (!usuario?.email)
            throw new outbox_1.FalloDefinitivo('Usuario inexistente o inactivo');
        comprobar();
        const dia = await reservarCritico(caducaEn);
        const enlace = nuevoEnlace();
        await enviar(dia, usuario, 'reset', { nombre: usuario.nombre, resetUrl: enlace.url, expirationTime: '1 hora' });
        await guardarEnlace(String(usuario._id), enlace.hash, exports.HORAS_ENLACE_RESET);
        return;
    }
    if (payload.tipo === 'bienvenida') {
        const acudiente = await usuario_model_1.default.findById(payload.acudienteId).select('_id email nombre apellidos').lean();
        if (!acudiente?.email)
            throw new outbox_1.FalloDefinitivo('Acudiente inexistente');
        comprobar();
        const dia = await reservarCritico(caducaEn);
        const enlace = await (0, exports.crearEnlaceContrasena)(String(acudiente._id), exports.HORAS_ENLACE_DEFINIR);
        const estudiantes = [];
        for (const est of payload.estudiantes || []) {
            if (!est.esExistente && est.usuarioId && mongoose_1.default.isValidObjectId(est.usuarioId)) {
                estudiantes.push({ ...est, enlace: await (0, exports.crearEnlaceContrasena)(String(est.usuarioId), exports.HORAS_ENLACE_DEFINIR) });
            }
            else {
                estudiantes.push(est);
            }
        }
        const nombre = payload.nombre || `${acudiente.nombre ?? ''} ${acudiente.apellidos ?? ''}`.trim();
        await enviar(dia, { email: acudiente.email, nombre }, 'credenciales', {
            nombre,
            email: acudiente.email,
            enlace,
            horas: exports.HORAS_ENLACE_DEFINIR,
            loginUrl: `${config_1.default.frontendUrl}/login`,
            estudiantes,
        });
        return;
    }
    if (payload.tipo === 'definir') {
        const usuario = await usuario_model_1.default.findOne({ _id: payload.usuarioId, estado: 'ACTIVO' })
            .select('_id email nombre apellidos')
            .lean();
        if (!usuario)
            throw new outbox_1.FalloDefinitivo('Usuario inexistente o inactivo');
        const ids = (Array.isArray(payload.enviarA) ? payload.enviarA : []).filter((id) => mongoose_1.default.isValidObjectId(id));
        const destinatarios = await usuario_model_1.default.find({ _id: { $in: ids }, estado: 'ACTIVO' })
            .select('_id email nombre apellidos')
            .lean();
        const conCorreo = destinatarios.filter((d) => d.email && !(0, email_service_1.esEmailFicticio)(d.email));
        if (conCorreo.length === 0)
            throw new outbox_1.FalloDefinitivo('Sin destinatarios con correo real');
        const dias = [];
        try {
            for (let i = 0; i < conCorreo.length; i++)
                dias.push(await reservarCritico(caducaEn));
        }
        catch (error) {
            for (const dia of dias)
                await (0, cupo_1.liberarCupo)('critica', 1, dia);
            throw error;
        }
        const enlace = nuevoEnlace();
        let entregados = 0;
        const rechazados = [];
        const nombreUsuario = `${usuario.nombre ?? ''} ${usuario.apellidos ?? ''}`.trim();
        for (let i = 0; i < conCorreo.length; i++) {
            const d = conCorreo[i];
            try {
                comprobar();
            }
            catch (error) {
                for (let j = i; j < conCorreo.length; j++)
                    await (0, cupo_1.liberarCupo)('critica', 1, dias[j]);
                throw error;
            }
            const nombre = `${d.nombre ?? ''} ${d.apellidos ?? ''}`.trim();
            try {
                await enviar(dias[i], { email: d.email, nombre }, 'enlace-contrasena', {
                    nombre,
                    nombreUsuario,
                    usuario: usuario.email,
                    esPropio: String(d._id) === String(usuario._id),
                    enlace: enlace.url,
                    horas: exports.HORAS_ENLACE_DEFINIR,
                });
            }
            catch (error) {
                if (error instanceof outbox_1.FalloDefinitivo) {
                    rechazados.push((0, enmascarar_1.enmascararEmail)(d.email));
                    logger_1.logger.warn(`[Cuentas] Enlace de contraseña: rechazo permanente para ${(0, enmascarar_1.enmascararEmail)(d.email)}`);
                    continue;
                }
                for (let j = i + 1; j < conCorreo.length; j++)
                    await (0, cupo_1.liberarCupo)('critica', 1, dias[j]);
                throw error;
            }
            entregados++;
            if (entregados === 1)
                await guardarEnlace(String(usuario._id), enlace.hash, exports.HORAS_ENLACE_DEFINIR);
        }
        if (entregados === 0) {
            throw new outbox_1.FalloDefinitivo(`Ningún destinatario aceptó el enlace (${rechazados.join(', ')}); el enlace anterior sigue vigente`);
        }
        return;
    }
    throw new outbox_1.FalloDefinitivo(`Tipo de correo de cuenta desconocido: ${payload.tipo}`);
};
exports.procesarCorreoCuenta = procesarCorreoCuenta;
logger_1.logger.debug('[Cuentas] módulo de correos de cuenta cargado');
//# sourceMappingURL=cuentas.js.map