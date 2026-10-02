"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.construirCopiaAcudiente = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const IMensaje_1 = require("../interfaces/IMensaje");
const INotificacion_1 = require("../interfaces/INotificacion");
const regexBusqueda_1 = require("../utils/regexBusqueda");
const email_service_1 = require("./email.service");
const preferencias_1 = require("../utils/preferencias");
const pushNotification_service_1 = __importDefault(require("./pushNotification.service"));
const notificacion_model_1 = __importDefault(require("../models/notificacion.model"));
const INotificacion_2 = require("../interfaces/INotificacion");
const outbox_1 = require("../queue/outbox");
const simpleCache_1 = require("../cache/simpleCache");
const config_1 = __importDefault(require("../config/config"));
const accesoAcademico_1 = require("../utils/accesoAcademico");
const logger_1 = require("../utils/logger");
const claveLote_1 = require("../utils/claveLote");
const TIPO_LEGIBLE = {
    DOCENTE: 'docente',
    RECTOR: 'rector(a)',
    COORDINADOR: 'coordinador(a)',
    ADMINISTRATIVO: 'administrativo(a)',
    ADMIN: 'administrador(a)',
    SUPER_ADMIN: 'administrador(a) del sistema',
    ESTUDIANTE: 'estudiante',
    ACUDIENTE: 'acudiente',
};
const construirCopiaAcudiente = (datos, remitente, estudiante) => {
    const tipo = TIPO_LEGIBLE[remitente.tipo || ''] || 'personal del colegio';
    const nombreRemitente = `${remitente.nombre ?? ''} ${remitente.apellidos ?? ''}`.trim();
    const nombreEstudiante = `${estudiante.nombre ?? ''} ${estudiante.apellidos ?? ''}`.trim();
    return {
        asunto: `${datos.asunto} · ${(estudiante.nombre ?? '').trim()}`,
        contenido: `El/La ${tipo} ${nombreRemitente} le escribió a ${nombreEstudiante}. ` +
            `Usted recibe este mensaje porque es su acudiente.\n\n${datos.contenido}`,
    };
};
exports.construirCopiaAcudiente = construirCopiaAcudiente;
class MensajeService {
    createCacheKey(type, ...params) {
        return `${type}_${params.join('_')}`;
    }
    async getOrSetCache(cacheKey, ttl, fetchFunction) {
        const cached = simpleCache_1.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.debug(`📋 CACHE HIT: ${cacheKey}`);
            return cached;
        }
        const result = await fetchFunction();
        if ((0, simpleCache_1.safeCacheSet)(cacheKey, result, ttl)) {
            logger_1.logger.debug(`💾 CACHE SET: ${cacheKey} (${ttl}s)`);
        }
        return result;
    }
    safeObjectId(id) {
        try {
            if (!id)
                return null;
            if (id instanceof mongoose_1.default.Types.ObjectId)
                return id;
            if (typeof id === 'string' && mongoose_1.default.isValidObjectId(id)) {
                return new mongoose_1.default.Types.ObjectId(id);
            }
            return null;
        }
        catch (error) {
            console.error('Error al convertir a ObjectId:', error);
            return null;
        }
    }
    async getPosiblesDestinatarios(userId, escuelaId, query = '') {
        try {
            logger_1.logger.debug(`🔍 getPosiblesDestinatarios: userId=${userId}, query='${query}'`);
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(escuelaId)) {
                throw new ApiError_1.default(400, 'IDs inválidos');
            }
            const cacheKey = this.createCacheKey('destinatarios', userId, escuelaId, query);
            return await this.getOrSetCache(cacheKey, 120, async () => {
                const resultado = await usuario_model_1.default.aggregate([
                    {
                        $match: {
                            escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
                            _id: { $ne: new mongoose_1.default.Types.ObjectId(userId) },
                            estado: 'ACTIVO',
                            ...(query &&
                                query.trim() !== '' && {
                                $or: [
                                    { nombre: { $regex: (0, regexBusqueda_1.patronBusqueda)(query), $options: 'i' } },
                                    { apellidos: { $regex: (0, regexBusqueda_1.patronBusqueda)(query), $options: 'i' } },
                                    { email: { $regex: (0, regexBusqueda_1.patronBusqueda)(query), $options: 'i' } },
                                ],
                            }),
                        },
                    },
                    {
                        $lookup: {
                            from: 'usuarios',
                            let: { currentUserId: new mongoose_1.default.Types.ObjectId(userId) },
                            pipeline: [
                                { $match: { $expr: { $eq: ['$_id', '$$currentUserId'] } } },
                                { $project: { tipo: 1 } },
                            ],
                            as: 'usuario_actual',
                        },
                    },
                    {
                        $addFields: {
                            usuario_tipo: { $arrayElemAt: ['$usuario_actual.tipo', 0] },
                        },
                    },
                    {
                        $match: {
                            $expr: {
                                $cond: [
                                    { $eq: ['$usuario_tipo', 'ESTUDIANTE'] },
                                    { $in: ['$tipo', ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO']] },
                                    true,
                                ],
                            },
                        },
                    },
                    {
                        $project: {
                            _id: 1,
                            nombre: 1,
                            apellidos: 1,
                            email: 1,
                            tipo: 1,
                            avatar: '$perfil.avatar',
                            nombreCompleto: {
                                $concat: ['$nombre', ' ', '$apellidos'],
                            },
                        },
                    },
                    {
                        $sort: { nombreCompleto: 1 },
                    },
                    {
                        $limit: 50,
                    },
                ]);
                logger_1.logger.debug(`✅ Destinatarios encontrados: ${resultado.length}`);
                return resultado;
            });
        }
        catch (error) {
            console.error('[ERROR] getPosiblesDestinatarios:', error);
            throw this.handleError(error);
        }
    }
    async getCursosPosiblesDestinatarios(userId, escuelaId) {
        try {
            if (!mongoose_1.default.isValidObjectId(userId) || !mongoose_1.default.isValidObjectId(escuelaId)) {
                throw new ApiError_1.default(400, 'IDs inválidos');
            }
            const cacheKey = this.createCacheKey('cursos_destinatarios', userId, escuelaId);
            return await this.getOrSetCache(cacheKey, 600, async () => {
                const resultado = await usuario_model_1.default.aggregate([
                    {
                        $match: { _id: new mongoose_1.default.Types.ObjectId(userId) },
                    },
                    {
                        $project: {
                            tipo: 1,
                            tienePermisosMasivos: {
                                $in: [
                                    '$tipo',
                                    ['ADMIN', 'SUPER_ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'],
                                ],
                            },
                        },
                    },
                    {
                        $match: { tienePermisosMasivos: true },
                    },
                    {
                        $lookup: {
                            from: 'cursos',
                            let: { escuela: new mongoose_1.default.Types.ObjectId(escuelaId) },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ['$escuelaId', '$$escuela'] },
                                    },
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        nombre: 1,
                                        grado: 1,
                                        seccion: 1,
                                        nivel: 1,
                                        estudiantesCount: { $size: { $ifNull: ['$estudiantes', []] } },
                                    },
                                },
                                {
                                    $sort: { nivel: 1, grado: 1, seccion: 1 },
                                },
                            ],
                            as: 'cursos',
                        },
                    },
                    {
                        $unwind: '$cursos',
                    },
                    {
                        $replaceRoot: { newRoot: '$cursos' },
                    },
                ]);
                if (resultado.length === 0) {
                    const usuario = await usuario_model_1.default.findById(userId).select('tipo');
                    if (!usuario) {
                        throw new ApiError_1.default(404, 'Usuario no encontrado');
                    }
                    const rolesMasivos = [
                        'ADMIN',
                        'SUPER_ADMIN',
                        'RECTOR',
                        'COORDINADOR',
                        'ADMINISTRATIVO',
                        'DOCENTE',
                    ];
                    if (!rolesMasivos.includes(usuario.tipo)) {
                        throw new ApiError_1.default(403, 'No tiene permisos para enviar mensajes masivos');
                    }
                }
                logger_1.logger.debug(`✅ Cursos encontrados: ${resultado.length}`);
                return resultado;
            });
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async crearMensaje(datos, user) {
        try {
            const { destinatarios = [], destinatariosCc = [], cursoIds = [], asunto, contenido, adjuntos = [], tipo = IMensaje_1.TipoMensaje.INDIVIDUAL, prioridad = IMensaje_1.PrioridadMensaje.NORMAL, estado = IMensaje_1.EstadoMensaje.ENVIADO, etiquetas = [], esRespuesta = false, mensajeOriginalId = null, esCopiaAcudiente = false, copiaDe = undefined, } = datos;
            if (!user.escuelaId) {
                throw new ApiError_1.default(403, 'No tiene una escuela asociada');
            }
            let destinatariosFinales = (0, accesoAcademico_1.aArregloDeIds)(destinatarios);
            let destinatariosCcFinales = (0, accesoAcademico_1.aArregloDeIds)(destinatariosCc);
            const cursoIdsValidos = (0, accesoAcademico_1.aArregloDeIds)(cursoIds);
            if (cursoIdsValidos.length > 0) {
                const rolesMasivos = [
                    'ADMIN',
                    'SUPER_ADMIN',
                    'RECTOR',
                    'COORDINADOR',
                    'ADMINISTRATIVO',
                    'DOCENTE',
                ];
                if (!rolesMasivos.includes(user.tipo)) {
                    throw new ApiError_1.default(403, 'No tiene permisos para enviar mensajes masivos');
                }
                if (user.tipo === 'DOCENTE') {
                    const cursosDocente = await (0, accesoAcademico_1.obtenerCursosDocente)(String(user._id), String(user.escuelaId), false);
                    if (cursoIdsValidos.some((id) => !cursosDocente.includes(id))) {
                        throw new ApiError_1.default(403, 'Solo puede enviar mensajes a sus cursos');
                    }
                }
                const cursosDestinatarios = await this.obtenerDestinatariosDeCursos(cursoIdsValidos, String(user.escuelaId));
                destinatariosFinales.push(...cursosDestinatarios);
            }
            destinatariosFinales = [...new Set(destinatariosFinales)];
            destinatariosCcFinales = [...new Set(destinatariosCcFinales)];
            const validos = await usuario_model_1.default.find({
                _id: { $in: [...destinatariosFinales, ...destinatariosCcFinales] },
                escuelaId: user.escuelaId,
                estado: 'ACTIVO',
            })
                .select('_id')
                .lean();
            const idsValidos = new Set(validos.map((u) => String(u._id)));
            destinatariosFinales = destinatariosFinales.filter((id) => idsValidos.has(id));
            destinatariosCcFinales = destinatariosCcFinales.filter((id) => idsValidos.has(id));
            if (destinatariosFinales.length === 0) {
                throw new ApiError_1.default(400, 'Debe especificar al menos un destinatario válido');
            }
            const destinatariosObjectIds = destinatariosFinales
                .map((id) => this.safeObjectId(id))
                .filter((id) => id !== null);
            const destinatariosCcObjectIds = destinatariosCcFinales
                .map((id) => this.safeObjectId(id))
                .filter((id) => id !== null);
            const nuevoMensaje = (await mensaje_model_1.default.create({
                remitente: user._id,
                destinatarios: destinatariosObjectIds,
                destinatariosCc: destinatariosCcObjectIds,
                asunto,
                contenido,
                adjuntos,
                escuelaId: user.escuelaId,
                tipo,
                prioridad,
                estado,
                etiquetas,
                esRespuesta,
                mensajeOriginalId,
                lecturas: [],
                esCopiaAcudiente,
                ...(copiaDe && { copiaDe }),
                cursoIds: cursoIdsValidos
                    .map((id) => this.safeObjectId(id))
                    .filter((id) => id !== null),
            }));
            if (estado !== IMensaje_1.EstadoMensaje.BORRADOR) {
                await this.encolarDespacho(nuevoMensaje._id.toString(), user, prioridad);
            }
            await nuevoMensaje.populate([
                { path: 'remitente', select: 'nombre apellidos email tipo' },
                { path: 'destinatarios', select: 'nombre apellidos tipo', options: { lean: true } },
                { path: 'destinatariosCc', select: 'nombre apellidos tipo', options: { lean: true } },
            ]);
            this.invalidarCacheMensajes(user._id, user.escuelaId);
            (0, simpleCache_1.invalidarCacheUsuarios)(['dashboard', 'dashboard_rol', 'dashboard_completo'], [...destinatariosFinales, ...destinatariosCcFinales].map(String), String(user.escuelaId));
            return nuevoMensaje;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerDestinatariosDeCursos(cursoIds, escuelaId) {
        const validCursoIds = cursoIds.map((id) => this.safeObjectId(id)).filter((id) => id !== null);
        if (validCursoIds.length === 0 || !escuelaId) {
            return [];
        }
        const cursos = await curso_model_1.default.find({ _id: { $in: validCursoIds }, escuelaId })
            .select('estudiantes')
            .lean();
        const idsEnCursos = [...new Set(cursos.flatMap((c) => (c.estudiantes || []).map(String)))];
        if (idsEnCursos.length === 0) {
            return [];
        }
        const estudiantes = await usuario_model_1.default.find({
            _id: { $in: idsEnCursos },
            escuelaId,
            tipo: 'ESTUDIANTE',
            estado: 'ACTIVO',
        })
            .select('_id')
            .lean();
        const estudiantesIds = estudiantes.map((e) => e._id);
        const acudientes = estudiantesIds.length
            ? await usuario_model_1.default.find({
                escuelaId,
                tipo: 'ACUDIENTE',
                estado: 'ACTIVO',
                'info_academica.estudiantes_asociados': { $in: estudiantesIds },
            })
                .select('_id')
                .lean()
            : [];
        const destinatarios = [
            ...estudiantesIds.map(String),
            ...acudientes.map((a) => String(a._id)),
        ];
        logger_1.logger.debug(`✅ Destinatarios de cursos obtenidos: ${destinatarios.length}`);
        return destinatarios;
    }
    async encolarDespacho(mensajeId, remitente, _prioridad, opciones = {}) {
        const trabajo = {
            tipo: 'despachar-mensaje',
            prioridad: 'alta',
            escuelaId: String(remitente.escuelaId),
            claveUnica: `despacho:${mensajeId}`,
            payload: {
                mensajeId,
                remitente: {
                    _id: String(remitente._id),
                    nombre: remitente.nombre,
                    apellidos: remitente.apellidos,
                    escuelaId: String(remitente.escuelaId),
                },
            },
        };
        try {
            await (0, outbox_1.encolar)(trabajo);
        }
        catch (error) {
            try {
                await (0, outbox_1.encolar)(trabajo);
            }
            catch (error2) {
                if (opciones.lanzarError)
                    throw error2;
                console.error(`[Mensajes] No se pudo encolar el despacho del mensaje ${mensajeId}:`, error2);
            }
        }
    }
    async procesarDespacho(mensajeId, remitente, ctx) {
        const comprobar = () => ctx?.comprobarCancelacion();
        const mensaje = await mensaje_model_1.default.findById(mensajeId)
            .select('destinatarios destinatariosCc asunto prioridad adjuntos escuelaId')
            .lean();
        if (!mensaje)
            return;
        const escuelaId = String(mensaje.escuelaId || remitente.escuelaId);
        const idsDest = (mensaje.destinatarios || []).map(String);
        const idsCc = (mensaje.destinatariosCc || []).map(String);
        const usuarios = await usuario_model_1.default.find({
            _id: { $in: [...new Set([...idsDest, ...idsCc])] },
            escuelaId,
            estado: 'ACTIVO',
        })
            .select('_id email nombre tipo preferencias fcmToken fcmTokens.token')
            .sort({ _id: 1 })
            .lean();
        if (usuarios.length === 0)
            return;
        const setDest = new Set(idsDest);
        const nombreRemitente = `${remitente.nombre ?? ''} ${remitente.apellidos ?? ''}`.trim();
        const url = `${config_1.default.frontendUrl}/mensajes/${mensajeId}`;
        const prioridad = mensaje.prioridad;
        const asunto = mensaje.asunto;
        const tieneAdjuntos = (mensaje.adjuntos || []).length > 0;
        const mensajeObjId = new mongoose_1.default.Types.ObjectId(mensajeId);
        const existentes = await notificacion_model_1.default.find({
            entidadTipo: 'Mensaje',
            entidadId: mensajeObjId,
            usuarioId: { $in: usuarios.map((u) => u._id) },
        })
            .select('usuarioId metadata.emailEncolado metadata.pushEncolado')
            .lean();
        const yaNotificados = new Set(existentes.map((n) => String(n.usuarioId)));
        const conEmail = new Set(existentes.filter((n) => n.metadata?.emailEncolado).map((n) => String(n.usuarioId)));
        const conPush = new Set(existentes.filter((n) => n.metadata?.pushEncolado).map((n) => String(n.usuarioId)));
        const faltan = usuarios.filter((u) => !yaNotificados.has(String(u._id)));
        comprobar();
        if (faltan.length > 0) {
            const ahora = new Date();
            const escuelaObjId = new mongoose_1.default.Types.ObjectId(escuelaId);
            await notificacion_model_1.default.insertMany(faltan.map((u) => ({
                usuarioId: new mongoose_1.default.Types.ObjectId(String(u._id)),
                titulo: `Nuevo mensaje: ${asunto}`,
                mensaje: `Has recibido un nuevo mensaje de ${nombreRemitente}`,
                tipo: INotificacion_1.TipoNotificacion.MENSAJE,
                estado: INotificacion_2.EstadoNotificacion.PENDIENTE,
                escuelaId: escuelaObjId,
                entidadId: mensajeObjId,
                entidadTipo: 'Mensaje',
                metadata: {
                    remitente: nombreRemitente,
                    tieneAdjuntos,
                    mensajeId,
                    url,
                    ...(this.correoAlResumen(u, prioridad) && { resumen: true }),
                },
                createdAt: ahora,
                updatedAt: ahora,
            })), { ordered: false, lean: true }).catch((error) => {
                const errores = error?.writeErrors || [];
                if (errores.length > 0 && errores.every((e) => (e.code ?? e.err?.code) === 11000))
                    return;
                throw error;
            });
        }
        const urgente = prioridad === IMensaje_1.PrioridadMensaje.ALTA || /urgente|emergencia/i.test(String(asunto || ''));
        const idsDelLote = (t) => t.payload.usuarioIds || (t.payload.destinatarios || []).map((d) => d.usuarioId || d.email);
        const conClave = (trabajos, canal) => trabajos.map((t) => ({ ...t, claveUnica: (0, claveLote_1.claveDeLote)(`despacho:${mensajeId}:${canal}`, idsDelLote(t)) }));
        const paraEmail = usuarios
            .filter((u) => this.correoInmediato(u, prioridad) && !conEmail.has(String(u._id)))
            .map((u) => String(u._id));
        const setEmail = new Set(paraEmail);
        const paraPush = usuarios
            .filter((u) => setDest.has(String(u._id)) && (u.fcmToken || (u.fcmTokens || []).length > 0) && !conPush.has(String(u._id)))
            .map((u) => String(u._id));
        const trabajos = [
            ...conClave((0, email_service_1.construirTrabajosCorreo)({
                destinatarios: usuarios
                    .filter((u) => setEmail.has(String(u._id)))
                    .map((u) => ({ email: u.email, nombre: u.nombre, usuarioId: String(u._id) })),
                plantilla: 'mensaje',
                datos: { remitente: nombreRemitente, asunto, fecha: new Date(), tieneAdjuntos, url },
                prioridad: prioridad === IMensaje_1.PrioridadMensaje.ALTA ? 'alta' : 'normal',
                escuelaId,
            }), 'email'),
            ...conClave(pushNotification_service_1.default.construirTrabajosPush({
                usuarioIds: paraPush,
                contenido: urgente
                    ? {
                        titulo: `🚨 URGENTE: ${nombreRemitente}`,
                        mensaje: asunto,
                        data: { tipo: 'urgente', mensajeId, prioridad: 'ALTA', remitente: nombreRemitente },
                        sound: 'emergency',
                    }
                    : {
                        titulo: `💬 Nuevo mensaje de ${nombreRemitente}`,
                        mensaje: asunto,
                        data: { tipo: 'mensaje', mensajeId, prioridad: prioridad || 'NORMAL', remitente: nombreRemitente },
                    },
                prioridad: urgente ? 'alta' : 'normal',
                escuelaId,
            }), 'push'),
        ];
        comprobar();
        if (trabajos.length > 0)
            await (0, outbox_1.encolar)(trabajos);
        const marcar = async (ids, campo) => {
            if (ids.length === 0)
                return;
            await notificacion_model_1.default.updateMany({ entidadTipo: 'Mensaje', entidadId: mensajeObjId, usuarioId: { $in: ids.map((id) => new mongoose_1.default.Types.ObjectId(id)) } }, { $set: { [`metadata.${campo}`]: true } });
        };
        await marcar(paraEmail, 'emailEncolado');
        await marcar(paraPush, 'pushEncolado');
    }
    correoInmediato(usuario, prioridad) {
        if (!usuario?.email || (0, email_service_1.esEmailFicticio)(usuario.email))
            return false;
        if (prioridad === IMensaje_1.PrioridadMensaje.ALTA)
            return true;
        return (0, preferencias_1.preferenciaEmail)(usuario) === 'inmediato';
    }
    correoAlResumen(usuario, prioridad) {
        if (!usuario?.email || (0, email_service_1.esEmailFicticio)(usuario.email))
            return false;
        if (prioridad === IMensaje_1.PrioridadMensaje.ALTA)
            return false;
        return (0, preferencias_1.preferenciaEmail)(usuario) === 'resumen';
    }
    async encolarCopiasAcudientes(mensajeOriginalId, estudianteIds, datos, usuarioOrigen) {
        const ids = [...new Set(estudianteIds.map(String))].filter((id) => mongoose_1.default.isValidObjectId(id));
        if (ids.length === 0)
            return 0;
        const usuario = {
            _id: String(usuarioOrigen._id),
            escuelaId: String(usuarioOrigen.escuelaId),
            tipo: usuarioOrigen.tipo,
            nombre: usuarioOrigen.nombre,
            apellidos: usuarioOrigen.apellidos,
        };
        const datosCopia = {
            asunto: datos.asunto,
            contenido: datos.contenido,
            adjuntos: datos.adjuntos || [],
            tipo: datos.tipo,
            prioridad: datos.prioridad,
            etiquetas: datos.etiquetas || [],
        };
        const trabajos = [];
        for (let i = 0; i < ids.length; i += 50) {
            trabajos.push({
                tipo: 'copias-acudientes',
                escuelaId: usuario.escuelaId,
                payload: { mensajeOriginalId: String(mensajeOriginalId), estudianteIds: ids.slice(i, i + 50), datos: datosCopia, usuario },
            });
        }
        return (0, outbox_1.encolar)(trabajos);
    }
    async enviarCopiaAcudientes(estudianteId, datos, usuarioOrigen, copiaDe) {
        try {
            if (!mongoose_1.default.isValidObjectId(estudianteId)) {
                logger_1.logger.debug(`[WARNING] ID de estudiante inválido: ${estudianteId}`);
                return null;
            }
            const escuelaId = String(usuarioOrigen?.escuelaId || '');
            if (!mongoose_1.default.isValidObjectId(escuelaId)) {
                return null;
            }
            const estudiante = await usuario_model_1.default.findOne({
                _id: estudianteId,
                escuelaId,
                tipo: 'ESTUDIANTE',
                estado: 'ACTIVO',
            })
                .select('nombre apellidos')
                .lean();
            if (!estudiante) {
                return null;
            }
            const cacheKey = this.createCacheKey('acudientes', escuelaId, estudianteId);
            const cached = simpleCache_1.cache.get(cacheKey);
            let acudientes;
            if (cached && cached.length > 0) {
                logger_1.logger.debug(`📋 CACHE HIT: ${cacheKey}`);
                acudientes = cached;
            }
            else {
                acudientes = await usuario_model_1.default.find({
                    escuelaId,
                    tipo: 'ACUDIENTE',
                    'info_academica.estudiantes_asociados': new mongoose_1.default.Types.ObjectId(estudianteId),
                })
                    .select('_id')
                    .lean();
                if (acudientes.length > 0) {
                    if ((0, simpleCache_1.safeCacheSet)(cacheKey, acudientes, 300)) {
                        logger_1.logger.debug(`💾 CACHE SET: ${cacheKey} (300s)`);
                    }
                }
            }
            if (acudientes.length === 0) {
                logger_1.logger.debug(`[INFO] enviarCopiaAcudientes: no se encontraron acudientes para estudiante ${estudianteId}`);
                return null;
            }
            const copia = (0, exports.construirCopiaAcudiente)({ asunto: datos.asunto, contenido: datos.contenido }, usuarioOrigen || {}, estudiante);
            const mensajeAcudientes = {
                destinatarios: acudientes.map((a) => a._id.toString()),
                asunto: copia.asunto,
                contenido: copia.contenido,
                adjuntos: datos.adjuntos || [],
                tipo: datos.tipo || IMensaje_1.TipoMensaje.INDIVIDUAL,
                prioridad: datos.prioridad || IMensaje_1.PrioridadMensaje.NORMAL,
                estado: IMensaje_1.EstadoMensaje.ENVIADO,
                etiquetas: datos.etiquetas || [],
                esRespuesta: false,
                esCopiaAcudiente: true,
                ...(copiaDe && {
                    copiaDe: {
                        mensajeId: new mongoose_1.default.Types.ObjectId(copiaDe.mensajeId),
                        estudianteId: new mongoose_1.default.Types.ObjectId(copiaDe.estudianteId),
                    },
                }),
            };
            return this.crearMensaje(mensajeAcudientes, usuarioOrigen);
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    invalidarCacheMensajes(usuarioId, escuelaId) {
        logger_1.logger.debug(`🔄 Invalidando cache de mensajes para usuario ${usuarioId}`);
        (0, simpleCache_1.invalidateRelatedCache)('mensajes', usuarioId, escuelaId, [
            'destinatarios',
            'cursos_destinatarios',
            'acudientes',
            'dashboard',
            'dashboard_completo',
        ]);
    }
    async obtenerMensajes(userId, filtros = {}) {
        const cacheKey = this.createCacheKey('lista_mensajes', userId, JSON.stringify(filtros));
        return await this.getOrSetCache(cacheKey, 120, async () => {
            return [];
        });
    }
    async obtenerEstadisticasDocentes(escuelaId, params) {
        try {
            const { desde, hasta, cursoId, docenteId } = params;
            const desdeDate = new Date(desde);
            const hastaDate = new Date(hasta);
            hastaDate.setUTCHours(23, 59, 59, 999);
            const matchDocentes = {
                tipo: 'DOCENTE',
                escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
                estado: 'ACTIVO',
            };
            if (docenteId && mongoose_1.default.isValidObjectId(docenteId)) {
                matchDocentes._id = new mongoose_1.default.Types.ObjectId(docenteId);
            }
            if (cursoId && mongoose_1.default.isValidObjectId(cursoId)) {
                matchDocentes['info_academica.asignaturas_asignadas.cursoId'] =
                    new mongoose_1.default.Types.ObjectId(cursoId);
            }
            const pipeline = [
                { $match: matchDocentes },
                {
                    $lookup: {
                        from: 'asignaturas',
                        let: { docenteId: '$_id' },
                        pipeline: [
                            { $match: { $expr: { $eq: ['$docenteId', '$$docenteId'] } } },
                            { $project: { cursoId: 1, _id: 0 } },
                        ],
                        as: 'asignaturasDocente',
                    },
                },
                {
                    $lookup: {
                        from: 'mensajes',
                        let: { docenteId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$remitente', '$$docenteId'] },
                                            { $gte: ['$createdAt', desdeDate] },
                                            { $lte: ['$createdAt', hastaDate] },
                                            { $ne: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                            { $ne: ['$tipo', IMensaje_1.TipoMensaje.BORRADOR] },
                                            { $ne: ['$esCopiaAcudiente', true] },
                                        ],
                                    },
                                },
                            },
                            { $project: { cursoIds: 1, _id: 0 } },
                        ],
                        as: 'mensajesMasivosEnPeriodo',
                    },
                },
                {
                    $lookup: {
                        from: 'mensajes',
                        let: { docenteId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$remitente', '$$docenteId'] },
                                            { $gte: ['$createdAt', desdeDate] },
                                            { $lte: ['$createdAt', hastaDate] },
                                            { $eq: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                            { $ne: ['$esCopiaAcudiente', true] },
                                        ],
                                    },
                                },
                            },
                            { $unwind: '$destinatarios' },
                            { $group: { _id: '$destinatarios' } },
                        ],
                        as: 'estudiantesContactados',
                    },
                },
                {
                    $lookup: {
                        from: 'cursos',
                        let: { studentIds: '$estudiantesContactados._id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $gt: [
                                            {
                                                $size: {
                                                    $ifNull: [
                                                        { $setIntersection: ['$estudiantes', '$$studentIds'] },
                                                        [],
                                                    ],
                                                },
                                            },
                                            0,
                                        ],
                                    },
                                },
                            },
                            { $project: { _id: 1 } },
                        ],
                        as: 'cursosDeEstudiantesContactados',
                    },
                },
                {
                    $addFields: {
                        cursosIds: {
                            $setUnion: [
                                { $ifNull: ['$info_academica.cursos', []] },
                                {
                                    $map: {
                                        input: { $ifNull: ['$info_academica.asignaturas_asignadas', []] },
                                        as: 'a',
                                        in: '$$a.cursoId',
                                    },
                                },
                                {
                                    $map: {
                                        input: { $ifNull: ['$asignaturasDocente', []] },
                                        as: 'a',
                                        in: '$$a.cursoId',
                                    },
                                },
                                {
                                    $reduce: {
                                        input: { $ifNull: ['$mensajesMasivosEnPeriodo', []] },
                                        initialValue: [],
                                        in: {
                                            $concatArrays: [
                                                '$$value',
                                                { $ifNull: ['$$this.cursoIds', []] },
                                            ],
                                        },
                                    },
                                },
                                {
                                    $map: {
                                        input: { $ifNull: ['$cursosDeEstudiantesContactados', []] },
                                        as: 'c',
                                        in: '$$c._id',
                                    },
                                },
                            ],
                        },
                    },
                },
                {
                    $lookup: {
                        from: 'cursos',
                        localField: 'cursosIds',
                        foreignField: '_id',
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $gt: [{ $size: { $ifNull: ['$estudiantes', []] } }, 0] },
                                },
                            },
                            { $project: { _id: 1, nombre: 1, grupo: 1 } },
                        ],
                        as: 'cursosInfo',
                    },
                },
                {
                    $lookup: {
                        from: 'mensajes',
                        let: { docenteId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$remitente', '$$docenteId'] },
                                            { $gte: ['$createdAt', desdeDate] },
                                            { $lte: ['$createdAt', hastaDate] },
                                            { $ne: ['$esCopiaAcudiente', true] },
                                            { $ne: ['$tipo', IMensaje_1.TipoMensaje.BORRADOR] },
                                            { $not: [{ $regexMatch: { input: '$asunto', regex: /^\[COPIA\]/i } }] },
                                        ],
                                    },
                                },
                            },
                            { $project: { _id: 1, createdAt: 1 } },
                        ],
                        as: 'mensajes',
                    },
                },
                {
                    $project: {
                        docenteId: '$_id',
                        nombre: 1,
                        apellidos: 1,
                        count: { $size: '$mensajes' },
                        ultimoMensaje: {
                            $cond: {
                                if: { $gt: [{ $size: '$mensajes' }, 0] },
                                then: { $max: '$mensajes.createdAt' },
                                else: null,
                            },
                        },
                        cursos: {
                            $map: {
                                input: '$cursosInfo',
                                as: 'c',
                                in: { _id: '$$c._id', nombre: '$$c.nombre', grupo: '$$c.grupo' },
                            },
                        },
                    },
                },
                { $sort: { count: 1 } },
            ];
            const docentes = await usuario_model_1.default.aggregate(pipeline);
            return {
                data: docentes,
                meta: {
                    desde: desdeDate.toISOString(),
                    hasta: hastaDate.toISOString(),
                    totalDocentes: docentes.length,
                },
            };
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerMensajesAuditoria(escuelaId, params) {
        try {
            const { remitenteId, desde, hasta, pagina = 1, limite = 20 } = params;
            if (!mongoose_1.default.isValidObjectId(remitenteId)) {
                throw new ApiError_1.default(400, 'remitenteId inválido');
            }
            const desdeDate = new Date(desde);
            const hastaDate = new Date(hasta);
            hastaDate.setUTCHours(23, 59, 59, 999);
            const skip = (pagina - 1) * limite;
            const pipeline = [
                {
                    $match: {
                        remitente: new mongoose_1.default.Types.ObjectId(remitenteId),
                        escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
                        createdAt: { $gte: desdeDate, $lte: hastaDate },
                        esCopiaAcudiente: { $ne: true },
                        tipo: { $ne: IMensaje_1.TipoMensaje.BORRADOR },
                        asunto: { $not: /^\[COPIA\]/i },
                    },
                },
                {
                    $lookup: {
                        from: 'usuarios',
                        let: { dests: '$destinatarios' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $in: ['$_id', '$$dests'] },
                                            { $eq: ['$tipo', 'ESTUDIANTE'] },
                                        ],
                                    },
                                },
                            },
                            { $project: { _id: 1, nombre: 1, apellidos: 1 } },
                        ],
                        as: 'destinatariosEstudiantes',
                    },
                },
                {
                    $lookup: {
                        from: 'cursos',
                        localField: 'cursoIds',
                        foreignField: '_id',
                        pipeline: [{ $project: { _id: 1, nombre: 1 } }],
                        as: 'cursosInfo',
                    },
                },
                {
                    $lookup: {
                        from: 'cursos',
                        let: { estudianteId: { $arrayElemAt: ['$destinatariosEstudiantes._id', 0] } },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $in: ['$$estudianteId', '$estudiantes'] },
                                },
                            },
                            { $project: { _id: 1, nombre: 1 } },
                            { $limit: 1 },
                        ],
                        as: 'cursoEstudianteInfo',
                    },
                },
                {
                    $project: {
                        asunto: 1,
                        contenido: 1,
                        createdAt: 1,
                        tipo: 1,
                        destinatario: {
                            $cond: {
                                if: { $eq: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                then: { $arrayElemAt: ['$destinatariosEstudiantes', 0] },
                                else: '$$REMOVE',
                            },
                        },
                        cursoEstudiante: {
                            $cond: {
                                if: { $eq: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                then: { $arrayElemAt: ['$cursoEstudianteInfo', 0] },
                                else: null,
                            },
                        },
                        cursoNombre: {
                            $cond: {
                                if: { $ne: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                then: {
                                    $let: {
                                        vars: {
                                            curso: {
                                                $ifNull: [
                                                    { $arrayElemAt: ['$cursosInfo', 0] },
                                                    { $arrayElemAt: ['$cursoEstudianteInfo', 0] },
                                                ],
                                            },
                                        },
                                        in: '$$curso.nombre',
                                    },
                                },
                                else: '$$REMOVE',
                            },
                        },
                        cantidadDestinatariosEstudiantes: {
                            $cond: {
                                if: { $ne: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                then: { $size: '$destinatariosEstudiantes' },
                                else: '$$REMOVE',
                            },
                        },
                    },
                },
                {
                    $addFields: {
                        cursoParaOrden: {
                            $cond: {
                                if: { $eq: ['$tipo', IMensaje_1.TipoMensaje.INDIVIDUAL] },
                                then: { $ifNull: [{ $arrayElemAt: ['$cursoEstudianteInfo.nombre', 0] }, 'ZZZ'] },
                                else: { $ifNull: ['$cursoNombre', 'ZZZ'] },
                            },
                        },
                    },
                },
                { $sort: { cursoParaOrden: 1, createdAt: -1 } },
                {
                    $facet: {
                        data: [{ $skip: skip }, { $limit: limite }],
                        total: [{ $count: 'count' }],
                    },
                },
            ];
            const [result] = await mensaje_model_1.default.aggregate(pipeline);
            const total = result.total[0]?.count ?? 0;
            const paginas = Math.ceil(total / limite);
            return {
                data: result.data,
                meta: { total, pagina, limite, paginas },
            };
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    handleError(error) {
        console.error('[Error en MensajeService]', error);
        if (error instanceof ApiError_1.default) {
            return error;
        }
        if (error.name === 'CastError') {
            return new ApiError_1.default(400, 'Formato de ID inválido: ' + (error.message || ''));
        }
        if (error.response) {
            return new ApiError_1.default(error.response.status || 500, error.response.data.message || 'Error en la solicitud');
        }
        else if (error.request) {
            return new ApiError_1.default(500, 'No se recibió respuesta del servidor');
        }
        else {
            return new ApiError_1.default(500, error.message || 'Error desconocido');
        }
    }
}
exports.default = new MensajeService();
//# sourceMappingURL=mensaje.service.js.map