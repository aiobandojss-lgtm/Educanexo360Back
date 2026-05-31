"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerEstudianteConInvitacion = exports.buscarEstudiantesConInvitacion = exports.obtenerInfoCursoPublica = exports.obtenerCursosDisponibles = exports.obtenerInfoCurso = exports.validarCodigoInvitacion = void 0;
const invitacion_service_1 = __importDefault(require("../services/invitacion.service"));
const estudiante_service_1 = require("../services/estudiante.service");
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const validarCodigoInvitacion = async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) {
            res.status(400).json({
                success: false,
                message: 'El código de invitación es requerido',
            });
            return;
        }
        const resultado = await invitacion_service_1.default.validarCodigo(codigo);
        res.status(200).json({
            success: true,
            data: resultado,
            message: 'Código de invitación válido',
        });
    }
    catch (error) {
        console.error('Error al validar código de invitación:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.validarCodigoInvitacion = validarCodigoInvitacion;
const obtenerInfoCurso = async (req, res) => {
    try {
        const { cursoId, codigoInvitacion } = req.params;
        if (!cursoId || !codigoInvitacion) {
            res.status(400).json({
                success: false,
                message: 'ID de curso y código de invitación son requeridos',
            });
            return;
        }
        try {
            await invitacion_service_1.default.validarCodigo(codigoInvitacion);
        }
        catch (error) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación no válido',
            });
            return;
        }
        const curso = await curso_model_1.default.findById(cursoId)
            .select('nombre grado grupo seccion descripcion')
            .populate('escuelaId', 'nombre');
        if (!curso) {
            res.status(404).json({
                success: false,
                message: 'Curso no encontrado',
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: curso,
        });
    }
    catch (error) {
        console.error('Error al obtener información del curso:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.obtenerInfoCurso = obtenerInfoCurso;
const obtenerCursosDisponibles = async (req, res) => {
    try {
        const { codigoInvitacion } = req.params;
        if (!codigoInvitacion) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación es requerido',
            });
            return;
        }
        let invitacionInfo;
        try {
            invitacionInfo = await invitacion_service_1.default.validarCodigo(codigoInvitacion);
        }
        catch (error) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación no válido',
            });
            return;
        }
        const cursos = await curso_model_1.default.find({
            escuelaId: invitacionInfo.escuelaId,
        })
            .select('nombre grado grupo seccion')
            .sort({ grado: 1, grupo: 1 });
        res.status(200).json({
            success: true,
            data: cursos,
            message: `Se encontraron ${cursos.length} cursos disponibles`,
        });
    }
    catch (error) {
        console.error('Error al obtener cursos disponibles:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.obtenerCursosDisponibles = obtenerCursosDisponibles;
const obtenerInfoCursoPublica = async (req, res) => {
    try {
        const { cursoId } = req.params;
        if (!cursoId) {
            res.status(400).json({
                success: false,
                message: 'ID de curso es requerido',
            });
            return;
        }
        const curso = await curso_model_1.default.findById(cursoId)
            .select('nombre grado grupo seccion descripcion')
            .populate('escuelaId', 'nombre');
        if (!curso) {
            res.status(404).json({
                success: false,
                message: 'Curso no encontrado',
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: curso,
        });
    }
    catch (error) {
        console.error('Error al obtener información pública del curso:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.obtenerInfoCursoPublica = obtenerInfoCursoPublica;
const buscarEstudiantesConInvitacion = async (req, res) => {
    try {
        const { codigoInvitacion } = req.params;
        const { nombre, apellidos, email, codigo_estudiante } = req.query;
        if (!codigoInvitacion) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación es requerido',
            });
            return;
        }
        let invitacionInfo;
        try {
            invitacionInfo = await invitacion_service_1.default.validarCodigo(codigoInvitacion);
            if (!invitacionInfo || !invitacionInfo.escuelaId) {
                res.status(400).json({
                    success: false,
                    message: 'Código de invitación no válido',
                });
                return;
            }
        }
        catch (invitacionError) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación no válido o expirado',
            });
            return;
        }
        const estudiantes = await estudiante_service_1.estudianteService.buscarEstudiantesExistentes({
            escuelaId: invitacionInfo.escuelaId,
            nombre: nombre,
            apellidos: apellidos,
            email: email,
            codigo_estudiante: codigo_estudiante,
        });
        const estudiantesPublicos = estudiantes.map((est) => ({
            _id: est._id,
            nombre: est.nombre,
            apellidos: est.apellidos,
            codigo_estudiante: est.codigo_estudiante,
            curso: est.curso,
            tieneAcudientes: est.acudientesActuales.length > 0,
            numeroAcudientes: est.acudientesActuales.length,
        }));
        res.status(200).json({
            success: true,
            data: estudiantesPublicos,
            message: `Se encontraron ${estudiantesPublicos.length} estudiantes disponibles`,
        });
    }
    catch (error) {
        console.error('Error al buscar estudiantes con invitación:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.buscarEstudiantesConInvitacion = buscarEstudiantesConInvitacion;
const obtenerEstudianteConInvitacion = async (req, res) => {
    try {
        const { codigoInvitacion, estudianteId } = req.params;
        if (!codigoInvitacion || !estudianteId) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación y ID de estudiante son requeridos',
            });
            return;
        }
        let invitacionInfo;
        try {
            invitacionInfo = await invitacion_service_1.default.validarCodigo(codigoInvitacion);
            if (!invitacionInfo || !invitacionInfo.escuelaId) {
                res.status(400).json({
                    success: false,
                    message: 'Código de invitación no válido',
                });
                return;
            }
        }
        catch (invitacionError) {
            res.status(400).json({
                success: false,
                message: 'Código de invitación no válido o expirado',
            });
            return;
        }
        const estudiante = await estudiante_service_1.estudianteService.obtenerEstudiantePorId(estudianteId, invitacionInfo.escuelaId);
        if (!estudiante) {
            res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado',
            });
            return;
        }
        const estudiantePublico = {
            _id: estudiante._id,
            nombre: estudiante.nombre,
            apellidos: estudiante.apellidos,
            codigo_estudiante: estudiante.codigo_estudiante,
            curso: estudiante.curso,
            tieneAcudientes: estudiante.acudientesActuales.length > 0,
            numeroAcudientes: estudiante.acudientesActuales.length,
        };
        res.status(200).json({
            success: true,
            data: estudiantePublico,
        });
    }
    catch (error) {
        console.error('Error al obtener estudiante con invitación:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
        });
    }
};
exports.obtenerEstudianteConInvitacion = obtenerEstudianteConInvitacion;
const publicController = {
    validarCodigoInvitacion: exports.validarCodigoInvitacion,
    obtenerInfoCurso: exports.obtenerInfoCurso,
    obtenerCursosDisponibles: exports.obtenerCursosDisponibles,
    obtenerInfoCursoPublica: exports.obtenerInfoCursoPublica,
    buscarEstudiantesConInvitacion: exports.buscarEstudiantesConInvitacion,
    obtenerEstudianteConInvitacion: exports.obtenerEstudianteConInvitacion,
};
exports.default = publicController;
//# sourceMappingURL=public.controller.js.map