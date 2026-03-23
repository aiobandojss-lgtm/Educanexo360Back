import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Anuncio from '../models/anuncio.model';
import ApiError from '../utils/ApiError';
import { GridFSBucket } from 'mongodb';
import * as fs from 'fs';
import { escapeRegex } from '../utils/escapeRegex';

interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
  };
}

class AnuncioController {
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const {
        titulo,
        contenido,
        paraEstudiantes = true,
        paraDocentes = false,
        paraPadres = true,
        destacado = false,
        estaPublicado = false,
      } = req.body;

      // Crear el nuevo anuncio
      const nuevoAnuncio = await Anuncio.create({
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
    } catch (error) {
      next(error);
    }
  }

  async obtenerTodos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Parámetros de paginación
      const pagina = parseInt(req.query.pagina as string) || 1;
      const limite = parseInt(req.query.limite as string) || 10;
      const skip = (pagina - 1) * limite;

      // Filtros
      const filters: any = { escuelaId: req.user.escuelaId };

      // Filtro por destacados
      if (req.query.soloDestacados === 'true') {
        filters.destacado = true;
      }

      // Filtro por estado de publicación
      if (req.query.soloPublicados === 'true') {
        filters.estaPublicado = true;
      }

      // Filtro por rol
      const paraRol = req.query.paraRol as string;
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

      // Búsqueda por texto
      if (req.query.busqueda) {
        const busqueda = req.query.busqueda as string;
        filters.$or = [
          { titulo: { $regex: escapeRegex(busqueda), $options: 'i' } },
          { contenido: { $regex: escapeRegex(busqueda), $options: 'i' } },
        ];
      }

      // Consulta a la base de datos
      const [anuncios, total] = await Promise.all([
        Anuncio.find(filters)
          .sort({ destacado: -1, fechaPublicacion: -1, createdAt: -1 })
          .skip(skip)
          .limit(limite)
          .populate('creador', 'nombre apellidos')
          .lean(),
        Anuncio.countDocuments(filters),
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
    } catch (error) {
      next(error);
    }
  }

  async obtenerPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const anuncio = await Anuncio.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate('creador', 'nombre apellidos');

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Registrar la lectura si el usuario no ha leído el anuncio antes
      const yaLeido = anuncio.lecturas.some(
        (lectura) => lectura.usuarioId.toString() === req.user?._id.toString(),
      );

      if (!yaLeido && req.user?._id) {
        anuncio.lecturas.push({
          usuarioId: new mongoose.Types.ObjectId(req.user._id),
          fechaLectura: new Date(),
        });
        await anuncio.save();
      }

      res.json({
        success: true,
        data: anuncio,
      });
    } catch (error) {
      next(error);
    }
  }

  async actualizar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const anuncio = await Anuncio.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Verificar permisos: solo el creador o un admin puede editar
      if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tienes permiso para editar este anuncio');
      }

      const {
        titulo,
        contenido,
        paraEstudiantes,
        paraDocentes,
        paraPadres,
        destacado,
        estaPublicado,
      } = req.body;

      // Actualizar campos
      if (titulo !== undefined) anuncio.titulo = titulo;
      if (contenido !== undefined) anuncio.contenido = contenido;
      if (paraEstudiantes !== undefined) anuncio.paraEstudiantes = paraEstudiantes;
      if (paraDocentes !== undefined) anuncio.paraDocentes = paraDocentes;
      if (paraPadres !== undefined) anuncio.paraPadres = paraPadres;
      if (destacado !== undefined) anuncio.destacado = destacado;

      // Si cambia el estado de publicación
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
    } catch (error) {
      next(error);
    }
  }

  async publicar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const anuncio = await Anuncio.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Verificar permisos: solo el creador o un admin puede publicar
      if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tienes permiso para publicar este anuncio');
      }

      // Actualizar estado
      anuncio.estaPublicado = true;
      anuncio.fechaPublicacion = new Date();
      await anuncio.save();

      res.json({
        success: true,
        data: anuncio,
        message: 'Anuncio publicado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async eliminar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const anuncio = await Anuncio.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Verificar permisos: solo el creador o un admin puede eliminar
      if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tienes permiso para eliminar este anuncio');
      }

      await anuncio.deleteOne();

      // TODO: Eliminar archivos adjuntos de GridFS si es necesario

      res.json({
        success: true,
        message: 'Anuncio eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async obtenerAdjunto(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id, archivoId } = req.params;

      const anuncio = await Anuncio.findOne({
        _id: id,
        escuelaId: req.user.escuelaId,
        'archivosAdjuntos.fileId': new mongoose.Types.ObjectId(archivoId),
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio o archivo adjunto no encontrado');
      }

      // Encontrar el archivo en el anuncio
      const archivo = anuncio.archivosAdjuntos.find((adj) => adj.fileId.toString() === archivoId);

      if (!archivo) {
        throw new ApiError(404, 'Archivo adjunto no encontrado');
      }

      // Configurar GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db as any, {
        bucketName: 'anuncios_adjuntos',
      });

      // IMPORTANTE: Establecer correctamente las cabeceras
      // Establecer el tipo MIME
      res.setHeader('Content-Type', archivo.tipo);

      // Establecer la disposición como "attachment" para forzar descarga
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(archivo.nombre)}"`,
      );

      // Desactivar el almacenamiento en caché para evitar problemas
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Buscar el archivo en GridFS y transmitirlo
      const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(archivoId));

      // Manejar errores del stream
      downloadStream.on('error', (error) => {
        console.error('Error en GridFS stream:', error);
        if (!res.headersSent) {
          next(new ApiError(500, 'Error al leer el archivo desde GridFS'));
        }
      });

      // Transmitir el archivo al cliente
      downloadStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  async agregarAdjuntos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que existan archivos
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new ApiError(400, 'No se han subido archivos');
      }

      const anuncio = await Anuncio.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Verificar permisos: solo el creador o un admin puede añadir archivos
      if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tienes permiso para modificar este anuncio');
      }

      // Configurar GridFS para cargar los archivos desde disco
      const db = mongoose.connection.db;
      if (!db) {
        throw new ApiError(500, 'Error de conexión a la base de datos');
      }
      const bucket = new GridFSBucket(db as any, {
        bucketName: 'anuncios_adjuntos',
      });

      // Procesar cada archivo: subirlo a GridFS y luego eliminarlo del disco
      const filePromises = (req.files as Express.Multer.File[]).map(async (file) => {
        // Crear un stream de lectura del archivo en disco
        const fileStream = fs.createReadStream(file.path);

        // Crear un stream de escritura a GridFS
        const uploadStream = bucket.openUploadStream(file.originalname, {
          contentType: file.mimetype,
        });

        // Conectar los streams y esperar a que termine la subida
        return new Promise<any>((resolve, reject) => {
          fileStream
            .pipe(uploadStream)
            .on('error', (error) => {
              reject(error);
            })
            .on('finish', () => {
              // Eliminar el archivo temporal
              fs.unlinkSync(file.path);

              // Retornar los datos del archivo
              resolve({
                fileId: uploadStream.id,
                nombre: file.originalname,
                tipo: file.mimetype,
                tamaño: file.size,
              });
            });
        });
      });

      // Esperar a que todos los archivos se suban a GridFS
      const nuevosAdjuntos = await Promise.all(filePromises);

      // Actualizar el anuncio con los nuevos adjuntos
      anuncio.archivosAdjuntos.push(...nuevosAdjuntos);
      await anuncio.save();

      res.json({
        success: true,
        data: anuncio.archivosAdjuntos,
        message: 'Archivos adjuntos añadidos exitosamente',
      });
    } catch (error) {
      // Limpiar archivos temporales en caso de error
      if (req.files && Array.isArray(req.files)) {
        (req.files as Express.Multer.File[]).forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }
      next(error);
    }
  }

  async eliminarAdjunto(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id, archivoId } = req.params;

      const anuncio = await Anuncio.findOne({
        _id: id,
        escuelaId: req.user.escuelaId,
      });

      if (!anuncio) {
        throw new ApiError(404, 'Anuncio no encontrado');
      }

      // Verificar permisos: solo el creador o un admin puede eliminar archivos
      if (anuncio.creador.toString() !== req.user._id.toString() && req.user.tipo !== 'ADMIN') {
        throw new ApiError(403, 'No tienes permiso para modificar este anuncio');
      }

      // Encontrar el índice del archivo
      const archivoIndex = anuncio.archivosAdjuntos.findIndex(
        (adj) => adj.fileId.toString() === archivoId,
      );

      if (archivoIndex === -1) {
        throw new ApiError(404, 'Archivo adjunto no encontrado');
      }

      try {
        // Configurar GridFS para eliminar el archivo
        const db = mongoose.connection.db;
        if (!db) {
          throw new ApiError(500, 'Error de conexión a la base de datos');
        }
        const bucket = new GridFSBucket(db, {
          bucketName: 'anuncios_adjuntos',
        });

        // Eliminar el archivo de GridFS
        await bucket.delete(new mongoose.Types.ObjectId(archivoId));
      } catch (error: unknown) {
        // Manejo elegante si el archivo ya fue eliminado de GridFS
        if (error instanceof Error && error.message.includes('FileNotFound')) {
          console.warn(
            `Archivo ${archivoId} no encontrado en GridFS, continuando con la eliminación de la referencia`,
          );
        } else {
          throw error;
        }
      }

      // Eliminar la referencia del anuncio
      anuncio.archivosAdjuntos.splice(archivoIndex, 1);
      await anuncio.save();

      res.json({
        success: true,
        message: 'Archivo adjunto eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AnuncioController();
