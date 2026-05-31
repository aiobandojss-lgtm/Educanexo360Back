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
const mongoose_1 = __importDefault(require("mongoose"));
const anuncio_model_1 = __importDefault(require("../models/anuncio.model"));
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const mongodb_1 = require("mongodb");
const fs = __importStar(require("fs"));
const escapeRegex_1 = require("../utils/escapeRegex");
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
            const pagina = parseInt(req.query.pagina) || 1;
            const limite = parseInt(req.query.limite) || 10;
            const skip = (pagina - 1) * limite;
            const filters = { escuelaId: req.user.escuelaId };
            if (req.query.soloDestacados === 'true') {
                filters.destacado = true;
            }
            if (req.query.soloPublicados === 'true') {
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
            await anuncio.deleteOne();
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
            });
            if (!anuncio) {
                throw new ApiError_1.default(404, 'Anuncio o archivo adjunto no encontrado');
            }
            const archivo = anuncio.archivosAdjuntos.find((adj) => adj.fileId.toString() === archivoId);
            if (!archivo) {
                throw new ApiError_1.default(404, 'Archivo adjunto no encontrado');
            }
            const db = mongoose_1.default.connection.db;
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName: 'anuncios_adjuntos',
            });
            res.setHeader('Content-Type', archivo.tipo);
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(archivo.nombre)}"`);
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            const downloadStream = bucket.openDownloadStream(new mongoose_1.default.Types.ObjectId(archivoId));
            downloadStream.on('error', (error) => {
                console.error('Error en GridFS stream:', error);
                if (!res.headersSent) {
                    next(new ApiError_1.default(500, 'Error al leer el archivo desde GridFS'));
                }
            });
            downloadStream.pipe(res);
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
            const db = mongoose_1.default.connection.db;
            if (!db) {
                throw new ApiError_1.default(500, 'Error de conexión a la base de datos');
            }
            const bucket = new mongodb_1.GridFSBucket(db, {
                bucketName: 'anuncios_adjuntos',
            });
            const filePromises = req.files.map(async (file) => {
                const fileStream = fs.createReadStream(file.path);
                const uploadStream = bucket.openUploadStream(file.originalname, {
                    contentType: file.mimetype,
                });
                return new Promise((resolve, reject) => {
                    fileStream
                        .pipe(uploadStream)
                        .on('error', (error) => {
                        reject(error);
                    })
                        .on('finish', () => {
                        fs.unlinkSync(file.path);
                        resolve({
                            fileId: uploadStream.id,
                            nombre: file.originalname,
                            tipo: file.mimetype,
                            tamaño: file.size,
                        });
                    });
                });
            });
            const nuevosAdjuntos = await Promise.all(filePromises);
            anuncio.archivosAdjuntos.push(...nuevosAdjuntos);
            await anuncio.save();
            res.json({
                success: true,
                data: anuncio.archivosAdjuntos,
                message: 'Archivos adjuntos añadidos exitosamente',
            });
        }
        catch (error) {
            if (req.files && Array.isArray(req.files)) {
                req.files.forEach((file) => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                });
            }
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
            try {
                const db = mongoose_1.default.connection.db;
                if (!db) {
                    throw new ApiError_1.default(500, 'Error de conexión a la base de datos');
                }
                const bucket = new mongodb_1.GridFSBucket(db, {
                    bucketName: 'anuncios_adjuntos',
                });
                await bucket.delete(new mongoose_1.default.Types.ObjectId(archivoId));
            }
            catch (error) {
                if (error instanceof Error && error.message.includes('FileNotFound')) {
                    console.warn(`Archivo ${archivoId} no encontrado en GridFS, continuando con la eliminación de la referencia`);
                }
                else {
                    throw error;
                }
            }
            anuncio.archivosAdjuntos.splice(archivoIndex, 1);
            await anuncio.save();
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