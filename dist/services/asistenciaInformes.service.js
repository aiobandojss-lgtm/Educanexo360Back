"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.informeHistorialEstudiante = exports.informePatronDias = exports.informeRankingCursos = exports.informeTendencia = exports.informeEstudiantesEnRiesgo = exports.calcularPorcentaje = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const asistencia_model_1 = __importDefault(require("../models/asistencia.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const IAsistencia_1 = require("../interfaces/IAsistencia");
const calcularPorcentaje = (presentes, tardanzas, total) => {
    if (total === 0)
        return 0;
    return Math.round(((presentes + tardanzas) / total) * 100);
};
exports.calcularPorcentaje = calcularPorcentaje;
const contarEstados = (estados) => {
    const contadores = { presentes: 0, ausentes: 0, tardanzas: 0, justificados: 0, permisos: 0 };
    for (const estado of estados) {
        switch (estado) {
            case IAsistencia_1.EstadoAsistencia.PRESENTE:
                contadores.presentes++;
                break;
            case IAsistencia_1.EstadoAsistencia.AUSENTE:
                contadores.ausentes++;
                break;
            case IAsistencia_1.EstadoAsistencia.TARDANZA:
                contadores.tardanzas++;
                break;
            case IAsistencia_1.EstadoAsistencia.JUSTIFICADO:
                contadores.justificados++;
                break;
            case IAsistencia_1.EstadoAsistencia.PERMISO:
                contadores.permisos++;
                break;
        }
    }
    return contadores;
};
const informeEstudiantesEnRiesgo = async (escuelaId, umbral = 80, cursoId, desde, hasta) => {
    const queryBase = { escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId) };
    if (cursoId)
        queryBase.cursoId = new mongoose_1.default.Types.ObjectId(cursoId);
    if (desde || hasta) {
        queryBase.fecha = {};
        if (desde)
            queryBase.fecha.$gte = desde;
        if (hasta)
            queryBase.fecha.$lte = hasta;
    }
    const pipeline = [
        { $match: queryBase },
        { $unwind: '$estudiantes' },
        {
            $group: {
                _id: { estudianteId: '$estudiantes.estudianteId', cursoId: '$cursoId' },
                clasesTotales: { $sum: 1 },
                presentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0] } },
                ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] }, 1, 0] } },
                tardanzas: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] }, 1, 0] } },
                justificados: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
                permisos: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] }, 1, 0] } },
            },
        },
        {
            $addFields: {
                porcentajeAsistencia: {
                    $cond: [
                        { $eq: ['$clasesTotales', 0] },
                        0,
                        { $round: [{ $multiply: [{ $divide: [{ $add: ['$presentes', '$tardanzas'] }, '$clasesTotales'] }, 100] }, 0] },
                    ],
                },
            },
        },
        { $match: { porcentajeAsistencia: { $lt: umbral } } },
        { $sort: { porcentajeAsistencia: 1 } },
    ];
    const resultados = await asistencia_model_1.default.aggregate(pipeline);
    if (resultados.length === 0)
        return [];
    const estudianteIds = [...new Set(resultados.map((r) => r._id.estudianteId.toString()))];
    const cursoIds = [...new Set(resultados.map((r) => r._id.cursoId.toString()))];
    const [estudiantes, cursos] = await Promise.all([
        usuario_model_1.default.find({ _id: { $in: estudianteIds } }).select('nombre apellidos').lean(),
        curso_model_1.default.find({ _id: { $in: cursoIds } }).select('nombre grado grupo').lean(),
    ]);
    const estudianteMap = new Map(estudiantes.map((e) => [e._id.toString(), e]));
    const cursoMap = new Map(cursos.map((c) => [c._id.toString(), c]));
    return resultados.map((r) => {
        const est = estudianteMap.get(r._id.estudianteId.toString());
        const curso = cursoMap.get(r._id.cursoId.toString());
        const pct = r.porcentajeAsistencia;
        return {
            estudianteId: r._id.estudianteId.toString(),
            nombre: est?.nombre ?? 'Desconocido',
            apellidos: est?.apellidos ?? '',
            curso: {
                _id: r._id.cursoId.toString(),
                nombre: curso?.nombre ?? '',
                grado: curso?.grado ?? '',
                grupo: curso?.grupo ?? '',
            },
            clasesTotales: r.clasesTotales,
            ausencias: r.ausentes,
            tardanzas: r.tardanzas,
            porcentajeAsistencia: pct,
            nivelRiesgo: pct < 70 ? 'CRITICO' : pct < umbral ? 'ALERTA' : 'OK',
        };
    });
};
exports.informeEstudiantesEnRiesgo = informeEstudiantesEnRiesgo;
const informeTendencia = async (escuelaId, desde, hasta, agrupacion = 'semana', cursoId) => {
    const queryBase = {
        escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
        fecha: { $gte: desde, $lte: hasta },
    };
    if (cursoId)
        queryBase.cursoId = new mongoose_1.default.Types.ObjectId(cursoId);
    const formatoFecha = agrupacion === 'mes'
        ? { year: { $year: '$fecha' }, month: { $month: '$fecha' } }
        : { year: { $year: '$fecha' }, week: { $isoWeek: '$fecha' } };
    const pipeline = [
        { $match: queryBase },
        { $unwind: '$estudiantes' },
        {
            $group: {
                _id: formatoFecha,
                totalClases: { $addToSet: '$_id' },
                presentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0] } },
                ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] }, 1, 0] } },
                tardanzas: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] }, 1, 0] } },
                justificados: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
                permisos: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] }, 1, 0] } },
                totalEstudiantes: { $sum: 1 },
                fechaMinima: { $min: '$fecha' },
            },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.week': 1 } },
    ];
    const resultados = await asistencia_model_1.default.aggregate(pipeline);
    return resultados.map((r) => {
        const total = r.totalEstudiantes;
        const pct = (0, exports.calcularPorcentaje)(r.presentes, r.tardanzas, total);
        const label = agrupacion === 'mes'
            ? `${r._id.year}-${String(r._id.month).padStart(2, '0')}`
            : `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`;
        return {
            periodo: label,
            fechaInicio: r.fechaMinima,
            totalClases: r.totalClases.length,
            totalEstudiantes: total,
            presentes: r.presentes,
            ausentes: r.ausentes,
            tardanzas: r.tardanzas,
            porcentajeAsistencia: pct,
        };
    });
};
exports.informeTendencia = informeTendencia;
const informeRankingCursos = async (escuelaId, desde, hasta) => {
    const pipeline = [
        {
            $match: {
                escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
                fecha: { $gte: desde, $lte: hasta },
            },
        },
        { $unwind: '$estudiantes' },
        {
            $group: {
                _id: '$cursoId',
                totalClases: { $addToSet: '$_id' },
                presentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0] } },
                ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] }, 1, 0] } },
                tardanzas: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] }, 1, 0] } },
                totalRegistros: { $sum: 1 },
                estudiantesUnicos: { $addToSet: '$estudiantes.estudianteId' },
            },
        },
        {
            $addFields: {
                totalEstudiantes: { $size: '$estudiantesUnicos' },
                porcentajeAsistencia: {
                    $cond: [
                        { $eq: ['$totalRegistros', 0] },
                        0,
                        { $round: [{ $multiply: [{ $divide: [{ $add: ['$presentes', '$tardanzas'] }, '$totalRegistros'] }, 100] }, 0] },
                    ],
                },
            },
        },
        { $sort: { porcentajeAsistencia: -1 } },
    ];
    const resultados = await asistencia_model_1.default.aggregate(pipeline);
    if (resultados.length === 0)
        return [];
    const cursoIds = resultados.map((r) => r._id);
    const cursos = await curso_model_1.default.find({ _id: { $in: cursoIds } }).select('nombre grado grupo').lean();
    const cursoMap = new Map(cursos.map((c) => [c._id.toString(), c]));
    return resultados.map((r, idx) => {
        const curso = cursoMap.get(r._id.toString());
        return {
            posicion: idx + 1,
            cursoId: r._id.toString(),
            nombre: curso?.nombre ?? '',
            grado: curso?.grado ?? '',
            grupo: curso?.grupo ?? '',
            totalClases: r.totalClases.length,
            totalEstudiantes: r.totalEstudiantes,
            presentes: r.presentes,
            ausentes: r.ausentes,
            tardanzas: r.tardanzas,
            porcentajeAsistencia: r.porcentajeAsistencia,
        };
    });
};
exports.informeRankingCursos = informeRankingCursos;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const informePatronDias = async (escuelaId, desde, hasta, cursoId) => {
    const queryBase = {
        escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
        fecha: { $gte: desde, $lte: hasta },
    };
    if (cursoId)
        queryBase.cursoId = new mongoose_1.default.Types.ObjectId(cursoId);
    const pipeline = [
        { $match: queryBase },
        { $unwind: '$estudiantes' },
        {
            $group: {
                _id: { $isoDayOfWeek: '$fecha' },
                totalClases: { $addToSet: '$_id' },
                ausentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'AUSENTE'] }, 1, 0] } },
                tardanzas: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'TARDANZA'] }, 1, 0] } },
                presentes: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PRESENTE'] }, 1, 0] } },
                justificados: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'JUSTIFICADO'] }, 1, 0] } },
                permisos: { $sum: { $cond: [{ $eq: ['$estudiantes.estado', 'PERMISO'] }, 1, 0] } },
                totalEstudiantes: { $sum: 1 },
            },
        },
        { $match: { _id: { $gte: 1, $lte: 5 } } },
        { $sort: { _id: 1 } },
    ];
    const resultados = await asistencia_model_1.default.aggregate(pipeline);
    const diasNombres = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    return resultados.map((r) => {
        const total = r.totalEstudiantes;
        const pctAusentismo = total > 0 ? Math.round(((r.ausentes + r.tardanzas) / total) * 100) : 0;
        return {
            diaSemana: r._id,
            nombreDia: diasNombres[r._id] ?? DIAS_SEMANA[r._id],
            totalClases: r.totalClases.length,
            totalEstudiantes: total,
            ausencias: r.ausentes,
            tardanzas: r.tardanzas,
            porcentajeAusentismo: pctAusentismo,
        };
    });
};
exports.informePatronDias = informePatronDias;
const informeHistorialEstudiante = async (estudianteId, escuelaId, desde, hasta) => {
    const estudiante = await usuario_model_1.default.findById(estudianteId).select('nombre apellidos email').lean();
    if (!estudiante)
        throw new ApiError_1.default(404, 'Estudiante no encontrado');
    const registros = await asistencia_model_1.default.find({
        'estudiantes.estudianteId': new mongoose_1.default.Types.ObjectId(estudianteId),
        escuelaId: new mongoose_1.default.Types.ObjectId(escuelaId),
        fecha: { $gte: desde, $lte: hasta },
    })
        .populate('cursoId', 'nombre grado grupo')
        .populate('asignaturaId', 'nombre')
        .sort({ fecha: 1 })
        .lean();
    const contadores = { presentes: 0, ausentes: 0, tardanzas: 0, justificados: 0, permisos: 0 };
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const historial = [];
    for (const registro of registros) {
        const entrada = registro.estudiantes.find((e) => e.estudianteId.toString() === estudianteId);
        if (!entrada)
            continue;
        switch (entrada.estado) {
            case IAsistencia_1.EstadoAsistencia.PRESENTE:
                contadores.presentes++;
                break;
            case IAsistencia_1.EstadoAsistencia.AUSENTE:
                contadores.ausentes++;
                break;
            case IAsistencia_1.EstadoAsistencia.TARDANZA:
                contadores.tardanzas++;
                break;
            case IAsistencia_1.EstadoAsistencia.JUSTIFICADO:
                contadores.justificados++;
                break;
            case IAsistencia_1.EstadoAsistencia.PERMISO:
                contadores.permisos++;
                break;
        }
        const cursoData = registro.cursoId;
        const asignaturaData = registro.asignaturaId;
        let registradoPor = null;
        if (entrada.registradoPor) {
            const docente = await usuario_model_1.default.findById(entrada.registradoPor).select('nombre apellidos').lean();
            if (docente) {
                registradoPor = { _id: docente._id.toString(), nombre: docente.nombre, apellidos: docente.apellidos };
            }
        }
        historial.push({
            fecha: registro.fecha,
            diaSemana: dias[new Date(registro.fecha).getDay()],
            curso: {
                _id: cursoData?._id?.toString() ?? '',
                nombre: cursoData?.nombre ?? '',
                grado: cursoData?.grado ?? '',
                grupo: cursoData?.grupo ?? '',
            },
            asignatura: asignaturaData ? { _id: asignaturaData._id.toString(), nombre: asignaturaData.nombre } : null,
            estado: entrada.estado,
            justificacion: entrada.justificacion ?? '',
            observaciones: entrada.observaciones ?? '',
            registradoPor,
        });
    }
    const clasesTotales = historial.length;
    return {
        estudiante: {
            _id: estudiante._id.toString(),
            nombre: estudiante.nombre,
            apellidos: estudiante.apellidos,
            email: estudiante.email,
        },
        resumen: {
            clasesTotales,
            ...contadores,
            porcentajeAsistencia: (0, exports.calcularPorcentaje)(contadores.presentes, contadores.tardanzas, clasesTotales),
        },
        registros: historial,
    };
};
exports.informeHistorialEstudiante = informeHistorialEstudiante;
//# sourceMappingURL=asistenciaInformes.service.js.map