// src/controllers/tarea.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Tarea from '../models/tarea.model';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';
import { GridFSBucket } from 'mongodb';
import * as fs from 'fs';

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

class TareaController {
  // ========================================
  // CREAR TAREA
  // ========================================
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const {
        titulo,
        descripcion,
        asignaturaId,
        cursoId,
        estudiantesIds,
        fechaLimite,
        tipo = 'INDIVIDUAL',
        prioridad = 'MEDIA',
        permiteTardias = true,
        calificacionMaxima,
        pesoEvaluacion,
      } = req.body;

      // Verificar que el curso existe y pertenece a la escuela
      const curso = await Curso.findOne({
        _id: cursoId,
        escuelaId: req.user.escuelaId,
      });

      if (!curso) {
        throw new ApiError(404, 'Curso no encontrado');
      }

      // Determinar los estudiantes a asignar
      let estudiantesParaAsignar: mongoose.Types.ObjectId[] = [];

      if (estudiantesIds && estudiantesIds.length > 0) {
        // Validar que los estudiantes existen y pertenecen al curso
        const estudiantesValidos = await Usuario.find({
          _id: { $in: estudiantesIds },
          escuelaId: req.user.escuelaId,
          tipo: 'ESTUDIANTE',
        });

        if (estudiantesValidos.length !== estudiantesIds.length) {
          throw new ApiError(400, 'Algunos estudiantes no son válidos');
        }

        estudiantesParaAsignar = estudiantesIds.map(
          (id: string) => new mongoose.Types.ObjectId(id)
        );
      } else {
        // Asignar a todos los estudiantes del curso
        estudiantesParaAsignar = curso.estudiantes.map(
          (id: any) => new mongoose.Types.ObjectId(id)
        );
      }

      // Crear entregas vacías para cada estudiante
      const entregas = estudiantesParaAsignar.map((estudianteId) => ({
        estudianteId,
        estado: 'PENDIENTE',
        archivos: [],
        intentos: 0,
      }));

      // Crear la tarea
      const nuevaTarea = await Tarea.create({
        titulo,
        descripcion,
        docenteId: req.user._id,
        asignaturaId,
        cursoId,
        estudiantesIds: estudiantesParaAsignar,
        fechaLimite,
        tipo,
        prioridad,
        permiteTardias,
        calificacionMaxima,
        pesoEvaluacion,
        archivosReferencia: [],
        vistas: [],
        entregas,
        estado: 'ACTIVA',
        escuelaId: req.user.escuelaId,
      });

      res.status(201).json({
        success: true,
        data: nuevaTarea,
        message: 'Tarea creada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // LISTAR TAREAS
  // ========================================
  async listar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const pagina = parseInt(req.query.pagina as string) || 1;
      const limite = parseInt(req.query.limite as string) || 10;
      const skip = (pagina - 1) * limite;

      const filters: any = { escuelaId: req.user.escuelaId };

      // Filtros según el rol
      if (req.user.tipo === 'DOCENTE') {
        filters.docenteId = req.user._id;
      } else if (req.user.tipo === 'ESTUDIANTE') {
        filters['entregas.estudianteId'] = req.user._id;
      }

      // Filtros adicionales
      if (req.query.cursoId) {
        filters.cursoId = req.query.cursoId;
      }

      if (req.query.asignaturaId) {
        filters.asignaturaId = req.query.asignaturaId;
      }

      if (req.query.estado) {
        filters.estado = req.query.estado;
      }

      if (req.query.prioridad) {
        filters.prioridad = req.query.prioridad;
      }

      // Búsqueda por texto
      if (req.query.busqueda) {
        const busqueda = req.query.busqueda as string;
        filters.$or = [
          { titulo: { $regex: busqueda, $options: 'i' } },
          { descripcion: { $regex: busqueda, $options: 'i' } },
        ];
      }

      const [tareas, total] = await Promise.all([
        Tarea.find(filters)
          .sort({ fechaLimite: 1, createdAt: -1 })
          .skip(skip)
          .limit(limite)
          .populate('docenteId', 'nombre apellidos')
          .populate('asignaturaId', 'nombre')
          .populate('cursoId', 'nombre nivel')
          .lean(),
        Tarea.countDocuments(filters),
      ]);

      res.json({
        success: true,
        data: tareas,
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

  // ========================================
  // OBTENER POR ID
  // ========================================
  async obtenerPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      })
        .populate('docenteId', 'nombre apellidos email')
        .populate('asignaturaId', 'nombre')
        .populate('cursoId', 'nombre nivel')
        .populate('entregas.estudianteId', 'nombre apellidos email');

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Actualizar estados de entregas
      tarea.actualizarEstadosEntregas();
      await tarea.save();

      // Si es estudiante, filtrar solo su entrega
      if (req.user.tipo === 'ESTUDIANTE') {
        const tareaObj = tarea.toObject();
        tareaObj.entregas = tareaObj.entregas.filter(
          (e: any) => e.estudianteId._id.toString() === req.user?._id
        );
        
        res.json({
          success: true,
          data: tareaObj,
        });
        return;
      }

      // Para docentes y admin, incluir estadísticas
      const estadisticas = tarea.obtenerEstadisticas();

      res.json({
        success: true,
        data: tarea,
        estadisticas,
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // ACTUALIZAR TAREA
  // ========================================
  async actualizar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)
      ) {
        throw new ApiError(403, 'No tienes permiso para editar esta tarea');
      }

      // Campos actualizables
      const {
        titulo,
        descripcion,
        fechaLimite,
        prioridad,
        permiteTardias,
        calificacionMaxima,
        pesoEvaluacion,
      } = req.body;

      if (titulo !== undefined) tarea.titulo = titulo;
      if (descripcion !== undefined) tarea.descripcion = descripcion;
      if (fechaLimite !== undefined) tarea.fechaLimite = new Date(fechaLimite);
      if (prioridad !== undefined) tarea.prioridad = prioridad;
      if (permiteTardias !== undefined) tarea.permiteTardias = permiteTardias;
      if (calificacionMaxima !== undefined) tarea.calificacionMaxima = calificacionMaxima;
      if (pesoEvaluacion !== undefined) tarea.pesoEvaluacion = pesoEvaluacion;

      await tarea.save();

      res.json({
        success: true,
        data: tarea,
        message: 'Tarea actualizada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // ELIMINAR TAREA
  // ========================================
  async eliminar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        req.user.tipo !== 'ADMIN'
      ) {
        throw new ApiError(403, 'No tienes permiso para eliminar esta tarea');
      }

      // Verificar si hay entregas
      const tieneEntregas = tarea.entregas.some((e: any) => e.fechaEntrega);

      if (tieneEntregas) {
        throw new ApiError(
          400,
          'No se puede eliminar una tarea que ya tiene entregas. Considere cancelarla.'
        );
      }

      await tarea.deleteOne();

      res.json({
        success: true,
        message: 'Tarea eliminada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // Continúa en el siguiente mensaje...
  // ========================================
  // CERRAR TAREA
  // ========================================
  async cerrar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)
      ) {
        throw new ApiError(403, 'No tienes permiso para cerrar esta tarea');
      }

      tarea.estado = 'CERRADA';
      tarea.actualizarEstadosEntregas();
      await tarea.save();

      res.json({
        success: true,
        data: tarea,
        message: 'Tarea cerrada exitosamente. No se permiten más entregas.',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // MARCAR TAREA COMO VISTA (ESTUDIANTE)
  // ========================================
  async marcarVista(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ESTUDIANTE') {
        throw new ApiError(403, 'Solo los estudiantes pueden marcar tareas como vistas');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
        'entregas.estudianteId': req.user._id,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada o no asignada a ti');
      }

      // Registrar la vista si no existe
      const yaVista = tarea.vistas.some(
        (v: any) => v.estudianteId.toString() === req.user?._id
      );

      if (!yaVista) {
        tarea.vistas.push({
          estudianteId: new mongoose.Types.ObjectId(req.user._id),
          fechaVista: new Date(),
        });

        // Actualizar estado de la entrega a VISTA
        const entrega = tarea.entregas.find(
          (e: any) => e.estudianteId.toString() === req.user?._id
        );

        if (entrega && entrega.estado === 'PENDIENTE') {
          entrega.estado = 'VISTA';
        }

        await tarea.save();
      }

      res.json({
        success: true,
        message: 'Tarea marcada como vista',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // ENTREGAR TAREA (ESTUDIANTE)
  // ========================================
  async entregar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ESTUDIANTE') {
        throw new ApiError(403, 'Solo los estudiantes pueden entregar tareas');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
        'entregas.estudianteId': req.user._id,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada o no asignada a ti');
      }

      if (tarea.estado !== 'ACTIVA') {
        throw new ApiError(400, 'Esta tarea ya no acepta entregas');
      }

      // Verificar fecha límite
      const ahora = new Date();
      const esAtrasada = ahora > tarea.fechaLimite;

      if (esAtrasada && !tarea.permiteTardias) {
        throw new ApiError(400, 'La fecha límite ha pasado y no se permiten entregas tardías');
      }

      // Verificar que se hayan subido archivos
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new ApiError(400, 'Debes subir al menos un archivo');
      }

      // Procesar archivos subidos con GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db as any, {
        bucketName: 'tareas_entregas',
      });

      const archivosSubidos = [];

      for (const file of req.files as Express.Multer.File[]) {
        const readStream = fs.createReadStream(file.path);
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            estudianteId: req.user._id,
            tareaId: req.params.id,
            contentType: file.mimetype,
          },
        });

        await new Promise((resolve, reject) => {
          readStream
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve);
        });

        archivosSubidos.push({
          fileId: uploadStream.id,
          nombre: file.originalname,
          tipo: file.mimetype,
          tamaño: file.size,
          fechaSubida: new Date(),
        });

        // Eliminar archivo temporal
        fs.unlinkSync(file.path);
      }

      // Encontrar y actualizar la entrega del estudiante
      const entrega = tarea.entregas.find(
        (e: any) => e.estudianteId.toString() === req.user?._id
      );

      if (!entrega) {
        throw new ApiError(404, 'Entrega no encontrada');
      }

      entrega.fechaEntrega = new Date();
      entrega.estado = esAtrasada ? 'ATRASADA' : 'ENTREGADA';
      entrega.archivos = archivosSubidos;
      entrega.comentarioEstudiante = req.body.comentarioEstudiante || '';
      entrega.intentos += 1;

      await tarea.save();

      res.json({
        success: true,
        data: entrega,
        message: esAtrasada 
          ? 'Tarea entregada (ATRASADA)' 
          : 'Tarea entregada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // VER MI ENTREGA (ESTUDIANTE)
  // ========================================
  async verMiEntrega(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ESTUDIANTE') {
        throw new ApiError(403, 'Solo los estudiantes pueden ver sus entregas');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
        'entregas.estudianteId': req.user._id,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      const miEntrega = tarea.entregas.find(
        (e: any) => e.estudianteId.toString() === req.user?._id
      );

      if (!miEntrega) {
        throw new ApiError(404, 'Entrega no encontrada');
      }

      res.json({
        success: true,
        data: miEntrega,
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // VER ENTREGAS (DOCENTE)
  // ========================================
  async verEntregas(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      }).populate('entregas.estudianteId', 'nombre apellidos email');

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)
      ) {
        throw new ApiError(403, 'No tienes permiso para ver las entregas');
      }

      // Actualizar estados
      tarea.actualizarEstadosEntregas();
      await tarea.save();

      const estadisticas = tarea.obtenerEstadisticas();

      res.json({
        success: true,
        data: tarea.entregas,
        estadisticas,
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // CALIFICAR ENTREGA (DOCENTE)
  // ========================================
  async calificarEntrega(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { calificacion, comentarioDocente } = req.body;

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)
      ) {
        throw new ApiError(403, 'No tienes permiso para calificar esta tarea');
      }

      // Encontrar la entrega
      const entrega = tarea.entregas.find(
        (e: any) => e._id?.toString() === req.params.entregaId
      );

      if (!entrega) {
        throw new ApiError(404, 'Entrega no encontrada');
      }

      // Validar que la calificación no exceda el máximo
      if (calificacion > tarea.calificacionMaxima) {
        throw new ApiError(
          400,
          `La calificación no puede ser mayor a ${tarea.calificacionMaxima}`
        );
      }

      // Validar que haya una entrega
      if (!entrega.fechaEntrega) {
        throw new ApiError(400, 'No se puede calificar una tarea que no ha sido entregada');
      }

      // Actualizar calificación
      entrega.calificacion = calificacion;
      entrega.comentarioDocente = comentarioDocente || '';
      entrega.fechaCalificacion = new Date();
      entrega.estado = 'CALIFICADA';

      await tarea.save();

      res.json({
        success: true,
        data: entrega,
        message: 'Entrega calificada exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // SUBIR ARCHIVOS DE REFERENCIA (DOCENTE)
  // ========================================
  async subirArchivosReferencia(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        throw new ApiError(400, 'No se han subido archivos');
      }

      const tarea = await Tarea.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        !['ADMIN', 'COORDINADOR', 'RECTOR'].includes(req.user.tipo)
      ) {
        throw new ApiError(403, 'No tienes permiso para subir archivos a esta tarea');
      }

      // Procesar archivos con GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db as any, {
        bucketName: 'tareas_referencias',
      });

      const archivosSubidos = [];

      for (const file of req.files as Express.Multer.File[]) {
        const readStream = fs.createReadStream(file.path);
        const uploadStream = bucket.openUploadStream(file.originalname, {
          metadata: {
            docenteId: req.user._id,
            tareaId: req.params.id,
            contentType: file.mimetype,
          },
        });

        await new Promise((resolve, reject) => {
          readStream
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', resolve);
        });

        archivosSubidos.push({
          fileId: uploadStream.id,
          nombre: file.originalname,
          tipo: file.mimetype,
          tamaño: file.size,
          fechaSubida: new Date(),
        });

        // Eliminar archivo temporal
        fs.unlinkSync(file.path);
      }

      // Agregar archivos a la tarea
      tarea.archivosReferencia.push(...archivosSubidos);
      await tarea.save();

      res.json({
        success: true,
        data: archivosSubidos,
        message: 'Archivos subidos exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // DESCARGAR ARCHIVO
  // ========================================
  async descargarArchivo(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id, archivoId } = req.params;
      const tipo = req.query.tipo as string; // 'referencia' o 'entrega'

      const tarea = await Tarea.findOne({
        _id: id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      let archivo: any;
      let bucketName: string;

      if (tipo === 'referencia') {
        archivo = tarea.archivosReferencia.find(
          (a: any) => a.fileId.toString() === archivoId
        );
        bucketName = 'tareas_referencias';
      } else if (tipo === 'entrega') {
        // Buscar en todas las entregas
        for (const entrega of tarea.entregas) {
          archivo = entrega.archivos.find(
            (a: any) => a.fileId.toString() === archivoId
          );
          if (archivo) break;
        }
        bucketName = 'tareas_entregas';
      } else {
        throw new ApiError(400, 'Tipo de archivo inválido');
      }

      if (!archivo) {
        throw new ApiError(404, 'Archivo no encontrado');
      }

      // Configurar GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db as any, {
        bucketName,
      });

      // Configurar headers
      res.setHeader('Content-Type', archivo.tipo);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(archivo.nombre)}"`
      );

      // Stream del archivo
      const downloadStream = bucket.openDownloadStream(
        new mongoose.Types.ObjectId(archivoId)
      );

      downloadStream.on('error', (error) => {
        console.error('Error en GridFS stream:', error);
        if (!res.headersSent) {
          next(new ApiError(500, 'Error al descargar el archivo'));
        }
      });

      downloadStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // ELIMINAR ARCHIVO DE REFERENCIA
  // ========================================
  async eliminarArchivoReferencia(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id, archivoId } = req.params;

      const tarea = await Tarea.findOne({
        _id: id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Verificar permisos
      if (
        tarea.docenteId.toString() !== req.user._id &&
        req.user.tipo !== 'ADMIN'
      ) {
        throw new ApiError(403, 'No tienes permiso para eliminar archivos de esta tarea');
      }

      // Encontrar el archivo
      const archivoIndex = tarea.archivosReferencia.findIndex(
        (a: any) => a.fileId.toString() === archivoId
      );

      if (archivoIndex === -1) {
        throw new ApiError(404, 'Archivo no encontrado');
      }

      // Eliminar de GridFS
      const db = mongoose.connection.db;
      const bucket = new GridFSBucket(db as any, {
        bucketName: 'tareas_referencias',
      });

      await bucket.delete(new mongoose.Types.ObjectId(archivoId));

      // Eliminar del array
      tarea.archivosReferencia.splice(archivoIndex, 1);
      await tarea.save();

      res.json({
        success: true,
        message: 'Archivo eliminado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // MIS TAREAS (ESTUDIANTE)
  // ========================================
  // ========================================
// MIS TAREAS (ESTUDIANTE)
// ========================================
async misTareas(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    if (req.user.tipo !== 'ESTUDIANTE') {
      throw new ApiError(403, 'Solo los estudiantes pueden ver sus tareas');
    }

    const filtroEstado = req.query.filtro as string; // 'pendientes', 'entregadas', 'calificadas'

    // 🔥 CORRECCIÓN: Buscar tareas ACTIVAS y CERRADAS
    const query: any = {
      escuelaId: req.user.escuelaId,
      estado: { $in: ['ACTIVA', 'CERRADA'] }, // ✅ Incluir tareas cerradas
      'entregas.estudianteId': req.user._id,
    };

    // 🔥 CORRECCIÓN: Aplicar filtros con $elemMatch para verificar estudiante específico
    if (filtroEstado === 'pendientes') {
      // ✅ CORREGIDO: Solo PENDIENTE y VISTA (sin ATRASADA)
      query.entregas = {
        $elemMatch: {
          estudianteId: req.user._id,
          estado: { $in: ['PENDIENTE', 'VISTA'] }
        }
      };
    } else if (filtroEstado === 'entregadas') {
      // ✅ CORREGIDO: Solo ENTREGADA y ATRASADA (sin CALIFICADA)
      query.entregas = {
        $elemMatch: {
          estudianteId: req.user._id,
          estado: { $in: ['ENTREGADA', 'ATRASADA'] },
          calificacion: { $exists: false } // Asegurar que no tenga calificación
        }
      };
    } else if (filtroEstado === 'calificadas') {
      query.entregas = {
        $elemMatch: {
          estudianteId: req.user._id,
          estado: 'CALIFICADA'
        }
      };
    }

    const tareas = await Tarea.find(query)
      .sort({ fechaLimite: 1 })
      .populate('docenteId', 'nombre apellidos')
      .populate('asignaturaId', 'nombre')
      .populate('cursoId', 'nombre')
      .lean();

    // Filtrar para mostrar solo la entrega del estudiante
    const tareasConMiEntrega = tareas.map((tarea: any) => {
      const miEntrega = tarea.entregas.find(
        (e: any) => e.estudianteId.toString() === req.user?._id
      );

      return {
        ...tarea,
        miEntrega,
        entregas: undefined, // No mostrar todas las entregas
      };
    });

    res.json({
      success: true,
      data: tareasConMiEntrega,
    });
  } catch (error) {
    next(error);
  }
}

  // ========================================
  // TAREAS DE UN ESTUDIANTE (ACUDIENTE)
  // ========================================
  async tareasEstudiante(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      if (req.user.tipo !== 'ACUDIENTE') {
        throw new ApiError(403, 'Solo los acudientes pueden ver tareas de estudiantes');
      }

      const estudianteId = req.params.estudianteId;

      // Verificar que el estudiante está asociado al acudiente
      const acudiente = await Usuario.findById(req.user._id);

      if (!acudiente) {
        throw new ApiError(404, 'Acudiente no encontrado');
      }

      const estudiantesAsociados =
        acudiente.info_academica?.estudiantes_asociados || [];

      const estaAsociado = estudiantesAsociados.some(
        (id: any) => id.toString() === estudianteId
      );

      if (!estaAsociado) {
        throw new ApiError(403, 'No tienes permiso para ver las tareas de este estudiante');
      }

      // Obtener tareas del estudiante
      const tareas = await Tarea.find({
        escuelaId: req.user.escuelaId,
        'entregas.estudianteId': estudianteId,
      })
        .sort({ fechaLimite: 1 })
        .populate('docenteId', 'nombre apellidos')
        .populate('asignaturaId', 'nombre')
        .populate('cursoId', 'nombre')
        .lean();

      // Filtrar para mostrar solo la entrega del estudiante
      const tareasConEntrega = tareas.map((tarea: any) => {
        const entregaEstudiante = tarea.entregas.find(
          (e: any) => e.estudianteId.toString() === estudianteId
        );

        return {
          ...tarea,
          entregaEstudiante,
          entregas: undefined,
        };
      });

      res.json({
        success: true,
        data: tareasConEntrega,
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // ESTADÍSTICAS (DOCENTE/ADMIN)
  // ========================================
  async estadisticas(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const filters: any = { escuelaId: req.user.escuelaId };

      if (req.user.tipo === 'DOCENTE') {
        filters.docenteId = req.user._id;
      }

      // Filtros opcionales
      if (req.query.cursoId) {
        filters.cursoId = req.query.cursoId;
      }

      if (req.query.asignaturaId) {
        filters.asignaturaId = req.query.asignaturaId;
      }

      const tareas = await Tarea.find(filters);

      let totalTareas = 0;
      let totalEntregas = 0;
      let entregasATiempo = 0;
      let entregasAtrasadas = 0;
      let tareasCalificadas = 0;
      let sumaCalificaciones = 0;
      let totalCalificaciones = 0;

      tareas.forEach((tarea) => {
        totalTareas++;
        tarea.entregas.forEach((entrega: any) => {
          totalEntregas++;

          if (entrega.fechaEntrega) {
            if (entrega.estado === 'ATRASADA') {
              entregasAtrasadas++;
            } else {
              entregasATiempo++;
            }
          }

          if (entrega.estado === 'CALIFICADA' && entrega.calificacion !== undefined) {
            tareasCalificadas++;
            sumaCalificaciones += entrega.calificacion;
            totalCalificaciones++;
          }
        });
      });

      const promedioGeneral =
        totalCalificaciones > 0 ? sumaCalificaciones / totalCalificaciones : 0;

      const porcentajeEntrega =
        totalEntregas > 0 ? ((entregasATiempo + entregasAtrasadas) / totalEntregas) * 100 : 0;

      res.json({
        success: true,
        data: {
          totalTareas,
          totalEntregas,
          entregasATiempo,
          entregasAtrasadas,
          tareasCalificadas,
          promedioGeneral: promedioGeneral.toFixed(2),
          porcentajeEntrega: porcentajeEntrega.toFixed(2),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ========================================
  // TAREAS PRÓXIMAS A VENCER
  // ========================================
  async proximasVencer(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const ahora = new Date();
      const proximosDias = new Date();
      proximosDias.setDate(proximosDias.getDate() + 3); // Próximos 3 días

      const query: any = {
        escuelaId: req.user.escuelaId,
        estado: 'ACTIVA',
        fechaLimite: { $gte: ahora, $lte: proximosDias },
      };

      if (req.user.tipo === 'DOCENTE') {
        query.docenteId = req.user._id;
      } else if (req.user.tipo === 'ESTUDIANTE') {
        query['entregas.estudianteId'] = req.user._id;
        query['entregas.estado'] = { $in: ['PENDIENTE', 'VISTA'] };
      }

      const tareas = await Tarea.find(query)
        .sort({ fechaLimite: 1 })
        .populate('docenteId', 'nombre apellidos')
        .populate('asignaturaId', 'nombre')
        .populate('cursoId', 'nombre')
        .limit(10)
        .lean();

      res.json({
        success: true,
        data: tareas,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new TareaController();