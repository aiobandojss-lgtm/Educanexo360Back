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
exports.estadoWorker = exports.detenerWorker = exports.iniciarWorker = exports.ejecutarTick = exports.encolar = exports.registrarTareaPeriodica = exports.registrarHandler = exports.FalloDefinitivo = exports.ReprogramarTrabajo = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const outbox_model_1 = __importStar(require("../models/outbox.model"));
const logger_1 = require("../utils/logger");
const num = (clave, porDefecto) => {
    const v = parseInt(process.env[clave] || '', 10);
    return Number.isFinite(v) && v > 0 ? v : porDefecto;
};
const CFG = {
    intervaloMs: num('OUTBOX_INTERVAL_MS', 5000),
    lote: num('OUTBOX_BATCH', 20),
    concurrencia: num('OUTBOX_CONCURRENCY', 5),
    maxIntentos: num('OUTBOX_MAX_INTENTOS', 5),
    lockMs: num('OUTBOX_LOCK_MS', 2 * 60 * 1000),
    backoffBaseMs: num('OUTBOX_BACKOFF_MS', 30 * 1000),
    timeoutTrabajoMs: Math.min(num('OUTBOX_TIMEOUT_TRABAJO_MS', 90 * 1000), num('OUTBOX_LOCK_MS', 2 * 60 * 1000) - 1000),
    retencionMs: 7 * 24 * 60 * 60 * 1000,
};
class ReprogramarTrabajo extends Error {
    constructor(fecha, motivo) {
        super(motivo);
        this.fecha = fecha;
        this.name = 'ReprogramarTrabajo';
    }
}
exports.ReprogramarTrabajo = ReprogramarTrabajo;
class FalloDefinitivo extends Error {
    constructor(motivo) {
        super(motivo);
        this.definitivo = true;
        this.name = 'FalloDefinitivo';
    }
}
exports.FalloDefinitivo = FalloDefinitivo;
const handlers = new Map();
const tareasPeriodicas = [];
const registrarHandler = (tipo, handler) => {
    handlers.set(tipo, handler);
};
exports.registrarHandler = registrarHandler;
const registrarTareaPeriodica = (nombre, fn) => {
    if (!tareasPeriodicas.some((t) => t.nombre === nombre))
        tareasPeriodicas.push({ nombre, fn });
};
exports.registrarTareaPeriodica = registrarTareaPeriodica;
const encolar = async (trabajos) => {
    const lista = (Array.isArray(trabajos) ? trabajos : [trabajos]).map((t) => ({
        tipo: t.tipo,
        payload: t.payload,
        prioridad: t.prioridad || 'normal',
        orden: outbox_model_1.ORDEN_PRIORIDAD[t.prioridad || 'normal'] ?? 2,
        ...(t.escuelaId && mongoose_1.default.isValidObjectId(String(t.escuelaId)) && { escuelaId: t.escuelaId }),
        ...(t.claveUnica && { claveUnica: t.claveUnica }),
        nextRunAt: t.nextRunAt || new Date(),
    }));
    if (lista.length === 0)
        return 0;
    try {
        const insertados = await outbox_model_1.default.insertMany(lista, { ordered: false });
        return insertados.length;
    }
    catch (error) {
        const errores = error?.writeErrors || [];
        if (errores.length > 0 && errores.every((e) => (e.code ?? e.err?.code) === 11000)) {
            return lista.length - errores.length;
        }
        throw error;
    }
};
exports.encolar = encolar;
let timer = null;
let tickEnCurso = null;
let deteniendo = false;
let ultimoTick = null;
let trabajosEnCurso = 0;
const redactar = (trabajo) => trabajo.payload?.sensible ? { payload: { sensible: true, redactado: true } } : {};
const retrasoBackoff = (intentos) => CFG.backoffBaseMs * Math.pow(2, Math.max(intentos - 1, 0));
const cerrarTrabajo = async (trabajo, update, que) => {
    for (let intento = 1; intento <= 3; intento++) {
        try {
            const r = await outbox_model_1.default.updateOne({ _id: trabajo._id, estado: 'PROCESANDO', lockedUntil: trabajo.lockedUntil }, update);
            if (r.matchedCount === 0) {
                logger_1.logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id}: no se marcó ${que} (el lock venció y otro proceso lo retomó)`);
            }
            return r.matchedCount > 0;
        }
        catch (error) {
            if (intento === 3) {
                logger_1.logger.error(`[Outbox] ${trabajo.tipo} ${trabajo._id}: no se pudo marcar ${que}:`, error?.message || error);
                return false;
            }
            await new Promise((r) => setTimeout(r, 200 * intento));
        }
    }
    return false;
};
const ejecutarTrabajo = async (trabajo) => {
    const handler = handlers.get(trabajo.tipo);
    const enviados = new Set(trabajo.enviados || []);
    const ctx = {
        enviados,
        marcarEnviados: async (ids) => {
            const nuevos = ids.map(String).filter((id) => !enviados.has(id));
            if (nuevos.length === 0)
                return;
            await outbox_model_1.default.updateOne({ _id: trabajo._id }, { $addToSet: { enviados: { $each: nuevos } } });
            nuevos.forEach((id) => enviados.add(id));
        },
    };
    let errorHandler = null;
    try {
        if (!handler)
            throw new Error(`Sin handler para el tipo de trabajo '${trabajo.tipo}'`);
        let reloj;
        try {
            await Promise.race([
                handler(trabajo, ctx),
                new Promise((_, rechazar) => {
                    reloj = setTimeout(() => rechazar(new Error(`Tiempo agotado: el trabajo superó ${CFG.timeoutTrabajoMs} ms`)), CFG.timeoutTrabajoMs);
                }),
            ]);
        }
        finally {
            if (reloj)
                clearTimeout(reloj);
        }
    }
    catch (error) {
        errorHandler = error ?? new Error('Error desconocido');
    }
    if (!errorHandler) {
        await cerrarTrabajo(trabajo, {
            $set: { estado: 'HECHO', expireAt: new Date(Date.now() + CFG.retencionMs), ...redactar(trabajo) },
            $unset: { lockedUntil: 1, error: 1 },
        }, 'HECHO');
        return;
    }
    if (errorHandler instanceof ReprogramarTrabajo) {
        await cerrarTrabajo(trabajo, {
            $set: { estado: 'PENDIENTE', nextRunAt: errorHandler.fecha, error: errorHandler.message },
            $inc: { intentos: -1 },
            $unset: { lockedUntil: 1 },
        }, 'aplazado');
        logger_1.logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id} aplazado hasta ${errorHandler.fecha.toISOString()}: ${errorHandler.message}`);
        return;
    }
    const mensaje = String(errorHandler?.message || errorHandler).slice(0, 1000);
    if (trabajo.intentos >= CFG.maxIntentos || errorHandler?.definitivo === true) {
        await cerrarTrabajo(trabajo, {
            $set: {
                estado: 'FALLIDO',
                error: mensaje,
                expireAt: new Date(Date.now() + CFG.retencionMs),
                ...redactar(trabajo),
            },
            $unset: { lockedUntil: 1 },
        }, 'FALLIDO');
        logger_1.logger.error(`[Outbox] ${trabajo.tipo} ${trabajo._id} FALLIDO tras ${trabajo.intentos} intento(s): ${mensaje}`);
    }
    else {
        const nextRunAt = new Date(Date.now() + retrasoBackoff(trabajo.intentos));
        await cerrarTrabajo(trabajo, { $set: { estado: 'PENDIENTE', error: mensaje, nextRunAt }, $unset: { lockedUntil: 1 } }, 'para reintento');
        logger_1.logger.warn(`[Outbox] ${trabajo.tipo} ${trabajo._id} intento ${trabajo.intentos} falló (reintento ${nextRunAt.toISOString()}): ${mensaje}`);
    }
};
const tomarSiguiente = async () => {
    const ahora = new Date();
    return outbox_model_1.default.findOneAndUpdate({ estado: 'PENDIENTE', nextRunAt: { $lte: ahora } }, {
        $set: { estado: 'PROCESANDO', lockedUntil: new Date(ahora.getTime() + CFG.lockMs) },
        $inc: { intentos: 1 },
    }, { sort: { orden: 1, nextRunAt: 1 }, new: true });
};
const ejecutarTick = async () => {
    if (tickEnCurso)
        return tickEnCurso;
    if (mongoose_1.default.connection.readyState !== 1)
        return;
    tickEnCurso = (async () => {
        ultimoTick = new Date();
        try {
            const vencido = { estado: 'PROCESANDO', lockedUntil: { $lt: new Date() } };
            await outbox_model_1.default.updateMany({ ...vencido, intentos: { $gte: CFG.maxIntentos } }, {
                $set: {
                    estado: 'FALLIDO',
                    error: 'Proceso interrumpido en cada intento (lock vencido)',
                    expireAt: new Date(Date.now() + CFG.retencionMs),
                },
                $unset: { lockedUntil: 1 },
            });
            await outbox_model_1.default.updateMany({ ...vencido, intentos: { $lt: CFG.maxIntentos } }, { $set: { estado: 'PENDIENTE' }, $unset: { lockedUntil: 1 } });
            for (const tarea of tareasPeriodicas) {
                if (deteniendo)
                    break;
                await tarea.fn().catch((err) => logger_1.logger.error(`[Outbox] tarea periódica ${tarea.nombre}:`, err));
            }
            let tomados = 0;
            const carril = async () => {
                while (!deteniendo && tomados < CFG.lote) {
                    tomados++;
                    let trabajo = null;
                    try {
                        trabajo = await tomarSiguiente();
                    }
                    catch (error) {
                        logger_1.logger.error('[Outbox] Error tomando el siguiente trabajo:', error);
                        return;
                    }
                    if (!trabajo)
                        return;
                    trabajosEnCurso++;
                    try {
                        await ejecutarTrabajo(trabajo);
                    }
                    catch (error) {
                        logger_1.logger.error(`[Outbox] Error inesperado en el trabajo ${trabajo._id}:`, error);
                    }
                    finally {
                        trabajosEnCurso--;
                    }
                }
            };
            await Promise.allSettled(Array.from({ length: CFG.concurrencia }, carril));
        }
        catch (error) {
            logger_1.logger.error('[Outbox] Error en el tick del worker:', error);
        }
    })().finally(() => {
        tickEnCurso = null;
    });
    return tickEnCurso;
};
exports.ejecutarTick = ejecutarTick;
const iniciarWorker = () => {
    if (timer || process.env.OUTBOX_DISABLED === 'true')
        return;
    deteniendo = false;
    timer = setInterval(() => {
        (0, exports.ejecutarTick)().catch((err) => logger_1.logger.error('[Outbox] tick:', err));
    }, CFG.intervaloMs);
    timer.unref();
    logger_1.logger.info(`[Outbox] Worker iniciado (cada ${CFG.intervaloMs} ms, concurrencia ${CFG.concurrencia})`);
};
exports.iniciarWorker = iniciarWorker;
const detenerWorker = async (esperaMs = 8000) => {
    deteniendo = true;
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    if (tickEnCurso) {
        await Promise.race([tickEnCurso, new Promise((r) => setTimeout(r, esperaMs))]);
    }
};
exports.detenerWorker = detenerWorker;
const estadoWorker = () => ({
    activo: !!timer && !deteniendo,
    ultimoTick,
    trabajosEnCurso,
    intervaloMs: CFG.intervaloMs,
});
exports.estadoWorker = estadoWorker;
//# sourceMappingURL=outbox.js.map