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
exports.invitacionService = void 0;
const mongoose_1 = require("mongoose");
const invitacion_model_1 = __importStar(require("../models/invitacion.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const codigoUtils_1 = require("../utils/codigoUtils");
const curso_model_1 = __importDefault(require("../models/curso.model"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
class InvitacionService {
    async generarCodigoUnico(escuelaId, tipo, cursoId) {
        let prefijo = '';
        if (tipo === invitacion_model_1.TipoInvitacion.CURSO && cursoId) {
            try {
                const curso = await curso_model_1.default.findById(cursoId);
                if (curso) {
                    prefijo = curso.nombre.substring(0, 2).toUpperCase();
                }
                else {
                    prefijo = 'C';
                }
            }
            catch (error) {
                prefijo = 'C';
            }
        }
        else if (tipo === invitacion_model_1.TipoInvitacion.ESTUDIANTE_ESPECIFICO) {
            prefijo = 'E';
        }
        else {
            prefijo = 'P';
        }
        const año = new Date().getFullYear();
        prefijo = `${prefijo}${año.toString().slice(-2)}-`;
        let codigo;
        let esUnico = false;
        while (!esUnico) {
            const parteAleatoria = (0, codigoUtils_1.generarCodigoAleatorio)(6);
            codigo = `${prefijo}${parteAleatoria}`;
            const invitacionExistente = await invitacion_model_1.default.findOne({ codigo });
            if (!invitacionExistente) {
                esUnico = true;
            }
        }
        return codigo;
    }
    async crearInvitacion(data) {
        console.log('Datos recibidos:', JSON.stringify(data));
        if (data.cursoId) {
            const curso = await curso_model_1.default.findById(data.cursoId);
            console.log('Curso encontrado:', curso ? JSON.stringify(curso) : 'Curso no encontrado');
            if (curso) {
                console.log('Comparando escuelas:', {
                    cursoEscuelaId: curso.escuelaId.toString(),
                    requestEscuelaId: data.escuelaId,
                    sonIguales: curso.escuelaId.toString() === data.escuelaId,
                });
            }
            if (!curso) {
                throw new ApiError_1.default(404, 'Curso no encontrado');
            }
            if (curso.escuelaId.toString() !== data.escuelaId) {
                throw new ApiError_1.default(400, 'El curso no pertenece a la escuela especificada');
            }
        }
        if (data.estudianteId && data.tipo === invitacion_model_1.TipoInvitacion.ESTUDIANTE_ESPECIFICO) {
            const estudiante = await usuario_model_1.default.findOne({
                _id: data.estudianteId,
                tipo: 'ESTUDIANTE',
                escuelaId: data.escuelaId,
            });
            if (!estudiante) {
                throw new ApiError_1.default(404, 'Estudiante no encontrado o no pertenece a la escuela especificada');
            }
        }
        const codigo = await this.generarCodigoUnico(data.escuelaId, data.tipo, data.cursoId);
        const invitacion = new invitacion_model_1.default({
            codigo,
            tipo: data.tipo,
            escuelaId: new mongoose_1.Types.ObjectId(data.escuelaId),
            cursoId: data.cursoId ? new mongoose_1.Types.ObjectId(data.cursoId) : undefined,
            estudianteId: data.estudianteId ? new mongoose_1.Types.ObjectId(data.estudianteId) : undefined,
            estado: invitacion_model_1.EstadoInvitacion.ACTIVO,
            fechaCreacion: new Date(),
            fechaExpiracion: data.fechaExpiracion,
            creadorId: new mongoose_1.Types.ObjectId(data.creadorId),
            datosAdicionales: data.datosAdicionales,
            cantidadUsos: data.cantidadUsos || 1,
            usosActuales: 0,
            registros: [],
        });
        await invitacion.save();
        return invitacion;
    }
    async validarCodigo(codigo) {
        const invitacion = await invitacion_model_1.default.findOne({
            codigo,
            estado: invitacion_model_1.EstadoInvitacion.ACTIVO,
        });
        if (!invitacion) {
            throw new ApiError_1.default(404, 'Código de invitación no válido o expirado');
        }
        if (invitacion.usosActuales >= invitacion.cantidadUsos) {
            throw new ApiError_1.default(400, 'Este código ha alcanzado el límite máximo de usos');
        }
        if (invitacion.fechaExpiracion && invitacion.fechaExpiracion < new Date()) {
            invitacion.estado = invitacion_model_1.EstadoInvitacion.EXPIRADO;
            await invitacion.save();
            throw new ApiError_1.default(400, 'Este código de invitación ha expirado');
        }
        const response = {
            invitacionId: invitacion._id,
            codigo: invitacion.codigo,
            tipo: invitacion.tipo,
            escuelaId: invitacion.escuelaId,
            cursoId: invitacion.cursoId,
            estudianteId: invitacion.estudianteId,
            datosAdicionales: invitacion.datosAdicionales,
        };
        if (invitacion.cursoId) {
            try {
                const curso = await curso_model_1.default.findById(invitacion.cursoId);
                if (curso) {
                    response.cursoInfo = {
                        _id: curso._id,
                        nombre: curso.nombre,
                        grado: curso.grado,
                        grupo: curso.grupo,
                    };
                }
            }
            catch (error) {
                console.error('Error al obtener información del curso:', error);
            }
        }
        if (invitacion.tipo === invitacion_model_1.TipoInvitacion.CURSO) {
            try {
                const cursos = await curso_model_1.default.find({ escuelaId: invitacion.escuelaId })
                    .select('_id nombre grado grupo')
                    .sort({ grado: 1, grupo: 1 })
                    .lean();
                response.cursos = cursos;
            }
            catch (error) {
                console.error('Error al obtener cursos:', error);
            }
        }
        if (invitacion.tipo === invitacion_model_1.TipoInvitacion.ESTUDIANTE_ESPECIFICO && invitacion.estudianteId) {
            try {
                const estudiante = await usuario_model_1.default.findById(invitacion.estudianteId).select('nombre apellidos info_academica');
                if (estudiante) {
                    const estudianteInfo = {
                        _id: estudiante._id,
                        nombre: estudiante.nombre,
                        apellidos: estudiante.apellidos,
                        codigo: estudiante.info_academica?.codigo_estudiante,
                    };
                    if (estudiante.info_academica?.grado) {
                        estudianteInfo.grado = estudiante.info_academica.grado;
                    }
                    if (estudiante.info_academica?.grupo) {
                        estudianteInfo.grupo = estudiante.info_academica.grupo;
                    }
                    const cursos = await curso_model_1.default.find({
                        estudiantes: { $in: [estudiante._id] },
                        escuelaId: invitacion.escuelaId,
                    })
                        .select('_id nombre grado grupo')
                        .lean();
                    if (cursos && cursos.length > 0) {
                        estudianteInfo.curso = {
                            _id: cursos[0]._id,
                            nombre: cursos[0].nombre,
                            grado: cursos[0].grado,
                            grupo: cursos[0].grupo,
                        };
                    }
                    response.estudiante = estudianteInfo;
                }
            }
            catch (error) {
                console.error('Error al obtener datos del estudiante:', error);
            }
        }
        return response;
    }
    async registrarUso(invitacionId, usuarioId, tipoCuenta) {
        const invitacion = await invitacion_model_1.default.findById(invitacionId);
        if (!invitacion || invitacion.estado !== invitacion_model_1.EstadoInvitacion.ACTIVO) {
            throw new ApiError_1.default(404, 'Invitación no encontrada o no activa');
        }
        invitacion.usosActuales += 1;
        invitacion.registros.push({
            usuarioId: new mongoose_1.Types.ObjectId(usuarioId),
            fechaRegistro: new Date(),
            tipoCuenta,
        });
        if (invitacion.usosActuales >= invitacion.cantidadUsos) {
            invitacion.estado = invitacion_model_1.EstadoInvitacion.UTILIZADO;
            invitacion.fechaUtilizacion = new Date();
        }
        await invitacion.save();
        return {
            message: 'Uso de invitación registrado correctamente',
            invitacionId: invitacion._id,
            usosRestantes: invitacion.cantidadUsos > invitacion.usosActuales
                ? invitacion.cantidadUsos - invitacion.usosActuales
                : 0,
        };
    }
    async obtenerInvitacionesPorCurso(cursoId, estado) {
        const filtro = {
            cursoId: new mongoose_1.Types.ObjectId(cursoId),
            tipo: invitacion_model_1.TipoInvitacion.CURSO,
        };
        if (estado) {
            filtro.estado = estado;
        }
        const invitaciones = await invitacion_model_1.default.find(filtro)
            .sort({ fechaCreacion: -1 })
            .populate('creadorId', 'nombre apellidos');
        return invitaciones;
    }
    async revocarInvitacion(invitacionId) {
        const invitacion = await invitacion_model_1.default.findById(invitacionId);
        if (!invitacion) {
            throw new ApiError_1.default(404, 'Invitación no encontrada');
        }
        if (invitacion.estado !== invitacion_model_1.EstadoInvitacion.ACTIVO) {
            return {
                message: `La invitación ya no está activa. Estado actual: ${invitacion.estado}`,
            };
        }
        invitacion.estado = invitacion_model_1.EstadoInvitacion.REVOCADO;
        await invitacion.save();
        return { message: 'Invitación revocada exitosamente' };
    }
    async obtenerInvitacionPorId(id) {
        const invitacion = await invitacion_model_1.default.findById(id)
            .populate('creadorId', 'nombre apellidos')
            .populate('cursoId', 'nombre grado grupo');
        if (!invitacion) {
            throw new ApiError_1.default(404, 'Invitación no encontrada');
        }
        return invitacion;
    }
    async obtenerInvitacionesEscuela(escuelaId, estado, pagina = 1, limite = 10) {
        const filtro = {
            escuelaId: new mongoose_1.Types.ObjectId(escuelaId),
        };
        if (estado) {
            filtro.estado = estado;
        }
        const total = await invitacion_model_1.default.countDocuments(filtro);
        const invitaciones = await invitacion_model_1.default.find(filtro)
            .sort({ fechaCreacion: -1 })
            .skip((pagina - 1) * limite)
            .limit(limite)
            .populate('cursoId', 'nombre grado grupo')
            .populate('creadorId', 'nombre apellidos')
            .populate('estudianteId', 'nombre apellidos');
        return {
            total,
            pagina,
            limite,
            invitaciones,
        };
    }
    async obtenerCursosEscuela(escuelaId) {
        try {
            const cursos = await curso_model_1.default.find({ escuelaId: new mongoose_1.Types.ObjectId(escuelaId) })
                .select('_id nombre grado grupo director_grupo')
                .sort({ grado: 1, grupo: 1 });
            return cursos;
        }
        catch (error) {
            console.error('Error al obtener cursos de la escuela:', error);
            throw new ApiError_1.default(500, 'Error al obtener cursos de la escuela');
        }
    }
}
exports.invitacionService = new InvitacionService();
exports.default = exports.invitacionService;
//# sourceMappingURL=invitacion.service.js.map