"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarAsociacionEstudiante = exports.obtenerEstudiantePorId = exports.buscarEstudiantesParaAsociacion = void 0;
const estudiante_service_1 = require("../services/estudiante.service");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const accesoAcademico_1 = require("../utils/accesoAcademico");
const escuelaDelUsuario = (req) => req.user?.escuelaId || undefined;
const buscarEstudiantesParaAsociacion = async (req, res) => {
    try {
        const escuelaId = escuelaDelUsuario(req);
        const nombre = (0, accesoAcademico_1.queryString)(req.query.nombre);
        const apellidos = (0, accesoAcademico_1.queryString)(req.query.apellidos);
        const email = (0, accesoAcademico_1.queryString)(req.query.email);
        const codigo_estudiante = (0, accesoAcademico_1.queryString)(req.query.codigo_estudiante);
        const cursoId = (0, accesoAcademico_1.queryString)(req.query.cursoId);
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'El ID de la escuela es requerido',
            });
            return;
        }
        const estudiantes = await estudiante_service_1.estudianteService.buscarEstudiantesExistentes({
            escuelaId,
            nombre,
            apellidos,
            email,
            codigo_estudiante,
            cursoId,
        });
        res.status(200).json({
            success: true,
            data: estudiantes,
            message: `Se encontraron ${estudiantes.length} estudiantes`,
        });
    }
    catch (error) {
        console.error('Error al buscar estudiantes:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al buscar estudiantes',
        });
    }
};
exports.buscarEstudiantesParaAsociacion = buscarEstudiantesParaAsociacion;
const obtenerEstudiantePorId = async (req, res) => {
    try {
        const { id } = req.params;
        const escuelaId = escuelaDelUsuario(req);
        if (!escuelaId) {
            res.status(400).json({
                success: false,
                message: 'El ID de la escuela es requerido',
            });
            return;
        }
        const estudiante = await estudiante_service_1.estudianteService.obtenerEstudiantePorId(id, escuelaId);
        if (!estudiante) {
            res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado',
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: estudiante,
        });
    }
    catch (error) {
        console.error('Error al obtener estudiante:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al obtener estudiante',
        });
    }
};
exports.obtenerEstudiantePorId = obtenerEstudiantePorId;
const verificarAsociacionEstudiante = async (req, res) => {
    try {
        const { estudianteId } = req.params;
        const acudienteEmail = typeof req.body.acudienteEmail === 'string' ? req.body.acudienteEmail : undefined;
        const escuelaId = escuelaDelUsuario(req);
        if (!acudienteEmail || !escuelaId) {
            res.status(400).json({
                success: false,
                message: 'Email del acudiente y ID de escuela son requeridos',
            });
            return;
        }
        const verificacion = await estudiante_service_1.estudianteService.puedeAsociarAcudiente(estudianteId, acudienteEmail, escuelaId);
        res.status(200).json({
            success: true,
            data: verificacion,
        });
    }
    catch (error) {
        console.error('Error al verificar asociación:', error);
        if (error instanceof ApiError_1.default) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor al verificar asociación',
        });
    }
};
exports.verificarAsociacionEstudiante = verificarAsociacionEstudiante;
//# sourceMappingURL=estudiante.controller.js.map