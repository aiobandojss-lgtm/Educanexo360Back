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
const IAsistencia_1 = require("../interfaces/IAsistencia");
const alertaAsistencia_model_1 = __importDefault(require("../models/alertaAsistencia.model"));
const alertaAsistencia_service_1 = require("../services/alertaAsistencia.service");
const crearAsistencia = async (req, res, next) => {
    try {
        if (!req.user) {
            return next(new ApiError_1.default(401, 'No autorizado'));
        }
        const { fecha, cursoId, asignaturaId, tipoSesion, horaInicio, horaFin, observacionesGenerales, estudiantes, } = req.body;
        const existeAsistencia = await asistencia_model_1.default.findOne({
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
            const curso = await curso_model_1.default.findById(cursoId);
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
        const { cursoId, asignaturaId, desde, hasta, docenteId, finalizado, page = 1, limit = 10, } = req.query;
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
        const asistencia = await asistencia_model_1.default.findById(id)
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
        if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
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
        console.log('Estados de estudiantes:', estudiantesFormateados.map((e) => e.estado));
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
        const { estudiantes, observacionesGenerales, tipoSesion, horaInicio, horaFin } = req.body;
        const asistencia = await asistencia_model_1.default.findById(id);
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este registro de asistencia'));
        }
        if (estudiantes) {
            const estudiantesActualizados = estudiantes.map((est) => ({
                ...est,
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
        const asistencia = await asistencia_model_1.default.findById(id);
        if (!asistencia) {
            return next(new ApiError_1.default(404, 'Registro de asistencia no encontrado'));
        }
        if (asistencia.escuelaId.toString() !== req.user.escuelaId) {
            return next(new ApiError_1.default(403, 'No tiene acceso a este registro de asistencia'));
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
            for (const entrada of asistencia.estudiantes ?? []) {
                (0, alertaAsistencia_service_1.triggerAlertasAsistencia)(entrada.estudianteId.toString(), cursoId, escuelaId, docenteId, periodoId).catch((err) => console.error('[AlertaAsistencia]', err));
            }
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
        if (asistencia.docenteId.toString() !== req.user._id && req.user.tipo !== 'ADMIN') {
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
        const { desde, hasta, asignaturaId } = req.query;
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
        const { desde, hasta, cursoId, asignaturaId } = req.query;
        const estudiante = await usuario_model_1.default.findById(estudianteId).select('nombre apellidos');
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
        const { fecha, cursoId, asignaturaId } = req.query;
        if (!fecha) {
            return next(new ApiError_1.default(400, 'La fecha es requerida'));
        }
        if (!cursoId) {
            return next(new ApiError_1.default(400, 'El ID del curso es requerido'));
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
        const { fechaInicio, fechaFin, cursoId } = req.query;
        const query = { escuelaId: req.user.escuelaId };
        if (cursoId)
            query.cursoId = cursoId;
        if (fechaInicio || fechaFin) {
            query.fecha = {};
            if (fechaInicio)
                query.fecha.$gte = new Date(fechaInicio);
            if (fechaFin)
                query.fecha.$lte = new Date(fechaFin);
        }
        if (req.user.tipo === 'DOCENTE') {
            query.docenteId = req.user._id;
        }
        const registros = await asistencia_model_1.default.find(query)
            .populate('cursoId', 'nombre nivel grado grupo')
            .populate('asignaturaId', 'nombre codigo')
            .populate('docenteId', 'nombre apellidos')
            .select('fecha cursoId asignaturaId docenteId estudiantes createdAt finalizado');
        const resumen = registros.map((registro) => {
            const totalEstudiantes = registro.estudiantes.length;
            const presentes = registro.estudiantes.filter((est) => est.estado === IAsistencia_1.EstadoAsistencia.PRESENTE).length;
            const ausentes = registro.estudiantes.filter((est) => est.estado === IAsistencia_1.EstadoAsistencia.AUSENTE).length;
            const tardes = registro.estudiantes.filter((est) => est.estado === IAsistencia_1.EstadoAsistencia.TARDANZA).length;
            const justificados = registro.estudiantes.filter((est) => est.estado === IAsistencia_1.EstadoAsistencia.JUSTIFICADO).length;
            const permisos = registro.estudiantes.filter((est) => est.estado === IAsistencia_1.EstadoAsistencia.PERMISO).length;
            const porcentajeAsistencia = Math.round(((presentes + justificados) / totalEstudiantes) * 100);
            const cursoData = registro.cursoId
                ? registro.cursoId
                : { nombre: 'Sin curso', grado: '', grupo: '' };
            const asignaturaData = registro.asignaturaId
                ? registro.asignaturaId
                : null;
            const docenteData = registro.docenteId
                ? registro.docenteId
                : { nombre: 'Sin nombre', apellidos: '' };
            return {
                _id: registro._id,
                fecha: registro.fecha,
                cursoId: cursoData._id || '',
                curso: {
                    nombre: cursoData.nombre || 'Sin curso',
                    grado: cursoData.grado || '',
                    grupo: cursoData.grupo || '',
                },
                asignatura: asignaturaData ? {
                    _id: asignaturaData._id || '',
                    nombre: asignaturaData.nombre || '',
                } : null,
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
        const curso = await curso_model_1.default.findById(cursoId).populate({
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