"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const outbox_1 = require("./outbox");
const resumenDiario_service_1 = require("../services/resumenDiario.service");
const email_service_1 = require("../services/email.service");
const proveedores_1 = require("../services/email/proveedores");
const cupo_1 = require("../services/email/cupo");
const plantillas_1 = require("../services/email/plantillas");
const fechas_1 = require("../utils/fechas");
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const mensaje_service_1 = __importDefault(require("../services/mensaje.service"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const logger_1 = require("../utils/logger");
(0, outbox_1.registrarHandler)('email', async (trabajo, ctx) => {
    const { destinatarios = [], plantilla, datos } = trabajo.payload || {};
    const prioridad = trabajo.prioridad;
    const errores = [];
    for (const dest of destinatarios) {
        const clave = String(dest?.email || '').trim().toLowerCase();
        if (!clave || ctx.enviados.has(clave))
            continue;
        if ((0, email_service_1.esEmailFicticio)(clave)) {
            await ctx.marcarEnviados([clave]);
            continue;
        }
        if (!(await (0, cupo_1.reservarCupo)(prioridad))) {
            const cupo = await (0, cupo_1.cupoDeHoy)();
            const pendientes = destinatarios.length - ctx.enviados.size;
            throw new outbox_1.ReprogramarTrabajo((0, fechas_1.inicioDiaSiguienteColombia)(new Date(), 5), `Cupo diario de correo agotado (${cupo.enviados}/${cupo.limite}, reserva alta ${cupo.reservaAlta}); ` +
                `${pendientes} correo(s) quedan para mañana`);
        }
        try {
            const correo = (0, plantillas_1.renderizarCorreo)(plantilla, datos, dest);
            await (0, proveedores_1.obtenerProveedor)().send({ to: dest.email, ...correo });
            await ctx.marcarEnviados([clave]);
        }
        catch (error) {
            await (0, cupo_1.liberarCupo)(prioridad);
            errores.push(`${clave}: ${String(error?.message || error).slice(0, 150)}`);
        }
    }
    if (errores.length > 0) {
        throw new Error(`${errores.length} correo(s) no salieron: ${errores.slice(0, 3).join(' | ')}`);
    }
});
(0, outbox_1.registrarHandler)('push', async (trabajo, ctx) => {
    const { usuarioIds = [], titulo, mensaje, data, sound } = trabajo.payload || {};
    const pendientes = usuarioIds.map(String).filter((id) => !ctx.enviados.has(id));
    if (pendientes.length === 0 || !pushNotification_service_1.default.disponible)
        return;
    const tokens = await pushNotification_service_1.default.obtenerTokens(pendientes);
    await pushNotification_service_1.default.enviarMulticast(tokens, { titulo, mensaje, data, sound });
    await ctx.marcarEnviados(pendientes);
});
(0, outbox_1.registrarHandler)('copias-acudientes', async (trabajo, ctx) => {
    const { mensajeOriginalId, estudianteIds = [], datos, usuario } = trabajo.payload || {};
    for (const estudianteId of estudianteIds.map(String)) {
        if (ctx.enviados.has(estudianteId))
            continue;
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
        await ctx.marcarEnviados([estudianteId]);
    }
});
(0, outbox_1.registrarTareaPeriodica)('resumen-diario', async () => {
    await (0, resumenDiario_service_1.encolarResumenSiCorresponde)();
});
(0, outbox_1.registrarHandler)('resumen-diario', async (trabajo) => {
    await (0, resumenDiario_service_1.procesarResumenDiario)(String(trabajo.payload?.dia));
});
//# sourceMappingURL=handlers.js.map