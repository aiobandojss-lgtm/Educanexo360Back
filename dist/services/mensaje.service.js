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
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const IMensaje_1 = require("../interfaces/IMensaje");
const INotificacion_1 = require("../interfaces/INotificacion");
const escapeRegex_1 = require("../utils/escapeRegex");
const email_service_1 = __importStar(require("./email.service"));
const notificacion_service_1 = __importDefault(require("./notificacion.service"));
const simpleCache_1 = require("../cache/simpleCache");
const config_1 = __importDefault(require("../config/config"));
class MensajeService {
    createCacheKey(type, ...params) {
        return `${type}_${params.join('_')}`;
    }
    async getOrSetCache(cacheKey, ttl, fetchFunction) {
        const cached = simpleCache_1.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 CACHE HIT: ${cacheKey}`);
            return cached;
        }
        const result = await fetchFunction();
        simpleCache_1.cache.set(cacheKey, result, ttl);
        console.log(`💾 CACHE SET: ${cacheKey} (${ttl}s)`);
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
            console.log(`🔍 getPosiblesDestinatarios: userId=${userId}, query='${query}'`);
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
                                    { nombre: { $regex: (0, escapeRegex_1.escapeRegex)(query), $options: 'i' } },
                                    { apellidos: { $regex: (0, escapeRegex_1.escapeRegex)(query), $options: 'i' } },
                                    { email: { $regex: (0, escapeRegex_1.escapeRegex)(query), $options: 'i' } },
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
                console.log(`✅ Destinatarios encontrados: ${resultado.length}`);
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
                console.log(`✅ Cursos encontrados: ${resultado.length}`);
                return resultado;
            });
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async crearMensaje(datos, user) {
        try {
            const { destinatarios = [], destinatariosCc = [], cursoIds = [], asunto, contenido, adjuntos = [], tipo = IMensaje_1.TipoMensaje.INDIVIDUAL, prioridad = IMensaje_1.PrioridadMensaje.NORMAL, estado = IMensaje_1.EstadoMensaje.ENVIADO, etiquetas = [], esRespuesta = false, mensajeOriginalId = null, esCopiaAcudiente = false, } = datos;
            let destinatariosFinales = [...destinatarios];
            let destinatariosCcFinales = [...destinatariosCc];
            if (cursoIds && cursoIds.length > 0) {
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
                const cursosDestinatarios = await this.obtenerDestinatariosDeCursos(cursoIds);
                destinatariosFinales.push(...cursosDestinatarios);
            }
            destinatariosFinales = [...new Set(destinatariosFinales)];
            destinatariosCcFinales = [...new Set(destinatariosCcFinales)];
            if (destinatariosFinales.length === 0) {
                throw new ApiError_1.default(400, 'Debe especificar al menos un destinatario');
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
                cursoIds: cursoIds
                    .map((id) => this.safeObjectId(id))
                    .filter((id) => id !== null),
            }));
            if (estado !== IMensaje_1.EstadoMensaje.BORRADOR) {
                await this.enviarNotificacionesEnBatch(nuevoMensaje._id.toString(), [...destinatariosFinales, ...destinatariosCcFinales], asunto, user, adjuntos.length > 0);
            }
            await nuevoMensaje.populate([
                { path: 'remitente', select: 'nombre apellidos email tipo' },
                { path: 'destinatarios', select: 'nombre apellidos email tipo' },
                { path: 'destinatariosCc', select: 'nombre apellidos email tipo' },
            ]);
            this.invalidarCacheMensajes(user._id, user.escuelaId);
            return nuevoMensaje;
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    async obtenerDestinatariosDeCursos(cursoIds) {
        const validCursoIds = cursoIds.map((id) => this.safeObjectId(id)).filter((id) => id !== null);
        if (validCursoIds.length === 0) {
            return [];
        }
        const resultado = await curso_model_1.default.aggregate([
            {
                $match: {
                    _id: { $in: validCursoIds },
                },
            },
            {
                $unwind: {
                    path: '$estudiantes',
                    preserveNullAndEmptyArrays: false,
                },
            },
            {
                $group: {
                    _id: null,
                    estudiantesIds: { $addToSet: '$estudiantes' },
                },
            },
            {
                $lookup: {
                    from: 'usuarios',
                    let: { estudiantesIds: '$estudiantesIds' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $in: ['$_id', '$$estudiantesIds'] },
                                        { $eq: ['$tipo', 'ESTUDIANTE'] },
                                        { $eq: ['$estado', 'ACTIVO'] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: { _id: 1 },
                        },
                    ],
                    as: 'estudiantes_activos',
                },
            },
            {
                $lookup: {
                    from: 'usuarios',
                    let: { estudiantesIds: '$estudiantesIds' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$tipo', 'ACUDIENTE'] },
                                        {
                                            $ne: [
                                                {
                                                    $size: {
                                                        $setIntersection: [
                                                            '$info_academica.estudiantes_asociados',
                                                            '$$estudiantesIds',
                                                        ],
                                                    },
                                                },
                                                0,
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                        {
                            $project: { _id: 1 },
                        },
                    ],
                    as: 'acudientes',
                },
            },
            {
                $project: {
                    _id: 0,
                    todos_destinatarios: {
                        $concatArrays: [
                            { $map: { input: '$estudiantes_activos', as: 'e', in: { $toString: '$$e._id' } } },
                            { $map: { input: '$acudientes', as: 'a', in: { $toString: '$$a._id' } } },
                        ],
                    },
                },
            },
        ]);
        const destinatarios = resultado.length > 0 ? resultado[0].todos_destinatarios : [];
        console.log(`✅ Destinatarios de cursos obtenidos: ${destinatarios.length}`);
        return destinatarios;
    }
    async enviarNotificacionesEnBatch(mensajeId, destinatariosIds, asunto, remitente, tieneAdjuntos) {
        try {
            const validDestinatariosIds = destinatariosIds
                .map((id) => this.safeObjectId(id))
                .filter((id) => id !== null);
            if (validDestinatariosIds.length === 0)
                return;
            const usuarios = await usuario_model_1.default.find({
                _id: { $in: validDestinatariosIds },
                estado: 'ACTIVO',
            }).select('_id email nombre apellidos');
            const nombreRemitente = `${remitente.nombre} ${remitente.apellidos}`.trim();
            const batchSize = 20;
            for (let i = 0; i < usuarios.length; i += batchSize) {
                const batch = usuarios.slice(i, i + batchSize);
                const promesasBatch = batch.map(async (destinatario) => {
                    const destId = destinatario._id.toString();
                    const [,] = await Promise.all([
                        notificacion_service_1.default.crearNotificacion({
                            usuarioId: destId,
                            titulo: `Nuevo mensaje: ${asunto}`,
                            mensaje: `Has recibido un nuevo mensaje de ${nombreRemitente}`,
                            tipo: INotificacion_1.TipoNotificacion.MENSAJE,
                            escuelaId: remitente.escuelaId,
                            entidadId: mensajeId,
                            entidadTipo: 'Mensaje',
                            metadata: {
                                remitente: nombreRemitente,
                                tieneAdjuntos,
                                mensajeId,
                                url: `${config_1.default.frontendUrl}/mensajes/${mensajeId}`,
                            },
                            enviarEmail: false,
                        }),
                        destinatario.email && !(0, email_service_1.esEmailFicticio)(destinatario.email)
                            ? email_service_1.default.sendMensajeNotification(destinatario.email, {
                                remitente: nombreRemitente,
                                asunto,
                                fecha: new Date(),
                                tieneAdjuntos,
                                url: `${config_1.default.frontendUrl}/mensajes/${mensajeId}`,
                            })
                            : Promise.resolve(),
                    ]);
                });
                await Promise.all(promesasBatch);
                if (i + batchSize < usuarios.length) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }
            console.log(`✅ Notificaciones enviadas a ${usuarios.length} destinatarios`);
        }
        catch (error) {
            console.error('Error enviando notificaciones en batch:', error);
        }
    }
    async enviarCopiaAcudientes(estudianteId, datos, usuarioOrigen) {
        try {
            if (!mongoose_1.default.isValidObjectId(estudianteId)) {
                console.log(`[WARNING] ID de estudiante inválido: ${estudianteId}`);
                return null;
            }
            const cacheKey = this.createCacheKey('acudientes', estudianteId);
            const cached = simpleCache_1.cache.get(cacheKey);
            let acudientes;
            if (cached && cached.length > 0) {
                console.log(`📋 CACHE HIT: ${cacheKey}`);
                acudientes = cached;
            }
            else {
                acudientes = await usuario_model_1.default.aggregate([
                    {
                        $match: {
                            _id: new mongoose_1.default.Types.ObjectId(estudianteId),
                            tipo: 'ESTUDIANTE',
                            estado: 'ACTIVO',
                        },
                    },
                    {
                        $lookup: {
                            from: 'usuarios',
                            let: { estudianteId: '$_id' },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ['$tipo', 'ACUDIENTE'] },
                                                { $in: ['$$estudianteId', '$info_academica.estudiantes_asociados'] },
                                            ],
                                        },
                                    },
                                },
                                {
                                    $project: { _id: 1 },
                                },
                            ],
                            as: 'acudientes',
                        },
                    },
                    {
                        $unwind: '$acudientes',
                    },
                    {
                        $replaceRoot: { newRoot: '$acudientes' },
                    },
                ]);
                if (acudientes.length > 0) {
                    simpleCache_1.cache.set(cacheKey, acudientes, 300);
                    console.log(`💾 CACHE SET: ${cacheKey} (300s)`);
                }
            }
            if (acudientes.length === 0) {
                console.log(`[INFO] enviarCopiaAcudientes: no se encontraron acudientes para estudiante ${estudianteId}`);
                return null;
            }
            const mensajeAcudientes = {
                destinatarios: acudientes.map((a) => a._id.toString()),
                asunto: `[COPIA] ${datos.asunto}`,
                contenido: `Este mensaje ha sido enviado automáticamente como copia del mensaje enviado a su acudido.\n\n${datos.contenido}`,
                adjuntos: datos.adjuntos || [],
                tipo: datos.tipo || IMensaje_1.TipoMensaje.INDIVIDUAL,
                prioridad: datos.prioridad || IMensaje_1.PrioridadMensaje.NORMAL,
                estado: IMensaje_1.EstadoMensaje.ENVIADO,
                etiquetas: datos.etiquetas || [],
                esRespuesta: false,
                esCopiaAcudiente: true,
            };
            return this.crearMensaje(mensajeAcudientes, usuarioOrigen);
        }
        catch (error) {
            throw this.handleError(error);
        }
    }
    invalidarCacheMensajes(usuarioId, escuelaId) {
        console.log(`🔄 Invalidando cache de mensajes para usuario ${usuarioId}`);
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
                            ],
                        },
                    },
                },
                {
                    $lookup: {
                        from: 'cursos',
                        localField: 'cursosIds',
                        foreignField: '_id',
                        pipeline: [{ $project: { _id: 1, nombre: 1 } }],
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
                                in: { _id: '$$c._id', nombre: '$$c.nombre' },
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