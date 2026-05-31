"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const calendario_model_1 = __importDefault(require("../models/calendario.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const gridfs_1 = __importDefault(require("../config/gridfs"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ICalendario_1 = require("../interfaces/ICalendario");
class CalendarioController {
    async crearEvento(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const eventoData = {
                ...req.body,
                escuelaId: req.user.escuelaId,
                creadorId: req.user._id,
            };
            if (req.files && req.files.length > 0) {
                const file = req.files[0];
                const bucket = gridfs_1.default.getBucket();
                if (!bucket) {
                    throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                }
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
                eventoData.archivoAdjunto = {
                    fileId: uploadStream.id,
                    nombre: file.originalname,
                    tipo: file.mimetype,
                    tamaño: file.size,
                };
                try {
                    fs_1.default.unlinkSync(file.path);
                }
                catch (error) {
                    console.error('Error deleting temporary file:', error);
                }
            }
            if (eventoData.fechaInicio) {
                eventoData.fechaInicio = new Date(eventoData.fechaInicio);
                console.log(`Fecha inicio recibida: ${eventoData.fechaInicio}`);
                console.log(`Fecha inicio procesada: ${new Date(eventoData.fechaInicio).toISOString()}`);
            }
            if (eventoData.fechaFin) {
                eventoData.fechaFin = new Date(eventoData.fechaFin);
                console.log(`Fecha fin recibida: ${eventoData.fechaFin}`);
                console.log(`Fecha fin procesada: ${new Date(eventoData.fechaFin).toISOString()}`);
            }
            if (eventoData.invitados && typeof eventoData.invitados === 'string') {
                try {
                    eventoData.invitados = JSON.parse(eventoData.invitados);
                }
                catch (error) {
                    throw new ApiError_1.default(400, 'Formato de invitados inválido');
                }
            }
            if (eventoData.recordatorios && typeof eventoData.recordatorios === 'string') {
                try {
                    eventoData.recordatorios = JSON.parse(eventoData.recordatorios);
                }
                catch (error) {
                    throw new ApiError_1.default(400, 'Formato de recordatorios inválido');
                }
            }
            const evento = (await calendario_model_1.default.create(eventoData));
            const eventoPopulado = await calendario_model_1.default.findById(evento._id)
                .populate('creadorId', 'nombre apellidos email tipo')
                .populate('cursoId', 'nombre nivel');
            res.status(201).json({
                success: true,
                data: eventoPopulado,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerEventos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { inicio, fin, cursoId, tipo, estado } = req.query;
            console.log('🔍 DEPURACIÓN - Parámetros de consulta:', {
                inicio,
                fin,
                cursoId,
                tipo,
                estado,
                userType: req.user.tipo,
                userId: req.user._id,
                escuelaId: req.user.escuelaId,
            });
            const pipeline = [
                { $match: { escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId.toString()) } },
            ];
            if (req.user.tipo === 'ESTUDIANTE' ||
                req.user.tipo === 'PADRE' ||
                req.user.tipo === 'ACUDIENTE') {
                pipeline.push({ $match: { estado: 'ACTIVO' } });
                console.log('✅ Usuario estudiante/padre/acudiente - SOLO eventos ACTIVOS');
            }
            else {
                console.log('🔍 Filtro de estado recibido:', estado);
                if (estado === 'ACTIVO') {
                    pipeline.push({ $match: { estado: 'ACTIVO' } });
                    console.log('✅ Filtrando: SOLO eventos ACTIVOS');
                }
                else if (estado === 'PENDIENTE') {
                    pipeline.push({ $match: { estado: 'PENDIENTE' } });
                    console.log('✅ Filtrando: SOLO eventos PENDIENTES');
                }
                else if (estado === 'CANCELADO') {
                    pipeline.push({ $match: { estado: 'CANCELADO' } });
                    console.log('✅ Filtrando: SOLO eventos CANCELADOS');
                }
                else if (estado === 'ALL') {
                    console.log('✅ TODOS: Sin filtro de estado - Mostrando ACTIVOS + PENDIENTES + CANCELADOS');
                }
                else {
                    pipeline.push({ $match: { estado: 'ACTIVO' } });
                    console.log('✅ Por defecto: SOLO eventos ACTIVOS');
                }
            }
            if (cursoId) {
                pipeline.push({ $match: { cursoId: new mongoose_1.default.Types.ObjectId(cursoId.toString()) } });
            }
            if (tipo) {
                pipeline.push({ $match: { tipo: tipo } });
            }
            if (inicio || fin) {
                const fechaMatch = {};
                if (inicio) {
                    const fechaInicio = new Date(inicio);
                    fechaMatch.fechaFin = { $gte: fechaInicio };
                    console.log(`Filtro inicio: ${fechaInicio.toISOString()}`);
                }
                if (fin) {
                    const fechaFin = new Date(fin);
                    if (!fechaMatch.fechaInicio)
                        fechaMatch.fechaInicio = {};
                    fechaMatch.fechaInicio.$lte = fechaFin;
                    console.log(`Filtro fin: ${fechaFin.toISOString()}`);
                }
                pipeline.push({ $match: fechaMatch });
                console.log('Filtro de fechas aplicado:', JSON.stringify(fechaMatch));
            }
            if (req.user.tipo === 'ESTUDIANTE') {
                const cursos = await curso_model_1.default.find({ estudiantes: req.user._id }).select('_id');
                const cursoIds = cursos.map((c) => new mongoose_1.default.Types.ObjectId(c._id.toString()));
                pipeline.push({
                    $match: {
                        $or: [
                            { cursoId: { $in: cursoIds } },
                            { cursoId: { $exists: false } },
                            { 'invitados.usuarioId': req.user._id },
                        ],
                    },
                });
            }
            else if (req.user.tipo === 'DOCENTE') {
                const cursos = await curso_model_1.default.find({
                    $or: [{ director_grupo: req.user._id }],
                }).select('_id');
                const cursoIds = cursos.map((c) => new mongoose_1.default.Types.ObjectId(c._id.toString()));
                pipeline.push({
                    $match: {
                        $or: [
                            { cursoId: { $in: cursoIds } },
                            { cursoId: { $exists: false } },
                            { creadorId: new mongoose_1.default.Types.ObjectId(req.user._id.toString()) },
                            { 'invitados.usuarioId': req.user._id },
                        ],
                    },
                });
            }
            else if (req.user.tipo === 'PADRE' || req.user.tipo === 'ACUDIENTE') {
                const usuario = await usuario_model_1.default.findById(req.user._id);
                if (usuario && usuario.info_academica && usuario.info_academica.estudiantes_asociados) {
                    const estudiantesIds = usuario.info_academica.estudiantes_asociados;
                    const cursos = await curso_model_1.default.find({
                        estudiantes: { $in: estudiantesIds },
                    }).select('_id');
                    const cursoIds = cursos.map((c) => new mongoose_1.default.Types.ObjectId(c._id.toString()));
                    pipeline.push({
                        $match: {
                            $or: [
                                { cursoId: { $in: cursoIds } },
                                { cursoId: { $exists: false } },
                                { 'invitados.usuarioId': req.user._id },
                            ],
                        },
                    });
                }
            }
            pipeline.push({ $sort: { fechaInicio: 1 } });
            console.log('🔍 DEPURACIÓN - Pipeline con filtros aplicados:', JSON.stringify(pipeline, null, 2));
            const eventos = await calendario_model_1.default.aggregate(pipeline);
            await calendario_model_1.default.populate(eventos, {
                path: 'creadorId',
                select: 'nombre apellidos email tipo',
            });
            await calendario_model_1.default.populate(eventos, {
                path: 'cursoId',
                select: 'nombre nivel',
            });
            console.log(`✅ RESULTADO - Eventos encontrados: ${eventos.length}`);
            if (eventos.length > 0) {
                console.log('✅ RESULTADO - Estados de eventos:', eventos.map((e) => ({ id: e._id, titulo: e.titulo, estado: e.estado })));
            }
            else {
                console.log('⚠️ RESULTADO - No se encontraron eventos');
                console.log('⚠️ Pipeline usado:', JSON.stringify(pipeline, null, 2));
            }
            res.json({
                success: true,
                data: eventos,
            });
        }
        catch (error) {
            console.error('ERROR en obtenerEventos:', error);
            next(error);
        }
    }
    async obtenerEventoPorId(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const evento = await calendario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            })
                .populate('creadorId', 'nombre apellidos email tipo')
                .populate('cursoId', 'nombre nivel')
                .populate('invitados.usuarioId', 'nombre apellidos email tipo');
            if (!evento) {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            if ((req.user.tipo === 'ESTUDIANTE' ||
                req.user.tipo === 'PADRE' ||
                req.user.tipo === 'ACUDIENTE') &&
                evento.estado !== 'ACTIVO') {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            console.log('✅ Evento obtenido:', {
                id: evento._id,
                titulo: evento.titulo,
                estado: evento.estado,
                usuarioTipo: req.user.tipo,
            });
            res.json({
                success: true,
                data: evento,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarEvento(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const evento = await calendario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!evento) {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            const rolesAdministrativos = ['ADMIN', 'COORDINADOR', 'RECTOR', 'DOCENTE', 'ADMINISTRATIVO'];
            const esCreador = evento.creadorId.toString() === req.user._id;
            const tienePermisoAdministrativo = rolesAdministrativos.includes(req.user.tipo);
            if (!esCreador && !tienePermisoAdministrativo) {
                throw new ApiError_1.default(403, 'No tienes permiso para editar este evento');
            }
            const datosActualizacion = { ...req.body };
            if (datosActualizacion.fechaInicio) {
                datosActualizacion.fechaInicio = new Date(datosActualizacion.fechaInicio);
            }
            if (datosActualizacion.fechaFin) {
                datosActualizacion.fechaFin = new Date(datosActualizacion.fechaFin);
            }
            if (datosActualizacion.invitados && typeof datosActualizacion.invitados === 'string') {
                try {
                    datosActualizacion.invitados = JSON.parse(datosActualizacion.invitados);
                }
                catch (error) {
                    throw new ApiError_1.default(400, 'Formato de invitados inválido');
                }
            }
            if (req.files && req.files.length > 0) {
                const file = req.files[0];
                const bucket = gridfs_1.default.getBucket();
                if (!bucket) {
                    throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
                }
                if (evento.archivoAdjunto && evento.archivoAdjunto.fileId) {
                    try {
                        await bucket.delete(new mongoose_1.default.Types.ObjectId(evento.archivoAdjunto.fileId.toString()));
                    }
                    catch (error) {
                        console.error('Error deleting old file:', error);
                    }
                }
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
                datosActualizacion.archivoAdjunto = {
                    fileId: uploadStream.id,
                    nombre: file.originalname,
                    tipo: file.mimetype,
                    tamaño: file.size,
                };
                try {
                    fs_1.default.unlinkSync(file.path);
                }
                catch (error) {
                    console.error('Error deleting temporary file:', error);
                }
            }
            await calendario_model_1.default.findByIdAndUpdate(req.params.id, datosActualizacion, {
                new: true,
                runValidators: true,
            });
            const eventoActualizado = await calendario_model_1.default.findById(req.params.id)
                .populate('creadorId', 'nombre apellidos email tipo')
                .populate('cursoId', 'nombre nivel')
                .populate('invitados.usuarioId', 'nombre apellidos email tipo')
                .lean();
            if (!eventoActualizado) {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            res.json({
                success: true,
                data: eventoActualizado,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarEvento(req, res, next) {
        try {
            console.log('🗑️ === INICIANDO CANCELACIÓN DE EVENTO ===');
            console.log(`ID del evento: ${req.params.id}`);
            console.log(`Usuario: ${req.user?.email} (${req.user?.tipo})`);
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const evento = await calendario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!evento) {
                console.log('❌ Evento no encontrado en la base de datos');
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            console.log(`✅ Evento encontrado: "${evento.titulo}"`);
            console.log(`Estado actual: ${evento.estado}`);
            const rolesAdministrativos = ['ADMIN', 'COORDINADOR', 'RECTOR', 'DOCENTE', 'ADMINISTRATIVO'];
            const esCreador = evento.creadorId.toString() === req.user._id;
            const tienePermisoAdministrativo = rolesAdministrativos.includes(req.user.tipo);
            if (!esCreador && !tienePermisoAdministrativo) {
                console.log('❌ Usuario sin permisos para eliminar');
                console.log(`   - Tipo de usuario: ${req.user.tipo}`);
                console.log(`   - Es creador: ${esCreador}`);
                console.log(`   - Tiene permiso administrativo: ${tienePermisoAdministrativo}`);
                throw new ApiError_1.default(403, 'No tienes permiso para eliminar este evento');
            }
            if (evento.estado === 'CANCELADO') {
                console.log('⚠️ El evento ya estaba cancelado');
                throw new ApiError_1.default(400, 'El evento ya está cancelado');
            }
            console.log('🔄 Cambiando estado del evento a CANCELADO...');
            const eventoActualizado = await calendario_model_1.default.findByIdAndUpdate(req.params.id, {
                estado: ICalendario_1.EstadoEvento.CANCELADO,
                fechaCancelacion: new Date(),
            }, { new: true });
            if (!eventoActualizado) {
                console.log('❌ No se pudo cancelar el evento');
                throw new ApiError_1.default(500, 'Error al cancelar el evento');
            }
            console.log('✅ EVENTO CANCELADO EXITOSAMENTE');
            console.log(`Título: "${eventoActualizado.titulo}"`);
            console.log(`Nuevo estado: ${eventoActualizado.estado}`);
            console.log('🗑️ === CANCELACIÓN COMPLETADA ===');
            res.json({
                success: true,
                message: 'Evento cancelado exitosamente',
                data: {
                    _id: eventoActualizado._id,
                    titulo: eventoActualizado.titulo,
                    estado: eventoActualizado.estado,
                    cancelado: true,
                    fechaCancelacion: new Date().toISOString(),
                },
            });
        }
        catch (error) {
            console.error('❌ ERROR al cancelar evento:', error);
            next(error);
        }
    }
    async confirmarAsistencia(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { confirmado } = req.body;
            const evento = await calendario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                'invitados.usuarioId': req.user._id,
            });
            if (!evento) {
                throw new ApiError_1.default(404, 'Evento no encontrado o no estás invitado');
            }
            await calendario_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                'invitados.usuarioId': req.user._id,
            }, {
                $set: {
                    'invitados.$.confirmado': confirmado,
                    'invitados.$.fechaConfirmacion': new Date(),
                },
            }, { new: true });
            const eventoActualizado = await calendario_model_1.default.findById(req.params.id)
                .populate('creadorId', 'nombre apellidos email tipo')
                .populate('cursoId', 'nombre nivel');
            if (!eventoActualizado) {
                throw new ApiError_1.default(500, 'Error al actualizar la confirmación');
            }
            res.json({
                success: true,
                message: `Has confirmado tu asistencia al evento`,
                data: eventoActualizado,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async cambiarEstadoEvento(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id } = req.params;
            const { estado } = req.body;
            if (!['PENDIENTE', 'ACTIVO', 'FINALIZADO', 'CANCELADO'].includes(estado)) {
                throw new ApiError_1.default(400, 'Estado no válido');
            }
            const evento = await calendario_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
            });
            if (!evento) {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            const rolesConPermiso = ['ADMIN', 'COORDINADOR', 'RECTOR', 'DOCENTE', 'ADMINISTRATIVO'];
            if (!rolesConPermiso.includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para cambiar el estado de este evento');
            }
            const eventoActualizado = await calendario_model_1.default.findByIdAndUpdate(id, { estado }, { new: true })
                .populate('creadorId', 'nombre apellidos email tipo')
                .populate('cursoId', 'nombre nivel');
            res.json({
                success: true,
                data: eventoActualizado,
                message: `Estado del evento cambiado a ${estado} exitosamente`,
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
            const evento = await calendario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!evento) {
                throw new ApiError_1.default(404, 'Evento no encontrado');
            }
            if (!evento.archivoAdjunto || !evento.archivoAdjunto.fileId) {
                throw new ApiError_1.default(404, 'Este evento no tiene archivo adjunto');
            }
            const bucket = gridfs_1.default.getBucket();
            if (!bucket) {
                throw new ApiError_1.default(500, 'Servicio de archivos no disponible');
            }
            const fileId = new mongoose_1.default.Types.ObjectId(evento.archivoAdjunto.fileId.toString());
            const documentoCursor = bucket.find({ _id: fileId });
            const documentoCount = await documentoCursor.count();
            if (documentoCount === 0) {
                throw new ApiError_1.default(404, 'Archivo no encontrado en el sistema');
            }
            res.set({
                'Content-Type': evento.archivoAdjunto.tipo,
                'Content-Disposition': `attachment; filename="${evento.archivoAdjunto.nombre}"`,
            });
            const downloadStream = bucket.openDownloadStream(fileId);
            downloadStream.pipe(res);
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new CalendarioController();
//# sourceMappingURL=calendario.controller.js.map