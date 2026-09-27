"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const outbox_1 = require("./outbox");
const monitorEnvios_1 = require("./monitorEnvios");
const resumenDiario_service_1 = require("../services/resumenDiario.service");
const email_service_1 = require("../services/email.service");
const proveedores_1 = require("../services/email/proveedores");
const cupo_1 = require("../services/email/cupo");
const plantillas_1 = require("../services/email/plantillas");
const fechas_1 = require("../utils/fechas");
const pushNotification_service_1 = __importStar(require("../services/pushNotification.service"));
const mensaje_service_1 = __importDefault(require("../services/mensaje.service"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const logger_1 = require("../utils/logger");
const enmascarar_1 = require("../utils/enmascarar");
const cuentas_1 = require("../services/email/cuentas");
(0, proveedores_1.registrarObservadorEnvios)((resultado) => (0, monitorEnvios_1.registrarEnvioProveedor)(resultado));
(0, outbox_1.registrarObservadorFallido)((trabajo) => (0, monitorEnvios_1.registrarFallido)(trabajo));
(0, outbox_1.registrarTareaPeriodica)('monitor-envios', async () => (0, monitorEnvios_1.revisarCierre)());
const marcarConReintentos = async (ctx, id) => {
    for (let intento = 1;; intento++) {
        try {
            await ctx.marcarEnviados([id]);
            return;
        }
        catch (error) {
            if (intento >= 3)
                throw error;
            await new Promise((r) => setTimeout(r, 200 * intento));
        }
    }
};
(0, outbox_1.registrarHandler)('email', async (trabajo, ctx) => {
    const { destinatarios = [], plantilla, datos } = trabajo.payload || {};
    const prioridad = trabajo.prioridad;
    const errores = [];
    for (const dest of destinatarios) {
        const clave = String(dest?.email || '').trim().toLowerCase();
        if (!clave || ctx.enviados.has(clave))
            continue;
        ctx.comprobarCancelacion();
        if ((0, email_service_1.esEmailFicticio)(clave)) {
            await ctx.marcarEnviados([clave]);
            continue;
        }
        const diaCupo = await (0, cupo_1.reservarCupo)(prioridad);
        if (!diaCupo) {
            const cupo = await (0, cupo_1.cupoDeHoy)();
            const pendientes = destinatarios.length - ctx.enviados.size;
            throw new outbox_1.ReprogramarTrabajo((0, fechas_1.inicioDiaSiguienteColombia)(new Date(), 5), `Cupo diario de correo agotado (${cupo.enviados}/${cupo.limite}, reservas alta ${cupo.reservaAlta} y crítica ${cupo.reservaCritica}); ` +
                `${pendientes} correo(s) quedan para mañana`);
        }
        try {
            const correo = (0, plantillas_1.renderizarCorreo)(plantilla, datos, dest);
            await (0, proveedores_1.obtenerProveedor)().send({ to: dest.email, ...correo });
        }
        catch (error) {
            await (0, cupo_1.liberarCupo)(prioridad, 1, diaCupo);
            if (error?.permanente) {
                logger_1.logger.warn(`[Email] Rechazo permanente para ${(0, enmascarar_1.enmascararEmail)(clave)}: ${(0, enmascarar_1.enmascararEmailsEnTexto)(String(error?.message || error).slice(0, 150))}`);
                await marcarConReintentos(ctx, clave);
                continue;
            }
            errores.push(`${(0, enmascarar_1.enmascararEmail)(clave)}: ${(0, enmascarar_1.enmascararEmailsEnTexto)(String(error?.message || error).slice(0, 150))}`);
            continue;
        }
        await marcarConReintentos(ctx, clave);
    }
    if (errores.length > 0) {
        throw new Error(`${errores.length} correo(s) no salieron: ${errores.slice(0, 3).join(' | ')}`);
    }
});
(0, outbox_1.registrarHandler)('push', async (trabajo, ctx) => {
    const { usuarioIds = [], tokens: tokensDirectos, titulo, mensaje, data, sound, reintentoTokens = 0 } = trabajo.payload || {};
    if (!pushNotification_service_1.default.disponible)
        return;
    const contenido = { titulo, mensaje, data, sound };
    let tokens;
    let pendientes = [];
    let destinatarios = usuarioIds.map(String);
    if (Array.isArray(tokensDirectos)) {
        if (ctx.enviados.has('tokens'))
            return;
        const vigentes = new Set(destinatarios.length > 0 ? await pushNotification_service_1.default.obtenerTokens(destinatarios) : []);
        tokens = tokensDirectos.filter((t) => typeof t === 'string' && t && vigentes.has(t));
        if (tokens.length === 0) {
            await ctx.marcarEnviados(['tokens']);
            return;
        }
    }
    else {
        destinatarios = [];
        pendientes = usuarioIds.map(String).filter((id) => !ctx.enviados.has(id));
        if (pendientes.length === 0)
            return;
        tokens = await pushNotification_service_1.default.obtenerTokens(pendientes);
        destinatarios = pendientes;
    }
    ctx.comprobarCancelacion();
    const { transitorios } = await pushNotification_service_1.default.enviarMulticast(tokens, contenido);
    if (transitorios.length > 0) {
        if (reintentoTokens < pushNotification_service_1.MAX_REINTENTOS_TOKENS) {
            const base = parseInt(process.env.PUSH_REINTENTO_BASE_MS || '', 10) || 60000;
            await (0, outbox_1.encolar)({
                tipo: 'push',
                prioridad: trabajo.prioridad,
                escuelaId: trabajo.escuelaId ? String(trabajo.escuelaId) : undefined,
                claveUnica: `${trabajo._id}:tokens`,
                nextRunAt: new Date(Date.now() + base * 2 ** reintentoTokens),
                payload: { ...contenido, tokens: transitorios, usuarioIds: destinatarios, reintentoTokens: reintentoTokens + 1 },
            });
        }
        else {
            logger_1.logger.warn(`[Push] ${transitorios.length} dispositivo(s) sin entregar tras ${pushNotification_service_1.MAX_REINTENTOS_TOKENS} reintentos (error temporal de FCM)`);
        }
    }
    await ctx.marcarEnviados(pendientes.length > 0 ? pendientes : ['tokens']);
});
(0, outbox_1.registrarHandler)('copias-acudientes', async (trabajo, ctx) => {
    const { mensajeOriginalId, estudianteIds = [], datos, usuario } = trabajo.payload || {};
    for (const estudianteId of estudianteIds.map(String)) {
        if (ctx.enviados.has(estudianteId))
            continue;
        ctx.comprobarCancelacion();
        const yaExiste = await mensaje_model_1.default.exists({
            'copiaDe.mensajeId': mensajeOriginalId,
            'copiaDe.estudianteId': estudianteId,
        });
        if (!yaExiste) {
            try {
                await mensaje_service_1.default.enviarCopiaAcudientes(estudianteId, datos, usuario, {
                    mensajeId: mensajeOriginalId,
                    estudianteId,
                });
            }
            catch (error) {
                const duplicada = /E11000/.test(String(error?.message || ''));
                const permanente = error?.statusCode >= 400 && error?.statusCode < 500;
                if (!duplicada && !permanente)
                    throw error;
                if (permanente)
                    logger_1.logger.warn(`[Copias] Estudiante ${estudianteId}: ${error.message} (se omite)`);
            }
        }
        const copia = await mensaje_model_1.default.findOne({
            'copiaDe.mensajeId': mensajeOriginalId,
            'copiaDe.estudianteId': estudianteId,
        })
            .select('_id prioridad')
            .lean();
        if (copia) {
            await mensaje_service_1.default.encolarDespacho(String(copia._id), usuario, copia.prioridad, { lanzarError: true });
        }
        await ctx.marcarEnviados([estudianteId]);
    }
});
(0, outbox_1.registrarTareaPeriodica)('resumen-diario', async () => {
    await (0, resumenDiario_service_1.encolarResumenSiCorresponde)();
});
(0, outbox_1.registrarHandler)('despachar-mensaje', async (trabajo, ctx) => {
    const { mensajeId, remitente } = trabajo.payload || {};
    await mensaje_service_1.default.procesarDespacho(String(mensajeId), remitente || {}, ctx);
});
(0, outbox_1.registrarHandler)('correo-cuenta', async (trabajo, ctx) => {
    await (0, cuentas_1.procesarCorreoCuenta)(trabajo.payload || {}, ctx);
});
(0, outbox_1.registrarHandler)('resumen-diario', async (trabajo, ctx) => {
    await (0, resumenDiario_service_1.procesarResumenDiario)(String(trabajo.payload?.dia), new Date(), ctx);
});
//# sourceMappingURL=handlers.js.map