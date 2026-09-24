"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const escapeRegex_1 = require("../utils/escapeRegex");
const notificacion_service_1 = __importDefault(require("../services/notificacion.service"));
const INotificacion_1 = require("../interfaces/INotificacion");
const perfilPorRutas = (perfil) => {
    const datos = {};
    if (perfil && typeof perfil === 'object') {
        ['telefono', 'direccion', 'foto'].forEach((campo) => {
            const valor = perfil[campo];
            if (typeof valor === 'string')
                datos[`perfil.${campo}`] = valor;
        });
    }
    return datos;
};
class UsuarioController {
    async obtenerUsuarios(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tipoUsuario = req.query.tipo;
            const searchTerm = req.query.q;
            const query = { escuelaId: req.user.escuelaId };
            if (tipoUsuario) {
                query.tipo = tipoUsuario;
            }
            if (searchTerm) {
                query.$or = [
                    { nombre: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                    { apellidos: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                    { email: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                ];
            }
            const usuarios = await usuario_model_1.default.find(query).select('-password');
            res.json({
                success: true,
                data: usuarios,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerUsuario(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const solicitandoPropioUsuario = req.params.id === req.user._id;
            const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);
            let esHijoAsociado = false;
            if (req.user.tipo === 'ACUDIENTE') {
                const acudiente = await usuario_model_1.default.findById(req.user._id);
                const estudiantesAsociados = acudiente?.info_academica?.estudiantes_asociados || [];
                esHijoAsociado = estudiantesAsociados.some((estudianteId) => estudianteId.toString() === req.params.id);
            }
            if (!solicitandoPropioUsuario && !tieneRolAdministrativo && !esHijoAsociado) {
                throw new ApiError_1.default(403, 'No tienes permiso para ver este perfil');
            }
            const usuario = await usuario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }).select('-password');
            if (!usuario) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            if (usuario.tipo === 'ESTUDIANTE') {
                const curso = await curso_model_1.default.findOne({
                    escuelaId: usuario.escuelaId,
                    estudiantes: usuario._id,
                    estado: 'ACTIVO'
                }).select('_id nombre nivel grado grupo jornada');
                if (curso) {
                    const usuarioObj = usuario.toObject();
                    if (!usuarioObj.info_academica) {
                        usuarioObj.info_academica = {};
                    }
                    usuarioObj.info_academica.grado = {
                        _id: curso._id,
                        nombre: curso.nombre,
                        nivel: curso.nivel,
                        grado: curso.grado,
                        grupo: curso.grupo,
                        jornada: curso.jornada
                    };
                    res.json({
                        success: true,
                        data: usuarioObj,
                    });
                    return;
                }
            }
            res.json({
                success: true,
                data: usuario,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async actualizarUsuario(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const actualizandoPropioUsuario = req.params.id === req.user._id;
            const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);
            if (!actualizandoPropioUsuario && !tieneRolAdministrativo) {
                throw new ApiError_1.default(403, 'No tienes permiso para modificar este perfil');
            }
            if (!tieneRolAdministrativo && req.body.email !== req.user.email) {
                delete req.body.email;
            }
            if (req.body.email) {
                const usuarioActual = await usuario_model_1.default.findById(req.params.id);
                if (!usuarioActual) {
                    throw new ApiError_1.default(404, 'Usuario no encontrado');
                }
                if (usuarioActual.email !== req.body.email) {
                    const emailExistente = await usuario_model_1.default.findOne({
                        email: req.body.email,
                        escuelaId: req.user.escuelaId,
                        _id: { $ne: req.params.id },
                    });
                    if (emailExistente) {
                        throw new ApiError_1.default(400, 'El correo electrónico ya está en uso por otro usuario de esta escuela');
                    }
                }
            }
            let datosPermitidos = {};
            if (tieneRolAdministrativo) {
                const usuarioObjetivo = await usuario_model_1.default.findOne({
                    _id: req.params.id,
                    escuelaId: req.user.escuelaId,
                }).select('tipo');
                if (!usuarioObjetivo) {
                    throw new ApiError_1.default(404, 'Usuario no encontrado');
                }
                const esAdmin = req.user.tipo === 'ADMIN';
                if (usuarioObjetivo.tipo === 'ADMIN' && !esAdmin) {
                    throw new ApiError_1.default(403, 'No tienes permiso para modificar este perfil');
                }
                const { nombre, apellidos, email, estado, perfil, tipo, info_academica } = req.body;
                datosPermitidos = { nombre, apellidos, email, estado };
                Object.assign(datosPermitidos, perfilPorRutas(perfil));
                if (tipo !== undefined && tipo !== usuarioObjetivo.tipo) {
                    if (!esAdmin) {
                        throw new ApiError_1.default(403, 'No tienes permiso para cambiar el tipo de usuario');
                    }
                    datosPermitidos.tipo = tipo;
                }
                if (info_academica && typeof info_academica === 'object') {
                    ['grado', 'grupo', 'codigo_estudiante'].forEach((campo) => {
                        if (info_academica[campo] !== undefined) {
                            datosPermitidos[`info_academica.${campo}`] = info_academica[campo];
                        }
                    });
                    if (Array.isArray(info_academica.estudiantes_asociados)) {
                        const idsUnicos = [
                            ...new Set(info_academica.estudiantes_asociados.map((item) => String(item && typeof item === 'object' ? item._id : item))),
                        ];
                        if (idsUnicos.some((id) => !mongoose_1.default.isValidObjectId(id))) {
                            throw new ApiError_1.default(400, 'ID de estudiante asociado no válido');
                        }
                        const validos = await usuario_model_1.default.countDocuments({
                            _id: { $in: idsUnicos },
                            tipo: 'ESTUDIANTE',
                            escuelaId: req.user.escuelaId,
                        });
                        if (validos !== idsUnicos.length) {
                            throw new ApiError_1.default(400, 'Hay estudiantes asociados que no son válidos para esta escuela');
                        }
                        datosPermitidos['info_academica.estudiantes_asociados'] = idsUnicos;
                    }
                }
            }
            else {
                datosPermitidos = {
                    nombre: req.body.nombre,
                    apellidos: req.body.apellidos,
                    ...perfilPorRutas(req.body.perfil),
                };
            }
            const usuario = await usuario_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, datosPermitidos, { new: true, runValidators: true }).select('-password');
            if (!usuario) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            res.json({
                success: true,
                data: usuario,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async buscarUsuarios(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const searchTerm = req.query.q;
            const filter = {
                escuelaId: req.user.escuelaId,
                $or: [
                    { nombre: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                    { apellidos: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                    { email: new RegExp((0, escapeRegex_1.escapeRegex)(searchTerm), 'i') },
                ],
            };
            const usuarios = await usuario_model_1.default.find(filter).select('-password').limit(10);
            res.json({
                success: true,
                data: usuarios,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async cambiarPassword(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { passwordActual, nuevaPassword } = req.body;
            const usuario = await usuario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!usuario) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            const isPasswordMatch = await usuario.compararPassword(passwordActual);
            if (!isPasswordMatch) {
                throw new ApiError_1.default(400, 'La contraseña actual es incorrecta');
            }
            usuario.password = nuevaPassword;
            await usuario.save();
            res.json({
                success: true,
                message: 'Contraseña actualizada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async solicitarEliminacionCuenta(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { password, motivo } = req.body;
            if (!password) {
                throw new ApiError_1.default(400, 'La contraseña es requerida para eliminar la cuenta');
            }
            const usuario = await usuario_model_1.default.findOne({
                _id: req.user._id,
                escuelaId: req.user.escuelaId,
            });
            if (!usuario) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            const isPasswordMatch = await usuario.compararPassword(password);
            if (!isPasswordMatch) {
                throw new ApiError_1.default(400, 'La contraseña es incorrecta');
            }
            usuario.estado = 'INACTIVO';
            usuario.set('fcmToken', null);
            usuario.set('eliminacionCuenta', {
                solicitada: true,
                fecha: new Date(),
                motivo: motivo || undefined,
            });
            await usuario.save();
            try {
                const admins = await usuario_model_1.default.find({
                    escuelaId: req.user.escuelaId,
                    tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR'] },
                    estado: 'ACTIVO',
                }).select('_id');
                if (admins.length > 0) {
                    await notificacion_service_1.default.crearNotificacionMasiva({
                        usuarioIds: admins.map((a) => String(a._id)),
                        titulo: 'Solicitud de eliminación de cuenta',
                        mensaje: `${usuario.nombre} ${usuario.apellidos} (${usuario.email}) solicitó eliminar su cuenta y fue desactivado.${motivo ? ` Motivo: ${motivo}` : ''}`,
                        tipo: INotificacion_1.TipoNotificacion.SISTEMA,
                        escuelaId: req.user.escuelaId,
                        entidadId: String(usuario._id),
                        entidadTipo: 'Usuario',
                        enviarEmail: true,
                    });
                }
            }
            catch (notifError) {
                console.error('Error notificando solicitud de eliminación a admins:', notifError);
            }
            res.json({
                success: true,
                message: 'Solicitud de eliminación registrada. Tu cuenta ha sido desactivada y será eliminada por el colegio.',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarUsuario(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const tieneRolAdministrativo = ['ADMIN', 'RECTOR', 'COORDINADOR'].includes(req.user.tipo);
            if (!tieneRolAdministrativo) {
                throw new ApiError_1.default(403, 'No tienes permiso para eliminar usuarios');
            }
            const usuario = await usuario_model_1.default.findOneAndUpdate({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            }, { estado: 'INACTIVO' }, { new: true });
            if (!usuario) {
                throw new ApiError_1.default(404, 'Usuario no encontrado');
            }
            res.json({
                success: true,
                message: 'Usuario desactivado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerEstudiantesAsociados(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const acudiente = await usuario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!acudiente) {
                throw new ApiError_1.default(404, 'Acudiente no encontrado');
            }
            if (acudiente.tipo !== 'ACUDIENTE') {
                throw new ApiError_1.default(400, 'El usuario no es un acudiente');
            }
            const estudiantesIds = acudiente.info_academica?.estudiantes_asociados || [];
            const estudiantes = await usuario_model_1.default.find({
                _id: { $in: estudiantesIds },
                escuelaId: req.user.escuelaId,
            }).select('_id nombre apellidos email');
            res.json({
                success: true,
                data: estudiantes,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async asociarEstudiante(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { estudianteId } = req.body;
            if (!estudianteId) {
                throw new ApiError_1.default(400, 'ID de estudiante requerido');
            }
            const acudiente = await usuario_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!acudiente) {
                throw new ApiError_1.default(404, 'Acudiente no encontrado');
            }
            if (acudiente.tipo !== 'ACUDIENTE') {
                throw new ApiError_1.default(400, 'El usuario no es un acudiente');
            }
            const estudiante = await usuario_model_1.default.findOne({
                _id: estudianteId,
                tipo: 'ESTUDIANTE',
                escuelaId: req.user.escuelaId,
            });
            if (!estudiante) {
                throw new ApiError_1.default(404, 'Estudiante no encontrado');
            }
            const estudiantesAsociados = acudiente.info_academica?.estudiantes_asociados || [];
            if (estudiantesAsociados.some((id) => id.toString() === estudianteId)) {
                throw new ApiError_1.default(400, 'El estudiante ya está asociado a este acudiente');
            }
            let actualizacion;
            if (acudiente.info_academica) {
                actualizacion = await usuario_model_1.default.findOneAndUpdate({ _id: req.params.id, escuelaId: req.user.escuelaId }, { $push: { 'info_academica.estudiantes_asociados': estudianteId } }, { new: true });
            }
            else {
                actualizacion = await usuario_model_1.default.findOneAndUpdate({ _id: req.params.id, escuelaId: req.user.escuelaId }, {
                    $set: {
                        info_academica: {
                            estudiantes_asociados: [estudianteId],
                        },
                    },
                }, { new: true });
            }
            res.json({
                success: true,
                message: 'Estudiante asociado exitosamente',
                data: actualizacion,
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarAsociacionEstudiante(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const acudienteId = req.params.id;
            const estudianteId = req.params.estudianteId;
            const acudiente = await usuario_model_1.default.findOne({
                _id: acudienteId,
                escuelaId: req.user.escuelaId,
            });
            if (!acudiente) {
                throw new ApiError_1.default(404, 'Acudiente no encontrado');
            }
            if (acudiente.tipo !== 'ACUDIENTE') {
                throw new ApiError_1.default(400, 'El usuario no es un acudiente');
            }
            if (!acudiente.info_academica?.estudiantes_asociados?.some((id) => id.toString() === estudianteId)) {
                throw new ApiError_1.default(404, 'El estudiante no está asociado a este acudiente');
            }
            await usuario_model_1.default.findOneAndUpdate({ _id: acudienteId, escuelaId: req.user.escuelaId }, { $pull: { 'info_academica.estudiantes_asociados': estudianteId } });
            res.json({
                success: true,
                message: 'Asociación eliminada exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new UsuarioController();
//# sourceMappingURL=usuario.controller.js.map