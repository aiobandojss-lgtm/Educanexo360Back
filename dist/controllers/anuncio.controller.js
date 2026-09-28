"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const anuncio_model_1 = __importDefault(require("../models/anuncio.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const adjuntos_1 = require("../utils/adjuntos");
const storage_1 = require("../services/storage");
const referenciasArchivos_1 = require("../utils/referenciasArchivos");
const BUCKET_ANUNCIOS = 'anuncios_adjuntos';
const soloPublicados = (tipo) => !((0, accesoAcademico_1.esRolAdministrativo)(tipo) || tipo === 'DOCENTE' || tipo === 'SUPER_ADMIN');
const escapeRegex_1 = require("../utils/escapeRegex");
const pushNotification_service_1 = __importDefault(require("../services/pushNotification.service"));
const paginacion_1 = require("../utils/paginacion");
const accesoAcademico_1 = require("../utils/accesoAcademico");
const enviarArchivo_1 = require("../utils/enviarArchivo");
class AnuncioController {
    async crear(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { titulo, contenido, paraEstudiantes = true, paraDocentes = false, paraPadres = true, destacado = false, estaPublicado = false, } = req.body;
            const nuevoAnuncio = await anuncio_model_1.default.create({
                titulo,
                contenido,
                creador: req.user._id,
                escuelaId: req.user.escuelaId,
                paraEstudiantes,
                paraDocentes,
                paraPadres,
                destacado,
                estaPublicado,
                fechaPublicacion: estaPublicado ? new Date() : null,
                archivosAdjuntos: [],
                lecturas: [],
            });
            res.status(201).json({
                success: true,
                data: nuevoAnuncio,
                message: 'Anuncio creado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerTodos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const pagina = (0, paginacion_1.numeroPagina)(req.query.pagina);
            const limite = (0, paginacion_1.numeroLimite)(req.query.limite, 10);
            const skip = (pagina - 1) * limite;
            const filters = { escuelaId: req.user.escuelaId };
            if (req.query.soloDestacados === 'true') {
                filters.destacado = true;
            }
            if (req.query.soloPublicados === 'true' || soloPublicados(req.user.tipo)) {
                filters.estaPublicado = true;
            }
            const paraRol = req.query.paraRol;
            if (paraRol) {
                switch (paraRol) {
                    case 'ESTUDIANTE':
                        filters.paraEstudiantes = true;
                        break;
                    case 'DOCENTE':
                        filters.paraDocentes = true;
                        break;
                    case 'PADRE':
                        filters.paraPadres = true;
                        break;
                }
            }
            if (req.query.busqueda) {
                const busqueda = req.query.busqueda;
                filters.$or = [
                    { titulo: { $regex: (0, escapeRegex_1.escapeRegex)(busqueda), $options: 'i' } },
                    { contenido: { $regex: (0, escapeRegex_1.escapeRegex)(busqueda), $options: 'i' } },
                ];
            }
            const [anuncios, total] = await Promise.all([
                anuncio_model_1.default.find(filters)
                    .sort({ destacado: -1, fechaPublicacion: -1, createdAt: -1 })
                    .skip(skip)
                    .limit(limite)
                    .populate('creador', 'nombre apellidos')
                    .lean(),
                anuncio_model_1.default.countDocuments(filters),
            ]);
            res.json({
                success: true,
                data: anuncios,
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
            const anuncio = await anuncio_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
                ...(soloPublicados(req.user.tipo) && { estaPublicado: true }),
            }).populate('creador', 'nombre apellidos');
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            const yaLeido = anuncio.lecturas.some((lectura) => lectura.usuarioId.toString() === req.user?._id.toString());
            if (!yaLeido && req.user?._id) {
                anuncio.lecturas.push({
                    usuarioId: new mongoose_1.default.Types.ObjectId(req.user._id),
                    fechaLectura: new Date(),
                });
                await anuncio.save();
            }
            res.json({
                success: true,
                data: anuncio,
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
            const anuncio = await anuncio_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para editar este anuncio');
            }
            const { titulo, contenido, paraEstudiantes, paraDocentes, paraPadres, destacado, estaPublicado, } = req.body;
            if (titulo !== undefined)
                anuncio.titulo = titulo;
            if (contenido !== undefined)
                anuncio.contenido = contenido;
            if (paraEstudiantes !== undefined)
                anuncio.paraEstudiantes = paraEstudiantes;
            if (paraDocentes !== undefined)
                anuncio.paraDocentes = paraDocentes;
            if (paraPadres !== undefined)
                anuncio.paraPadres = paraPadres;
            if (destacado !== undefined)
                anuncio.destacado = destacado;
            if (estaPublicado !== undefined && estaPublicado !== anuncio.estaPublicado) {
                anuncio.estaPublicado = estaPublicado;
                if (estaPublicado) {
                    anuncio.fechaPublicacion = new Date();
                }
            }
            await anuncio.save();
            res.json({
                success: true,
                data: anuncio,
                message: 'Anuncio actualizado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async publicar(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const anuncio = await anuncio_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para publicar este anuncio');
            }
            anuncio.estaPublicado = true;
            anuncio.fechaPublicacion = new Date();
            await anuncio.save();
            res.json({
                success: true,
                data: anuncio,
                message: 'Anuncio publicado exitosamente',
            });
            const rolesDestino = [];
            if (anuncio.paraPadres)
                rolesDestino.push('ACUDIENTE');
            if (anuncio.paraDocentes)
                rolesDestino.push('DOCENTE');
            if (anuncio.paraEstudiantes)
                rolesDestino.push('ESTUDIANTE');
            if (rolesDestino.length === 0)
                rolesDestino.push('ACUDIENTE', 'DOCENTE', 'ESTUDIANTE');
            pushNotification_service_1.default
                .encolarPushFiltro({ escuelaId: req.user.escuelaId, tipo: { $in: rolesDestino } }, {
                titulo: `Nuevo comunicado: ${anuncio.titulo}`,
                mensaje: 'Se ha publicado un nuevo comunicado en EducaNexo360',
                data: { tipo: 'anuncio', anuncioId: anuncio._id.toString() },
            }, { escuelaId: String(req.user.escuelaId) })
                .catch((err) => console.error('[Anuncio] No se pudo encolar el push:', err));
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
            const anuncio = await anuncio_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para eliminar este anuncio');
            }
            const adjuntos = (anuncio.archivosAdjuntos || []).map((a) => (a.toObject ? a.toObject() : a));
            await anuncio.deleteOne();
            await (0, referenciasArchivos_1.eliminarSiNoReferenciados)(adjuntos, BUCKET_ANUNCIOS);
            res.json({
                success: true,
                message: 'Anuncio eliminado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async obtenerAdjunto(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id, archivoId } = req.params;
            const anuncio = await anuncio_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
                'archivosAdjuntos.fileId': new mongoose_1.default.Types.ObjectId(archivoId),
                ...(soloPublicados(req.user.tipo) && { estaPublicado: true }),
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio o archivo adjunto no encontrado');
            }
            const archivo = anuncio.archivosAdjuntos.find((adj) => adj.fileId.toString() === archivoId);
            if (!archivo) {
                throw new ApiError_1.default(404, 'Archivo adjunto no encontrado');
            }
            const downloadStream = await (0, storage_1.abrirArchivo)(archivo, BUCKET_ANUNCIOS);
            res.setHeader('Content-Type', archivo.tipo);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo.nombre)}"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            (0, enviarArchivo_1.enviarArchivo)(downloadStream, res, next, 'Error al leer el archivo');
        }
        catch (error) {
            next(error);
        }
    }
    async agregarAdjuntos(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
                throw new ApiError_1.default(400, 'No se han subido archivos');
            }
            const anuncio = await anuncio_model_1.default.findOne({
                _id: req.params.id,
                escuelaId: req.user.escuelaId,
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para modificar este anuncio');
            }
            const nuevosAdjuntos = await (0, adjuntos_1.subirAdjuntos)(req.files, BUCKET_ANUNCIOS, String(req.user._id), {
                anuncioId: String(anuncio._id),
            });
            anuncio.archivosAdjuntos.push(...nuevosAdjuntos);
            try {
                await anuncio.save();
            }
            catch (saveError) {
                await (0, adjuntos_1.eliminarAdjuntos)(nuevosAdjuntos, BUCKET_ANUNCIOS);
                throw saveError;
            }
            res.json({
                success: true,
                data: anuncio.archivosAdjuntos,
                message: 'Archivos adjuntos añadidos exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
    async eliminarAdjunto(req, res, next) {
        try {
            if (!req.user) {
                throw new ApiError_1.default(401, 'No autorizado');
            }
            const { id, archivoId } = req.params;
            const anuncio = await anuncio_model_1.default.findOne({
                _id: id,
                escuelaId: req.user.escuelaId,
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio no encontrado');
            }
            if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
                throw new ApiError_1.default(403, 'No tienes permiso para modificar este anuncio');
            }
            const archivoIndex = anuncio.archivosAdjuntos.findIndex((adj) => adj.fileId.toString() === archivoId);
            if (archivoIndex === -1) {
                throw new ApiError_1.default(404, 'Archivo adjunto no encontrado');
            }
            const [archivo] = anuncio.archivosAdjuntos.splice(archivoIndex, 1);
            await anuncio.save();
            try {
                await (0, storage_1.eliminarArchivo)(archivo, BUCKET_ANUNCIOS);
            }
            catch (errorBorrado) {
                console.warn(`[Anuncios] No se pudo borrar el archivo ${archivoId} del almacén:`, errorBorrado);
            }
            res.json({
                success: true,
                message: 'Archivo adjunto eliminado exitosamente',
            });
        }
        catch (error) {
            next(error);
        }
    }
}
exports.default = new AnuncioController();
//# sourceMappingURL=anuncio.controller.js.map