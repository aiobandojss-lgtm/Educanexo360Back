// src/controllers/calendario.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import EventoCalendario from '../models/calendario.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import gridfsManager from '../config/gridfs';
import fs from 'fs';
import path from 'path';
import { EstadoEvento } from '../interfaces/ICalendario';
import pushNotificationService from '../services/pushNotification.service';
import { logger } from '../utils/logger';
import { contentDispositionAdjunto } from '../utils/contentDisposition';

// Campos editables de un evento (lista blanca: escuelaId, creadorId y archivoAdjunto nunca vienen del cliente)
const CAMPOS_EVENTO = [
  'titulo',
  'descripcion',
  'fechaInicio',
  'fechaFin',
  'todoElDia',
  'lugar',
  'tipo',
  'color',
  'cursoId',
  'invitados',
  'recordatorios',
  'estado',
];

const tomarCamposEvento = (body: any): Record<string, any> => {
  const datos: Record<string, any> = {};
  CAMPOS_EVENTO.forEach((campo) => {
    if (body?.[campo] !== undefined) datos[campo] = body[campo];
  });
  return datos;
};

// Multer llena req.file con .single('archivo'); se acepta también req.files por compatibilidad
const archivoSubido = (req: any): Express.Multer.File | undefined =>
  req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined);

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
  files?: Express.Multer.File[];
}

/**
 * Push a todos los usuarios del colegio cuando un evento queda publicado (ACTIVO). Fire-and-forget.
 * Se usa al crear un evento ACTIVO y cuando un evento pasa a ACTIVO (PATCH /estado o PUT con estado).
 */
const notificarEventoPublicado = (
  evento: { _id: unknown; titulo?: string; fechaInicio?: Date | string },
  escuelaId: string,
): void => {
  const titulo = evento.titulo || 'Nuevo evento';
  const fechaStr = evento.fechaInicio ? new Date(evento.fechaInicio).toLocaleDateString('es-CO') : '';
  Usuario.find({ escuelaId, fcmToken: { $exists: true, $ne: null } }, { fcmToken: 1 })
    .then((usuarios: any[]) => {
      const tokens = usuarios.map((u) => u.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        pushNotificationService
          .enviarNotificacionMasiva({
            tokens,
            titulo: `Nuevo evento: ${titulo}`,
            mensaje: fechaStr ? `Fecha: ${fechaStr}` : 'Se ha creado un nuevo evento en el calendario',
            data: { tipo: 'evento', eventoId: String(evento._id) },
          })
          .catch(() => {/* silencioso */});
      }
    })
    .catch(() => {/* silencioso */});
};

class CalendarioController {
  // Crear un nuevo evento
  async crearEvento(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const eventoData: any = {
        ...tomarCamposEvento(req.body),
        escuelaId: req.user.escuelaId,
        creadorId: req.user._id,
      };

      // El curso (si se indica) debe ser del colegio
      if (eventoData.cursoId) {
        const cursoValido = await Curso.exists({ _id: eventoData.cursoId, escuelaId: req.user.escuelaId });
        if (!cursoValido) {
          throw new ApiError(400, 'Curso no válido');
        }
      }

      // Verificar si hay un archivo adjunto
      const archivoCrear = archivoSubido(req);
      if (archivoCrear) {
        const file = archivoCrear;
        const bucket = gridfsManager.getBucket();

        if (!bucket) {
          throw new ApiError(500, 'Servicio de archivos no disponible');
        }

        // Subir archivo a GridFS
        const filename = file.filename || path.basename(file.path);
        const uploadStream = bucket.openUploadStream(filename, {
          metadata: {
            originalName: file.originalname,
            contentType: file.mimetype,
            size: file.size,
            uploadedBy: req.user._id,
          },
        });

        const fileContent = fs.readFileSync(file.path);
        // Esperar a que GridFS termine de escribir (antes se respondía antes de que existiera el archivo)
        await new Promise((resolve, reject) => {
          uploadStream.once('finish', resolve).once('error', reject);
          uploadStream.end(fileContent);
        });

        eventoData.archivoAdjunto = {
          fileId: uploadStream.id,
          nombre: file.originalname,
          tipo: file.mimetype,
          tamaño: file.size,
        };

        // Limpiar archivo temporal
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          console.error('Error deleting temporary file:', error);
        }
      }

      // Procesar fechas - MODIFICADO para mejor manejo de zonas horarias
      if (eventoData.fechaInicio) {
        eventoData.fechaInicio = new Date(eventoData.fechaInicio);
        logger.debug(`Fecha inicio recibida: ${eventoData.fechaInicio}`);
        logger.debug(`Fecha inicio procesada: ${new Date(eventoData.fechaInicio).toISOString()}`);
      }

      if (eventoData.fechaFin) {
        eventoData.fechaFin = new Date(eventoData.fechaFin);
        logger.debug(`Fecha fin recibida: ${eventoData.fechaFin}`);
        logger.debug(`Fecha fin procesada: ${new Date(eventoData.fechaFin).toISOString()}`);
      }

      // Procesar invitados
      if (eventoData.invitados && typeof eventoData.invitados === 'string') {
        try {
          eventoData.invitados = JSON.parse(eventoData.invitados);
        } catch (error) {
          throw new ApiError(400, 'Formato de invitados inválido');
        }
      }

      // Procesar recordatorios
      if (eventoData.recordatorios && typeof eventoData.recordatorios === 'string') {
        try {
          eventoData.recordatorios = JSON.parse(eventoData.recordatorios);
        } catch (error) {
          throw new ApiError(400, 'Formato de recordatorios inválido');
        }
      }

      const evento = (await EventoCalendario.create(eventoData)) as any;

      const eventoPopulado = await EventoCalendario.findById(evento._id)
        .populate('creadorId', 'nombre apellidos email tipo')
        .populate('cursoId', 'nombre nivel');

      res.status(201).json({
        success: true,
        data: eventoPopulado,
      });

      // Notificar a todos los usuarios de la escuela solo si el evento quedó publicado (ACTIVO)
      if (evento.estado === EstadoEvento.ACTIVO) {
        notificarEventoPublicado(evento, req.user!.escuelaId);
      }
    } catch (error) {
      next(error);
    }
  }

  // 🚨 FUNCIÓN PRINCIPAL MODIFICADA - Obtener eventos con filtrado automático
  async obtenerEventos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { inicio, fin, cursoId, tipo, estado } = req.query;

      logger.debug('🔍 DEPURACIÓN - Parámetros de consulta:', {
        inicio,
        fin,
        cursoId,
        tipo,
        estado,
        userType: req.user.tipo,
        userId: req.user._id,
        escuelaId: req.user.escuelaId,
      });

      // Construir la consulta base
      const pipeline: mongoose.PipelineStage[] = [
        { $match: { escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId.toString()) } },
      ];

      // 🚨 FILTRADO SIMPLIFICADO Y CLARO
      if (
        req.user.tipo === 'ESTUDIANTE' ||
        req.user.tipo === 'PADRE' ||
        req.user.tipo === 'ACUDIENTE'
      ) {
        // Estudiantes, padres y acudientes SOLO ven eventos ACTIVOS
        pipeline.push({ $match: { estado: 'ACTIVO' } });
        logger.debug('✅ Usuario estudiante/padre/acudiente - SOLO eventos ACTIVOS');
      } else {
        // Administradores y docentes
        logger.debug('🔍 Filtro de estado recibido:', estado);

        if (estado === 'ACTIVO') {
          pipeline.push({ $match: { estado: 'ACTIVO' } });
          logger.debug('✅ Filtrando: SOLO eventos ACTIVOS');
        } else if (estado === 'PENDIENTE') {
          pipeline.push({ $match: { estado: 'PENDIENTE' } });
          logger.debug('✅ Filtrando: SOLO eventos PENDIENTES');
        } else if (estado === 'CANCELADO') {
          pipeline.push({ $match: { estado: 'CANCELADO' } });
          logger.debug('✅ Filtrando: SOLO eventos CANCELADOS');
        } else if (estado === 'ALL') {
          // 🚨 CRÍTICO: NO aplicar NINGÚN filtro de estado para mostrar TODOS
          logger.debug(
            '✅ TODOS: Sin filtro de estado - Mostrando ACTIVOS + PENDIENTES + CANCELADOS',
          );
        } else {
          // Por defecto (vacío o cualquier otra cosa): SOLO ACTIVOS
          pipeline.push({ $match: { estado: 'ACTIVO' } });
          logger.debug('✅ Por defecto: SOLO eventos ACTIVOS');
        }
      }

      // Aplicar filtros básicos
      if (cursoId) {
        pipeline.push({ $match: { cursoId: new mongoose.Types.ObjectId(cursoId.toString()) } });
      }

      if (tipo) {
        pipeline.push({ $match: { tipo: tipo } });
      }

      // Aplicar filtro de fechas
      if (inicio || fin) {
        const fechaMatch: any = {};

        if (inicio) {
          const fechaInicio = new Date(inicio as string);
          fechaMatch.fechaFin = { $gte: fechaInicio };
          logger.debug(`Filtro inicio: ${fechaInicio.toISOString()}`);
        }

        if (fin) {
          const fechaFin = new Date(fin as string);
          if (!fechaMatch.fechaInicio) fechaMatch.fechaInicio = {};
          fechaMatch.fechaInicio.$lte = fechaFin;
          logger.debug(`Filtro fin: ${fechaFin.toISOString()}`);
        }

        pipeline.push({ $match: fechaMatch });
        logger.debug('Filtro de fechas aplicado:', JSON.stringify(fechaMatch));
      }

      // Aplicar filtros específicos según el rol DESPUÉS de los filtros de estado
      if (req.user.tipo === 'ESTUDIANTE') {
        const cursos = await Curso.find({ estudiantes: req.user._id }).select<{
          _id: mongoose.Types.ObjectId;
        }>('_id');
        const cursoIds = cursos.map(
          (c) => new mongoose.Types.ObjectId((c._id as mongoose.Types.ObjectId).toString()),
        );

        pipeline.push({
          $match: {
            $or: [
              { cursoId: { $in: cursoIds } },
              { cursoId: { $exists: false } },
              { 'invitados.usuarioId': req.user._id },
            ],
          },
        });
      } else if (req.user.tipo === 'DOCENTE') {
        const cursos = await Curso.find({
          $or: [{ director_grupo: req.user._id }],
        }).select<{ _id: mongoose.Types.ObjectId }>('_id');
        const cursoIds = cursos.map((c) => new mongoose.Types.ObjectId(c._id.toString()));

        pipeline.push({
          $match: {
            $or: [
              { cursoId: { $in: cursoIds } },
              { cursoId: { $exists: false } },
              { creadorId: new mongoose.Types.ObjectId(req.user._id.toString()) },
              { 'invitados.usuarioId': req.user._id },
            ],
          },
        });
      } else if (req.user.tipo === 'PADRE' || req.user.tipo === 'ACUDIENTE') {
        // Obtener cursos de los hijos del padre/acudiente
        const usuario = await Usuario.findById(req.user._id);
        if (usuario && usuario.info_academica && usuario.info_academica.estudiantes_asociados) {
          const estudiantesIds = usuario.info_academica.estudiantes_asociados;
          const cursos = await Curso.find({
            estudiantes: { $in: estudiantesIds },
          }).select<{ _id: mongoose.Types.ObjectId }>('_id');
          const cursoIds = cursos.map((c) => new mongoose.Types.ObjectId(c._id.toString()));

          pipeline.push({
            $match: {
              $or: [
                { cursoId: { $in: cursoIds } },
                { cursoId: { $exists: false } },
                { 'invitados.usuarioId': req.user._id },
              ],
            },
          });
        }
      }
      // Los ADMIN ven todos los eventos (respetando el filtro de estado aplicado arriba)

      // Añadir ordenamiento
      pipeline.push({ $sort: { fechaInicio: 1 } });

      logger.debug(
        '🔍 DEPURACIÓN - Pipeline con filtros aplicados:',
        JSON.stringify(pipeline, null, 2),
      );

      // Ejecutar la agregación
      const eventos = await EventoCalendario.aggregate(pipeline);

      // Poblar los IDs relacionados
      await EventoCalendario.populate(eventos, {
        path: 'creadorId',
        select: 'nombre apellidos email tipo',
      });

      await EventoCalendario.populate(eventos, {
        path: 'cursoId',
        select: 'nombre nivel',
      });

      // DEBUGGING - Mostrar resultados
      logger.debug(`✅ RESULTADO - Eventos encontrados: ${eventos.length}`);
      if (eventos.length > 0) {
        logger.debug(
          '✅ RESULTADO - Estados de eventos:',
          eventos.map((e) => ({ id: e._id, titulo: e.titulo, estado: e.estado })),
        );
      } else {
        logger.debug('⚠️ RESULTADO - No se encontraron eventos');
        logger.debug('⚠️ Pipeline usado:', JSON.stringify(pipeline, null, 2));
      }

      // Retornar resultados
      res.json({
        success: true,
        data: eventos,
      });
    } catch (error) {
      console.error('ERROR en obtenerEventos:', error);
      next(error);
    }
  }

  // Obtener un evento por su ID
  async obtenerEventoPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const evento = await EventoCalendario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      })
        .populate('creadorId', 'nombre apellidos email tipo')
        .populate('cursoId', 'nombre nivel')
        .populate('invitados.usuarioId', 'nombre apellidos email tipo');

      if (!evento) {
        throw new ApiError(404, 'Evento no encontrado');
      }

      // 🚨 CONTROL DE ACCESO: Estudiantes/padres solo ven eventos ACTIVOS
      if (
        (req.user.tipo === 'ESTUDIANTE' ||
          req.user.tipo === 'PADRE' ||
          req.user.tipo === 'ACUDIENTE') &&
        evento.estado !== 'ACTIVO'
      ) {
        throw new ApiError(404, 'Evento no encontrado');
      }

      logger.debug('✅ Evento obtenido:', {
        id: evento._id,
        titulo: evento.titulo,
        estado: evento.estado,
        usuarioTipo: req.user.tipo,
      });

      res.json({
        success: true,
        data: evento,
      });
    } catch (error) {
      next(error);
    }
  }

  // Actualizar un evento existente
  async actualizarEvento(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    // Verificar si el usuario puede editar el evento
    const evento = await EventoCalendario.findOne({
      _id: req.params.id,
      escuelaId: req.user.escuelaId,
    });

    if (!evento) {
      throw new ApiError(404, 'Evento no encontrado');
    }

    // Administrativos: cualquier evento de su colegio. DOCENTE (y demás): solo los que creó
    const rolesAdministrativos = ['ADMIN', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO'];
    const esCreador = evento.creadorId.toString() === req.user._id;
    const tienePermisoAdministrativo = rolesAdministrativos.includes(req.user.tipo);

    // Verificar permisos: puede editar si es el creador O tiene rol administrativo
    if (!esCreador && !tienePermisoAdministrativo) {
      throw new ApiError(403, 'No tienes permiso para editar este evento');
    }

    // Lista blanca: escuelaId, creadorId y archivoAdjunto no se pueden modificar desde el body
    const datosActualizacion: any = tomarCamposEvento(req.body);

    if (datosActualizacion.cursoId) {
      const cursoValido = await Curso.exists({
        _id: datosActualizacion.cursoId,
        escuelaId: req.user.escuelaId,
      });
      if (!cursoValido) {
        throw new ApiError(400, 'Curso no válido');
      }
    }

    // Procesar fechas
    if (datosActualizacion.fechaInicio) {
      datosActualizacion.fechaInicio = new Date(datosActualizacion.fechaInicio);
    }

    if (datosActualizacion.fechaFin) {
      datosActualizacion.fechaFin = new Date(datosActualizacion.fechaFin);
    }

    // Procesar invitados
    if (datosActualizacion.invitados && typeof datosActualizacion.invitados === 'string') {
      try {
        datosActualizacion.invitados = JSON.parse(datosActualizacion.invitados);
      } catch (error) {
        throw new ApiError(400, 'Formato de invitados inválido');
      }
    }

    // Verificar si hay un archivo adjunto
    const archivoActualizar = archivoSubido(req);
    if (archivoActualizar) {
      const file = archivoActualizar;
      const bucket = gridfsManager.getBucket();

      if (!bucket) {
        throw new ApiError(500, 'Servicio de archivos no disponible');
      }

      // Si ya hay un archivo adjunto, eliminarlo
      if (evento.archivoAdjunto && evento.archivoAdjunto.fileId) {
        try {
          await bucket.delete(
            new mongoose.Types.ObjectId(evento.archivoAdjunto.fileId.toString()),
          );
        } catch (error) {
          console.error('Error deleting old file:', error);
        }
      }

      // Subir nuevo archivo a GridFS
      const filename = file.filename || path.basename(file.path);
      const uploadStream = bucket.openUploadStream(filename, {
        metadata: {
          originalName: file.originalname,
          contentType: file.mimetype,
          size: file.size,
          uploadedBy: req.user._id,
        },
      });

      const fileContent = fs.readFileSync(file.path);
      // Esperar a que GridFS termine de escribir (antes se respondía antes de que existiera el archivo)
      await new Promise((resolve, reject) => {
        uploadStream.once('finish', resolve).once('error', reject);
        uploadStream.end(fileContent);
      });

      datosActualizacion.archivoAdjunto = {
        fileId: uploadStream.id,
        nombre: file.originalname,
        tipo: file.mimetype,
        tamaño: file.size,
      };

      // Limpiar archivo temporal
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error('Error deleting temporary file:', error);
      }
    }

    // Actualizar el evento
    await EventoCalendario.findOneAndUpdate(
      { _id: req.params.id, escuelaId: req.user.escuelaId },
      datosActualizacion,
      {
        new: true,
        runValidators: true,
      },
    );

    // Obtener evento actualizado con campos populados
    const eventoActualizado = await EventoCalendario.findById(req.params.id)
      .populate('creadorId', 'nombre apellidos email tipo')
      .populate('cursoId', 'nombre nivel')
      .populate('invitados.usuarioId', 'nombre apellidos email tipo')
      .lean();

    if (!eventoActualizado) {
      throw new ApiError(404, 'Evento no encontrado');
    }

    res.json({
      success: true,
      data: eventoActualizado,
    });

    // Si el PUT publica el evento (Flutter cambia el estado por aquí), se avisa al colegio como al crear
    if (datosActualizacion.estado === EstadoEvento.ACTIVO && evento.estado !== EstadoEvento.ACTIVO) {
      notificarEventoPublicado(eventoActualizado as any, req.user.escuelaId);
    }
  } catch (error) {
    next(error);
  }
}

  // 🚨 FUNCIÓN MODIFICADA - Eliminar (cancelar) un evento
  async eliminarEvento(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    logger.debug('🗑️ === INICIANDO CANCELACIÓN DE EVENTO ===');
    logger.debug(`ID del evento: ${req.params.id}`);
    logger.debug(`Usuario: ${req.user?.email} (${req.user?.tipo})`);

    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    // Verificar si el usuario puede eliminar el evento
    const evento = await EventoCalendario.findOne({
      _id: req.params.id,
      escuelaId: req.user.escuelaId,
    });

    if (!evento) {
      logger.debug('❌ Evento no encontrado en la base de datos');
      throw new ApiError(404, 'Evento no encontrado');
    }

    logger.debug(`✅ Evento encontrado: "${evento.titulo}"`);
    logger.debug(`Estado actual: ${evento.estado}`);

    // 🚨 CAMBIO AQUÍ: Agregar COORDINADOR, RECTOR, DOCENTE y ADMINISTRATIVO a los roles permitidos
    // Administrativos: cualquier evento de su colegio. DOCENTE: solo los que creó (decisión de Aymer, Fase 3;
    // el web ya solo le muestra el botón en sus eventos y Flutter no se lo muestra)
    const rolesAdministrativos = ['ADMIN', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO'];
    const esCreador = evento.creadorId.toString() === req.user._id;
    const tienePermisoAdministrativo = rolesAdministrativos.includes(req.user.tipo);

    // Verificar permisos: puede eliminar si es el creador O tiene rol administrativo
    if (!esCreador && !tienePermisoAdministrativo) {
      logger.debug('❌ Usuario sin permisos para eliminar');
      logger.debug(`   - Tipo de usuario: ${req.user.tipo}`);
      logger.debug(`   - Es creador: ${esCreador}`);
      logger.debug(`   - Tiene permiso administrativo: ${tienePermisoAdministrativo}`);
      throw new ApiError(403, 'No tienes permiso para eliminar este evento');
    }

    // Verificar si ya está cancelado
    if (evento.estado === 'CANCELADO') {
      logger.debug('⚠️ El evento ya estaba cancelado');
      throw new ApiError(400, 'El evento ya está cancelado');
    }

    // 🚨 CAMBIAR ESTADO A CANCELADO (mantener en BD para historial)
    logger.debug('🔄 Cambiando estado del evento a CANCELADO...');
    const eventoActualizado = await EventoCalendario.findOneAndUpdate(
      { _id: req.params.id, escuelaId: req.user.escuelaId },
      {
        estado: EstadoEvento.CANCELADO,
        fechaCancelacion: new Date(),
      },
      { new: true },
    );

    if (!eventoActualizado) {
      logger.debug('❌ No se pudo cancelar el evento');
      throw new ApiError(500, 'Error al cancelar el evento');
    }

    logger.debug('✅ EVENTO CANCELADO EXITOSAMENTE');
    logger.debug(`Título: "${eventoActualizado.titulo}"`);
    logger.debug(`Nuevo estado: ${eventoActualizado.estado}`);
    logger.debug('🗑️ === CANCELACIÓN COMPLETADA ===');

    // Respuesta de éxito
    res.json({
      success: true,
      message: 'Evento cancelado exitosamente',
      data: {
        _id: eventoActualizado._id,
        titulo: eventoActualizado.titulo,
        estado: eventoActualizado.estado,
        cancelado: true,
        fechaCancelacion: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ ERROR al cancelar evento:', error);
    next(error);
  }
}

  // Confirmar asistencia a un evento
  async confirmarAsistencia(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { confirmado } = req.body;

      // Buscar el evento
      const evento = await EventoCalendario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
        'invitados.usuarioId': req.user._id,
      });

      if (!evento) {
        throw new ApiError(404, 'Evento no encontrado o no estás invitado');
      }

      // Actualizar la confirmación del usuario
      await EventoCalendario.findOneAndUpdate(
        {
          _id: req.params.id,
          'invitados.usuarioId': req.user._id,
        },
        {
          $set: {
            'invitados.$.confirmado': confirmado,
            'invitados.$.fechaConfirmacion': new Date(),
          },
        },
        { new: true },
      );

      // Obtener el evento actualizado con datos populados
      const eventoActualizado = await EventoCalendario.findById(req.params.id)
        .populate('creadorId', 'nombre apellidos email tipo')
        .populate('cursoId', 'nombre nivel');

      if (!eventoActualizado) {
        throw new ApiError(500, 'Error al actualizar la confirmación');
      }

      res.json({
        success: true,
        message: `Has confirmado tu asistencia al evento`,
        data: eventoActualizado,
      });
    } catch (error) {
      next(error);
    }
  }

  async cambiarEstadoEvento(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    const { id } = req.params;
    const { estado } = req.body;

    // Verificar que el estado es válido
    if (!['PENDIENTE', 'ACTIVO', 'FINALIZADO', 'CANCELADO'].includes(estado)) {
      throw new ApiError(400, 'Estado no válido');
    }

    // Verificar si el usuario puede modificar el evento
    const evento = await EventoCalendario.findOne({
      _id: id,
      escuelaId: req.user.escuelaId,
    });

    if (!evento) {
      throw new ApiError(404, 'Evento no encontrado');
    }

    // 🚨 CAMBIO AQUÍ: Agregar COORDINADOR y RECTOR a los roles permitidos
    // Administrativos: cualquier evento de su colegio. DOCENTE: solo los que creó (decisión de Aymer, Fase 3)
    const rolesConPermiso = ['ADMIN', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO'];
    const esCreadorEvento = evento.creadorId.toString() === req.user._id;
    if (!rolesConPermiso.includes(req.user.tipo) && !(req.user.tipo === 'DOCENTE' && esCreadorEvento)) {
      throw new ApiError(403, 'No tienes permiso para cambiar el estado de este evento');
    }

    // Actualizar el estado
    const eventoActualizado = await EventoCalendario.findOneAndUpdate(
      { _id: id, escuelaId: req.user.escuelaId },
      { estado },
      { new: true },
    )
      .populate('creadorId', 'nombre apellidos email tipo')
      .populate('cursoId', 'nombre nivel');

    res.json({
      success: true,
      data: eventoActualizado,
      message: `Estado del evento cambiado a ${estado} exitosamente`,
    });

    // Al publicarse (pasar a ACTIVO desde otro estado) se avisa al colegio, igual que al crear
    if (eventoActualizado && estado === EstadoEvento.ACTIVO && evento.estado !== EstadoEvento.ACTIVO) {
      notificarEventoPublicado(eventoActualizado as any, req.user.escuelaId);
    }
  } catch (error) {
    next(error);
  }
}

  // Descargar un archivo adjunto de un evento
  async descargarAdjunto(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const evento = await EventoCalendario.findOne({
        _id: req.params.id,
        escuelaId: req.user.escuelaId,
      });

      if (!evento) {
        throw new ApiError(404, 'Evento no encontrado');
      }

      if (!evento.archivoAdjunto || !evento.archivoAdjunto.fileId) {
        throw new ApiError(404, 'Este evento no tiene archivo adjunto');
      }

      const bucket = gridfsManager.getBucket();
      if (!bucket) {
        throw new ApiError(500, 'Servicio de archivos no disponible');
      }

      // Buscar el archivo en GridFS
      const fileId = new mongoose.Types.ObjectId(evento.archivoAdjunto.fileId.toString());
      // Existencia en GridFS (cursor.count() está deprecado en el driver 6)
      const [documento] = await bucket.find({ _id: fileId }).limit(1).toArray();
      if (!documento) {
        throw new ApiError(404, 'Archivo no encontrado en el sistema');
      }

      // Configurar respuesta (Content-Disposition RFC 5987, ver utils/contentDisposition)
      res.set({
        'Content-Type': evento.archivoAdjunto.tipo,
        'Content-Disposition': contentDispositionAdjunto(evento.archivoAdjunto.nombre),
      });

      // Devolver el stream del archivo
      const downloadStream = bucket.openDownloadStream(fileId);
      // Sin handler, un error de GridFS con las cabeceras ya enviadas era un error de stream no manejado
      downloadStream.on('error', (error) => {
        console.error('Error en stream de descarga GridFS:', error);
        if (!res.headersSent) {
          next(new ApiError(500, 'Error al descargar el archivo'));
        } else {
          res.end();
        }
      });
      downloadStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
}

export default new CalendarioController();
