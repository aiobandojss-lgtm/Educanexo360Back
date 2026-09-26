"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAlertasAsistencia = exports.obtenerResumenPeriodo = exports.obtenerResumen = exports.obtenerAsistenciaDia = exports.obtenerEstadisticasEstudiante = exports.obtenerEstadisticasCurso = exports.eliminarAsistencia = exports.finalizarAsistencia = exports.actualizarAsistencia = exports.obtenerAsistenciaPorId = exports.obtenerAsistencias = exports.crearAsistencia = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const asistencia_model_1 = __importDefault(require("../models/asistencia.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const IAsistencia_1 = require("../interfaces/IAsistencia");
const alertaAsistencia_model_1 = __importDefault(require("../models/alertaAsistencia.model"));
const alertaAsistencia_service_1 = require("../services/alertaAsistencia.service");
const paginacion_1 = require("../utils/paginacion");
const logger_1 = require("../utils/logger");
const fechas_1 = require("../utils/fechas");
const accesoAcademico_1 = require("../utils/accesoAcademico");
const idDe = (valor) => String(valor?._id ?? valor);
const docentePuedeVerRegistro = async (user, asistencia) => idDe(asistencia.docenteId) === String(user._id) ||
    (await (0, accesoAcademico_1.docenteTieneCurso)(user, idDe(asistencia.cursoId)));
const puedeModificarRegistro = (user, asistencia) => (0, accesoAcademico_1.esRolAdministrativo)(user.tipo) || idDe(asistencia.docenteId) === String(user._id);
const crearAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { fecha, cursoId, asignaturaId, tipoSesion, horaInicio, horaFin, observacionesGenerales, estudiantes, } = req.body;
        const existeAsistencia = await asistencia_model_1.default.findOne({
            escuelaId: req.user.escuelaId,
            fecha: new Date(fecha),
            cursoId,
            ...(asignaturaId && { asignaturaId }),
        });
        if (existeAsistencia) {
            return next(new ApiError_1.default(400, 'Ya existe un registro de asistencia para esta fecha, curso y asignatura'));
        }
        if (req.user.tipo === 'DOCENTE') {
            const curso = await curso_model_1.default.findOne({
                _id: cursoId,
                director_grupo: req.user._id,
            });
            if (!curso) {
                const tieneAsignatura = await mongoose_1.default.model('Asignatura').findOne({
                    cursoId: cursoId,
                    docenteId: req.user._id,
                    estado: 'ACTIVO',
                });
                if (!tieneAsignatura) {
                    return next(new ApiError_1.default(403, 'No tiene autorización para registrar asistencia en este curso'));
                }
            }
        }
        if (!estudiantes || estudiantes.length === 0) {
            const curso = await curso_model_1.default.findOne({ _id: cursoId, escuelaId: req.user.escuelaId });
            if (!curso) {
                return next(new ApiError_1.default(404, 'Curso no encontrado'));
            }
            const estudiantesRegistro = curso.estudiantes.map((estudianteId) => ({
                estudianteId,
                estado: IAsistencia_1.EstadoAsistencia.PRESENTE,
                fechaRegistro: new Date(),
                registradoPor: req.user._id,
            }));
            req.body.estudiantes = estudiantesRegistro;
        }
        req.body.docenteId = req.user._id;
        req.body.escuelaId = req.user.escuelaId;
        const nuevaAsistencia = await asistencia_model_1.default.create(req.body);
        return res.status(201).json({
            success: true,
            data: nuevaAsistencia,
            message: 'Registro de asistencia creado exitosamente',
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.crearAsistencia = crearAsistencia;
const obtenerAsistencias = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
        const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
        const desde = (0, accesoAcademico_1.queryString)(req.query.desde);
        const hasta = (0, accesoAcademico_1.queryString)(req.query.hasta);
        const docenteId = (0, accesoAcademico_1.queryString)(req.query.docenteId);
        const finalizado = (0, accesoAcademico_1.queryString)(req.query.finalizado);
        const page = (0, paginacion_1.numeroPagina)(req.query.page);
        const limit = (0, paginacion_1.numeroLimite)(req.query.limit, 10);
        const skip = (Number(page) - 1) * Number(limit);
        const query = { escuelaId: req.user.escuelaId };
        if (cursoId)
            query.cursoId = cursoId;
        if (asignaturaId)
            query.asignaturaId = asignaturaId;
        if (docenteId)
            query.docenteId = docenteId;
        if (finalizado !== undefined)
            query.finalizado = finalizado === 'true';
        if (req.user.tipo === 'DOCENTE') {
            const cursosDocente = await (0, accesoAcademico_1.obtenerCursosDocente)(req.user._id, req.user.escuelaId);
            query.$or = [{ docenteId: req.user._id }, { cursoId: { $in: cursosDocente } }];
        }
        if (desde || hasta) {
            query.fecha = {};
            if (desde)
                query.fecha.$gte = new Date(desde);
            if (hasta)
                query.fecha.$lte = new Date(hasta);
        }
        const total = await asistencia_model_1.default.countDocuments(query);
        const asistencias = await asistencia_model_1.default.find(query)
            .sort({ fecha: -1 })
            .skip(skip)
            .limit(Number(limit))
            .populate('cursoId', 'nombre nivel grado grupo')
            .populate('asignaturaId', 'nombre codigo')
            .populate('docenteId', 'nombre apellidos')
            .populate('estudiantes.estudianteId', 'nombre apellidos');
        return res.status(200).json({
            success: true,
            total,
            count: asistencias.length,
            data: asistencias,
            pagination: {
                totalPages: Math.ceil(total / Number(limit)),
                currentPage: Number(page),
                hasNext: Number(page) < Math.ceil(total / Number(limit)),
                hasPrev: Number(page) > 1,
            },
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerAsistencias = obtenerAsistencias;
const obtenerAsistenciaPorId = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { id } = req.params;
        const asistencia = await asistencia_model_1.default.findOne({ _id: id, escuelaId: req.user.escuelaId })
            .populate('cursoId', 'nombre nivel grado grupo')
            .populate('asignaturaId', 'nombre codigo')
            .populate('docenteId', 'nombre apellidos')
            .populate({
            path: 'estudiantes.estudianteId',
            select: 'nombre apellidos email',
            model: 'Usuario',
        });
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (req.user.tipo === 'DOCENTE' && !(await docentePuedeVerRegistro(req.user, asistencia))) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este registro de asistencia'));
        }
        const estudiantesFormateados = asistencia.estudiantes.map((est) => {
            const estudianteObj = typeof est.estudianteId === 'object' && est.estudianteId !== null
                ? est.estudianteId
                : { _id: est.estudianteId, nombre: '', apellidos: '' };
            const estadoValido = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'JUSTIFICADO', 'PERMISO'].includes(est.estado)
                ? est.estado
                : 'PRESENTE';
            return {
                estudianteId: estudianteObj._id || est.estudianteId,
                nombre: 'nombre' in estudianteObj ? estudianteObj.nombre : '',
                apellidos: 'apellidos' in estudianteObj ? estudianteObj.apellidos : '',
                estado: estadoValido,
                observaciones: est.observaciones || '',
                justificacion: est.justificacion || '',
            };
        });
        const respuesta = {
            ...asistencia.toObject(),
            estudiantes: estudiantesFormateados,
            cursoNombre: asistencia.cursoId?.nombre || '',
            asignaturaNombre: asistencia.asignaturaId?.nombre || '',
            grado: asistencia.cursoId?.grado || '',
            grupo: asistencia.cursoId?.grupo || '',
        };
        logger_1.logger.debug('Estados de estudiantes:', estudiantesFormateados.map((e) => e.estado));
        return res.status(200).json({
            success: true,
            data: respuesta,
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerAsistenciaPorId = obtenerAsistenciaPorId;
const actualizarAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { id } = req.params;
        const { observacionesGenerales, tipoSesion, horaInicio, horaFin } = req.body;
        let { estudiantes } = req.body;
        const asistencia = await asistencia_model_1.default.findOne({ _id: id, escuelaId: req.user.escuelaId });
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (!puedeModificarRegistro(req.user, asistencia)) {
            return next(new ApiError_1.default(403, 'No tiene autorización para modificar este registro'));
        }
        if (Array.isArray(estudiantes)) {
            const curso = await curso_model_1.default.findOne({ _id: asistencia.cursoId, escuelaId: req.user.escuelaId })
                .select('estudiantes')
                .lean();
            const idsCurso = new Set((curso?.estudiantes || []).map((e) => String(e)));
            estudiantes = estudiantes.filter((est) => idsCurso.has(String(est?.estudianteId)));
            const estudiantesActualizados = estudiantes.map((est) => ({
                estudianteId: est.estudianteId,
                estado: est.estado,
                justificacion: est.justificacion,
                observaciones: est.observaciones,
                registradoPor: req.user._id,
                fechaRegistro: new Date(),
            }));
            asistencia.estudiantes = estudiantesActualizados;
        }
        if (observacionesGenerales !== undefined) {
            asistencia.observacionesGenerales = observacionesGenerales;
        }
        if (tipoSesion) {
            asistencia.tipoSesion = tipoSesion;
        }
        if (horaInicio) {
            asistencia.horaInicio = horaInicio;
        }
        if (horaFin) {
            asistencia.horaFin = horaFin;
        }
        await asistencia.save();
        if (estudiantes && Array.isArray(estudiantes)) {
            const ausentes = estudiantes.filter((est) => est.estado === 'AUSENTE');
            if (ausentes.length > 0) {
                const ausentesIds = ausentes.map((est) => est.estudianteId);
                const asignaturaNombre = asistencia.asignaturaId?.nombre || 'clase';
                (async () => {
                    for (const estudianteId of ausentesIds) {
                        try {
                            const estudiante = await usuario_model_1.default.findOne({ _id: estudianteId, escuelaId: asistencia.escuelaId })
                                .select('nombre apellidos')
                                .lean();
                            if (!estudiante)
                                continue;
                            const acudientes = await usuario_model_1.default.find({
                                escuelaId: asistencia.escuelaId,
                                tipo: 'ACUDIENTE',
                                'info_academica.estudiantes_asociados': estudianteId,
                                fcmToken: { $exists: true, $ne: null },
                            }, { fcmToken: 1 }).lean();
                            for (const acudiente of acudientes) {
                                pushNotification_service_1.default.enviarNotificacion({
                                    token: acudiente.fcmToken,
                                    titulo: 'Ausencia registrada',
                                    mensaje: `${estudiante.nombre} ${estudiante.apellidos} fue marcado ausente en ${asignaturaNombre}`,
                                    data: { tipo: 'ausencia', estudianteId: estudianteId.toString() },
                                }).catch(() => { });
                            }
                        }
                        catch { }
                    }
                })();
            }
        }
        return res.status(200).json({
            success: true,
            data: asistencia,
            message: 'Registro de asistencia actualizado exitosamente',
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.actualizarAsistencia = actualizarAsistencia;
const finalizarAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { id } = req.params;
        const asistencia = await asistencia_model_1.default.findOne({ _id: id, escuelaId: req.user.escuelaId });
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (!puedeModificarRegistro(req.user, asistencia)) {
            return next(new ApiError_1.default(403, 'No tiene autorización para modificar este registro'));
        }
        if (!asistencia.estudiantes || asistencia.estudiantes.length === 0) {
            return next(new ApiError_1.default(400, 'No se puede finalizar un registro sin estudiantes'));
        }
        asistencia.finalizado = true;
        await asistencia.save();
        setImmediate(() => {
            const docenteId = asistencia.docenteId.toString();
            const cursoId = asistencia.cursoId.toString();
            const escuelaId = req.user.escuelaId.toString();
            const periodoId = asistencia.periodoId?.toString();
            (0, alertaAsistencia_service_1.procesarAlertasAsistenciaCurso)({
                estudianteIds: (asistencia.estudiantes ?? []).map((entrada) => entrada.estudianteId.toString()),
                cursoId,
                escuelaId,
                docenteId,
                periodoId,
            }).catch((err) => console.error('[AlertaAsistencia]', err));
        });
        return res.status(200).json({
            success: true,
            message: 'Registro de asistencia finalizado exitosamente',
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.finalizarAsistencia = finalizarAsistencia;
const eliminarAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { id } = req.params;
        const asistencia = await asistencia_model_1.default.findById(id);
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este registro de asistencia'));
        }
        if (!puedeModificarRegistro(req.user, asistencia)) {
            return next(new ApiError_1.default(403, 'No tiene autorización para eliminar este registro'));
        }
        if (asistencia.finalizado) {
            return next(new ApiError_1.default(400, 'No se puede eliminar un registro finalizado'));
        }
        await asistencia_model_1.default.findByIdAndDelete(id);
        return res.status(200).json({
            success: true,
            message: 'Registro de asistencia eliminado exitosamente',
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.eliminarAsistencia = eliminarAsistencia;
const obtenerEstadisticasCurso = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { cursoId } = req.params;
        const desde = (0, accesoAcademico_1.queryString)(req.query.desde);
        const hasta = (0, accesoAcademico_1.queryString)(req.query.hasta);
        const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
        if (req.user.tipo === 'DOCENTE' && !(await (0, accesoAcademico_1.docenteTieneCurso)(req.user, cursoId))) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este curso'));
        }
        const query = {
            cursoId,
            escuelaId: req.user.escuelaId,
            finalizado: true,
        };
        if (asignaturaId)
            query.asignaturaId = asignaturaId;
        if (desde || hasta) {
            query.fecha = {};
            if (desde)
                query.fecha.$gte = new Date(desde);
            if (hasta)
                query.fecha.$lte = new Date(hasta);
        }
        const registros = await asistencia_model_1.default.find(query).select('estudiantes fecha').sort({ fecha: 1 });
        if (registros.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No hay registros de asistencia para este curso en el período seleccionado',
                data: {
                    registrosTotales: 0,
                    estadisticas: {
                        presentes: 0,
                        ausentes: 0,
                        tardanzas: 0,
                        justificados: 0,
                        permisos: 0,
                        total: 0,
                        porcentajeAsistencia: 0,
                    },
                    porDia: [],
                },
            });
        }
        let presentes = 0;
        let ausentes = 0;
        let tardanzas = 0;
        let justificados = 0;
        let permisos = 0;
        let total = 0;
        const porDia = [];
        registros.forEach((registro) => {
            const estadisticaDia = {
                presentes: 0,
                ausentes: 0,
                tardanzas: 0,
                justificados: 0,
                permisos: 0,
                total: registro.estudiantes.length,
                porcentajeAsistencia: 0,
            };
            registro.estudiantes.forEach((est) => {
                switch (est.estado) {
                    case IAsistencia_1.EstadoAsistencia.PRESENTE:
                        presentes++;
                        estadisticaDia.presentes++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.AUSENTE:
                        ausentes++;
                        estadisticaDia.ausentes++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.TARDANZA:
                        tardanzas++;
                        estadisticaDia.tardanzas++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.JUSTIFICADO:
                        justificados++;
                        estadisticaDia.justificados++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.PERMISO:
                        permisos++;
                        estadisticaDia.permisos++;
                        break;
                }
            });
            total += registro.estudiantes.length;
            estadisticaDia.porcentajeAsistencia = Math.round(((estadisticaDia.presentes + estadisticaDia.tardanzas) / estadisticaDia.total) * 100);
            porDia.push({
                fecha: registro.fecha,
                estadisticas: estadisticaDia,
            });
        });
        const porcentajeAsistencia = Math.round(((presentes + tardanzas) / total) * 100);
        return res.status(200).json({
            success: true,
            data: {
                registrosTotales: registros.length,
                estadisticas: {
                    presentes,
                    ausentes,
                    tardanzas,
                    justificados,
                    permisos,
                    total,
                    porcentajeAsistencia,
                },
                porDia,
            },
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerEstadisticasCurso = obtenerEstadisticasCurso;
const obtenerEstadisticasEstudiante = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { estudianteId } = req.params;
        const desde = (0, accesoAcademico_1.queryString)(req.query.desde);
        const hasta = (0, accesoAcademico_1.queryString)(req.query.hasta);
        const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
        const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
        if (!(await (0, accesoAcademico_1.puedeVerEstudiante)(req.user, estudianteId))) {
            return next(new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante'));
        }
        const estudiante = await usuario_model_1.default.findOne({
            _id: estudianteId,
            escuelaId: req.user.escuelaId,
        }).select('nombre apellidos');
        if (!estudiante) {
            return next(new ApiError_1.default(404, 'Estudiante no encontrado'));
        }
        const query = {
            'estudiantes.estudianteId': estudianteId,
            escuelaId: req.user.escuelaId,
            finalizado: true,
        };
        if (cursoId)
            query.cursoId = cursoId;
        if (asignaturaId)
            query.asignaturaId = asignaturaId;
        if (desde || hasta) {
            query.fecha = {};
            if (desde)
                query.fecha.$gte = new Date(desde);
            if (hasta)
                query.fecha.$lte = new Date(hasta);
        }
        const registros = await asistencia_model_1.default.find(query)
            .populate({
            path: 'cursoId',
            select: 'nombre nivel grado grupo',
        })
            .populate({
            path: 'asignaturaId',
            select: 'nombre codigo',
        })
            .sort({ fecha: 1 });
        if (registros.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No hay registros de asistencia para este estudiante en el período seleccionado',
                data: {
                    estudiante: {
                        _id: estudianteId,
                        nombre: estudiante.nombre,
                        apellidos: estudiante.apellidos,
                    },
                    estadisticas: {
                        clasesTotales: 0,
                        presentes: 0,
                        ausentes: 0,
                        tardanzas: 0,
                        justificados: 0,
                        permisos: 0,
                        porcentajeAsistencia: 0,
                    },
                    registros: [],
                },
            });
        }
        let presentes = 0;
        let ausentes = 0;
        let tardanzas = 0;
        let justificados = 0;
        let permisos = 0;
        const registrosDetalle = [];
        registros.forEach((registro) => {
            const estudianteInfo = registro.estudiantes.find((est) => est.estudianteId.toString() === estudianteId);
            if (estudianteInfo) {
                switch (estudianteInfo.estado) {
                    case IAsistencia_1.EstadoAsistencia.PRESENTE:
                        presentes++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.AUSENTE:
                        ausentes++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.TARDANZA:
                        tardanzas++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.JUSTIFICADO:
                        justificados++;
                        break;
                    case IAsistencia_1.EstadoAsistencia.PERMISO:
                        permisos++;
                        break;
                }
                const cursoData = registro.cursoId ? registro.cursoId : null;
                const asignaturaData = registro.asignaturaId ? registro.asignaturaId : null;
                registrosDetalle.push({
                    _id: registro._id,
                    fecha: registro.fecha,
                    curso: cursoData,
                    asignatura: asignaturaData,
                    estado: estudianteInfo.estado,
                    justificacion: estudianteInfo.justificacion,
                    observaciones: estudianteInfo.observaciones,
                });
            }
        });
        const clasesTotales = registros.length;
        const porcentajeAsistencia = clasesTotales > 0 ? Math.round(((presentes + tardanzas) / clasesTotales) * 100) : 0;
        return res.status(200).json({
            success: true,
            data: {
                estudiante: {
                    _id: estudianteId,
                    nombre: estudiante.nombre,
                    apellidos: estudiante.apellidos,
                },
                estadisticas: {
                    clasesTotales,
                    presentes,
                    ausentes,
                    tardanzas,
                    justificados,
                    permisos,
                    porcentajeAsistencia,
                },
                registros: registrosDetalle,
            },
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerEstadisticasEstudiante = obtenerEstadisticasEstudiante;
const obtenerAsistenciaDia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const fecha = (0, accesoAcademico_1.queryString)(req.query.fecha);
        const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
        const asignaturaId = (0, accesoAcademico_1.queryString)(req.query.asignaturaId);
        if (!fecha) {
            return next(new ApiError_1.default(400, 'La fecha es requerida'));
        }
        if (!cursoId) {
            return next(new ApiError_1.default(400, 'El ID del curso es requerido'));
        }
        if (req.user.tipo === 'DOCENTE' && !(await (0, accesoAcademico_1.docenteTieneCurso)(req.user, cursoId))) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este curso'));
        }
        const fechaInicio = new Date(fecha);
        fechaInicio.setHours(0, 0, 0, 0);
        const fechaFin = new Date(fecha);
        fechaFin.setHours(23, 59, 59, 999);
        const query = {
            cursoId,
            escuelaId: req.user.escuelaId,
            fecha: { $gte: fechaInicio, $lte: fechaFin },
        };
        if (asignaturaId) {
            query.asignaturaId = asignaturaId;
        }
        const registros = await asistencia_model_1.default.find(query)
            .populate({
            path: 'asignaturaId',
            select: 'nombre codigo',
        })
            .populate({
            path: 'docenteId',
            select: 'nombre apellidos',
        })
            .populate({
            path: 'estudiantes.estudianteId',
            select: 'nombre apellidos',
        });
        return res.status(200).json({
            success: true,
            count: registros.length,
            data: registros,
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerAsistenciaDia = obtenerAsistenciaDia;
const obtenerResumen = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const fechaInicio = (0, accesoAcademico_1.queryString)(req.query.fechaInicio);
        const fechaFin = (0, accesoAcademico_1.queryString)(req.query.fechaFin);
        const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
        const estudianteIdQuery = (0, accesoAcademico_1.queryString)(req.query.estudianteId);
        if (cursoId && !mongoose_1.default.isValidObjectId(cursoId)) {
            return next(new ApiError_1.default(400, 'cursoId inválido'));
        }
        const query = { escuelaId: req.user.escuelaId };
        if (cursoId)
            query.cursoId = cursoId;
        const esRolPersonal = req.user.tipo === 'ESTUDIANTE' || req.user.tipo === 'ACUDIENTE';
        let estudiantesPermitidos = [];
        if (req.user.tipo === 'ESTUDIANTE') {
            estudiantesPermitidos = [String(req.user._id)];
        }
        else if (req.user.tipo === 'ACUDIENTE') {
            const hijos = await (0, accesoAcademico_1.obtenerHijosIds)(req.user);
            if (estudianteIdQuery) {
                if (!hijos.includes(estudianteIdQuery)) {
                    return next(new ApiError_1.default(403, 'No tiene acceso a la información de este estudiante'));
                }
                estudiantesPermitidos = [estudianteIdQuery];
            }
            else {
                estudiantesPermitidos = hijos;
            }
        }
        if (esRolPersonal) {
            query['estudiantes.estudianteId'] = { $in: estudiantesPermitidos };
        }
        query.fecha = {};
        if (fechaInicio)
            query.fecha.$gte = new Date(fechaInicio);
        if (fechaFin)
            query.fecha.$lte = new Date(fechaFin);
        if (!fechaInicio && !fechaFin) {
            query.fecha.$gte = (0, fechas_1.inicioMesColombia)();
        }
        if (req.user.tipo === 'DOCENTE') {
            query.docenteId = req.user._id;
        }
        const oid = (v) => (v instanceof mongoose_1.default.Types.ObjectId ? v : new mongoose_1.default.Types.ObjectId(String(v)));
        const matchAgg = { escuelaId: oid(query.escuelaId) };
        if (query.cursoId)
            matchAgg.cursoId = oid(query.cursoId);
        if (query.docenteId)
            matchAgg.docenteId = oid(query.docenteId);
        if (query.fecha)
            matchAgg.fecha = query.fecha;
        const permitidosOid = estudiantesPermitidos.filter((id) => mongoose_1.default.isValidObjectId(id)).map(oid);
        if (esRolPersonal)
            matchAgg['estudiantes.estudianteId'] = { $in: permitidosOid };
        const entradas = esRolPersonal
            ? { $filter: { input: '$estudiantes', as: 'e', cond: { $in: ['$$e.estudianteId', permitidosOid] } } }
            : '$estudiantes';
        const contar = (estado) => ({
            $size: { $filter: { input: '$entradas', as: 'e', cond: { $eq: ['$$e.estado', estado] } } },
        });
        const filas = await asistencia_model_1.default.aggregate([
            { $match: matchAgg },
            { $sort: { fecha: 1 } },
            { $project: { fecha: 1, cursoId: 1, asignaturaId: 1, docenteId: 1, createdAt: 1, finalizado: 1, entradas } },
            {
                $project: {
                    fecha: 1,
                    cursoId: 1,
                    asignaturaId: 1,
                    docenteId: 1,
                    createdAt: 1,
                    finalizado: 1,
                    totalEstudiantes: { $size: '$entradas' },
                    presentes: contar(IAsistencia_1.EstadoAsistencia.PRESENTE),
                    ausentes: contar(IAsistencia_1.EstadoAsistencia.AUSENTE),
                    tardes: contar(IAsistencia_1.EstadoAsistencia.TARDANZA),
                    justificados: contar(IAsistencia_1.EstadoAsistencia.JUSTIFICADO),
                    permisos: contar(IAsistencia_1.EstadoAsistencia.PERMISO),
                },
            },
        ]);
        const unicos = (campo) => [...new Set(filas.map((f) => f[campo]).filter(Boolean).map(String))];
        const [cursosInfo, asignaturasInfo, docentesInfo] = await Promise.all([
            curso_model_1.default.find({ _id: { $in: unicos('cursoId') } }).select('nombre nivel grado grupo').lean(),
            mongoose_1.default.model('Asignatura').find({ _id: { $in: unicos('asignaturaId') } }).select('nombre codigo').lean(),
            usuario_model_1.default.find({ _id: { $in: unicos('docenteId') } }).select('nombre apellidos').lean(),
        ]);
        const mapa = (docs) => new Map(docs.map((d) => [String(d._id), d]));
        const cursosMap = mapa(cursosInfo);
        const asignaturasMap = mapa(asignaturasInfo);
        const docentesMap = mapa(docentesInfo);
        const resumen = filas.map((registro) => {
            const { totalEstudiantes, presentes, ausentes, tardes, justificados, permisos } = registro;
            const porcentajeAsistencia = Math.round(((presentes + justificados) / totalEstudiantes) * 100);
            const cursoData = (registro.cursoId && cursosMap.get(String(registro.cursoId))) || {
                nombre: 'Sin curso',
                grado: '',
                grupo: '',
            };
            const asignaturaData = registro.asignaturaId
                ? asignaturasMap.get(String(registro.asignaturaId)) || null
                : null;
            const docenteData = (registro.docenteId && docentesMap.get(String(registro.docenteId))) || {
                nombre: 'Sin nombre',
                apellidos: '',
            };
            return {
                _id: registro._id,
                fecha: registro.fecha,
                cursoId: cursoData._id || '',
                curso: {
                    nombre: cursoData.nombre || 'Sin curso',
                    grado: cursoData.grado || '',
                    grupo: cursoData.grupo || '',
                },
                asignatura: asignaturaData
                    ? {
                        _id: asignaturaData._id || '',
                        nombre: asignaturaData.nombre || '',
                    }
                    : null,
                totalEstudiantes,
                presentes,
                ausentes,
                tardes,
                justificados,
                permisos,
                porcentajeAsistencia,
                registradoPor: {
                    _id: docenteData._id || '',
                    nombre: docenteData.nombre || 'Sin nombre',
                    apellidos: docenteData.apellidos || '',
                },
                createdAt: registro.createdAt,
                finalizado: registro.finalizado || false,
            };
        });
        return res.status(200).json({
            success: true,
            count: resumen.length,
            data: resumen,
        });
    }
    catch (error) {
        console.error('Error al obtener resumen de asistencia:', error);
        return next(error);
    }
};
exports.obtenerResumen = obtenerResumen;
const obtenerResumenPeriodo = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { periodoId } = req.params;
        const { cursoId } = req.query;
        if (!cursoId) {
            return next(new ApiError_1.default(400, 'El ID del curso es requerido'));
        }
        const escuela = await mongoose_1.default.model('Escuela').findById(req.user.escuelaId);
        if (!escuela) {
            return next(new ApiError_1.default(404, 'Escuela no encontrada'));
        }
        let periodoEncontrado = null;
        if (escuela.periodos_academicos && Array.isArray(escuela.periodos_academicos)) {
            periodoEncontrado = escuela.periodos_academicos.find((periodo) => periodo._id.toString() === periodoId);
        }
        if (!periodoEncontrado) {
            return next(new ApiError_1.default(404, 'Periodo académico no encontrado'));
        }
        const fechaInicio = new Date(periodoEncontrado.fecha_inicio);
        const fechaFin = new Date(periodoEncontrado.fecha_fin);
        const curso = await curso_model_1.default.findOne({ _id: cursoId, escuelaId: req.user.escuelaId }).populate({
            path: 'estudiantes',
            select: 'nombre apellidos',
        });
        if (!curso) {
            return next(new ApiError_1.default(404, 'Curso no encontrado'));
        }
        const registros = await asistencia_model_1.default.find({
            cursoId,
            escuelaId: req.user.escuelaId,
            finalizado: true,
            fecha: { $gte: fechaInicio, $lte: fechaFin },
        }).select('estudiantes fecha');
        const estudiantesEstadisticas = [];
        for (const estudiante of curso.estudiantes) {
            const estudianteId = estudiante._id;
            const estudianteDoc = estudiante;
            let presentes = 0;
            let ausentes = 0;
            let tardanzas = 0;
            let justificados = 0;
            let permisos = 0;
            for (const registro of registros) {
                const estudianteInfo = registro.estudiantes.find((est) => est.estudianteId.toString() === estudianteId.toString());
                if (estudianteInfo) {
                    switch (estudianteInfo.estado) {
                        case IAsistencia_1.EstadoAsistencia.PRESENTE:
                            presentes++;
                            break;
                        case IAsistencia_1.EstadoAsistencia.AUSENTE:
                            ausentes++;
                            break;
                        case IAsistencia_1.EstadoAsistencia.TARDANZA:
                            tardanzas++;
                            break;
                        case IAsistencia_1.EstadoAsistencia.JUSTIFICADO:
                            justificados++;
                            break;
                        case IAsistencia_1.EstadoAsistencia.PERMISO:
                            permisos++;
                            break;
                    }
                }
            }
            const clasesTotales = registros.length;
            const porcentajeAsistencia = clasesTotales > 0 ? Math.round(((presentes + tardanzas) / clasesTotales) * 100) : 0;
            estudiantesEstadisticas.push({
                estudianteId,
                nombreEstudiante: `${estudianteDoc.nombre || ''} ${estudianteDoc.apellidos || ''}`,
                clasesTotales,
                presentes,
                ausentes,
                tardanzas,
                justificados,
                permisos,
                porcentajeAsistencia,
            });
        }
        estudiantesEstadisticas.sort((a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia);
        const cursoAny = curso;
        return res.status(200).json({
            success: true,
            data: {
                periodo: {
                    _id: periodoEncontrado._id,
                    nombre: periodoEncontrado.nombre,
                    numero: periodoEncontrado.numero,
                    fechaInicio: periodoEncontrado.fecha_inicio,
                    fechaFin: periodoEncontrado.fecha_fin,
                },
                curso: {
                    _id: curso._id,
                    nombre: cursoAny.nombre || '',
                    nivel: cursoAny.nivel || '',
                    grado: cursoAny.grado || '',
                    grupo: cursoAny.grupo || '',
                },
                totalClases: registros.length,
                estudiantes: estudiantesEstadisticas,
            },
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.obtenerResumenPeriodo = obtenerResumenPeriodo;
const getAlertasAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { cursoId, estudianteId, nivel, periodoId } = req.query;
        const filtro = {
            escuelaId: req.user.escuelaId,
        };
        if (cursoId)
            filtro.cursoId = cursoId;
        if (estudianteId)
            filtro.estudianteId = estudianteId;
        if (nivel)
            filtro.nivel = nivel;
        if (periodoId)
            filtro.periodoId = periodoId;
        const alertas = await alertaAsistencia_model_1.default.find(filtro)
            .populate('estudianteId', 'nombre apellidos')
            .populate('cursoId', 'nombre nivel grado grupo')
            .sort({ fechaEnvio: -1 });
        return res.status(200).json({
            success: true,
            data: alertas,
        });
    }
    catch (error) {
        return next(error);
    }
};
exports.getAlertasAsistencia = getAlertasAsistencia;
//# sourceMappingURL=asistencia.controller.js.map