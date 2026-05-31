"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MensajeController = exports.ROLES_CON_BORRADORES = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const mensaje_model_1 = __importDefault(require("../models/mensaje.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const gridfs_1 = __importDefault(require("../config/gridfs"));
const mensaje_service_1 = __importDefault(require("../services/mensaje.service"));
const escapeRegex_1 = require("../utils/escapeRegex");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const IMensaje_1 = require("../interfaces/IMensaje");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
exports.ROLES_CON_BORRADORES = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'];
class MensajeController {
    async getPosiblesDestinatarios(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const debugLogs = [];
            const logDebug = (message) => {
                console.log(message);
                debugLogs.push(message);
            };
            if (!mongoose_1.default.isValidObjectId(req.user._id)) {
                throw new ApiError_1.default(400, 'ID de usuario inválido');
            }
            if (!mongoose_1.default.isValidObjectId(req.user.escuelaId)) {
                throw new ApiError_1.default(400, 'ID de escuela inválido');
            }
            const queryParam = req.query.q;
            const searchQuery = queryParam ? queryParam.trim() : '';
            logDebug(`[DEBUG] Controlador - Buscando destinatarios para usuario: ${req.user._id} (${req.user.nombre} ${req.user.apellidos}), escuela: ${req.user.escuelaId}, tipo: ${req.user.tipo}, query: '${searchQuery}'`);
            let destinatarios = [];
            const tipoUsuario = req.user.tipo;
            if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(tipoUsuario)) {
                logDebug('[DEBUG] Usuario administrativo - Mostrando todos los usuarios');
                try {
                    const filter = {
                        escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                        _id: { $ne: new mongoose_1.default.Types.ObjectId(req.user._id) },
                        estado: 'ACTIVO',
                    };
                    if (searchQuery) {
                        const searchRegex = new RegExp((0, escapeRegex_1.escapeRegex)(searchQuery), 'i');
                        filter.$or = [
                            { nombre: searchRegex },
                            { apellidos: searchRegex },
                            { email: searchRegex },
                        ];
                    }
                    const totalUsuarios = await usuario_model_1.default.countDocuments({
                        escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                        _id: { $ne: new mongoose_1.default.Types.ObjectId(req.user._id) },
                        estado: 'ACTIVO',
                    });
                    logDebug(`[DEBUG] Total usuarios disponibles en la escuela: ${totalUsuarios}`);
                    let limite = 500;
                    if (totalUsuarios > 1000 && !searchQuery) {
                        limite = 250;
                        logDebug(`[DEBUG] Escuela grande (${totalUsuarios} usuarios), aplicando límite de ${limite} sin búsqueda`);
                    }
                    else if (searchQuery) {
                        limite = 100;
                        logDebug(`[DEBUG] Búsqueda activa, aplicando límite de ${limite}`);
                    }
                    destinatarios = await usuario_model_1.default.find(filter)
                        .select('_id nombre apellidos email tipo')
                        .limit(limite)
                        .sort({ nombre: 1, apellidos: 1 });
                    logDebug(`[DEBUG] Usuarios encontrados: ${destinatarios.length} de ${totalUsuarios} totales`);
                }
                catch (error) {
                    logDebug(`[DEBUG ERROR] Error en consulta: ${error}`);
                    destinatarios = [];
                }
            }
            else if (tipoUsuario === 'DOCENTE') {
                logDebug(`[DEBUG] Usuario docente - Obteniendo destinatarios para: ${req.user.nombre} ${req.user.apellidos}`);
                try {
                    const estudiantesIds = new Set();
                    const acudientesIds = new Set();
                    const personalIds = new Set();
                    logDebug('[DEBUG] 2.1 - Buscando cursos donde es director de grupo...');
                    try {
                        const cursosDirigidos = await mongoose_1.default
                            .model('Curso')
                            .find({
                            director_grupo: new mongoose_1.default.Types.ObjectId(req.user._id),
                            escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                            estado: 'ACTIVO',
                        })
                            .select('_id estudiantes nombre');
                        logDebug(`[DEBUG] 2.1 - Cursos dirigidos encontrados: ${cursosDirigidos.length}`);
                        for (const curso of cursosDirigidos) {
                            logDebug(`[DEBUG] 2.1 - Procesando curso dirigido: ${curso.nombre} con ${curso.estudiantes?.length || 0} estudiantes`);
                            if (Array.isArray(curso.estudiantes)) {
                                curso.estudiantes.forEach((estudianteId) => {
                                    if (estudianteId && mongoose_1.default.isValidObjectId(estudianteId)) {
                                        estudiantesIds.add(estudianteId.toString());
                                        logDebug(`[DEBUG] 2.1 - Agregado estudiante de curso dirigido: ${estudianteId}`);
                                    }
                                });
                            }
                        }
                    }
                    catch (error) {
                        logDebug(`[DEBUG ERROR] Error obteniendo cursos dirigidos: ${error}`);
                    }
                    logDebug('[DEBUG] 2.2 - Buscando asignaturas que dicta...');
                    try {
                        const asignaturas = await mongoose_1.default
                            .model('Asignatura')
                            .find({
                            docenteId: new mongoose_1.default.Types.ObjectId(req.user._id),
                            escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                            estado: 'ACTIVO',
                        })
                            .select('_id cursoId nombre');
                        logDebug(`[DEBUG] 2.2 - Asignaturas encontradas: ${asignaturas.length}`);
                        const cursosAsignaturas = new Set();
                        asignaturas.forEach((asig, index) => {
                            if (asig.cursoId && mongoose_1.default.isValidObjectId(asig.cursoId)) {
                                cursosAsignaturas.add(asig.cursoId.toString());
                                logDebug(`[DEBUG] 2.2.${index + 1} - Asignatura: "${asig.nombre}" en curso: ${asig.cursoId}`);
                            }
                            else {
                                logDebug(`[DEBUG] 2.2.${index + 1} - Asignatura: "${asig.nombre}" SIN CURSO VÁLIDO`);
                            }
                        });
                        logDebug(`[DEBUG] 2.2 - Cursos únicos de asignaturas: ${cursosAsignaturas.size}`);
                        if (cursosAsignaturas.size > 0) {
                            logDebug('[DEBUG] 2.3 - Obteniendo estudiantes de cursos de asignaturas...');
                            const cursosConEstudiantes = await mongoose_1.default
                                .model('Curso')
                                .find({
                                _id: {
                                    $in: Array.from(cursosAsignaturas).map((id) => new mongoose_1.default.Types.ObjectId(id)),
                                },
                                estado: 'ACTIVO',
                            })
                                .select('_id estudiantes nombre');
                            logDebug(`[DEBUG] 2.3 - Cursos con estudiantes encontrados: ${cursosConEstudiantes.length}`);
                            for (const curso of cursosConEstudiantes) {
                                logDebug(`[DEBUG] 2.3 - Procesando curso de asignatura: ${curso.nombre} con ${curso.estudiantes?.length || 0} estudiantes`);
                                if (Array.isArray(curso.estudiantes)) {
                                    curso.estudiantes.forEach((estudianteId) => {
                                        if (estudianteId && mongoose_1.default.isValidObjectId(estudianteId)) {
                                            estudiantesIds.add(estudianteId.toString());
                                            logDebug(`[DEBUG] 2.3 - Agregado estudiante: ${estudianteId}`);
                                        }
                                        else {
                                            logDebug(`[DEBUG] 2.3 - ID de estudiante inválido: ${estudianteId}`);
                                        }
                                    });
                                }
                            }
                        }
                        else {
                            logDebug('[DEBUG] 2.3 - NO HAY CURSOS DE ASIGNATURAS PARA PROCESAR');
                        }
                    }
                    catch (error) {
                        logDebug(`[DEBUG ERROR] Error obteniendo asignaturas: ${error}`);
                    }
                    logDebug(`[DEBUG] 2.4 - Total estudiantes únicos encontrados: ${estudiantesIds.size}`);
                    if (estudiantesIds.size > 0) {
                        logDebug('[DEBUG] 2.4 - Validando estudiantes existentes...');
                        try {
                            const estudiantesValidos = await usuario_model_1.default.find({
                                _id: {
                                    $in: Array.from(estudiantesIds).map((id) => new mongoose_1.default.Types.ObjectId(id)),
                                },
                                tipo: 'ESTUDIANTE',
                                estado: 'ACTIVO',
                                escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                            }).select('_id nombre apellidos');
                            logDebug(`[DEBUG] 2.4 - Estudiantes válidos encontrados: ${estudiantesValidos.length}`);
                            estudiantesIds.clear();
                            estudiantesValidos.forEach((estudiante) => {
                                if (estudiante._id) {
                                    const estudianteId = estudiante._id.toString();
                                    estudiantesIds.add(estudianteId);
                                    logDebug(`[DEBUG] 2.4 - Estudiante válido: ${estudianteId} (${estudiante.nombre} ${estudiante.apellidos})`);
                                }
                            });
                            if (estudiantesIds.size > 0) {
                                logDebug('[DEBUG] 2.5 - Buscando acudientes de estudiantes válidos...');
                                const estudiantesIdsArray = Array.from(estudiantesIds);
                                const acudientesInfo = await usuario_model_1.default.find({
                                    'info_academica.estudiantes_asociados': {
                                        $in: estudiantesIdsArray.map((id) => new mongoose_1.default.Types.ObjectId(id)),
                                    },
                                    tipo: 'ACUDIENTE',
                                    estado: 'ACTIVO',
                                    escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                                }).select('_id nombre apellidos');
                                logDebug(`[DEBUG] 2.5 - Acudientes encontrados: ${acudientesInfo.length}`);
                                acudientesInfo.forEach((acudiente) => {
                                    if (acudiente._id) {
                                        const acudienteId = acudiente._id.toString();
                                        acudientesIds.add(acudienteId);
                                        logDebug(`[DEBUG] 2.5 - Agregado acudiente: ${acudienteId} (${acudiente.nombre} ${acudiente.apellidos})`);
                                    }
                                });
                            }
                            else {
                                logDebug('[DEBUG] 2.5 - NO HAY ESTUDIANTES VÁLIDOS, NO SE BUSCAN ACUDIENTES');
                            }
                        }
                        catch (error) {
                            logDebug(`[DEBUG ERROR] Error validando estudiantes: ${error}`);
                        }
                    }
                    else {
                        logDebug('[DEBUG] 2.4 - NO HAY ESTUDIANTES PARA VALIDAR');
                    }
                    logDebug('[DEBUG] 2.6 - Obteniendo personal administrativo y docentes...');
                    try {
                        const personalYDocentes = await usuario_model_1.default.find({
                            tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'] },
                            _id: { $ne: new mongoose_1.default.Types.ObjectId(req.user._id) },
                            estado: 'ACTIVO',
                            escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                        }).select('_id nombre apellidos tipo');
                        logDebug(`[DEBUG] 2.6 - Personal y docentes encontrados: ${personalYDocentes.length}`);
                        personalYDocentes.forEach((p) => {
                            if (p._id) {
                                const personalId = p._id.toString();
                                personalIds.add(personalId);
                                logDebug(`[DEBUG] 2.6 - Agregado ${p.tipo}: ${personalId} (${p.nombre} ${p.apellidos})`);
                            }
                        });
                    }
                    catch (error) {
                        logDebug(`[DEBUG ERROR] Error obteniendo personal: ${error}`);
                    }
                    const todosLosIds = new Set();
                    estudiantesIds.forEach((id) => todosLosIds.add(id));
                    acudientesIds.forEach((id) => todosLosIds.add(id));
                    personalIds.forEach((id) => todosLosIds.add(id));
                    logDebug(`[DEBUG] 2.7 - Total IDs únicos recolectados: ${todosLosIds.size}`);
                    logDebug(`[DEBUG] 2.7 - Distribución: Estudiantes=${estudiantesIds.size}, Acudientes=${acudientesIds.size}, Personal=${personalIds.size}`);
                    if (todosLosIds.size > 0) {
                        logDebug('[DEBUG] 2.8 - Ejecutando consulta final...');
                        try {
                            const filter = {
                                _id: {
                                    $in: Array.from(todosLosIds).map((id) => new mongoose_1.default.Types.ObjectId(id)),
                                },
                                escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                                estado: 'ACTIVO',
                            };
                            if (searchQuery) {
                                const searchRegex = new RegExp((0, escapeRegex_1.escapeRegex)(searchQuery), 'i');
                                filter.$or = [
                                    { nombre: searchRegex },
                                    { apellidos: searchRegex },
                                    { email: searchRegex },
                                ];
                                logDebug(`[DEBUG] 2.8 - Aplicando filtro de búsqueda: "${searchQuery}"`);
                            }
                            destinatarios = await usuario_model_1.default.find(filter)
                                .select('_id nombre apellidos email tipo')
                                .sort({ tipo: 1, nombre: 1 });
                            logDebug(`[DEBUG] 2.8 - Destinatarios finales después del filtrado: ${destinatarios.length}`);
                            const tiposCount = destinatarios.reduce((acc, dest) => {
                                acc[dest.tipo] = (acc[dest.tipo] || 0) + 1;
                                return acc;
                            }, {});
                            logDebug(`[DEBUG] 2.8 - Distribución por tipo: ${JSON.stringify(tiposCount)}`);
                            if (destinatarios.length > 150) {
                                destinatarios = destinatarios.slice(0, 150);
                                logDebug(`[DEBUG] 2.8 - Aplicado límite final: ${destinatarios.length} resultados`);
                            }
                            Object.keys(tiposCount).forEach((tipo) => {
                                const ejemplosTipo = destinatarios.filter((d) => d.tipo === tipo).slice(0, 2);
                                ejemplosTipo.forEach((dest, index) => {
                                    logDebug(`[DEBUG] 2.8 - Ejemplo ${tipo} ${index + 1}: ${dest.nombre} ${dest.apellidos}`);
                                });
                            });
                        }
                        catch (error) {
                            logDebug(`[DEBUG ERROR] Error en consulta final: ${error}`);
                            destinatarios = [];
                        }
                    }
                    else {
                        logDebug('[DEBUG] 2.8 - NO HAY IDS VÁLIDOS PARA CONSULTAR');
                        destinatarios = [];
                    }
                }
                catch (error) {
                    logDebug(`[DEBUG ERROR] Error general en lógica de docente: ${error}`);
                    destinatarios = [];
                }
            }
            else if (tipoUsuario === 'ACUDIENTE' || tipoUsuario === 'ESTUDIANTE') {
                logDebug(`[DEBUG] Usuario ${tipoUsuario} - usando lógica de acudiente`);
                return this.getDestinatariosParaAcudiente(req, res, next);
            }
            else {
                logDebug(`[DEBUG] Tipo de usuario no reconocido: ${tipoUsuario}`);
                destinatarios = [];
            }
            logDebug(`[DEBUG] RESULTADO FINAL - Destinatarios encontrados: ${destinatarios.length}`);
            return res.json({
                success: true,
                data: destinatarios,
                debug: debugLogs,
            });
        }
        catch (error) {
            console.error('[DEBUG ERROR] Error general al obtener destinatarios:', error);
            const errorMessage = error instanceof ApiError_1.default
                ? error.message
                : 'Error interno del servidor al obtener destinatarios';
            const statusCode = error instanceof ApiError_1.default ? error.statusCode : 500;
            return res.status(statusCode).json({
                success: false,
                message: errorMessage,
                data: [],
                debug: [`[DEBUG ERROR] Error general: ${error.message || error}`],
            });
        }
    }
    async guardarBorrador(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para guardar borradores');
            }
            console.log('=== DEBUG DESTINATARIOS ===');
            console.log('req.body completo:', JSON.stringify(req.body, null, 2));
            console.log('req.files:', req.files ? req.files.length : 0);
            console.log('Tipo de destinatarios:', typeof req.body.destinatarios);
            console.log('Valor destinatarios:', req.body.destinatarios);
            console.log('Es array destinatarios:', Array.isArray(req.body.destinatarios));
            let destinatariosArray = [];
            let destinatariosCcArray = [];
            if (req.body.destinatarios) {
                console.log('Procesando destinatarios...');
                if (typeof req.body.destinatarios === 'string') {
                    try {
                        destinatariosArray = JSON.parse(req.body.destinatarios);
                        console.log('Destinatarios parseados desde JSON:', destinatariosArray);
                    }
                    catch (error) {
                        destinatariosArray = [req.body.destinatarios];
                        console.log('Destinatarios como string único:', destinatariosArray);
                    }
                }
                else if (Array.isArray(req.body.destinatarios)) {
                    destinatariosArray = req.body.destinatarios;
                    console.log('Destinatarios como array directo:', destinatariosArray);
                }
                else {
                    console.log('Destinatarios en formato desconocido, usando array vacío');
                    destinatariosArray = [];
                }
            }
            if (req.body.destinatariosCc) {
                if (typeof req.body.destinatariosCc === 'string') {
                    try {
                        destinatariosCcArray = JSON.parse(req.body.destinatariosCc);
                    }
                    catch (error) {
                        destinatariosCcArray = [req.body.destinatariosCc];
                    }
                }
                else if (Array.isArray(req.body.destinatariosCc)) {
                    destinatariosCcArray = req.body.destinatariosCc;
                }
            }
            console.log('Destinatarios finales (string array):', destinatariosArray);
            console.log('Destinatarios CC finales (string array):', destinatariosCcArray);
            const destinatariosObjectIds = [];
            if (destinatariosArray.length > 0) {
                console.log('Convirtiendo destinatarios a ObjectId...');
                for (let i = 0; i < destinatariosArray.length; i++) {
                    const dest = destinatariosArray[i];
                    console.log(`Destinatario ${i}: "${dest}" (tipo: ${typeof dest})`);
                    if (dest && typeof dest === 'string' && dest.trim() !== '') {
                        if (mongoose_1.default.isValidObjectId(dest)) {
                            destinatariosObjectIds.push(new mongoose_1.default.Types.ObjectId(dest));
                            console.log(`✓ Destinatario ${i} válido agregado`);
                        }
                        else {
                            console.log(`✗ Destinatario ${i} no es ObjectId válido: ${dest}`);
                        }
                    }
                    else {
                        console.log(`✗ Destinatario ${i} vacío o inválido`);
                    }
                }
            }
            const destinatariosCcObjectIds = [];
            if (destinatariosCcArray.length > 0) {
                for (const dest of destinatariosCcArray) {
                    if (dest && typeof dest === 'string' && mongoose_1.default.isValidObjectId(dest)) {
                        destinatariosCcObjectIds.push(new mongoose_1.default.Types.ObjectId(dest));
                    }
                }
            }
            console.log('Destinatarios ObjectId finales:', destinatariosObjectIds.length);
            console.log('Destinatarios CC ObjectId finales:', destinatariosCcObjectIds.length);
            const { asunto = '(Sin asunto)', contenido = '', prioridad = IMensaje_1.PrioridadMensaje.NORMAL, etiquetas = [], } = req.body;
            const prioridadesValidas = ['ALTA', 'NORMAL', 'BAJA'];
            const prioridadFinal = prioridadesValidas.includes(prioridad)
                ? prioridad
                : IMensaje_1.PrioridadMensaje.NORMAL;
            const borradorId = req.query.id || req.body.id;
            let borrador;
            if (borradorId && mongoose_1.default.isValidObjectId(borradorId)) {
                borrador = await mensaje_model_1.default.findOne({
                    _id: borradorId,
                    remitente: req.user._id,
                    tipo: IMensaje_1.TipoMensaje.BORRADOR,
                });
                if (!borrador) {
                    throw new ApiError_1.default(404, 'Borrador no encontrado');
                }
                console.log('Actualizando borrador existente con destinatarios:', destinatariosObjectIds.length);
                borrador.asunto = asunto;
                borrador.contenido = contenido;
                borrador.prioridad = prioridadFinal;
                borrador.destinatarios = destinatariosObjectIds;
                borrador.destinatariosCc = destinatariosCcObjectIds;
                borrador.etiquetas = Array.isArray(etiquetas) ? etiquetas : [etiquetas].filter(Boolean);
                if (req.files && req.files.length > 0) {
                    console.log('Se enviaron nuevos adjuntos, reemplazando adjuntos anteriores...');
                    if (borrador.adjuntos && borrador.adjuntos.length > 0) {
                        const bucket = gridfs_1.default.getBucket();
                        if (bucket) {
                            console.log(`Eliminando ${borrador.adjuntos.length} adjuntos anteriores...`);
                            for (const adjuntoAnterior of borrador.adjuntos) {
                                try {
                                    await bucket.delete(adjuntoAnterior.fileId);
                                    console.log(`Adjunto eliminado: ${adjuntoAnterior.nombre}`);
                                }
                                catch (deleteError) {
                                    console.warn(`No se pudo eliminar adjunto ${adjuntoAnterior.nombre}:`, deleteError);
                                }
                            }
                        }
                    }
                    const nuevosAdjuntos = [];
                    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
                    const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
                    if (totalSize > MAX_TOTAL_SIZE) {
                        throw new ApiError_1.default(400, `El tamaño total de los archivos adjuntos no puede superar los 15MB`);
                    }
                    const bucket = gridfs_1.default.getBucket();
                    if (!bucket) {
                        throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                    }
                    for (const file of req.files) {
                        const filename = file.filename || path_1.default.basename(file.path);
                        const uploadStream = bucket.openUploadStream(filename, {
                            metadata: {
                                originalName: file.originalname,
                                contentType: file.mimetype,
                                size: file.size,
                                uploadedBy: req.user._id,
                            },
                        });
                        const fileContent = fs_1.default.readFileSync(file.path);
                        uploadStream.write(fileContent);
                        uploadStream.end();
                        nuevosAdjuntos.push({
                            nombre: file.originalname,
                            tipo: file.mimetype,
                            tamaño: file.size,
                            fileId: uploadStream.id,
                            fechaSubida: new Date(),
                        });
                        try {
                            fs_1.default.unlinkSync(file.path);
                        }
                        catch (error) {
                            console.error('Error deleting temporary file:', error);
                        }
                    }
                    borrador.adjuntos = nuevosAdjuntos;
                    console.log(`Adjuntos reemplazados: ${nuevosAdjuntos.length} nuevos adjuntos`);
                }
                else {
                    console.log('No se enviaron nuevos adjuntos, manteniendo adjuntos existentes:', borrador.adjuntos?.length || 0);
                }
                await borrador.save();
            }
            else {
                console.log('Creando nuevo borrador con destinatarios:', destinatariosObjectIds.length);
                const borradorData = {
                    remitente: new mongoose_1.default.Types.ObjectId(req.user._id),
                    destinatarios: destinatariosObjectIds,
                    destinatariosCc: destinatariosCcObjectIds,
                    asunto,
                    contenido,
                    tipo: IMensaje_1.TipoMensaje.BORRADOR,
                    estado: IMensaje_1.EstadoMensaje.BORRADOR,
                    prioridad: prioridadFinal,
                    etiquetas: Array.isArray(etiquetas) ? etiquetas : [etiquetas].filter(Boolean),
                    escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                    adjuntos: [],
                };
                console.log('Datos para crear borrador:', {
                    ...borradorData,
                    destinatarios: `${borradorData.destinatarios.length} destinatarios`,
                    destinatariosCc: `${borradorData.destinatariosCc.length} destinatarios CC`,
                });
                const borradorBasico = await mensaje_model_1.default.create(borradorData);
                console.log('Borrador creado con ID:', borradorBasico._id);
                console.log('Destinatarios guardados:', borradorBasico.destinatarios.length);
                if (req.files && req.files.length > 0) {
                    console.log('Procesando adjuntos para borrador nuevo...');
                    const adjuntos = [];
                    const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
                    const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
                    if (totalSize > MAX_TOTAL_SIZE) {
                        await mensaje_model_1.default.deleteOne({ _id: borradorBasico._id });
                        throw new ApiError_1.default(400, `El tamaño total de los archivos adjuntos no puede superar los 15MB`);
                    }
                    const bucket = gridfs_1.default.getBucket();
                    if (!bucket) {
                        await mensaje_model_1.default.deleteOne({ _id: borradorBasico._id });
                        throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                    }
                    try {
                        for (const file of req.files) {
                            const filename = file.filename || path_1.default.basename(file.path);
                            const uploadStream = bucket.openUploadStream(filename, {
                                metadata: {
                                    originalName: file.originalname,
                                    contentType: file.mimetype,
                                    size: file.size,
                                    uploadedBy: req.user._id,
                                },
                            });
                            const fileContent = fs_1.default.readFileSync(file.path);
                            uploadStream.write(fileContent);
                            uploadStream.end();
                            adjuntos.push({
                                nombre: file.originalname,
                                tipo: file.mimetype,
                                tamaño: file.size,
                                fileId: uploadStream.id,
                                fechaSubida: new Date(),
                            });
                            try {
                                fs_1.default.unlinkSync(file.path);
                            }
                            catch (error) {
                                console.error('Error deleting temporary file:', error);
                            }
                        }
                        borradorBasico.adjuntos = adjuntos;
                        await borradorBasico.save();
                    }
                    catch (adjuntosError) {
                        await mensaje_model_1.default.deleteOne({ _id: borradorBasico._id });
                        throw adjuntosError;
                    }
                }
                borrador = borradorBasico;
            }
            console.log('=== ANTES DE POPULAR ===');
            console.log('Borrador final destinatarios:', borrador.destinatarios.length);
            await borrador.populate([
                { path: 'remitente', select: 'nombre apellidos email tipo' },
                { path: 'destinatarios', select: 'nombre apellidos email tipo' },
                { path: 'destinatariosCc', select: 'nombre apellidos email tipo' },
            ]);
            console.log('=== DESPUÉS DE POPULAR ===');
            console.log('Borrador final destinatarios:', borrador.destinatarios.length);
            res.status(200).json({
                success: true,
                data: borrador,
                message: 'Borrador guardado correctamente',
            });
        }
        catch (error) {
            console.error('Error en guardarBorrador:', error);
            if (error.name === 'ValidationError') {
                const errors = Object.values(error.errors).map((err) => err.message);
                return next(new ApiError_1.default(400, `Error de validación: ${errors.join(', ')}`));
            }
            if (error.name === 'CastError') {
                return next(new ApiError_1.default(400, `Error de formato: ${error.message}`));
            }
            next(error);
        }
    }
    async enviarBorrador(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para usar borradores');
            }
            const { id } = req.params;
            const borrador = await mensaje_model_1.default.findOne({
                _id: id,
                remitente: req.user._id,
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
                estado: IMensaje_1.EstadoMensaje.BORRADOR,
            });
            if (!borrador) {
                throw new ApiError_1.default(404, 'Borrador no encontrado');
            }
            if (!borrador.destinatarios || borrador.destinatarios.length === 0) {
                throw new ApiError_1.default(400, 'El mensaje debe tener al menos un destinatario');
            }
            const usuarios = new Set();
            usuarios.add(borrador.remitente.toString());
            if (borrador.destinatarios && Array.isArray(borrador.destinatarios)) {
                borrador.destinatarios.forEach((dest) => {
                    const destId = typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
                    usuarios.add(destId);
                });
            }
            if (borrador.destinatariosCc && Array.isArray(borrador.destinatariosCc)) {
                borrador.destinatariosCc.forEach((dest) => {
                    const destId = typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
                    usuarios.add(destId);
                });
            }
            const ahora = new Date();
            const estadosUsuarios = Array.from(usuarios).map((userId) => ({
                usuarioId: new mongoose_1.default.Types.ObjectId(userId),
                estado: IMensaje_1.EstadoMensaje.ENVIADO,
                fechaAccion: ahora,
            }));
            const resultado = await mensaje_model_1.default.updateOne({
                _id: id,
                remitente: new mongoose_1.default.Types.ObjectId(req.user._id),
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
                estado: IMensaje_1.EstadoMensaje.BORRADOR,
            }, {
                $set: {
                    tipo: IMensaje_1.TipoMensaje.INDIVIDUAL,
                    estado: IMensaje_1.EstadoMensaje.ENVIADO,
                    estadosUsuarios: estadosUsuarios,
                    fechaAccion: ahora,
                },
            });
            if (resultado.matchedCount === 0 || resultado.modifiedCount === 0) {
                console.error('Error al enviar borrador:', resultado);
                throw new ApiError_1.default(500, 'No se pudo enviar el borrador. Por favor intenta nuevamente.');
            }
            const mensajeEnviado = await mensaje_model_1.default.findById(id)
                .populate('remitente', 'nombre apellidos email')
                .populate('destinatarios', 'nombre apellidos email');
            if (!mensajeEnviado) {
                throw new ApiError_1.default(404, 'No se pudo encontrar el mensaje después de enviarlo');
            }
            if (mensajeEnviado.tipo !== IMensaje_1.TipoMensaje.INDIVIDUAL ||
                mensajeEnviado.estado !== IMensaje_1.EstadoMensaje.ENVIADO) {
                console.error('Error: El mensaje no se actualizó correctamente:', mensajeEnviado);
                throw new ApiError_1.default(500, 'El mensaje no se actualizó correctamente');
            }
            try {
                const destinatariosIds = mensajeEnviado.destinatarios.map((d) => typeof d === 'object' && d._id ? d._id.toString() : d.toString());
                if (destinatariosIds.length > 0) {
                    const estudiantesInfo = await usuario_model_1.default.find({
                        _id: { $in: destinatariosIds },
                        tipo: 'ESTUDIANTE',
                    }).select('_id');
                    const datosMensaje = {
                        asunto: mensajeEnviado.asunto,
                        contenido: mensajeEnviado.contenido,
                        adjuntos: mensajeEnviado.adjuntos || [],
                        tipo: mensajeEnviado.tipo,
                        prioridad: mensajeEnviado.prioridad,
                        etiquetas: mensajeEnviado.etiquetas || [],
                    };
                    for (const est of estudiantesInfo) {
                        await mensaje_service_1.default.enviarCopiaAcudientes(est._id.toString(), datosMensaje, req.user);
                    }
                }
            }
            catch (errorCopia) {
                console.error('[ERROR] enviarCopiaAcudientes en borrador falló pero el mensaje fue enviado:', errorCopia);
            }
            res.status(200).json({
                success: true,
                data: mensajeEnviado,
                message: 'Mensaje enviado correctamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerBorradores(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para usar borradores');
            }
            const pagina = parseInt(req.query.pagina || '1', 10);
            const limite = parseInt(req.query.limite || '20', 10);
            const skip = (pagina - 1) * limite;
            const borradores = await mensaje_model_1.default.find({
                remitente: req.user._id,
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
            })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limite)
                .populate('destinatarios', 'nombre apellidos email tipo');
            const total = await mensaje_model_1.default.countDocuments({
                remitente: req.user._id,
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
            });
            res.json({
                success: true,
                data: borradores,
                meta: {
                    total,
                    pagina,
                    limite,
                    totalPaginas: Math.ceil(total / limite),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarBorrador(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para usar borradores');
            }
            const { id } = req.params;
            const borrador = await mensaje_model_1.default.findOne({
                _id: id,
                remitente: req.user._id,
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
            });
            if (!borrador) {
                throw new ApiError_1.default(404, 'Borrador no encontrado');
            }
            await mensaje_model_1.default.deleteOne({ _id: id });
            if (borrador.adjuntos && borrador.adjuntos.length > 0) {
                const bucket = gridfs_1.default.getBucket();
                if (bucket) {
                    for (const adjunto of borrador.adjuntos) {
                        try {
                            await bucket.delete(adjunto.fileId);
                        }
                        catch (err) {
                            console.error(`Error al eliminar adjunto con ID ${adjunto.fileId}:`, err);
                        }
                    }
                }
            }
            res.json({
                success: true,
                message: 'Borrador eliminado correctamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async getDestinatariosParaAcudiente(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ACUDIENTE' && req.user.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(403, 'Solo los acudientes y estudiantes pueden acceder a esta funcionalidad');
            }
            console.log(`[DEBUG] Obteniendo destinatarios para ${req.user.tipo} ID: ${req.user._id}`);
            if (req.user.tipo === 'ESTUDIANTE') {
                console.log(`[DEBUG] Usuario estudiante - obteniendo destinatarios con información contextual`);
                try {
                    const cursosEstudiante = await mongoose_1.default
                        .model('Curso')
                        .find({
                        estudiantes: new mongoose_1.default.Types.ObjectId(req.user._id),
                        escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                        estado: { $ne: 'INACTIVO' },
                    })
                        .select('_id nombre grado seccion director_grupo grupo jornada nivel estudiantes');
                    console.log(`[DEBUG] Cursos del estudiante encontrados: ${cursosEstudiante.length}`);
                    if (cursosEstudiante.length === 0) {
                        const personalEscuela = await usuario_model_1.default.find({
                            escuelaId: req.user.escuelaId,
                            tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
                            estado: 'ACTIVO',
                        }).select('_id nombre apellidos email tipo');
                        const destinatariosFinales = personalEscuela.map((persona) => ({
                            _id: persona._id,
                            nombre: persona.nombre,
                            apellidos: persona.apellidos,
                            email: persona.email,
                            tipo: persona.tipo,
                        }));
                        return res.json({
                            success: true,
                            data: destinatariosFinales,
                            count: destinatariosFinales.length,
                            message: 'No se encontraron cursos. Mostrando solo personal administrativo.',
                        });
                    }
                    const cursosIds = cursosEstudiante.map(c => c._id);
                    const docentesIds = new Set();
                    const directorGrupoInfo = new Map();
                    cursosEstudiante.forEach((curso) => {
                        if (curso.director_grupo) {
                            docentesIds.add(curso.director_grupo.toString());
                            let nombreCurso = curso.nombre || '';
                            if (curso.grado && curso.seccion) {
                                nombreCurso = `${curso.grado}${curso.seccion}`;
                            }
                            directorGrupoInfo.set(curso.director_grupo.toString(), nombreCurso);
                        }
                    });
                    const asignaturas = await mongoose_1.default
                        .model('Asignatura')
                        .find({
                        cursoId: { $in: cursosIds },
                        estado: 'ACTIVO',
                    })
                        .select('_id nombre docenteId cursoId');
                    console.log(`[DEBUG] Asignaturas encontradas: ${asignaturas.length}`);
                    const asignaturasMap = new Map();
                    const asignaturasPorCurso = new Map();
                    asignaturas.forEach((asignatura) => {
                        if (asignatura._id) {
                            asignaturasMap.set(asignatura._id.toString(), {
                                nombre: asignatura.nombre || '',
                                docenteId: asignatura.docenteId ? asignatura.docenteId.toString() : null,
                            });
                            if (asignatura.docenteId) {
                                docentesIds.add(asignatura.docenteId.toString());
                            }
                            if (asignatura.cursoId) {
                                const cursoId = asignatura.cursoId.toString();
                                if (!asignaturasPorCurso.has(cursoId)) {
                                    asignaturasPorCurso.set(cursoId, []);
                                }
                                const asignaturasDelCurso = asignaturasPorCurso.get(cursoId);
                                if (asignaturasDelCurso) {
                                    asignaturasDelCurso.push(asignatura._id.toString());
                                }
                            }
                        }
                    });
                    const personalAdministrativo = await usuario_model_1.default.find({
                        escuelaId: req.user.escuelaId,
                        tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
                        estado: 'ACTIVO',
                    }).select('_id nombre apellidos email tipo');
                    const docentes = await usuario_model_1.default.find({
                        _id: { $in: Array.from(docentesIds).map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                        tipo: 'DOCENTE',
                        estado: 'ACTIVO',
                    }).select('_id nombre apellidos email tipo');
                    console.log(`[DEBUG] Docentes encontrados: ${docentes.length}`);
                    const docenteAsignaturas = new Map();
                    const docenteCursos = new Map();
                    asignaturas.forEach((asignatura) => {
                        if (asignatura.docenteId && asignatura.cursoId) {
                            const docenteId = asignatura.docenteId.toString();
                            const cursoId = asignatura.cursoId.toString();
                            const curso = cursosEstudiante.find((c) => c._id.toString() === cursoId);
                            if (curso) {
                                if (!docenteAsignaturas.has(docenteId)) {
                                    docenteAsignaturas.set(docenteId, new Set());
                                }
                                const asignaturasSet = docenteAsignaturas.get(docenteId);
                                if (asignaturasSet && asignatura.nombre) {
                                    asignaturasSet.add(asignatura.nombre);
                                }
                                if (!docenteCursos.has(docenteId)) {
                                    docenteCursos.set(docenteId, new Set());
                                }
                                const cursosSet = docenteCursos.get(docenteId);
                                if (cursosSet) {
                                    let nombreCurso = curso.nombre || '';
                                    if (curso.grado && curso.seccion) {
                                        nombreCurso = `${curso.grado}${curso.seccion}`;
                                    }
                                    cursosSet.add(nombreCurso);
                                }
                            }
                        }
                    });
                    const destinatariosFinales = [];
                    docentes.forEach((docente) => {
                        if (docente._id && req.user) {
                            const docenteId = docente._id.toString();
                            const asignaturasSet = docenteAsignaturas.get(docenteId);
                            const cursosSet = docenteCursos.get(docenteId);
                            const asignaturas = asignaturasSet && asignaturasSet.size > 0 ? Array.from(asignaturasSet).join(', ') : '';
                            let cursosStr = cursosSet && cursosSet.size > 0 ? Array.from(cursosSet).join(', ') : '';
                            const cursoDirector = directorGrupoInfo.get(docenteId);
                            if (cursoDirector) {
                                if (cursosStr) {
                                    cursosStr += ` (Director de ${cursoDirector})`;
                                }
                                else {
                                    cursosStr = `Director de ${cursoDirector}`;
                                }
                            }
                            const nombreEstudiante = `${req.user.nombre} ${req.user.apellidos}`;
                            const infoContextual = `Docente de ${nombreEstudiante}`;
                            destinatariosFinales.push({
                                _id: docente._id,
                                nombre: docente.nombre || '',
                                apellidos: docente.apellidos || '',
                                email: docente.email || '',
                                tipo: docente.tipo || '',
                                asignatura: asignaturas,
                                curso: cursosStr,
                                infoContextual: infoContextual,
                            });
                        }
                    });
                    personalAdministrativo.forEach((admin) => {
                        if (admin._id) {
                            destinatariosFinales.push({
                                _id: admin._id,
                                nombre: admin.nombre || '',
                                apellidos: admin.apellidos || '',
                                email: admin.email || '',
                                tipo: admin.tipo || '',
                            });
                        }
                    });
                    console.log(`[DEBUG] Total destinatarios para estudiante: ${destinatariosFinales.length}`);
                    return res.json({
                        success: true,
                        data: destinatariosFinales,
                        count: destinatariosFinales.length,
                    });
                }
                catch (error) {
                    console.error('Error obteniendo destinatarios para estudiante:', error);
                    return res.json({
                        success: true,
                        data: [],
                        message: 'Error obteniendo destinatarios',
                    });
                }
            }
            const usuario = await usuario_model_1.default.findById(req.user._id).select('info_academica');
            if (!usuario || !usuario.info_academica) {
                return res.json({
                    success: true,
                    data: [],
                    message: 'No se encontró información académica del acudiente',
                });
            }
            const infoAcademica = usuario.info_academica;
            const estudiantesIds = infoAcademica.estudiantes_asociados || [];
            if (!Array.isArray(estudiantesIds) || estudiantesIds.length === 0) {
                return res.json({
                    success: true,
                    data: [],
                    message: 'No tiene estudiantes asociados',
                });
            }
            console.log(`[DEBUG] Estudiantes asociados: ${estudiantesIds.length}`);
            const estudiantes = (await usuario_model_1.default.find({
                _id: { $in: estudiantesIds },
                tipo: 'ESTUDIANTE',
                estado: { $ne: 'INACTIVO' },
            }).select('_id nombre apellidos'));
            const estudiantesNombres = new Map();
            estudiantes.forEach((estudiante) => {
                estudiantesNombres.set(estudiante._id.toString(), `${estudiante.nombre || ''} ${estudiante.apellidos || ''}`);
            });
            const estudiantesIdsString = estudiantes.map((est) => est._id.toString());
            console.log(`[DEBUG] Buscando cursos para los estudiantes: ${estudiantesIdsString.join(', ')}`);
            const cursos = (await mongoose_1.default
                .model('Curso')
                .find({
                estudiantes: { $in: estudiantesIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                estado: { $ne: 'INACTIVO' },
            })
                .select('_id nombre grado seccion director_grupo grupo jornada nivel estudiantes'));
            console.log(`[DEBUG] Cursos encontrados: ${cursos.length}`);
            const cursosIds = new Set();
            cursos.forEach((curso) => {
                if (curso._id) {
                    cursosIds.add(curso._id.toString());
                }
            });
            if (cursosIds.size === 0) {
                console.log('[DEBUG] No se encontraron cursos, obteniendo solo personal administrativo (sin docentes)');
                const personalEscuela = (await usuario_model_1.default.find({
                    escuelaId: req.user.escuelaId,
                    tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
                    estado: 'ACTIVO',
                }).select('_id nombre apellidos email tipo'));
                const destinatariosFinales = personalEscuela.map((persona) => ({
                    _id: persona._id,
                    nombre: persona.nombre,
                    apellidos: persona.apellidos,
                    email: persona.email,
                    tipo: persona.tipo,
                }));
                return res.json({
                    success: true,
                    data: destinatariosFinales,
                    count: destinatariosFinales.length,
                    message: 'No se encontraron cursos para sus estudiantes. Mostrando solo personal administrativo.',
                });
            }
            const docentesIds = new Set();
            const directorGrupoInfo = new Map();
            cursos.forEach((curso) => {
                if (curso.director_grupo) {
                    docentesIds.add(curso.director_grupo.toString());
                    let nombreCurso = curso.nombre || '';
                    if (curso.grado && curso.seccion) {
                        nombreCurso = `${curso.grado}${curso.seccion}`;
                    }
                    directorGrupoInfo.set(curso.director_grupo.toString(), nombreCurso);
                }
            });
            console.log(`[DEBUG] Buscando asignaturas para los cursos: ${Array.from(cursosIds).join(', ')}`);
            const asignaturas = (await mongoose_1.default
                .model('Asignatura')
                .find({
                cursoId: { $in: Array.from(cursosIds).map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                estado: 'ACTIVO',
            })
                .select('_id nombre docenteId cursoId'));
            console.log(`[DEBUG] Asignaturas encontradas por consulta directa: ${asignaturas.length}`);
            if (asignaturas.length > 0) {
                console.log('[DEBUG] Ejemplo de primera asignatura:', JSON.stringify({
                    id: asignaturas[0]._id.toString(),
                    nombre: asignaturas[0].nombre,
                    docenteId: asignaturas[0].docenteId
                        ? asignaturas[0].docenteId.toString()
                        : 'no docente',
                    cursoId: asignaturas[0].cursoId ? asignaturas[0].cursoId.toString() : 'no curso',
                }));
            }
            const asignaturasMap = new Map();
            const asignaturasPorCurso = new Map();
            asignaturas.forEach((asignatura) => {
                if (asignatura._id) {
                    asignaturasMap.set(asignatura._id.toString(), {
                        nombre: asignatura.nombre || '',
                        docenteId: asignatura.docenteId ? asignatura.docenteId.toString() : null,
                    });
                    if (asignatura.docenteId) {
                        docentesIds.add(asignatura.docenteId.toString());
                    }
                    if (asignatura.cursoId) {
                        const cursoId = asignatura.cursoId.toString();
                        if (!asignaturasPorCurso.has(cursoId)) {
                            asignaturasPorCurso.set(cursoId, []);
                        }
                        const asignaturasDelCurso = asignaturasPorCurso.get(cursoId);
                        if (asignaturasDelCurso) {
                            asignaturasDelCurso.push(asignatura._id.toString());
                        }
                    }
                }
            });
            console.log(`[DEBUG] Docentes encontrados (IDs): ${Array.from(docentesIds).join(', ')}`);
            const personalAdministrativo = (await usuario_model_1.default.find({
                escuelaId: req.user.escuelaId,
                tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
                estado: 'ACTIVO',
            }).select('_id nombre apellidos email tipo'));
            const docentes = (await usuario_model_1.default.find({
                _id: { $in: Array.from(docentesIds).map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                tipo: 'DOCENTE',
                estado: 'ACTIVO',
            }).select('_id nombre apellidos email tipo'));
            console.log(`[DEBUG] Docentes recuperados de la base de datos: ${docentes.length}`);
            if (docentes.length > 0) {
                console.log('[DEBUG] Lista de docentes encontrados:');
                docentes.forEach((docente) => {
                    console.log(`- ${docente._id.toString()}: ${docente.nombre} ${docente.apellidos}`);
                });
            }
            const docenteAsignaturas = new Map();
            const docenteCursos = new Map();
            asignaturas.forEach((asignatura) => {
                if (asignatura.docenteId && asignatura.cursoId) {
                    const docenteId = asignatura.docenteId.toString();
                    const cursoId = asignatura.cursoId.toString();
                    const curso = cursos.find((c) => c._id.toString() === cursoId);
                    if (curso) {
                        if (!docenteAsignaturas.has(docenteId)) {
                            docenteAsignaturas.set(docenteId, new Set());
                        }
                        const asignaturasSet = docenteAsignaturas.get(docenteId);
                        if (asignaturasSet && asignatura.nombre) {
                            asignaturasSet.add(asignatura.nombre);
                        }
                        if (!docenteCursos.has(docenteId)) {
                            docenteCursos.set(docenteId, new Set());
                        }
                        const cursosSet = docenteCursos.get(docenteId);
                        if (cursosSet) {
                            let nombreCurso = curso.nombre || '';
                            if (curso.grado && curso.seccion) {
                                nombreCurso = `${curso.grado}${curso.seccion}`;
                            }
                            cursosSet.add(nombreCurso);
                        }
                    }
                }
            });
            const destinatariosFinales = [];
            docentes.forEach((docente) => {
                if (docente._id) {
                    const docenteId = docente._id.toString();
                    const asignaturasSet = docenteAsignaturas.get(docenteId);
                    const cursosSet = docenteCursos.get(docenteId);
                    const asignaturas = asignaturasSet && asignaturasSet.size > 0 ? Array.from(asignaturasSet).join(', ') : '';
                    let cursosStr = cursosSet && cursosSet.size > 0 ? Array.from(cursosSet).join(', ') : '';
                    const cursoDirector = directorGrupoInfo.get(docenteId);
                    if (cursoDirector) {
                        if (cursosStr) {
                            cursosStr += ` (Director de ${cursoDirector})`;
                        }
                        else {
                            cursosStr = `Director de ${cursoDirector}`;
                        }
                    }
                    const estudiantesRelacionados = [];
                    const cursosDirector = cursos.filter((curso) => curso.director_grupo && curso.director_grupo.toString() === docenteId);
                    for (const curso of cursosDirector) {
                        if (Array.isArray(curso.estudiantes)) {
                            const estudiantesEnCurso = estudiantes.filter((est) => curso.estudiantes?.some((id) => id.toString() === est._id.toString()));
                            estudiantesEnCurso.forEach((est) => {
                                estudiantesRelacionados.push(`${est.nombre} ${est.apellidos}`);
                            });
                        }
                    }
                    const cursosAsignaturas = cursos.filter((curso) => {
                        if (!curso._id)
                            return false;
                        const asignaturasDelCurso = asignaturasPorCurso.get(curso._id.toString()) || [];
                        return asignaturasDelCurso.some((asigId) => {
                            const asigInfo = asignaturasMap.get(asigId);
                            return asigInfo && asigInfo.docenteId === docenteId;
                        });
                    });
                    for (const curso of cursosAsignaturas) {
                        if (Array.isArray(curso.estudiantes)) {
                            const estudiantesEnCurso = estudiantes.filter((est) => curso.estudiantes?.some((id) => id.toString() === est._id.toString()));
                            estudiantesEnCurso.forEach((est) => {
                                if (!estudiantesRelacionados.includes(`${est.nombre} ${est.apellidos}`)) {
                                    estudiantesRelacionados.push(`${est.nombre} ${est.apellidos}`);
                                }
                            });
                        }
                    }
                    let infoContextual = '';
                    if (estudiantesRelacionados.length > 0) {
                        infoContextual = `Docente de ${estudiantesRelacionados.join(', ')}`;
                    }
                    destinatariosFinales.push({
                        _id: docente._id,
                        nombre: docente.nombre || '',
                        apellidos: docente.apellidos || '',
                        email: docente.email || '',
                        tipo: docente.tipo || '',
                        asignatura: asignaturas,
                        curso: cursosStr,
                        infoContextual: infoContextual,
                    });
                }
            });
            personalAdministrativo.forEach((admin) => {
                if (admin._id) {
                    destinatariosFinales.push({
                        _id: admin._id,
                        nombre: admin.nombre || '',
                        apellidos: admin.apellidos || '',
                        email: admin.email || '',
                        tipo: admin.tipo || '',
                    });
                }
            });
            console.log(`[DEBUG] Total destinatarios encontrados: ${destinatariosFinales.length}`);
            return res.json({
                success: true,
                data: destinatariosFinales,
                count: destinatariosFinales.length,
            });
        }
        catch (error) {
            console.error('Error al obtener destinatarios para acudiente:', error);
            return next(error);
        }
    }
    async getCursosPosiblesDestinatarios(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            console.log(`[DEBUG] Obteniendo cursos disponibles para usuario: ${req.user._id}, tipo: ${req.user.tipo}`);
            const rolesMasivos = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'];
            if (!rolesMasivos.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para enviar mensajes masivos');
            }
            let cursos = [];
            if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(req.user.tipo)) {
                console.log('[DEBUG] Usuario administrativo - Mostrando todos los cursos');
                cursos = await mongoose_1.default
                    .model('Curso')
                    .find({
                    escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                })
                    .select('_id nombre grado seccion grupo estudiantes director_grupo')
                    .populate('director_grupo', 'nombre apellidos')
                    .populate({
                    path: 'estudiantes',
                    select: '_id',
                    match: { estado: 'ACTIVO' },
                })
                    .sort({ grado: 1, seccion: 1 });
            }
            else if (req.user.tipo === 'DOCENTE') {
                console.log('[DEBUG] Usuario docente - Obteniendo cursos donde dicta asignaturas');
                const cursosDirigidos = await mongoose_1.default
                    .model('Curso')
                    .find({
                    director_grupo: new mongoose_1.default.Types.ObjectId(req.user._id),
                    escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                })
                    .select('_id');
                const asignaturas = await mongoose_1.default
                    .model('Asignatura')
                    .find({
                    docenteId: new mongoose_1.default.Types.ObjectId(req.user._id),
                    escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                })
                    .select('cursoId');
                const cursosIds = new Set();
                cursosDirigidos.forEach((curso) => {
                    cursosIds.add(curso._id.toString());
                });
                asignaturas.forEach((asig) => {
                    if (asig.cursoId) {
                        cursosIds.add(asig.cursoId.toString());
                    }
                });
                if (cursosIds.size === 0) {
                    console.log('[DEBUG] Docente no tiene cursos asignados');
                    return res.json({
                        success: true,
                        data: [],
                        message: 'No tiene cursos asignados para enviar mensajes masivos',
                    });
                }
                cursos = await mongoose_1.default
                    .model('Curso')
                    .find({
                    _id: { $in: Array.from(cursosIds).map((id) => new mongoose_1.default.Types.ObjectId(id)) },
                })
                    .select('_id nombre grado seccion grupo estudiantes director_grupo')
                    .populate('director_grupo', 'nombre apellidos')
                    .populate({
                    path: 'estudiantes',
                    select: '_id',
                    match: { estado: 'ACTIVO' },
                })
                    .sort({ grado: 1, seccion: 1 });
            }
            const cursosFormateados = cursos.map((curso) => {
                const cantidadEstudiantes = Array.isArray(curso.estudiantes) ? curso.estudiantes.length : 0;
                let nombreCompleto = curso.nombre || '';
                if (!nombreCompleto.includes(curso.grado) && curso.grado) {
                    nombreCompleto = `${curso.grado}`;
                    if (curso.seccion) {
                        nombreCompleto += `${curso.seccion}`;
                    }
                }
                if (curso.grupo && !nombreCompleto.includes(curso.grupo)) {
                    nombreCompleto += ` - Grupo ${curso.grupo}`;
                }
                let infoAdicional = '';
                if (curso.director_grupo) {
                    try {
                        const directorInfo = typeof curso.director_grupo === 'object' && curso.director_grupo.nombre
                            ? `${curso.director_grupo.nombre} ${curso.director_grupo.apellidos || ''}`
                            : '';
                        if (directorInfo) {
                            infoAdicional = `Director: ${directorInfo}`;
                        }
                    }
                    catch (err) {
                        console.error('Error obteniendo información del director de grupo:', err);
                    }
                }
                return {
                    _id: curso._id,
                    nombre: nombreCompleto,
                    grado: curso.grado || '',
                    seccion: curso.seccion || '',
                    grupo: curso.grupo || '',
                    cantidadEstudiantes,
                    infoAdicional,
                };
            });
            console.log(`[DEBUG] Cursos encontrados: ${cursosFormateados.length}`);
            return res.json({
                success: true,
                data: cursosFormateados,
            });
        }
        catch (error) {
            console.error('Error al obtener cursos para mensajes masivos:', error);
            return next(error);
        }
    }
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { destinatarios, destinatariosCc, cursoIds, asunto, contenido, tipo = IMensaje_1.TipoMensaje.INDIVIDUAL, prioridad, etiquetas, esRespuesta, mensajeOriginalId, } = req.body;
            if ((!destinatarios || (Array.isArray(destinatarios) && destinatarios.length === 0)) &&
                (!cursoIds || (Array.isArray(cursoIds) && cursoIds.length === 0))) {
                throw new ApiError_1.default(400, 'Debe especificar al menos un destinatario o curso');
            }
            const adjuntos = [];
            if (req.files && req.files.length > 0) {
                const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
                const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
                if (totalSize > MAX_TOTAL_SIZE) {
                    throw new ApiError_1.default(400, `El tamaño total de los archivos adjuntos no puede superar los 15MB (tamaño actual: ${(totalSize /
                        (1024 * 1024)).toFixed(2)}MB)`);
                }
                const bucket = gridfs_1.default.getBucket();
                if (!bucket) {
                    throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                }
                for (const file of req.files) {
                    const filename = file.filename || path_1.default.basename(file.path);
                    const uploadStream = bucket.openUploadStream(filename, {
                        metadata: {
                            originalName: file.originalname,
                            contentType: file.mimetype,
                            size: file.size,
                            uploadedBy: req.user._id,
                        },
                    });
                    const fileContent = fs_1.default.readFileSync(file.path);
                    uploadStream.write(fileContent);
                    uploadStream.end();
                    adjuntos.push({
                        nombre: file.originalname,
                        tipo: file.mimetype,
                        tamaño: file.size,
                        fileId: uploadStream.id,
                        fechaSubida: new Date(),
                    });
                    try {
                        fs_1.default.unlinkSync(file.path);
                    }
                    catch (error) {
                        console.error('Error deleting temporary file:', error);
                    }
                }
            }
            let estado = IMensaje_1.EstadoMensaje.ENVIADO;
            if (tipo === 'BORRADOR') {
                estado = IMensaje_1.EstadoMensaje.BORRADOR;
            }
            let destinatariosArray = [];
            if (typeof destinatarios === 'string') {
                try {
                    destinatariosArray = JSON.parse(destinatarios);
                }
                catch (error) {
                    destinatariosArray = [destinatarios];
                }
            }
            else if (Array.isArray(destinatarios)) {
                destinatariosArray = destinatarios;
            }
            let destinatariosCcArray = [];
            if (destinatariosCc) {
                if (typeof destinatariosCc === 'string') {
                    try {
                        destinatariosCcArray = JSON.parse(destinatariosCc);
                    }
                    catch (error) {
                        destinatariosCcArray = [destinatariosCc];
                    }
                }
                else if (Array.isArray(destinatariosCc)) {
                    destinatariosCcArray = destinatariosCc;
                }
            }
            let cursoIdsArray = [];
            if (cursoIds) {
                if (typeof cursoIds === 'string') {
                    try {
                        cursoIdsArray = JSON.parse(cursoIds);
                    }
                    catch (error) {
                        cursoIdsArray = [cursoIds];
                    }
                }
                else if (Array.isArray(cursoIds)) {
                    cursoIdsArray = cursoIds;
                }
            }
            const datosMensaje = {
                destinatarios: destinatariosArray,
                destinatariosCc: destinatariosCcArray,
                cursoIds: cursoIdsArray,
                asunto,
                contenido,
                adjuntos,
                tipo,
                prioridad: prioridad || IMensaje_1.PrioridadMensaje.NORMAL,
                estado,
                etiquetas: etiquetas || [],
                esRespuesta: esRespuesta === 'true' || esRespuesta === true,
                mensajeOriginalId: mensajeOriginalId || null,
            };
            const nuevoMensaje = await mensaje_service_1.default.crearMensaje(datosMensaje, req.user);
            if (estado !== IMensaje_1.EstadoMensaje.BORRADOR) {
                try {
                    console.log('📱 Enviando notificaciones push automáticas...');
                    const senderName = `${req.user.nombre} ${req.user.apellidos}`;
                    const isUrgent = prioridad === IMensaje_1.PrioridadMensaje.ALTA ||
                        asunto.toLowerCase().includes('urgente') ||
                        asunto.toLowerCase().includes('emergencia');
                    let allRecipients = [...destinatariosArray];
                    if (cursoIdsArray && cursoIdsArray.length > 0) {
                        for (const cursoId of cursoIdsArray) {
                            const curso = await mongoose_1.default.model('Curso').findById(cursoId).populate('estudiantes');
                            if (curso && curso.estudiantes) {
                                const estudiantesIds = curso.estudiantes.map((est) => est._id.toString());
                                allRecipients.push(...estudiantesIds);
                                const acudientes = await usuario_model_1.default.find({
                                    'info_academica.estudiantes_asociados': { $in: estudiantesIds },
                                    tipo: 'ACUDIENTE',
                                }).select('_id');
                                allRecipients.push(...acudientes.map((a) => a._id.toString()));
                            }
                        }
                    }
                    allRecipients = [...new Set(allRecipients)];
                    let pushEnviadas = 0;
                    for (const recipientId of allRecipients) {
                        try {
                            let resultado;
                            if (isUrgent) {
                                resultado = await pushNotification_service_1.default.notificarMensajeUrgente(recipientId, senderName, asunto, nuevoMensaje._id.toString());
                            }
                            else {
                                resultado = await pushNotification_service_1.default.notificarNuevoMensaje(recipientId, senderName, asunto, nuevoMensaje._id.toString(), prioridad);
                            }
                            if (resultado)
                                pushEnviadas++;
                        }
                        catch (error) {
                            console.error(`❌ Error enviando push a ${recipientId}:`, error);
                        }
                    }
                    console.log(`✅ Notificaciones push enviadas: ${pushEnviadas}/${allRecipients.length}`);
                }
                catch (error) {
                    console.error('❌ Error enviando notificaciones push:', error);
                }
            }
            if (cursoIdsArray.length === 0 && destinatariosArray.length > 0) {
                try {
                    const estudiantesInfo = await usuario_model_1.default.find({
                        _id: { $in: destinatariosArray },
                        tipo: 'ESTUDIANTE',
                    }).select('_id');
                    const estudiantesIds = estudiantesInfo.map((est) => est._id.toString());
                    for (const estudianteId of estudiantesIds) {
                        await mensaje_service_1.default.enviarCopiaAcudientes(estudianteId, datosMensaje, req.user);
                    }
                }
                catch (errorCopia) {
                    console.error('[ERROR] enviarCopiaAcudientes falló pero el mensaje principal fue enviado:', errorCopia);
                }
            }
            res.status(201).json({
                success: true,
                data: nuevoMensaje,
            });
        }
        catch (error) {
            console.error('Error creating message:', error);
            next(error);
        }
    }
    async obtenerTodos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { tipo, bandeja = 'recibidos', pagina = 1, limite = 20, busqueda, desde, hasta, } = req.query;
            const opciones = {
                pagina: parseInt(pagina, 10),
                limite: parseInt(limite, 10),
            };
            const usuarioId = new mongoose_1.default.Types.ObjectId(req.user._id);
            const escuelaId = new mongoose_1.default.Types.ObjectId(req.user.escuelaId);
            const pipeline = [
                {
                    $match: {
                        escuelaId: escuelaId,
                    },
                },
            ];
            if (tipo) {
                pipeline.push({ $match: { tipo } });
            }
            if (desde || hasta) {
                const matchFecha = {};
                if (desde) {
                    matchFecha.createdAt = { $gte: new Date(desde) };
                }
                if (hasta) {
                    if (matchFecha.createdAt) {
                        matchFecha.createdAt.$lte = new Date(hasta);
                    }
                    else {
                        matchFecha.createdAt = { $lte: new Date(hasta) };
                    }
                }
                pipeline.push({ $match: matchFecha });
            }
            if (busqueda) {
                const regex = new RegExp((0, escapeRegex_1.escapeRegex)(busqueda), 'i');
                pipeline.push({
                    $match: {
                        $or: [{ asunto: regex }, { contenido: regex }],
                    },
                });
            }
            pipeline.push({
                $addFields: {
                    esRemitente: { $eq: ['$remitente', usuarioId] },
                    esDestinatario: { $in: [usuarioId, '$destinatarios'] },
                    esDestinatarioCc: { $in: [usuarioId, '$destinatariosCc'] },
                    estadoUsuario: {
                        $let: {
                            vars: {
                                estadoObj: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: { $ifNull: ['$estadosUsuarios', []] },
                                                as: 'estado',
                                                cond: { $eq: ['$$estado.usuarioId', usuarioId] },
                                            },
                                        },
                                        0,
                                    ],
                                },
                            },
                            in: { $ifNull: ['$$estadoObj.estado', '$estado'] },
                        },
                    },
                },
            });
            const matchBandeja = {};
            if (bandeja === 'recibidos') {
                matchBandeja.$or = [{ esDestinatario: true }, { esDestinatarioCc: true }];
                matchBandeja.estadoUsuario = IMensaje_1.EstadoMensaje.ENVIADO;
                matchBandeja.tipo = { $ne: IMensaje_1.TipoMensaje.BORRADOR };
            }
            else if (bandeja === 'enviados') {
                matchBandeja.esRemitente = true;
                matchBandeja.estadoUsuario = { $ne: IMensaje_1.EstadoMensaje.ELIMINADO };
                matchBandeja.tipo = { $ne: IMensaje_1.TipoMensaje.BORRADOR };
                matchBandeja.esCopiaAcudiente = { $ne: true };
            }
            else if (bandeja === 'borradores') {
                if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                    return res.json({
                        success: true,
                        data: [],
                        meta: {
                            total: 0,
                            pagina: opciones.pagina,
                            limite: opciones.limite,
                            totalPaginas: 0,
                        },
                        message: 'No tiene permisos para acceder a borradores',
                    });
                }
                matchBandeja.esRemitente = true;
                matchBandeja.tipo = IMensaje_1.TipoMensaje.BORRADOR;
            }
            else if (bandeja === 'archivados') {
                matchBandeja.$or = [
                    { esRemitente: true },
                    { esDestinatario: true },
                    { esDestinatarioCc: true },
                ];
                matchBandeja.estadoUsuario = IMensaje_1.EstadoMensaje.ARCHIVADO;
            }
            else if (bandeja === 'eliminados') {
                matchBandeja.$or = [
                    { esRemitente: true },
                    { esDestinatario: true },
                    { esDestinatarioCc: true },
                ];
                matchBandeja.estadoUsuario = IMensaje_1.EstadoMensaje.ELIMINADO;
            }
            pipeline.push({ $match: matchBandeja });
            pipeline.push({
                $lookup: {
                    from: 'usuarios',
                    localField: 'remitente',
                    foreignField: '_id',
                    as: 'remitenteInfo',
                },
            }, {
                $lookup: {
                    from: 'usuarios',
                    localField: 'destinatarios',
                    foreignField: '_id',
                    as: 'destinatariosInfo',
                },
            }, {
                $addFields: {
                    remitente: { $arrayElemAt: ['$remitenteInfo', 0] },
                    destinatarios: '$destinatariosInfo',
                },
            }, {
                $project: {
                    remitenteInfo: 0,
                    destinatariosInfo: 0,
                    'remitente.password': 0,
                    'destinatarios.password': 0,
                },
            });
            const totalPipeline = [...pipeline];
            const countResult = await mensaje_model_1.default.aggregate([...totalPipeline, { $count: 'total' }]);
            const total = countResult.length > 0 ? countResult[0].total : 0;
            pipeline.push({ $sort: { createdAt: -1 } }, { $skip: (opciones.pagina - 1) * opciones.limite }, { $limit: opciones.limite });
            const mensajes = await mensaje_model_1.default.aggregate(pipeline);
            return res.json({
                success: true,
                data: mensajes,
                meta: {
                    total,
                    pagina: opciones.pagina,
                    limite: opciones.limite,
                    totalPaginas: Math.ceil(total / opciones.limite),
                },
            });
        }
        catch (error) {
            return next(error);
        }
    }
    async obtenerPorId(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            if (!mongoose_1.default.isValidObjectId(id)) {
                throw new ApiError_1.default(400, 'ID de mensaje inválido');
            }
            const userObjId = mongoose_1.default.isValidObjectId(req.user._id)
                ? new mongoose_1.default.Types.ObjectId(req.user._id)
                : null;
            if (!userObjId) {
                throw new ApiError_1.default(400, 'ID de usuario inválido');
            }
            const matchQuery = {
                _id: new mongoose_1.default.Types.ObjectId(id),
                $or: [
                    { remitente: userObjId },
                    { destinatarios: userObjId },
                    { destinatariosCc: userObjId },
                ],
            };
            const mensaje = await mensaje_model_1.default.findOne(matchQuery).populate([
                { path: 'remitente', select: 'nombre apellidos email tipo' },
                { path: 'destinatarios', select: 'nombre apellidos email tipo' },
                { path: 'destinatariosCc', select: 'nombre apellidos email tipo' },
                { path: 'mensajeOriginalId' },
            ]);
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            if (mensaje.destinatarios && Array.isArray(mensaje.destinatarios)) {
                const destinatarioIds = mensaje.destinatarios
                    .filter((d) => d && d._id)
                    .map((d) => d._id.toString());
                const destinatariosCcIds = mensaje.destinatariosCc && Array.isArray(mensaje.destinatariosCc)
                    ? mensaje.destinatariosCc
                        .filter((d) => d && d._id)
                        .map((d) => d._id.toString())
                    : [];
                const userIdStr = req.user._id.toString();
                if (destinatarioIds.includes(userIdStr) || destinatariosCcIds.includes(userIdStr)) {
                    const lecturas = mensaje.lecturas || [];
                    const yaLeido = lecturas.some((l) => l && l.usuarioId && l.usuarioId.toString() === userIdStr);
                    if (!yaLeido) {
                        await mensaje_model_1.default.updateOne({ _id: id }, {
                            $push: {
                                lecturas: {
                                    usuarioId: userObjId,
                                    fechaLectura: new Date(),
                                },
                            },
                        });
                    }
                }
            }
            res.json({
                success: true,
                data: mensaje,
            });
        }
        catch (error) {
            console.error('Error al obtener mensaje por ID:', error);
            next(error);
        }
    }
    async archivar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
                const estadoUsuario = mensaje.estadosUsuarios.find((eu) => eu.usuarioId.toString() === req.user._id);
                if (estadoUsuario && estadoUsuario.estado === IMensaje_1.EstadoMensaje.ELIMINADO) {
                    throw new ApiError_1.default(400, 'No se puede archivar un mensaje que está en la papelera');
                }
            }
            await mensaje_model_1.default.updateOne({
                _id: id,
                $or: [
                    { 'estadosUsuarios.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) },
                    { 'estadosUsuarios.usuarioId': { $exists: false } },
                ],
            }, {
                $set: {
                    'estadosUsuarios.$[elem].estado': IMensaje_1.EstadoMensaje.ARCHIVADO,
                    'estadosUsuarios.$[elem].fechaAccion': new Date(),
                    fechaAccion: new Date(),
                },
            }, {
                arrayFilters: [{ 'elem.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) }],
                upsert: true,
            });
            res.json({
                success: true,
                message: 'Mensaje archivado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async desarchivar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            let estaArchivado = false;
            if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
                const estadoUsuario = mensaje.estadosUsuarios.find((eu) => eu.usuarioId.toString() === req.user._id);
                if (estadoUsuario && estadoUsuario.estado === IMensaje_1.EstadoMensaje.ARCHIVADO) {
                    estaArchivado = true;
                }
            }
            else if (mensaje.estado === IMensaje_1.EstadoMensaje.ARCHIVADO) {
                estaArchivado = true;
            }
            if (!estaArchivado) {
                throw new ApiError_1.default(400, 'El mensaje no está archivado');
            }
            await mensaje_model_1.default.updateOne({
                _id: id,
                'estadosUsuarios.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id),
            }, {
                $set: {
                    'estadosUsuarios.$[elem].estado': IMensaje_1.EstadoMensaje.ENVIADO,
                    'estadosUsuarios.$[elem].fechaAccion': new Date(),
                    fechaAccion: new Date(),
                },
            }, {
                arrayFilters: [{ 'elem.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) }],
            });
            res.json({
                success: true,
                message: 'Mensaje desarchivado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            await mensaje_model_1.default.updateOne({
                _id: id,
                $or: [
                    { 'estadosUsuarios.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) },
                    { 'estadosUsuarios.usuarioId': { $exists: false } },
                ],
            }, {
                $set: {
                    'estadosUsuarios.$[elem].estado': IMensaje_1.EstadoMensaje.ELIMINADO,
                    'estadosUsuarios.$[elem].fechaAccion': new Date(),
                    fechaAccion: new Date(),
                },
            }, {
                arrayFilters: [{ 'elem.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) }],
                upsert: true,
            });
            res.json({
                success: true,
                message: 'Mensaje movido a la papelera',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async restaurar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            let estaEliminado = false;
            if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
                const userId = req.user._id;
                const estadoUsuario = mensaje.estadosUsuarios.find((eu) => eu.usuarioId.toString() === userId);
                if (estadoUsuario && estadoUsuario.estado === IMensaje_1.EstadoMensaje.ELIMINADO) {
                    estaEliminado = true;
                }
            }
            else if (mensaje.estado === IMensaje_1.EstadoMensaje.ELIMINADO) {
                estaEliminado = true;
            }
            if (!estaEliminado) {
                throw new ApiError_1.default(400, 'El mensaje no está en la papelera');
            }
            await mensaje_model_1.default.updateOne({
                _id: id,
                'estadosUsuarios.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id),
            }, {
                $set: {
                    'estadosUsuarios.$[elem].estado': IMensaje_1.EstadoMensaje.ENVIADO,
                    'estadosUsuarios.$[elem].fechaAccion': new Date(),
                    fechaAccion: new Date(),
                },
            }, {
                arrayFilters: [{ 'elem.usuarioId': new mongoose_1.default.Types.ObjectId(req.user._id) }],
            });
            res.json({
                success: true,
                message: 'Mensaje restaurado correctamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarPermanentemente(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                estadosUsuarios: {
                    $elemMatch: {
                        usuarioId: req.user._id,
                        estado: 'ELIMINADO',
                    },
                },
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado o no está en la papelera');
            }
            await mensaje_model_1.default.updateOne({
                _id: id,
                'estadosUsuarios.usuarioId': req.user._id,
            }, {
                $set: { 'estadosUsuarios.$.estado': 'ELIMINADO_PERMANENTE' },
            });
            res.json({
                success: true,
                message: 'Mensaje eliminado permanentemente para este usuario',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async descargarAdjunto(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { mensajeId, adjuntoId } = req.params;
            const mensaje = await mensaje_model_1.default.findOne({
                _id: mensajeId,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            if (!mensaje.adjuntos || mensaje.adjuntos.length === 0) {
                throw new ApiError_1.default(404, 'El mensaje no tiene adjuntos');
            }
            const adjunto = mensaje.adjuntos.find((a) => a.fileId.toString() === adjuntoId);
            if (!adjunto) {
                throw new ApiError_1.default(404, 'Adjunto no encontrado');
            }
            const bucket = gridfs_1.default.getBucket();
            if (!bucket) {
                throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
            }
            const documentoCursor = bucket.find({ _id: new mongoose_1.default.Types.ObjectId(adjuntoId) });
            const documentoCount = await documentoCursor.count();
            if (documentoCount === 0) {
                throw new ApiError_1.default(404, 'Archivo no encontrado en el sistema');
            }
            res.set({
                'Content-Type': adjunto.tipo,
                'Content-Disposition': `attachment; filename="${adjunto.nombre}"`,
            });
            const downloadStream = bucket.openDownloadStream(new mongoose_1.default.Types.ObjectId(adjuntoId));
            downloadStream.pipe(res);
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarEstadoLectura(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const { leido } = req.body;
            if (leido === undefined || leido === null) {
                throw new ApiError_1.default(400, 'El parámetro "leido" es requerido');
            }
            const mensaje = await mensaje_model_1.default.findOne({
                _id: id,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            });
            if (!mensaje) {
                throw new ApiError_1.default(404, 'Mensaje no encontrado');
            }
            const esRemitente = mensaje.remitente.toString() === req.user._id.toString();
            const esDestinatario = mensaje.destinatarios &&
                Array.isArray(mensaje.destinatarios) &&
                mensaje.destinatarios.some((dest) => {
                    const destId = typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
                    return destId === req.user._id.toString();
                });
            const esDestinatarioCc = mensaje.destinatariosCc &&
                Array.isArray(mensaje.destinatariosCc) &&
                mensaje.destinatariosCc.some((dest) => {
                    const destId = typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
                    return destId === req.user._id.toString();
                });
            if (!esDestinatario && !esDestinatarioCc && !esRemitente) {
                console.log(`[DEBUG] Usuario ${req.user._id} (${req.user.tipo}) no puede marcar mensaje ${id}`);
                console.log(`[DEBUG] Es remitente: ${esRemitente}, Es destinatario: ${esDestinatario}, Es destinatarioCc: ${esDestinatarioCc}`);
                console.log(`[DEBUG] Mensaje.remitente: ${mensaje.remitente}`);
                throw new ApiError_1.default(403, 'No tiene permisos para cambiar el estado de lectura de este mensaje');
            }
            if (leido) {
                if (!esDestinatario && !esDestinatarioCc) {
                    throw new ApiError_1.default(403, 'Solo los destinatarios pueden marcar como leído');
                }
                const yaLeido = mensaje.lecturas &&
                    Array.isArray(mensaje.lecturas) &&
                    mensaje.lecturas.some((l) => l.usuarioId && l.usuarioId.toString() === req.user._id.toString());
                if (!yaLeido) {
                    await mensaje_model_1.default.updateOne({ _id: id }, {
                        $push: {
                            lecturas: {
                                usuarioId: req.user._id,
                                fechaLectura: new Date(),
                            },
                        },
                    });
                }
                res.json({
                    success: true,
                    message: 'Mensaje marcado como leído',
                });
            }
            else {
                if (!esDestinatario && !esDestinatarioCc) {
                    throw new ApiError_1.default(403, 'Solo los destinatarios pueden marcar como no leído');
                }
                await mensaje_model_1.default.updateOne({ _id: id }, {
                    $pull: {
                        lecturas: {
                            usuarioId: req.user._id,
                        },
                    },
                });
                res.json({
                    success: true,
                    message: 'Mensaje marcado como no leído',
                });
            }
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerBorradorPorId(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!exports.ROLES_CON_BORRADORES.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tiene permisos para usar borradores');
            }
            const { id } = req.params;
            if (!mongoose_1.default.isValidObjectId(id)) {
                throw new ApiError_1.default(400, 'ID de borrador inválido');
            }
            const borrador = await mensaje_model_1.default.findOne({
                _id: id,
                remitente: req.user._id,
                tipo: IMensaje_1.TipoMensaje.BORRADOR,
            }).populate('destinatarios', 'nombre apellidos email tipo');
            if (!borrador) {
                throw new ApiError_1.default(404, 'Borrador no encontrado');
            }
            res.json({
                success: true,
                data: borrador,
            });
        }
        catch (error) {
            console.error('Error al obtener borrador por ID:', error);
            next(error);
        }
    }
    async obtenerUltimos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const limit = parseInt(req.query.limit) || 3;
            const userId = req.user._id;
            console.log(`📬 Obteniendo últimos ${limit} mensajes para usuario: ${userId}`);
            const mensajes = await mensaje_model_1.default.find({
                destinatarios: userId,
                tipo: { $ne: IMensaje_1.TipoMensaje.BORRADOR },
                'lecturas.usuarioId': { $ne: userId }
            })
                .sort({ createdAt: -1 })
                .limit(limit)
                .populate('remitente', 'nombre apellidos')
                .select('asunto contenido createdAt fechaEnvio remitente')
                .lean();
            console.log(`✅ Encontrados ${mensajes.length} mensajes sin leer`);
            const formatted = mensajes.map((mensaje) => {
                const remitente = mensaje.remitente;
                const nombre = remitente?.nombre || '';
                const apellidos = remitente?.apellidos || '';
                const iniciales = `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
                const preview = mensaje.contenido
                    ? mensaje.contenido.substring(0, 50).trim() + '...'
                    : 'Sin contenido';
                console.log(`🔍 Mensaje ${mensaje._id}:`);
                console.log(`   fechaEnvio: ${mensaje.fechaEnvio}`);
                console.log(`   createdAt: ${mensaje.createdAt}`);
                const fechaReal = mensaje.fechaEnvio || mensaje.createdAt;
                console.log(`   ✅ Fecha a usar: ${fechaReal}`);
                const ahora = new Date();
                const fechaMensaje = new Date(fechaReal);
                const diffMs = ahora.getTime() - fechaMensaje.getTime();
                const diffMinutos = Math.floor(diffMs / 60000);
                console.log(`   ⏱️ Diferencia en minutos: ${diffMinutos}`);
                let tiempoRelativo;
                if (diffMinutos < 1) {
                    tiempoRelativo = 'Justo ahora';
                }
                else if (diffMinutos < 60) {
                    tiempoRelativo = `Hace ${diffMinutos} min`;
                }
                else if (diffMinutos < 1440) {
                    const horas = Math.floor(diffMinutos / 60);
                    tiempoRelativo = `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
                }
                else {
                    const dias = Math.floor(diffMinutos / 1440);
                    tiempoRelativo = `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
                }
                console.log(`   ⏰ Tiempo calculado: ${tiempoRelativo}`);
                const resultado = {
                    id: mensaje._id,
                    remitente: {
                        nombre: nombre,
                        apellidos: apellidos,
                        nombreCompleto: `${nombre} ${apellidos}`.trim(),
                        iniciales: iniciales
                    },
                    asunto: mensaje.asunto,
                    preview: preview,
                    fechaEnvio: fechaReal,
                    tiempoRelativo: tiempoRelativo
                };
                console.log(`   📦 Resultado:`, JSON.stringify(resultado, null, 2));
                return resultado;
            });
            console.log(`📤 Enviando ${formatted.length} mensajes formateados`);
            res.json({
                success: true,
                data: formatted
            });
        }
        catch (error) {
            console.error('❌ Error obteniendo últimos mensajes:', error);
            next(error);
        }
    }
    async responder(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { mensajeId } = req.params;
            const { asunto, contenido, destinatariosCc } = req.body;
            const mensajeOriginal = await mensaje_model_1.default.findOne({
                _id: mensajeId,
                $or: [
                    { remitente: req.user._id },
                    { destinatarios: req.user._id },
                    { destinatariosCc: req.user._id },
                ],
            }).populate('remitente', 'nombre apellidos email tipo');
            if (!mensajeOriginal) {
                throw new ApiError_1.default(404, 'Mensaje original no encontrado');
            }
            let destinatarios = [];
            if (mensajeOriginal.remitente._id.toString() === req.user._id) {
                destinatarios = mensajeOriginal.destinatarios.map((d) => d.toString());
            }
            else {
                destinatarios = [mensajeOriginal.remitente._id.toString()];
            }
            const adjuntos = [];
            if (req.files && req.files.length > 0) {
                const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
                const MAX_TOTAL_SIZE = 15 * 1024 * 1024;
                if (totalSize > MAX_TOTAL_SIZE) {
                    throw new ApiError_1.default(400, `El tamaño total de los archivos adjuntos no puede superar los 15MB (tamaño actual: ${(totalSize /
                        (1024 * 1024)).toFixed(2)}MB)`);
                }
                const bucket = gridfs_1.default.getBucket();
                if (!bucket) {
                    throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                }
                for (const file of req.files) {
                    const filename = file.filename || path_1.default.basename(file.path);
                    const uploadStream = bucket.openUploadStream(filename, {
                        metadata: {
                            originalName: file.originalname,
                            contentType: file.mimetype,
                            size: file.size,
                            uploadedBy: req.user._id,
                        },
                    });
                    const fileContent = fs_1.default.readFileSync(file.path);
                    uploadStream.write(fileContent);
                    uploadStream.end();
                    adjuntos.push({
                        nombre: file.originalname,
                        tipo: file.mimetype,
                        tamaño: file.size,
                        fileId: uploadStream.id,
                        fechaSubida: new Date(),
                    });
                    try {
                        fs_1.default.unlinkSync(file.path);
                    }
                    catch (error) {
                        console.error('Error deleting temporary file:', error);
                    }
                }
            }
            let destinatariosCcArray = [];
            if (destinatariosCc) {
                if (typeof destinatariosCc === 'string') {
                    try {
                        destinatariosCcArray = JSON.parse(destinatariosCc);
                    }
                    catch (error) {
                        destinatariosCcArray = [destinatariosCc];
                    }
                }
                else if (Array.isArray(destinatariosCc)) {
                    destinatariosCcArray = destinatariosCc;
                }
            }
            const datosRespuesta = {
                destinatarios,
                destinatariosCc: destinatariosCcArray,
                asunto: asunto || `Re: ${mensajeOriginal.asunto}`,
                contenido,
                adjuntos,
                tipo: IMensaje_1.TipoMensaje.INDIVIDUAL,
                prioridad: IMensaje_1.PrioridadMensaje.NORMAL,
                estado: IMensaje_1.EstadoMensaje.ENVIADO,
                esRespuesta: true,
                mensajeOriginalId: mensajeId,
            };
            const respuesta = await mensaje_service_1.default.crearMensaje(datosRespuesta, req.user);
            try {
                const senderName = `${req.user.nombre} ${req.user.apellidos}`;
                for (const recipientId of destinatarios) {
                    await pushNotification_service_1.default.notificarNuevoMensaje(recipientId, senderName, datosRespuesta.asunto, respuesta._id.toString(), 'NORMAL');
                }
                console.log('✅ Notificaciones push enviadas para respuesta');
            }
            catch (error) {
                console.error('❌ Error enviando push para respuesta:', error);
            }
            const estudiantesInfo = await usuario_model_1.default.find({
                _id: { $in: destinatarios },
                tipo: 'ESTUDIANTE',
            }).select('_id');
            const estudiantesIds = estudiantesInfo.map((est) => est._id.toString());
            for (const estudianteId of estudiantesIds) {
                await mensaje_service_1.default.enviarCopiaAcudientes(estudianteId, datosRespuesta, req.user);
            }
            res.status(201).json({
                success: true,
                data: respuesta,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async estadisticasDocentes(req, res, next) {
        try {
            if (!req.user)
                throw new ApiError_1.default(401, 'No autorizado');
            const { desde, hasta, cursoId, docenteId } = req.query;
            if (!desde || !hasta) {
                throw new ApiError_1.default(400, 'Los parámetros desde y hasta son requeridos');
            }
            if (cursoId && !mongoose_1.default.isValidObjectId(cursoId)) {
                throw new ApiError_1.default(400, 'cursoId inválido');
            }
            if (docenteId && !mongoose_1.default.isValidObjectId(docenteId)) {
                throw new ApiError_1.default(400, 'docenteId inválido');
            }
            const result = await mensaje_service_1.default.obtenerEstadisticasDocentes(req.user.escuelaId, {
                desde,
                hasta,
                cursoId,
                docenteId,
            });
            res.status(200).json({ success: true, ...result });
        }
        catch (error) {
            next(error);
        }
    }
    async auditoriaDocente(req, res, next) {
        try {
            if (!req.user)
                throw new ApiError_1.default(401, 'No autorizado');
            const { remitenteId, desde, hasta, pagina, limite } = req.query;
            if (!remitenteId || !desde || !hasta) {
                throw new ApiError_1.default(400, 'Los parámetros remitenteId, desde y hasta son requeridos');
            }
            if (!mongoose_1.default.isValidObjectId(remitenteId)) {
                throw new ApiError_1.default(400, 'remitenteId inválido');
            }
            const result = await mensaje_service_1.default.obtenerMensajesAuditoria(req.user.escuelaId, {
                remitenteId,
                desde,
                hasta,
                pagina: pagina ? parseInt(pagina, 10) : 1,
                limite: limite ? parseInt(limite, 10) : 20,
            });
            res.status(200).json({ success: true, ...result });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.MensajeController = MensajeController;
const mensajeController = new MensajeController();
exports.default = mensajeController;
//# sourceMappingURL=mensaje.controller.js.map