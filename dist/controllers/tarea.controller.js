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
const tarea_model_1 = __importDefault(require("../models/tarea.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const mongodb_1 = require("mongodb");
const fs = __importStar(require("fs"));
const escapeRegex_1 = require("../utils/escapeRegex");
class TareaController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { titulo, descripcion, asignaturaId, cursoId, estudiantesIds, fechaLimite, tipo = 'INDIVIDUAL', prioridad = 'MEDIA', permiteTardias = true, calificacionMaxima, pesoEvaluacion, } = req.body;
            const curso = await curso_model_1.default.findOne({
                _id: cursoId,
                escuelaId: req.user.escuelaId,
            });
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            let estudiantesParaAsignar = [];
            if (estudiantesIds && estudiantesIds.length > 0) {
                const estudiantesValidos = await usuario_model_1.default.find({
                    _id: { $in: estudiantesIds },
                    escuelaId: req.user.escuelaId,
                    tipo: 'ESTUDIANTE',
                });
                if (estudiantesValidos.length !== estudiantesIds.length) {
                    throw new ApiError_1.default(400, 'Algunos estudiantes no son válidos');
                }
                estudiantesParaAsignar = estudiantesIds.map((id) => new mongoose_1.default.Types.ObjectId(id));
            }
            else {
                estudiantesParaAsignar = curso.estudiantes.map((id) => new mongoose_1.default.Types.ObjectId(id));
            }
            const entregas = estudiantesParaAsignar.map((estudianteId) => ({
                estudianteId,
                estado: 'PENDIENTE',
                archivos: [],
                intentos: 0,
            }));
            const nuevaTarea = await tarea_model_1.default.create({
                titulo,
                descripcion,
                docenteId: req.user._id,
                asignaturaId,
                cursoId,
                estudiantesIds: estudiantesParaAsignar,
                fechaLimite,
                tipo,
                prioridad,
                permiteTardias,
                calificacionMaxima,
                pesoEvaluacion,
                archivosReferencia: [],
                vistas: [],
                entregas,
                estado: 'ACTIVA',
                escuelaId: req.user.escuelaId,
            });
            res.status(201).json({
                success: true,
                data: nuevaTarea,
                message: 'Tarea creada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async listar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const pagina = parseInt(req.query.pagina) || 1;
            const limite = parseInt(req.query.limite) || 10;
            const skip = (pagina - 1) * limite;
            const filters = { escuelaId: req.user.escuelaId };
            if (req.user.tipo === 'DOCENTE') {
                filters.docenteId = req.user._id;
            }
            else if (req.user.tipo === 'ESTUDIANTE') {
                filters['entregas.estudianteId'] = req.user._id;
            }
            if (req.query.cursoId) {
                filters.cursoId = req.query.cursoId;
            }
            if (req.query.asignaturaId) {
                filters.asignaturaId = req.query.asignaturaId;
            }
            if (req.query.estado) {
                filters.estado = req.query.estado;
            }
            if (req.query.prioridad) {
                filters.prioridad = req.query.prioridad;
            }
            if (req.query.busqueda) {
                const busqueda = req.query.busqueda;
                filters.$or = [
                    { titulo: { $regex: (0, escapeRegex_1.escapeRegex)(busqueda), $options: 'i' } },
                    { descripcion: { $regex: (0, escapeRegex_1.escapeRegex)(busqueda), $options: 'i' } },
                ];
            }
            const [tareas, total] = await Promise.all([
                tarea_model_1.default.find(filters)
                    .sort({ fechaLimite: 1, createdAt: -1 })
                    .skip(skip)
                    .limit(limite)
                    .populate('docenteId', 'nombre apellidos')
                    .populate('asignaturaId', 'nombre')
                    .populate('cursoId', 'nombre nivel')
                    .lean(),
                tarea_model_1.default.countDocuments(filters),
            ]);
            res.json({
                success: true,
                data: tareas,
                meta: {
                    total,
                    pagina,
                    limite,
                    paginas: Math.ceil(total / limite),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerPorId(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            })
                .populate('docenteId', 'nombre apellidos email')
                .populate('asignaturaId', 'nombre')
                .populate('cursoId', 'nombre nivel')
                .populate('entregas.estudianteId', 'nombre apellidos email');
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            tarea.actualizarEstadosEntregas();
            await tarea.save();
            if (req.user.tipo === 'ESTUDIANTE') {
                const tareaObj = tarea.toObject();
                tareaObj.entregas = tareaObj.entregas.filter((e) => e.estudianteId._id.toString() === req.user?._id);
                res.json({
                    success: true,
                    data: tareaObj,
                });
                return;
            }
            const estadisticas = tarea.obtenerEstadisticas();
            res.json({
                success: true,
                data: tarea,
                estadisticas,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para editar esta tarea');
            }
            const { titulo, descripcion, fechaLimite, prioridad, permiteTardias, calificacionMaxima, pesoEvaluacion, } = req.body;
            if (titulo !== undefined)
                tarea.titulo = titulo;
            if (descripcion !== undefined)
                tarea.descripcion = descripcion;
            if (fechaLimite !== undefined)
                tarea.fechaLimite = new Date(fechaLimite);
            if (prioridad !== undefined)
                tarea.prioridad = prioridad;
            if (permiteTardias !== undefined)
                tarea.permiteTardias = permiteTardias;
            if (calificacionMaxima !== undefined)
                tarea.calificacionMaxima = calificacionMaxima;
            if (pesoEvaluacion !== undefined)
                tarea.pesoEvaluacion = pesoEvaluacion;
            await tarea.save();
            res.json({
                success: true,
                data: tarea,
                message: 'Tarea actualizada exitosamente',
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
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para eliminar esta tarea');
            }
            const tieneEntregas = tarea.entregas.some((e) => e.fechaEntrega);
            if (tieneEntregas) {
                throw new ApiError_1.default(400, 'No se puede eliminar una tarea que ya tiene entregas. Considere cancelarla.');
            }
            await tarea.deleteOne();
            res.json({
                success: true,
                message: 'Tarea eliminada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async cerrar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para cerrar esta tarea');
            }
            tarea.estado = 'CERRADA';
            tarea.actualizarEstadosEntregas();
            await tarea.save();
            res.json({
                success: true,
                data: tarea,
                message: 'Tarea cerrada exitosamente. No se permiten más entregas.',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async marcarVista(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(403, 'Solo los estudiantes pueden marcar tareas como vistas');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                'entregas.estudianteId': req.user._id,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada o no asignada a ti');
            }
            const yaVista = tarea.vistas.some((v) => v.estudianteId.toString() === req.user?._id);
            if (!yaVista) {
                tarea.vistas.push({
                    estudianteId: new mongoose_1.default.Types.ObjectId(req.user._id),
                    fechaVista: new Date(),
                });
                const entrega = tarea.entregas.find((e) => e.estudianteId.toString() === req.user?._id);
                if (entrega && entrega.estado === 'PENDIENTE') {
                    entrega.estado = 'VISTA';
                }
                await tarea.save();
            }
            res.json({
                success: true,
                message: 'Tarea marcada como vista',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async entregar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(403, 'Solo los estudiantes pueden entregar tareas');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                'entregas.estudianteId': req.user._id,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada o no asignada a ti');
            }
            if (tarea.estado !== 'ACTIVA') {
                throw new ApiError_1.default(400, 'Esta tarea ya no acepta entregas');
            }
            const ahora = new Date();
            const esAtrasada = ahora > tarea.fechaLimite;
            if (esAtrasada && !tarea.permiteTardias) {
                throw new ApiError_1.default(400, 'La fecha límite ha pasado y no se permiten entregas tardías');
            }
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                throw new ApiError_1.default(400, 'Debes subir al menos un archivo');
            }
            const db = mongoose_1.default.connection.db;
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName: 'tareas_entregas',
            });
            const archivosSubidos = [];
            for (const file of req.files) {
                const readStream = fs.createReadStream(file.path);
                const uploadStream = bucket.openUploadStream(file.originalname, {
                    metadata: {
                        estudianteId: req.user._id,
                        tareaId: req.params.id,
                        contentType: file.mimetype,
                    },
                });
                await new Promise((resolve, reject) => {
                    readStream
                        .pipe(uploadStream)
                        .on('error', reject)
                        .on('finish', resolve);
                });
                archivosSubidos.push({
                    fileId: uploadStream.id,
                    nombre: file.originalname,
                    tipo: file.mimetype,
                    tamaño: file.size,
                    fechaSubida: new Date(),
                });
                fs.unlinkSync(file.path);
            }
            const entrega = tarea.entregas.find((e) => e.estudianteId.toString() === req.user?._id);
            if (!entrega) {
                throw new ApiError_1.default(404, 'Entrega no encontrada');
            }
            entrega.fechaEntrega = new Date();
            entrega.estado = esAtrasada ? 'ATRASADA' : 'ENTREGADA';
            entrega.archivos = archivosSubidos;
            entrega.comentarioEstudiante = req.body.comentarioEstudiante || '';
            entrega.intentos += 1;
            await tarea.save();
            res.json({
                success: true,
                data: entrega,
                message: esAtrasada
                    ? 'Tarea entregada (ATRASADA)'
                    : 'Tarea entregada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async verMiEntrega(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(403, 'Solo los estudiantes pueden ver sus entregas');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                'entregas.estudianteId': req.user._id,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            const miEntrega = tarea.entregas.find((e) => e.estudianteId.toString() === req.user?._id);
            if (!miEntrega) {
                throw new ApiError_1.default(404, 'Entrega no encontrada');
            }
            res.json({
                success: true,
                data: miEntrega,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async verEntregas(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }).populate('entregas.estudianteId', 'nombre apellidos email');
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para ver las entregas');
            }
            tarea.actualizarEstadosEntregas();
            await tarea.save();
            const estadisticas = tarea.obtenerEstadisticas();
            res.json({
                success: true,
                data: tarea.entregas,
                estadisticas,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async calificarEntrega(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { calificacion, comentarioDocente } = req.body;
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para calificar esta tarea');
            }
            const entrega = tarea.entregas.find((e) => e._id?.toString() === req.params.entregaId);
            if (!entrega) {
                throw new ApiError_1.default(404, 'Entrega no encontrada');
            }
            if (calificacion > tarea.calificacionMaxima) {
                throw new ApiError_1.default(400, `La calificación no puede ser mayor a ${tarea.calificacionMaxima}`);
            }
            if (!entrega.fechaEntrega) {
                throw new ApiError_1.default(400, 'No se puede calificar una tarea que no ha sido entregada');
            }
            entrega.calificacion = calificacion;
            entrega.comentarioDocente = comentarioDocente || '';
            entrega.fechaCalificacion = new Date();
            entrega.estado = 'CALIFICADA';
            await tarea.save();
            res.json({
                success: true,
                data: entrega,
                message: 'Entrega calificada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async subirArchivosReferencia(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                throw new ApiError_1.default(400, 'No se han subido archivos');
            }
            const tarea = await tarea_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)) {
                throw new ApiError_1.default(403, 'No tienes permiso para subir archivos a esta tarea');
            }
            const db = mongoose_1.default.connection.db;
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName: 'tareas_referencias',
            });
            const archivosSubidos = [];
            for (const file of req.files) {
                const readStream = fs.createReadStream(file.path);
                const uploadStream = bucket.openUploadStream(file.originalname, {
                    metadata: {
                        docenteId: req.user._id,
                        tareaId: req.params.id,
                        contentType: file.mimetype,
                    },
                });
                await new Promise((resolve, reject) => {
                    readStream
                        .pipe(uploadStream)
                        .on('error', reject)
                        .on('finish', resolve);
                });
                archivosSubidos.push({
                    fileId: uploadStream.id,
                    nombre: file.originalname,
                    tipo: file.mimetype,
                    tamaño: file.size,
                    fechaSubida: new Date(),
                });
                fs.unlinkSync(file.path);
            }
            tarea.archivosReferencia.push(...archivosSubidos);
            await tarea.save();
            res.json({
                success: true,
                data: archivosSubidos,
                message: 'Archivos subidos exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async descargarArchivo(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id, archivoId } = req.params;
            const tipo = req.query.tipo;
            const tarea = await tarea_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            let archivo;
            let bucketName;
            if (tipo === 'referencia') {
                archivo = tarea.archivosReferencia.find((a) => a.fileId.toString() === archivoId);
                bucketName = 'tareas_referencias';
            }
            else if (tipo === 'entrega') {
                for (const entrega of tarea.entregas) {
                    archivo = entrega.archivos.find((a) => a.fileId.toString() === archivoId);
                    if (archivo)
                        break;
                }
                bucketName = 'tareas_entregas';
            }
            else {
                throw new ApiError_1.default(400, 'Tipo de archivo inválido');
            }
            if (!archivo) {
                throw new ApiError_1.default(404, 'Archivo no encontrado');
            }
            const db = mongoose_1.default.connection.db;
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName,
            });
            res.setHeader('Content-Type', archivo.tipo);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo.nombre)}"`);
            const downloadStream = bucket.openDownloadStream(new mongoose_1.default.Types.ObjectId(archivoId));
            downloadStream.on('error', (error) => {
                console.error('Error en GridFS stream:', error);
                if (!res.headersSent) {
                    next(new ApiError_1.default(500, 'Error al descargar el archivo'));
                }
            });
            downloadStream.pipe(res);
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarArchivoReferencia(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id, archivoId } = req.params;
            const tarea = await tarea_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            if (tarea.docenteId.toString() !== req.user._id &&
                req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para eliminar archivos de esta tarea');
            }
            const archivoIndex = tarea.archivosReferencia.findIndex((a) => a.fileId.toString() === archivoId);
            if (archivoIndex === -1) {
                throw new ApiError_1.default(404, 'Archivo no encontrado');
            }
            const db = mongoose_1.default.connection.db;
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName: 'tareas_referencias',
            });
            await bucket.delete(new mongoose_1.default.Types.ObjectId(archivoId));
            tarea.archivosReferencia.splice(archivoIndex, 1);
            await tarea.save();
            res.json({
                success: true,
                message: 'Archivo eliminado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async misTareas(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ESTUDIANTE') {
                throw new ApiError_1.default(403, 'Solo los estudiantes pueden ver sus tareas');
            }
            const filtroEstado = req.query.filtro;
            const query = {
                escuelaId: req.user.escuelaId,
                estado: { $in: ['ACTIVA', 'CERRADA'] },
                'entregas.estudianteId': req.user._id,
            };
            if (filtroEstado === 'pendientes') {
                query.entregas = {
                    $elemMatch: {
                        estudianteId: req.user._id,
                        estado: { $in: ['PENDIENTE', 'VISTA'] }
                    }
                };
            }
            else if (filtroEstado === 'entregadas') {
                query.entregas = {
                    $elemMatch: {
                        estudianteId: req.user._id,
                        estado: { $in: ['ENTREGADA', 'ATRASADA'] },
                        calificacion: { $exists: false }
                    }
                };
            }
            else if (filtroEstado === 'calificadas') {
                query.entregas = {
                    $elemMatch: {
                        estudianteId: req.user._id,
                        estado: 'CALIFICADA'
                    }
                };
            }
            const tareas = await tarea_model_1.default.find(query)
                .sort({ fechaLimite: 1 })
                .populate('docenteId', 'nombre apellidos')
                .populate('asignaturaId', 'nombre')
                .populate('cursoId', 'nombre')
                .lean();
            const tareasConMiEntrega = tareas.map((tarea) => {
                const miEntrega = tarea.entregas.find((e) => e.estudianteId.toString() === req.user?._id);
                return {
                    ...tarea,
                    miEntrega,
                    entregas: undefined,
                };
            });
            res.json({
                success: true,
                data: tareasConMiEntrega,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async tareasEstudiante(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (req.user.tipo !== 'ACUDIENTE') {
                throw new ApiError_1.default(403, 'Solo los acudientes pueden ver tareas de estudiantes');
            }
            const estudianteId = req.params.estudianteId;
            const acudiente = await usuario_model_1.default.findById(req.user._id);
            if (!acudiente) {
                throw new ApiError_1.default(404, 'Acudiente no encontrado');
            }
            const estudiantesAsociados = acudiente.info_academica?.estudiantes_asociados || [];
            const estaAsociado = estudiantesAsociados.some((id) => id.toString() === estudianteId);
            if (!estaAsociado) {
                throw new ApiError_1.default(403, 'No tienes permiso para ver las tareas de este estudiante');
            }
            const tareas = await tarea_model_1.default.find({
                escuelaId: req.user.escuelaId,
                'entregas.estudianteId': estudianteId,
            })
                .sort({ fechaLimite: 1 })
                .populate('docenteId', 'nombre apellidos')
                .populate('asignaturaId', 'nombre')
                .populate('cursoId', 'nombre')
                .lean();
            const tareasConEntrega = tareas.map((tarea) => {
                const entregaEstudiante = tarea.entregas.find((e) => e.estudianteId.toString() === estudianteId);
                return {
                    ...tarea,
                    entregaEstudiante,
                    entregas: undefined,
                };
            });
            res.json({
                success: true,
                data: tareasConEntrega,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async estadisticas(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const filters = { escuelaId: req.user.escuelaId };
            if (req.user.tipo === 'DOCENTE') {
                filters.docenteId = req.user._id;
            }
            if (req.query.cursoId) {
                filters.cursoId = req.query.cursoId;
            }
            if (req.query.asignaturaId) {
                filters.asignaturaId = req.query.asignaturaId;
            }
            const tareas = await tarea_model_1.default.find(filters);
            let totalTareas = 0;
            let totalEntregas = 0;
            let entregasATiempo = 0;
            let entregasAtrasadas = 0;
            let tareasCalificadas = 0;
            let sumaCalificaciones = 0;
            let totalCalificaciones = 0;
            tareas.forEach((tarea) => {
                totalTareas++;
                tarea.entregas.forEach((entrega) => {
                    totalEntregas++;
                    if (entrega.fechaEntrega) {
                        if (entrega.estado === 'ATRASADA') {
                            entregasAtrasadas++;
                        }
                        else {
                            entregasATiempo++;
                        }
                    }
                    if (entrega.estado === 'CALIFICADA' && entrega.calificacion !== undefined) {
                        tareasCalificadas++;
                        sumaCalificaciones += entrega.calificacion;
                        totalCalificaciones++;
                    }
                });
            });
            const promedioGeneral = totalCalificaciones > 0 ? sumaCalificaciones / totalCalificaciones : 0;
            const porcentajeEntrega = totalEntregas > 0 ? ((entregasATiempo + entregasAtrasadas) / totalEntregas) * 100 : 0;
            res.json({
                success: true,
                data: {
                    totalTareas,
                    totalEntregas,
                    entregasATiempo,
                    entregasAtrasadas,
                    tareasCalificadas,
                    promedioGeneral: promedioGeneral.toFixed(2),
                    porcentajeEntrega: porcentajeEntrega.toFixed(2),
                },
            });
        }
        catch (error) {
            next(error);
        }
    }
    async proximasVencer(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const ahora = new Date();
            const proximosDias = new Date();
            proximosDias.setDate(proximosDias.getDate() + 3);
            const query = {
                escuelaId: req.user.escuelaId,
                estado: 'ACTIVA',
                fechaLimite: { $gte: ahora, $lte: proximosDias },
            };
            if (req.user.tipo === 'DOCENTE') {
                query.docenteId = req.user._id;
            }
            else if (req.user.tipo === 'ESTUDIANTE') {
                query['entregas.estudianteId'] = req.user._id;
                query['entregas.estado'] = { $in: ['PENDIENTE', 'VISTA'] };
            }
            const tareas = await tarea_model_1.default.find(query)
                .sort({ fechaLimite: 1 })
                .populate('docenteId', 'nombre apellidos')
                .populate('asignaturaId', 'nombre')
                .populate('cursoId', 'nombre')
                .limit(10)
                .lean();
            res.json({
                success: true,
                data: tareas,
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new TareaController();
//# sourceMappingURL=tarea.controller.js.map