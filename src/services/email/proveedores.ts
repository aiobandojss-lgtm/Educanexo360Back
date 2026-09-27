import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import config from '../../config/config';
import { logger } from '../../utils/logger';

/**
 * Proveedor de correo intercambiable (Fase 4.4). Se elige con EMAIL_PROVIDER = smtp | ses | brevo | simulado.
 * Credenciales SOLO por variables de entorno. Todas las implementaciones LANZAN error si el envío falla
 * (la cola reintenta); nunca devuelven "false" en silencio.
 */
export interface MensajeCorreo {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface EmailProvider {
  nombre: string;
  send(mensaje: MensajeCorreo): Promise<{ id?: string }>;
}

const remitente = () => ({ nombre: config.email.senderName, email: config.email.senderEmail });

// ===== SMTP (nodemailer con pool) =====
const crearSmtp = (): EmailProvider => {
  const num = (v: string | undefined, d: number) => (Number.isFinite(parseInt(v || '', 10)) ? parseInt(v!, 10) : d);
  const transporter = nodemailer.createTransport({
    pool: true,
    maxConnections: num(process.env.EMAIL_SMTP_MAX_CONNECTIONS, 2),
    // Tope de mensajes por segundo (rateDelta 1 s) para no ser bloqueados por el servidor SMTP
    rateDelta: 1000,
    rateLimit: num(process.env.EMAIL_SMTP_RATE_LIMIT, 5),
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: { user: config.email.user, pass: config.email.pass },
    tls: { rejectUnauthorized: config.email.tlsRejectUnauthorized },
  } as any);
  transporter
    .verify()
    .then(() => logger.debug('[Email] Conexión SMTP verificada'))
    .catch((err: any) => logger.warn('[Email] No se pudo verificar la conexión SMTP:', err?.code || err?.message));
  return {
    nombre: 'smtp',
    async send(m) {
      const r = remitente();
      const info = await transporter.sendMail({
        from: `"${r.nombre}" <${r.email}>`,
        to: m.to,
        subject: m.subject,
        text: m.text || '',
        html: m.html || undefined,
      });
      return { id: info.messageId };
    },
  };
};

// ===== Amazon SES (API SESv2) =====
const crearSes = (): EmailProvider => {
  // require perezoso: el SDK solo se carga si se usa SES
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
  const region = process.env.AWS_SES_REGION || process.env.AWS_REGION;
  if (!region) throw new Error('EMAIL_PROVIDER=ses requiere AWS_SES_REGION (o AWS_REGION)');
  // Credenciales: cadena estándar del SDK (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY en el entorno)
  const cliente = new SESv2Client({ region });
  return {
    nombre: 'ses',
    async send(m) {
      const r = remitente();
      const salida = await cliente.send(
        new SendEmailCommand({
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
        }),
      );
      return { id: salida.MessageId };
    },
  };
};

// ===== Brevo (API REST transaccional, fetch nativo) =====
const crearBrevo = (): EmailProvider => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('EMAIL_PROVIDER=brevo requiere BREVO_API_KEY');
  return {
    nombre: 'brevo',
    async send(m) {
      const r = remitente();
      const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: r.nombre, email: r.email },
          to: [{ email: m.to }],
          subject: m.subject,
          ...(m.html && { htmlContent: m.html }),
          textContent: m.text || ' ',
        }),
      });
      if (!resp.ok) {
        // El cuerpo de error de Brevo no incluye la API key; se recorta por si acaso
        const detalle = (await resp.text().catch(() => '')).slice(0, 300);
        throw new Error(`Brevo respondió ${resp.status}: ${detalle}`);
      }
      const json: any = await resp.json().catch(() => ({}));
      return { id: json.messageId };
    },
  };
};

// ===== Simulado (desarrollo y pruebas): nada sale a internet =====
// Guarda cada correo en la colección email_simulado. EMAIL_SIMULADO_FALLA=true hace fallar todos los envíos.
export const simulado = {
  fallar: process.env.EMAIL_SIMULADO_FALLA === 'true',
  // Solo pruebas: falla para los destinatarios que contengan este texto
  fallarPara: '' as string,
};
const crearSimulado = (): EmailProvider => ({
  nombre: 'simulado',
  async send(m) {
    // Solo pruebas: EMAIL_SIMULADO_DEMORA_MS simula la latencia de un proveedor real
    const demora = parseInt(process.env.EMAIL_SIMULADO_DEMORA_MS || '0', 10);
    if (demora > 0) await new Promise((r) => setTimeout(r, demora));
    if (simulado.fallar) throw new Error('Proveedor simulado: fallo forzado');
    if (simulado.fallarPara && m.to.includes(simulado.fallarPara)) {
      throw new Error(`Proveedor simulado: rechazo para ${m.to}`);
    }
    const r = await mongoose.connection.collection('email_simulado').insertOne({
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      fecha: new Date(),
    });
    return { id: String(r.insertedId) };
  },
});

let proveedor: EmailProvider | null = null;

/** Crea el proveedor indicado (exportado para pruebas). */
export const crearProveedor = (nombre: string): EmailProvider => {
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

/** Proveedor configurado (EMAIL_PROVIDER). Por defecto smtp, que es lo que había antes de la Fase 4. */
export const obtenerProveedor = (): EmailProvider => {
  if (proveedor) return proveedor;
  proveedor = crearProveedor(process.env.EMAIL_PROVIDER || 'smtp');
  logger.info(`[Email] Proveedor de correo: ${proveedor.nombre}`);
  return proveedor;
};
