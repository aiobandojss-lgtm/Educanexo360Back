"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerProveedor = exports.crearProveedor = exports.simulado = exports.esErrorPermanente = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../../config/config"));
const logger_1 = require("../../utils/logger");
const remitente = () => ({ nombre: config_1.default.email.senderName, email: config_1.default.email.senderEmail });
const timeoutCorreoMs = () => {
    const v = parseInt(process.env.EMAIL_TIMEOUT_MS || '', 10);
    return Number.isFinite(v) && v > 0 ? v : 30000;
};
const esErrorPermanente = (proveedor, error) => {
    if (!error)
        return false;
    if (proveedor === 'smtp') {
        const rcpt = /^RCPT TO$/i.test(String(error.command || '').trim());
        const codigo = Number(error.responseCode);
        return rcpt && codigo >= 550 && codigo <= 554;
    }
    const texto = String(error.detalle ?? error.message ?? '');
    if (proveedor === 'brevo') {
        if (error.status !== 400 && error.status !== 422)
            return false;
        if (/sender|remitente/i.test(texto))
            return false;
        return /(invalid|not valid).{0,40}(\bto\b|recipient|email)|(\bto\b|recipient|email).{0,40}(invalid|not valid)/i.test(texto);
    }
    if (proveedor === 'ses') {
        if (!['BadRequestException', 'MessageRejected'].includes(error.name))
            return false;
        if (/not verified|sender|from/i.test(texto))
            return false;
        return /illegal address|invalid (email )?address|missing final '@|domain contains illegal|local address contains/i.test(texto);
    }
    return false;
};
exports.esErrorPermanente = esErrorPermanente;
const marcarPermanente = (proveedor, error) => {
    if (error && typeof error === 'object' && (0, exports.esErrorPermanente)(proveedor, error))
        error.permanente = true;
    return error;
};
const conTimeout = async (nombre, fn) => {
    const ms = timeoutCorreoMs();
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ms);
    try {
        return await fn(control.signal);
    }
    catch (error) {
        if (control.signal.aborted)
            throw new Error(`${nombre}: tiempo agotado (${ms} ms)`);
        throw error;
    }
    finally {
        clearTimeout(reloj);
    }
};
const crearSmtp = () => {
    const num = (v, d) => (Number.isFinite(parseInt(v || '', 10)) ? parseInt(v, 10) : d);
    const transporter = nodemailer_1.default.createTransport({
        pool: true,
        maxConnections: num(process.env.EMAIL_SMTP_MAX_CONNECTIONS, 2),
        rateDelta: 1000,
        rateLimit: num(process.env.EMAIL_SMTP_RATE_LIMIT, 5),
        host: config_1.default.email.host,
        port: config_1.default.email.port,
        secure: config_1.default.email.secure,
        auth: { user: config_1.default.email.user, pass: config_1.default.email.pass },
        tls: { rejectUnauthorized: config_1.default.email.tlsRejectUnauthorized },
        connectionTimeout: timeoutCorreoMs(),
        greetingTimeout: timeoutCorreoMs(),
        socketTimeout: timeoutCorreoMs(),
    });
    transporter
        .verify()
        .then(() => logger_1.logger.debug('[Email] Conexión SMTP verificada'))
        .catch((err) => logger_1.logger.warn('[Email] No se pudo verificar la conexión SMTP:', err?.code || err?.message));
    return {
        nombre: 'smtp',
        async send(m) {
            const r = remitente();
            try {
                const info = await transporter.sendMail({
                    from: `"${r.nombre}" <${r.email}>`,
                    to: m.to,
                    subject: m.subject,
                    text: m.text || '',
                    html: m.html || undefined,
                });
                return { id: info.messageId };
            }
            catch (error) {
                throw marcarPermanente('smtp', error);
            }
        },
    };
};
const crearSes = () => {
    const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
    const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;
    if (!region)
        throw new Error('EMAIL_PROVIDER=ses requiere AWS_SES_REGION (o AWS_REGION)');
    const cliente = new SESv2Client({ region });
    return {
        nombre: 'ses',
        async send(m) {
            const r = remitente();
            const salida = await conTimeout('SES', (abortSignal) => cliente.send(new SendEmailCommand({
                FromEmailAddress: `"${r.nombre}" <${r.email}>`,
                Destination: { ToAddresses: [m.to] },
                Content: {
                    Simple: {
                        Subject: { Data: m.subject, Charset: 'UTF-8' },
                        Body: {
                            ...(m.html && { Html: { Data: m.html, Charset: 'UTF-8' } }),
                            Text: { Data: m.text || '', Charset: 'UTF-8' },
                        },
                    },
                },
                ...(process.env.AWS_SES_CONFIGURATION_SET && {
                    ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET,
                }),
            }), { abortSignal })).catch((error) => {
                throw marcarPermanente('ses', error);
            });
            return { id: salida.MessageId };
        },
    };
};
const crearBrevo = () => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey)
        throw new Error('EMAIL_PROVIDER=brevo requiere BREVO_API_KEY');
    return {
        nombre: 'brevo',
        async send(m) {
            const r = remitente();
            const resp = await conTimeout('Brevo', (signal) => fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
                signal,
                method: 'POST',
                headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    sender: { name: r.nombre, email: r.email },
                    to: [{ email: m.to }],
                    subject: m.subject,
                    ...(m.html && { htmlContent: m.html }),
                    textContent: m.text || ' ',
                }),
            }));
            if (!resp.ok) {
                const detalle = (await resp.text().catch(() => '')).slice(0, 300);
                const error = new Error(`Brevo respondió ${resp.status}: ${detalle}`);
                error.status = resp.status;
                error.detalle = detalle;
                throw marcarPermanente('brevo', error);
            }
            const json = await resp.json().catch(() => ({}));
            return { id: json.messageId };
        },
    };
};
exports.simulado = {
    fallar: process.env.EMAIL_SIMULADO_FALLA === 'true',
    fallarPara: '',
    rechazarPara: '',
};
const crearSimulado = () => ({
    nombre: 'simulado',
    async send(m) {
        const demora = parseInt(process.env.EMAIL_SIMULADO_DEMORA_MS || '0', 10);
        if (demora > 0)
            await new Promise((r) => setTimeout(r, demora));
        if (exports.simulado.fallar)
            throw new Error('Proveedor simulado: fallo forzado');
        if (exports.simulado.rechazarPara && m.to.includes(exports.simulado.rechazarPara)) {
            const e = new Error('550 5.1.1 destinatario inexistente (simulado)');
            e.permanente = true;
            throw e;
        }
        if (exports.simulado.fallarPara && m.to.includes(exports.simulado.fallarPara)) {
            throw new Error(`Proveedor simulado: rechazo para ${m.to}`);
        }
        const r = await mongoose_1.default.connection.collection('email_simulado').insertOne({
            to: m.to,
            subject: m.subject,
            text: m.text,
            html: m.html,
            fecha: new Date(),
        });
        return { id: String(r.insertedId) };
    },
});
let proveedor = null;
const crearProveedor = (nombre) => {
    switch (nombre.toLowerCase()) {
        case 'ses':
            return crearSes();
        case 'brevo':
            return crearBrevo();
        case 'simulado':
            return crearSimulado();
        case 'smtp':
            return crearSmtp();
        default:
            throw new Error(`EMAIL_PROVIDER desconocido: '${nombre}' (use smtp, ses, brevo o simulado)`);
    }
};
exports.crearProveedor = crearProveedor;
const obtenerProveedor = () => {
    if (proveedor)
        return proveedor;
    proveedor = (0, exports.crearProveedor)(process.env.EMAIL_PROVIDER || 'smtp');
    logger_1.logger.info(`[Email] Proveedor de correo: ${proveedor.nombre}`);
    return proveedor;
};
exports.obtenerProveedor = obtenerProveedor;
//# sourceMappingURL=proveedores.js.map