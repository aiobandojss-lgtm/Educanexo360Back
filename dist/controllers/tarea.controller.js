"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const tarea_model_1 = __importDefault(require("../models/tarea.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const adjuntos_1 = require("../utils/adjuntos");
const storage_1 = require("../services/storage");
const referenciasArchivos_1 = require("../utils/referenciasArchivos");
const escapeRegex_1 = require("../utils/escapeRegex");
const accesoAcademico_1 = require("../utils/accesoAcademico");
const idDe = (valor) => String(valor?._id ?? valor);
const sincronizarEstadosEntregas = async (tarea) => {
    const antes = new Map(tarea.entregas.map((e) => [String(e._id), e.estado]));
    tarea.actualizarEstadosEntregas();
    const cambiadas = tarea.entregas
        .filter((e) => antes.get(String(e._id)) !== e.estado)
        .map((e) => e._id);
    if (cambiadas.length > 0) {
        await tarea_model_1.default.updateOne({ _id: tarea._id }, { $set: { 'entregas.$[e].estado': 'ATRASADA' } }, { arrayFilters: [{ 'e._id': { $in: cambiadas }, 'e.estado': { $in: ['PENDIENTE', 'VISTA', 'ENTREGADA'] } }] });
    }
};
const resolverAccesoTarea = async (user, tarea) => {
    const entregas = tarea.entregas || [];
    if ((0, accesoAcademico_1.esRolAdministrativo)(user.tipo))
        return { entregas, completo: true };
    if (user.tipo === 'DOCENTE') {
        const propia = idDe(tarea.docenteId) === String(user._id);
        if (propia || (await (0, accesoAcademico_1.docenteTieneCurso)(user, idDe(tarea.cursoId)))) {
            return { entregas, completo: true };
        }
        return null;
    }
    let permitidos = [];
    if (user.tipo === 'ESTUDIANTE')
        permitidos = [String(user._id)];
    else if (user.tipo === 'ACUDIENTE')
        permitidos = await (0, accesoAcademico_1.obtenerHijosIds)(user);
    else
        return null;
    const visibles = entregas.filter((e) => e?.estudianteId && permitidos.includes(idDe(e.estudianteId)));
    if (visibles.length > 0)
        return { entregas: visibles, completo: false };
    const enCurso = permitidos.length
        ? await curso_model_1.default.exists({
            _id: idDe(tarea.cursoId),
            escuelaId: user.escuelaId,
            estudiantes: { $in: permitidos },
        })
        : null;
    return enCurso ? { entregas: [], completo: false } : null;
};
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const paginacion_1 = require("../utils/paginacion");
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
            if (estudiantesParaAsignar.length > 0) {
                const fechaStr = nuevaTarea.fechaLimite
                    ? new Date(nuevaTarea.fechaLimite).toLocaleDateString('es-CO')
                    : '';
                pushNotification_service_1.default
                    .encolarPushFiltro({ _id: { $in: estudiantesParaAsignar } }, {
                    titulo: `Nueva tarea: ${nuevaTarea.titulo}`,
                    mensaje: `${req.user.nombre} asignó una nueva tarea${fechaStr ? `. Vence: ${fechaStr}` : ''}`,
                    data: { tipo: 'tarea', tareaId: nuevaTarea._id.toString() },
                }, { escuelaId: String(req.user.escuelaId) })
                    .catch((err) => console.error('[Tarea] No se pudo encolar el push:', err));
            }
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
            const pagina = (0, paginacion_1.numeroPagina)(req.query.pagina);
            const limite = (0, paginacion_1.numeroLimite)(req.query.limite, 10);
            const skip = (pagina - 1) * limite;
            const filters = { escuelaId: req.user.escuelaId };
            let estudiantesVisibles = null;
            if (req.user.tipo === 'DOCENTE') {
                filters.docenteId = req.user._id;
            }
            else if (req.user.tipo === 'ESTUDIANTE') {
                filters['entregas.estudianteId'] = req.user._id;
                estudiantesVisibles = [String(req.user._id)];
            }
            else if (req.user.tipo === 'ACUDIENTE') {
                estudiantesVisibles = await (0, accesoAcademico_1.obtenerHijosIds)(req.user);
                filters['entregas.estudianteId'] = { $in: estudiantesVisibles };
            }
            const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
            const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            const estado = (0, accesoAcademico_1.queryString)(req.query.estado);
            const prioridad = (0, accesoAcademico_1.queryString)(req.query.prioridad);
            const busqueda = (0, accesoAcademico_1.queryString)(req.query.busqueda);
            if (cursoId) {
                filters.cursoId = cursoId;
            }
            if (asignaturaId) {
                filters.asignaturaId = asignaturaId;
            }
            if (estado) {
                filters.estado = estado;
            }
            if (prioridad) {
                filters.prioridad = prioridad;
            }
            if (busqueda) {
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
            if (estudiantesVisibles) {
                const visibles = new Set(estudiantesVisibles);
                tareas.forEach((t) => {
                    t.entregas = (t.entregas || []).filter((e) => visibles.has(idDe(e.estudianteId)));
                });
            }
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
            const acceso = await resolverAccesoTarea(req.user, tarea.toObject());
            if (!acceso) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            await sincronizarEstadosEntregas(tarea);
            if (!acceso.completo) {
                const tareaObj = tarea.toObject();
                const visibles = new Set(acceso.entregas.map((e) => idDe(e.estudianteId)));
                tareaObj.entregas = tareaObj.entregas.filter((e) => e?.estudianteId && visibles.has(idDe(e.estudianteId)));
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
            const referencias = (tarea.archivosReferencia || []).map((a) => (a.toObject ? a.toObject() : a));
            const deEntregas = (tarea.entregas || []).flatMap((e) => (e.archivos || []).map((a) => (a.toObject ? a.toObject() : a)));
            await tarea.deleteOne();
            await (0, referenciasArchivos_1.eliminarSiNoReferenciados)(referencias, 'tareas_referencias');
            await (0, referenciasArchivos_1.eliminarSiNoReferenciados)(deEntregas, 'tareas_entregas');
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
            const archivosSubidos = await (0, adjuntos_1.subirAdjuntos)(req.files, 'tareas_entregas', String(req.user._id), {
                estudianteId: String(req.user._id),
                tareaId: String(req.params.id),
            });
            const entrega = tarea.entregas.find((e) => e.estudianteId.toString() === req.user?._id);
            if (!entrega) {
                throw new ApiError_1.default(404, 'Entrega no encontrada');
            }
            const archivosAnteriores = (entrega.archivos || []).map((a) => (a.toObject ? a.toObject() : a));
            entrega.fechaEntrega = new Date();
            entrega.estado = esAtrasada ? 'ATRASADA' : 'ENTREGADA';
            entrega.archivos = archivosSubidos;
            entrega.comentarioEstudiante = req.body.comentarioEstudiante || '';
            entrega.intentos += 1;
            try {
                await tarea.save();
            }
            catch (saveError) {
                await (0, adjuntos_1.eliminarAdjuntos)(archivosSubidos, 'tareas_entregas');
                throw saveError;
            }
            await (0, referenciasArchivos_1.eliminarSiNoReferenciados)(archivosAnteriores, 'tareas_entregas');
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
            await sincronizarEstadosEntregas(tarea);
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
            const archivosSubidos = await (0, adjuntos_1.subirAdjuntos)(req.files, 'tareas_referencias', String(req.user._id), {
                docenteId: String(req.user._id),
                tareaId: String(req.params.id),
            });
            tarea.archivosReferencia.push(...archivosSubidos);
            try {
                await tarea.save();
            }
            catch (saveError) {
                await (0, adjuntos_1.eliminarAdjuntos)(archivosSubidos, 'tareas_referencias');
                throw saveError;
            }
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
            const tipo = (0, accesoAcademico_1.queryString)(req.query.tipo);
            const tarea = await tarea_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
            });
            if (!tarea) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            const acceso = await resolverAccesoTarea(req.user, tarea.toObject());
            if (!acceso) {
                throw new ApiError_1.default(404, 'Tarea no encontrada');
            }
            let archivo;
            let bucketName;
            if (tipo === 'referencia') {
                archivo = tarea.archivosReferencia.find((a) => a.fileId.toString() === archivoId);
                bucketName = 'tareas_referencias';
            }
            else if (tipo === 'entrega') {
                for (const entrega of acceso.entregas) {
                    archivo = (entrega.archivos || []).find((a) => a.fileId.toString() === archivoId);
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
            const downloadStream = await (0, storage_1.abrirArchivo)(archivo, bucketName);
            res.setHeader('Content-Type', archivo.tipo);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo.nombre)}"`);
            downloadStream.on('error', (error) => {
                console.error('Error en stream de descarga:', error);
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
            const [archivo] = tarea.archivosReferencia.splice(archivoIndex, 1);
            await tarea.save();
            try {
                await (0, storage_1.eliminarArchivo)(archivo, 'tareas_referencias');
            }
            catch (errorBorrado) {
                console.warn(`[Tareas] No se pudo borrar el archivo ${archivoId} del almacén:`, errorBorrado);
            }
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
            const uid = new mongoose_1.default.Types.ObjectId(req.user._id);
            const matchAgg = {
                ...query,
                escuelaId: new mongoose_1.default.Types.ObjectId(req.user.escuelaId),
                'entregas.estudianteId': uid,
            };
            if (matchAgg.entregas?.$elemMatch) {
                matchAgg.entregas = { $elemMatch: { ...matchAgg.entregas.$elemMatch, estudianteId: uid } };
            }
            const tareasAgg = await tarea_model_1.default.aggregate([
                { $match: matchAgg },
                { $sort: { fechaLimite: 1 } },
                {
                    $addFields: {
                        miEntrega: {
                            $arrayElemAt: [
                                { $filter: { input: '$entregas', as: 'e', cond: { $eq: ['$$e.estudianteId', uid] } } },
                                0,
                            ],
                        },
                    },
                },
                { $project: { entregas: 0 } },
            ]);
            const tareasConMiEntrega = await tarea_model_1.default.populate(tareasAgg, [
                { path: 'docenteId', select: 'nombre apellidos' },
                { path: 'asignaturaId', select: 'nombre' },
                { path: 'cursoId', select: 'nombre' },
            ]);
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
            const cursoIdFiltro = (0, accesoAcademico_1.queryString)(req.query.cursoId);
            const asignaturaIdFiltro = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
            if (cursoIdFiltro) {
                filters.cursoId = cursoIdFiltro;
            }
            if (asignaturaIdFiltro) {
                filters.asignaturaId = asignaturaIdFiltro;
            }
            const tareas = await tarea_model_1.default.find(filters)
                .select('entregas.fechaEntrega entregas.estado entregas.calificacion')
                .lean();
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