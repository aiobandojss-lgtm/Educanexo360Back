"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarCorreoAhora = exports.construirTrabajosCorreo = exports.encolarCorreo = exports.DESTINATARIOS_POR_TRABAJO = void 0;
exports.esEmailFicticio = esEmailFicticio;
const logger_1 = require("../utils/logger");
const enmascarar_1 = require("../utils/enmascarar");
const outbox_1 = require("../queue/outbox");
const proveedores_1 = require("./email/proveedores");
const cupo_1 = require("./email/cupo");
const plantillas_1 = require("./email/plantillas");
const DOMINIOS_EMAIL_FICTICIO = ['@estudiante.educanexo.com', '@demo.educanexo.invalid'];
exports.DESTINATARIOS_POR_TRABAJO = 50;
function esEmailFicticio(email) {
    const e = String(email || '').trim().toLowerCase();
    return DOMINIOS_EMAIL_FICTICIO.some((d) => e.endsWith(d)) || e.endsWith('.invalid');
}
const encolarCorreo = async (opciones) => {
    const trabajos = (0, exports.construirTrabajosCorreo)(opciones);
    return trabajos.length === 0 ? 0 : (0, outbox_1.encolar)(trabajos);
};
exports.encolarCorreo = encolarCorreo;
const construirTrabajosCorreo = (opciones) => {
    const vistos = new Set();
    const validos = opciones.destinatarios.filter((d) => {
        const email = String(d?.email || '').trim().toLowerCase();
        if (!email || esEmailFicticio(email) || vistos.has(email))
            return false;
        vistos.add(email);
        return true;
    });
    if (validos.length === 0)
        return [];
    const trabajos = [];
    for (let i = 0; i < validos.length; i += exports.DESTINATARIOS_POR_TRABAJO) {
        trabajos.push({
            tipo: 'email',
            prioridad: opciones.prioridad || 'normal',
            escuelaId: opciones.escuelaId,
            payload: {
                plantilla: opciones.plantilla,
                datos: opciones.datos,
                destinatarios: validos.slice(i, i + exports.DESTINATARIOS_POR_TRABAJO).map((d) => ({
                    email: d.email,
                    ...(d.nombre && { nombre: d.nombre }),
                    ...(d.usuarioId && { usuarioId: String(d.usuarioId) }),
                })),
                ...(opciones.sensible && { sensible: true }),
            },
        });
    }
    return trabajos;
};
exports.construirTrabajosCorreo = construirTrabajosCorreo;
const enviarCorreoAhora = async (opciones) => {
    const correo = (0, plantillas_1.renderizarCorreo)(opciones.plantilla, opciones.datos, opciones.destinatario);
    const diaCupo = await (0, cupo_1.reservarCupo)(opciones.prioridad);
    if (!diaCupo)
        return false;
    try {
        await (0, proveedores_1.obtenerProveedor)().send({ to: opciones.destinatario.email, ...correo });
        return true;
    }
    catch (error) {
        await (0, cupo_1.liberarCupo)(opciones.prioridad, 1, diaCupo);
        throw error;
    }
};
exports.enviarCorreoAhora = enviarCorreoAhora;
class EmailService {
    async sendEmail(options) {
        const destinos = (Array.isArray(options.to) ? options.to : [options.to]).filter(Boolean);
        let ok = true;
        for (const to of destinos) {
            try {
                const diaCupo = await (0, cupo_1.reservarCupo)('normal');
                if (!diaCupo) {
                    logger_1.logger.warn(`[Email] Cupo diario agotado: no se envió "${options.subject}" a ${(0, enmascarar_1.enmascararEmail)(to)}`);
                    ok = false;
                    continue;
                }
                try {
                    await (0, proveedores_1.obtenerProveedor)().send({ to, subject: options.subject, text: options.text, html: options.html });
                }
                catch (error) {
                    await (0, cupo_1.liberarCupo)('normal', 1, diaCupo);
                    throw error;
                }
            }
            catch (error) {
                logger_1.logger.error(`[Email] Error enviando "${options.subject}" a ${(0, enmascarar_1.enmascararEmail)(to)}:`, error?.message || error);
                ok = false;
            }
        }
        return ok;
    }
    async sendMensajeNotification(to, mensajeInfo) {
        try {
            const ok = await (0, exports.enviarCorreoAhora)({ destinatario: { email: to }, plantilla: 'mensaje', datos: mensajeInfo, prioridad: 'normal' });
            if (!ok)
                logger_1.logger.warn(`[Email] Cupo diario agotado: no se envió la notificación de mensaje a ${(0, enmascarar_1.enmascararEmail)(to)}`);
            return ok;
        }
        catch (error) {
            logger_1.logger.error(`[Email] Error enviando notificación de mensaje a ${(0, enmascarar_1.enmascararEmail)(to)}:`, error?.message || error);
            return false;
        }
    }
}
exports.default = new EmailService();
//# sourceMappingURL=email.service.js.map