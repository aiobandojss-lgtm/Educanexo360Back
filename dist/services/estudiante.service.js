"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estudianteService = void 0;
const mongoose_1 = require("mongoose");
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const escapeRegex_1 = require("../utils/escapeRegex");
class EstudianteService {
    async buscarEstudiantesExistentes(options) {
        const { escuelaId, ...criterios } = options;
        const query = {
            tipo: 'ESTUDIANTE',
            estado: 'ACTIVO',
            escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
        };
        const orConditions = [];
        if (criterios.email) {
            orConditions.push({ email: criterios.email });
        }
        if (criterios.codigo_estudiante) {
            orConditions.push({ 'info_academica.codigo_estudiante': criterios.codigo_estudiante });
        }
        if (criterios.nombre && criterios.apellidos) {
            orConditions.push({
                nombre: new RegExp((0, escapeRegex_1.escapeRegex)(criterios.nombre), 'i'),
                apellidos: new RegExp((0, escapeRegex_1.escapeRegex)(criterios.apellidos), 'i'),
            });
        }
        else if (criterios.nombre) {
            orConditions.push({
                nombre: new RegExp((0, escapeRegex_1.escapeRegex)(criterios.nombre), 'i'),
            });
        }
        else if (criterios.apellidos) {
            orConditions.push({
                apellidos: new RegExp((0, escapeRegex_1.escapeRegex)(criterios.apellidos), 'i'),
            });
        }
        if (orConditions.length > 0) {
            query.$or = orConditions;
        }
        else {
            return [];
        }
        try {
            const estudiantes = await usuario_model_1.default.find(query).lean();
            const estudiantesEncontrados = [];
            for (const estudiante of estudiantes) {
                let cursoInfo = undefined;
                try {
                    const curso = await curso_model_1.default.findOne({
                        estudiantes: { $in: [estudiante._id] },
                        escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
                    }).lean();
                    if (curso) {
                        cursoInfo = {
                            _id: curso._id.toString(),
                            nombre: curso.nombre || '',
                            grado: curso.grado || '',
                            grupo: curso.grupo || '',
                        };
                    }
                }
                catch (error) {
                    console.error('Error al buscar curso del estudiante:', error);
                }
                const acudientesRaw = await usuario_model_1.default.find({
                    tipo: 'ACUDIENTE',
                    estado: 'ACTIVO',
                    escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
                    'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
                })
                    .select('nombre apellidos email')
                    .lean();
                const acudientes = acudientesRaw.map((acudiente) => ({
                    _id: acudiente._id.toString(),
                    nombre: acudiente.nombre,
                    apellidos: acudiente.apellidos,
                    email: acudiente.email,
                }));
                estudiantesEncontrados.push({
                    _id: estudiante._id.toString(),
                    nombre: estudiante.nombre,
                    apellidos: estudiante.apellidos,
                    email: estudiante.email,
                    codigo_estudiante: estudiante.info_academica?.codigo_estudiante,
                    curso: cursoInfo,
                    acudientesActuales: acudientes,
                });
            }
            return estudiantesEncontrados;
        }
        catch (error) {
            console.error('Error al buscar estudiantes existentes:', error);
            throw new ApiError_1.default(500, 'Error al buscar estudiantes existentes');
        }
    }
    async obtenerEstudiantePorId(id, escuelaId) {
        try {
            const estudiante = await usuario_model_1.default.findOne({
                _id: new mongoose_1.Types.ObjectId(id),
                tipo: 'ESTUDIANTE',
                estado: 'ACTIVO',
                escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
            }).lean();
            if (!estudiante) {
                return null;
            }
            let cursoInfo = undefined;
            try {
                const curso = await curso_model_1.default.findOne({
                    estudiantes: { $in: [estudiante._id] },
                    escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
                }).lean();
                if (curso) {
                    cursoInfo = {
                        _id: curso._id.toString(),
                        nombre: curso.nombre || '',
                        grado: curso.grado || '',
                        grupo: curso.grupo || '',
                    };
                }
            }
            catch (error) {
                console.error('Error al buscar curso del estudiante:', error);
            }
            const acudientesRaw = await usuario_model_1.default.find({
                tipo: 'ACUDIENTE',
                estado: 'ACTIVO',
                escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
                'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
            })
                .select('nombre apellidos email')
                .lean();
            const acudientes = acudientesRaw.map((acudiente) => ({
                _id: acudiente._id.toString(),
                nombre: acudiente.nombre,
                apellidos: acudiente.apellidos,
                email: acudiente.email,
            }));
            return {
                _id: estudiante._id.toString(),
                nombre: estudiante.nombre,
                apellidos: estudiante.apellidos,
                email: estudiante.email,
                codigo_estudiante: estudiante.info_academica?.codigo_estudiante,
                curso: cursoInfo,
                acudientesActuales: acudientes,
            };
        }
        catch (error) {
            console.error('Error al obtener estudiante por ID:', error);
            throw new ApiError_1.default(500, 'Error al obtener información del estudiante');
        }
    }
    async puedeAsociarAcudiente(estudianteId, acudienteEmail, escuelaId) {
        try {
            const estudiante = await usuario_model_1.default.findOne({
                _id: new mongoose_1.Types.ObjectId(estudianteId),
                tipo: 'ESTUDIANTE',
                estado: 'ACTIVO',
                escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
            });
            if (!estudiante) {
                return { puede: false, razon: 'Estudiante no encontrado o inactivo' };
            }
            const acudienteExistente = await usuario_model_1.default.findOne({
                email: acudienteEmail,
                tipo: 'ACUDIENTE',
                escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
                'info_academica.estudiantes_asociados': { $in: [estudiante._id] },
            });
            if (acudienteExistente) {
                return {
                    puede: false,
                    razon: 'Este acudiente ya está asociado a este estudiante',
                };
            }
            return { puede: true };
        }
        catch (error) {
            console.error('Error al verificar asociación:', error);
            return { puede: false, razon: 'Error al verificar la asociación' };
        }
    }
    async asociarEstudianteAcudiente(estudianteId, acudienteId, cursoId, session) {
        try {
            await usuario_model_1.default.findByIdAndUpdate(acudienteId, {
                $addToSet: {
                    'info_academica.estudiantes_asociados': new mongoose_1.Types.ObjectId(estudianteId),
                },
            }, { session });
            await curso_model_1.default.findByIdAndUpdate(cursoId, {
                $addToSet: { estudiantes: new mongoose_1.Types.ObjectId(estudianteId) },
            }, { session });
            console.log(`Estudiante ${estudianteId} asociado exitosamente al acudiente ${acudienteId}`);
        }
        catch (error) {
            console.error('Error al asociar estudiante y acudiente:', error);
            throw new ApiError_1.default(500, 'Error al asociar estudiante y acudiente');
        }
    }
}
exports.estudianteService = new EstudianteService();
exports.default = exports.estudianteService;
//# sourceMappingURL=estudiante.service.js.map