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

// Auditoría 4.G: ningún proveedor puede colgar la cola. Timeout de conexión/respuesta (EMAIL_TIMEOUT_MS, 30 s):
// un SMTP que acepta la conexión y nunca responde (p. ej. el de cPanel con MagicSpam) antes frenaba todo 10 min.
const timeoutCorreoMs = (): number => {
  const v = parseInt(process.env.EMAIL_TIMEOUT_MS || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 30000;
};

/**
 * ¿El error es PERMANENTE para ese destinatario? (auditoría 4.H) Reintentar no sirve: la dirección no existe o
 * fue rechazada. Los errores de cuenta/credenciales (535, 401/403, cuenta de SES pausada) NO son permanentes por
 * destinatario: se reintentan y terminan en FALLIDO registrado (hay que corregir la configuración).
 */
// Auditoría 4.AF: Exim/cPanel aplica sus ACL en RCPT (sender verify, RBL, MagicSpam, "max emails per hour") y
// responde 550 igual que a una dirección inexistente. Permanente SOLO con código mejorado 5.1.1/5.1.2/5.1.10 o texto
// claro de destinatario inexistente; cualquier 5.7.x o texto de política/spam/límite/remitente/relay es transitorio.
const CODIGO_DESTINATARIO_INEXISTENTE = /\b5\.1\.(1|2|10)\b/;
const TEXTO_DESTINATARIO_INEXISTENTE = /user unknown|unknown user|no such user|does not exist|mailbox unavailable/i;
const TEXTO_TRANSITORIO = /\b5\.7\.\d+|policy|spam|blacklist|blocked|\brate\b|exceeded|sender|relay/i;

export const esErrorPermanente = (proveedor: string, error: any): boolean => {
  if (!error) return false;
  // Texto que da el proveedor (respuesta SMTP, cuerpo de Brevo, mensaje de SES)
  const texto = String(error.response ?? error.detalle ?? error.message ?? '');
  // 4.AF: el mismo criterio de texto para todos los proveedores: política, spam o límite nunca es permanente
  if (TEXTO_TRANSITORIO.test(texto)) return false;
  if (proveedor === 'smtp') {
    // Auditoría 4.R: nodemailer pone code 'EENVELOPE' también en rechazos de MAIL FROM, en RCPT con 4xx y en DATA.
    // Greylisting (451), "exceeded max emails per hour" de cPanel o el remitente rechazado son TEMPORALES o de
    // configuración: se reintentan. Solo el RCPT TO rechazado con 550-554 PUEDE ser permanente y, por 4.AF,
    // únicamente si el código mejorado o el texto dicen que el destinatario no existe.
    const rcpt = /^RCPT TO$/i.test(String(error.command || '').trim());
    const codigo = Number(error.responseCode);
    if (!rcpt || codigo < 550 || codigo > 554) return false;
    return CODIGO_DESTINATARIO_INEXISTENTE.test(texto) || TEXTO_DESTINATARIO_INEXISTENTE.test(texto);
  }
  // Auditoría 4.T: solo el rechazo de la DIRECCIÓN del destinatario es permanente. Remitente inválido o inactivo,
  // dominio sin verificar o sandbox son errores de CONFIGURACIÓN: se reintentan y terminan en FALLIDO registrado.
  if (proveedor === 'brevo') {
    if (error.status !== 400 && error.status !== 422) return false;
    if (/remitente/i.test(texto)) return false;
    return /(invalid|not valid).{0,40}(\bto\b|recipient|email)|(\bto\b|recipient|email).{0,40}(invalid|not valid)/i.test(texto);
  }
  if (proveedor === 'ses') {
    // SESv2: BadRequestException / MessageRejected con dirección mal formada. "not verified" = configuración.
    if (!['BadRequestException', 'MessageRejected'].includes(error.name)) return false;
    if (/not verified|sender|from/i.test(texto)) return false;
    return /illegal address|invalid (email )?address|missing final '@|domain contains illegal|local address contains/i.test(texto);
  }
  return false;
};

/**
 * Cortocircuito (auditoría 4.AF): si en 10 min hay "permanentes" a >= 5 dominios distintos, lo más probable es un
 * bloqueo del proveedor (RBL, MagicSpam, cuenta suspendida), no cinco direcciones inexistentes: durante 30 min
 * todos esos rechazos se tratan como TRANSITORIOS (se reintentan) en vez de darse por atendidos y perderse.
 */
const VENTANA_CORTOCIRCUITO_MS = 10 * 60 * 1000;
const DURACION_CORTOCIRCUITO_MS = 30 * 60 * 1000;
const DOMINIOS_CORTOCIRCUITO = 5;
let permanentesRecientes: { dominio: string; t: number }[] = [];
let cortocircuitoHasta = 0;

/** Solo pruebas y diagnóstico: estado del cortocircuito. */
export const estadoCortocircuito = () => ({ activoHasta: cortocircuitoHasta > Date.now() ? new Date(cortocircuitoHasta) : null });
/** Solo pruebas. */
export const reiniciarCortocircuito = (): void => {
  permanentesRecientes = [];
  cortocircuitoHasta = 0;
};

const marcarPermanente = (proveedor: string, error: any, destinatario?: string) => {
  if (!error || typeof error !== 'object' || !esErrorPermanente(proveedor, error)) return error;
  const ahora = Date.now();
  if (cortocircuitoHasta > ahora) return error; // cortocircuito activo: transitorio
  const dominio = String(destinatario || '').split('@')[1]?.toLowerCase() || '';
  permanentesRecientes = permanentesRecientes.filter((p) => ahora - p.t < VENTANA_CORTOCIRCUITO_MS);
  permanentesRecientes.push({ dominio, t: ahora });
  const dominios = new Set(permanentesRecientes.map((p) => p.dominio));
  if (dominios.size >= DOMINIOS_CORTOCIRCUITO) {
    cortocircuitoHasta = ahora + DURACION_CORTOCIRCUITO_MS;
    permanentesRecientes = [];
    logger.error(
      `[Email] ${dominios.size} rechazos "permanentes" a dominios distintos en 10 min: posible bloqueo del proveedor. ` +
        `Durante 30 min se tratan como transitorios (se reintentan).`,
    );
    return error;
  }
  error.permanente = true;
  return error;
};

/**
 * Ejecuta fn con un AbortSignal que se aborta al vencer el timeout de correo. Auditoría 4.AH: rechaza al vencer
 * AUNQUE fn no observe la señal (nodemailer no la acepta): el timeout es TOTAL por envío, incluida la cola del pool
 * y un servidor que responde a cuentagotas (tarpit). Premisa de 4.S: un envío nunca dura más que EMAIL_TIMEOUT_MS.
 */
const conTimeout = async <T>(nombre: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const ms = timeoutCorreoMs();
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ms);
  const vencido = new Promise<never>((_, rechazar) => {
    control.signal.addEventListener('abort', () => rechazar(new Error(`${nombre}: tiempo agotado (${ms} ms)`)), { once: true });
  });
  vencido.catch(() => undefined); // si fn termina antes, la promesa vencida no queda sin atender
  try {
    return await Promise.race([fn(control.signal), vencido]);
  } catch (error: any) {
    if (control.signal.aborted) throw new Error(`${nombre}: tiempo agotado (${ms} ms)`);
    throw error;
  } finally {
    clearTimeout(reloj);
  }
};

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
    // 4.G: sin esto nodemailer espera hasta 2 min para conectar, 30 s el saludo y 10 min por socket
    connectionTimeout: timeoutCorreoMs(),
    greetingTimeout: timeoutCorreoMs(),
    socketTimeout: timeoutCorreoMs(),
  } as any);
  transporter
    .verify()
    .then(() => logger.debug('[Email] Conexión SMTP verificada'))
    .catch((err: any) => logger.warn('[Email] No se pudo verificar la conexión SMTP:', err?.code || err?.message));
  return {
    nombre: 'smtp',
    async send(m) {
      const r = remitente();
      try {
        // 4.AH: timeout TOTAL del envío (los timeouts de nodemailer son de conexión/saludo/inactividad)
        const info: any = await conTimeout('SMTP', () =>
          transporter.sendMail({
            from: `"${r.nombre}" <${r.email}>`,
            to: m.to,
            subject: m.subject,
            text: m.text || '',
            html: m.html || undefined,
          }),
        );
        return { id: info.messageId };
      } catch (error) {
        throw marcarPermanente('smtp', error, m.to);
      }
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
      const salida: any = await conTimeout('SES', (abortSignal) => cliente.send(
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
        { abortSignal },
      )).catch((error: any) => {
        throw marcarPermanente('ses', error, m.to);
      });
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
      const resp: Response = await conTimeout('Brevo', (signal) => fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
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
        // El cuerpo de error de Brevo no incluye la API key; se recorta por si acaso
        const detalle = (await resp.text().catch(() => '')).slice(0, 300);
        const error: any = new Error(`Brevo respondió ${resp.status}: ${detalle}`);
        error.status = resp.status;
        error.detalle = detalle;
        throw marcarPermanente('brevo', error, m.to);
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
  // Solo pruebas: rechazo PERMANENTE (como un 550) para los destinatarios que contengan este texto
  rechazarPara: '' as string,
};
const crearSimulado = (): EmailProvider => ({
  nombre: 'simulado',
  async send(m) {
    // Solo pruebas: EMAIL_SIMULADO_DEMORA_MS simula la latencia de un proveedor real
    const demora = parseInt(process.env.EMAIL_SIMULADO_DEMORA_MS || '0', 10);
    if (demora > 0) await new Promise((r) => setTimeout(r, demora));
    if (simulado.fallar) throw new Error('Proveedor simulado: fallo forzado');
    if (simulado.rechazarPara && m.to.includes(simulado.rechazarPara)) {
      const e: any = new Error('550 5.1.1 destinatario inexistente (simulado)');
      e.permanente = true;
      throw e;
    }
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

/**
 * Observadores de cada envío (auditoría 4.AG): 'exito', 'fallo' (el proveedor no lo aceptó) o 'rechazo' (dirección
 * rechazada de forma permanente: el proveedor funciona). El detector de fallos sistémicos se conecta desde
 * queue/handlers.ts.
 */
export type ResultadoEnvio = 'exito' | 'fallo' | 'rechazo';
const observadoresEnvio: ((resultado: ResultadoEnvio) => void)[] = [];
export const registrarObservadorEnvios = (fn: (resultado: ResultadoEnvio) => void): void => {
  observadoresEnvio.push(fn);
};
const avisarEnvio = (resultado: ResultadoEnvio): void => {
  for (const fn of observadoresEnvio) {
    try {
      fn(resultado);
    } catch (e: any) {
      logger.error(`[Email] observador de envíos: ${e?.message || e}`);
    }
  }
};

/** Proveedor configurado (EMAIL_PROVIDER). Por defecto smtp, que es lo que había antes de la Fase 4. */
export const obtenerProveedor = (): EmailProvider => {
  if (proveedor) return proveedor;
  const real = crearProveedor(process.env.EMAIL_PROVIDER || 'smtp');
  proveedor = {
    nombre: real.nombre,
    async send(m) {
      try {
        const r = await real.send(m);
        avisarEnvio('exito');
        return r;
      } catch (error: any) {
        avisarEnvio(error?.permanente ? 'rechazo' : 'fallo');
        throw error;
      }
    },
  };
  logger.info(`[Email] Proveedor de correo: ${proveedor.nombre}`);
  return proveedor;
};
