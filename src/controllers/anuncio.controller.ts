import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Anuncio from '../models/anuncio.model';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';
import { subirAdjuntos, eliminarAdjuntos } from '../utils/adjuntos';
import { abrirArchivo, eliminarArchivo } from '../services/storage';
import { eliminarSiNoReferenciados } from '../utils/referenciasArchivos';

// Bucket (GridFS) / prefijo de clave de los adjuntos de anuncios
const BUCKET_ANUNCIOS = 'anuncios_adjuntos';
import { escapeRegex } from '../utils/escapeRegex';
import pushNotificationService from '../services/pushNotification.service';
import { numeroPagina, numeroLimite } from '../utils/paginacion';

interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: string;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
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
      const pagina = numeroPagina(req.query.pagina);
      const limite = numeroLimite(req.query.limite, 10);
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

      // Notificar destinatarios (fire-and-forget)
      const rolesDestino: string[] = [];
      if ((anuncio as any).paraPadres) rolesDestino.push('ACUDIENTE');
      if ((anuncio as any).paraDocentes) rolesDestino.push('DOCENTE');
      if ((anuncio as any).paraEstudiantes) rolesDestino.push('ESTUDIANTE');
      if (rolesDestino.length === 0) rolesDestino.push('ACUDIENTE', 'DOCENTE', 'ESTUDIANTE');

      // Por la cola (Fase 4.3): lotes de ~50 usuarios, todos sus dispositivos, bloques de 500 tokens
      pushNotificationService
        .encolarPushFiltro(
          { escuelaId: req.user.escuelaId, tipo: { $in: rolesDestino } },
          {
            titulo: `Nuevo comunicado: ${anuncio.titulo}`,
            mensaje: 'Se ha publicado un nuevo comunicado en EducaNexo360',
            data: { tipo: 'anuncio', anuncioId: (anuncio._id as any).toString() },
          },
          { escuelaId: String(req.user.escuelaId) },
        )
        .catch((err) => console.error('[Anuncio] No se pudo encolar el push:', err));
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

      const adjuntos = (anuncio.archivosAdjuntos || []).map((a: any) => (a.toObject ? a.toObject() : a));
      await anuncio.deleteOne();

      // Fase 5.5: sus archivos se borran (solo si ningún otro documento los referencia, criterio 3.X). Antes quedaban
      // huérfanos en GridFS para siempre.
      await eliminarSiNoReferenciados(adjuntos, BUCKET_ANUNCIOS);

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

      // Fase 5.2: abrir desde su almacén (GridFS o S3 según la referencia) ANTES de fijar cabeceras
      const downloadStream = await abrirArchivo(archivo, BUCKET_ANUNCIOS);

      // IMPORTANTE: Establecer correctamente las cabeceras (idénticas a las de siempre)
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

      // Manejar errores del stream (el backend autoriza y hace stream: no se redirige a una URL firmada)
      downloadStream.on('error', (error) => {
        console.error('Error en stream de descarga:', error);
        if (!res.headersSent) {
          next(new ApiError(500, 'Error al leer el archivo'));
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

      // Fase 5.2: subida por la capa de almacenamiento. Si una subida falla, no deja huérfanos; los temporales
      // los borra limpiarTemporales (antes: subida en paralelo sin rollback y unlink manual)
      const nuevosAdjuntos = await subirAdjuntos(req.files as Express.Multer.File[], BUCKET_ANUNCIOS, String(req.user._id), {
        anuncioId: String(anuncio._id),
      });

      // Actualizar el anuncio con los nuevos adjuntos
      anuncio.archivosAdjuntos.push(...(nuevosAdjuntos as any[]));
      try {
        await anuncio.save();
      } catch (saveError) {
        // No se guardó: los recién subidos quedarían huérfanos (criterio 3.O)
        await eliminarAdjuntos(nuevosAdjuntos, BUCKET_ANUNCIOS);
        throw saveError;
      }

      res.json({
        success: true,
        data: anuncio.archivosAdjuntos,
        message: 'Archivos adjuntos añadidos exitosamente',
      });
    } catch (error) {
      // Los temporales los borra limpiarTemporales (3.Q)
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

      // Fase 5.2: primero se quita la referencia y DESPUÉS se borra el archivo (si el save falla, el archivo sigue
      // referenciado y no se pierde); el borrado es idempotente
      const [archivo] = anuncio.archivosAdjuntos.splice(archivoIndex, 1);
      await anuncio.save();
      try {
        await eliminarArchivo(archivo as any, BUCKET_ANUNCIOS);
      } catch (errorBorrado) {
        console.warn(`[Anuncios] No se pudo borrar el archivo ${archivoId} del almacén:`, errorBorrado);
      }

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
