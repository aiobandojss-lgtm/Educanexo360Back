// src/controllers/tarea.controller.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Tarea from '../models/tarea.model';
import Curso from '../models/curso.model';
import Usuario from '../models/usuario.model';
import ApiError from '../utils/ApiError';
import { subirAdjuntos, eliminarAdjuntos } from '../utils/adjuntos';
import { abrirArchivo, eliminarArchivo } from '../services/storage';
import { eliminarSiNoReferenciados } from '../utils/referenciasArchivos';
import { escapeRegex } from '../utils/escapeRegex';
import {
  esRolAdministrativo,
  docenteTieneCurso,
  obtenerHijosIds,
  queryString,
} from '../utils/accesoAcademico';

const idDe = (valor: any): string => String(valor?._id ?? valor);

/**
 * Recalcula en memoria el estado de las entregas (actualizarEstadosEntregas) y SOLO escribe en la
 * base, con un updateOne, las entregas que pasaron a ATRASADA. Antes cada GET hacía tarea.save().
 */
const sincronizarEstadosEntregas = async (tarea: any): Promise<void> => {
  const antes = new Map<string, string>(tarea.entregas.map((e: any) => [String(e._id), e.estado]));
  tarea.actualizarEstadosEntregas();
  const cambiadas = tarea.entregas
    .filter((e: any) => antes.get(String(e._id)) !== e.estado)
    .map((e: any) => e._id);
  if (cambiadas.length > 0) {
    await Tarea.updateOne(
      { _id: tarea._id },
      { $set: { 'entregas.$[e].estado': 'ATRASADA' } },
      // Solo si la entrega sigue en un estado que puede pasar a ATRASADA: evita pisar una CALIFICADA
      // (u otra transición) hecha entre la lectura y esta escritura
      { arrayFilters: [{ 'e._id': { $in: cambiadas }, 'e.estado': { $in: ['PENDIENTE', 'VISTA', 'ENTREGADA'] } }] },
    );
  }
};

/**
 * Regla de acceso a una tarea (objeto plano). Devuelve las entregas visibles o null si no tiene acceso.
 * - Administrativos: todo (su colegio ya va en la consulta).
 * - DOCENTE: tareas propias o de sus cursos.
 * - ESTUDIANTE: si tiene entrega o pertenece al curso; solo ve SU entrega.
 * - ACUDIENTE: si algún hijo tiene entrega o pertenece al curso; solo ve las entregas de sus hijos.
 */
const resolverAccesoTarea = async (
  user: any,
  tarea: any,
): Promise<{ entregas: any[]; completo: boolean } | null> => {
  const entregas: any[] = tarea.entregas || [];

  if (esRolAdministrativo(user.tipo)) return { entregas, completo: true };

  if (user.tipo === 'DOCENTE') {
    const propia = idDe(tarea.docenteId) === String(user._id);
    if (propia || (await docenteTieneCurso(user, idDe(tarea.cursoId)))) {
      return { entregas, completo: true };
    }
    return null;
  }

  let permitidos: string[] = [];
  if (user.tipo === 'ESTUDIANTE') permitidos = [String(user._id)];
  else if (user.tipo === 'ACUDIENTE') permitidos = await obtenerHijosIds(user);
  else return null;

  const visibles = entregas.filter((e) => e?.estudianteId && permitidos.includes(idDe(e.estudianteId)));
  if (visibles.length > 0) return { entregas: visibles, completo: false };

  // Sin entrega (p. ej. estudiante agregado después): acceso si pertenece al curso de la tarea
  const enCurso = permitidos.length
    ? await Curso.exists({
        _id: idDe(tarea.cursoId),
        escuelaId: user.escuelaId,
        estudiantes: { $in: permitidos },
      })
    : null;
  return enCurso ? { entregas: [], completo: false } : null;
};
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

      // Notificar a los estudiantes asignados (fire-and-forget, no bloquea la respuesta)
      if (estudiantesParaAsignar.length > 0) {
        // Por la cola (Fase 4.3): lotes de ~50 estudiantes, todos sus dispositivos
        const fechaStr = nuevaTarea.fechaLimite
          ? new Date(nuevaTarea.fechaLimite).toLocaleDateString('es-CO')
          : '';
        pushNotificationService
          .encolarPushFiltro(
            { _id: { $in: estudiantesParaAsignar } },
            {
              titulo: `Nueva tarea: ${nuevaTarea.titulo}`,
              mensaje: `${req.user!.nombre} asignó una nueva tarea${fechaStr ? `. Vence: ${fechaStr}` : ''}`,
              data: { tipo: 'tarea', tareaId: (nuevaTarea._id as any).toString() },
            },
            { escuelaId: String(req.user!.escuelaId) },
          )
          .catch((err) => console.error('[Tarea] No se pudo encolar el push:', err));
      }
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

      const pagina = numeroPagina(req.query.pagina);
      const limite = numeroLimite(req.query.limite, 10);
      const skip = (pagina - 1) * limite;

      const filters: any = { escuelaId: req.user.escuelaId };

      // Filtros según el rol
      let estudiantesVisibles: string[] | null = null; // null = ve todas las entregas
      if (req.user.tipo === 'DOCENTE') {
        filters.docenteId = req.user._id;
      } else if (req.user.tipo === 'ESTUDIANTE') {
        filters['entregas.estudianteId'] = req.user._id;
        estudiantesVisibles = [String(req.user._id)];
      } else if (req.user.tipo === 'ACUDIENTE') {
        estudiantesVisibles = await obtenerHijosIds(req.user);
        filters['entregas.estudianteId'] = { $in: estudiantesVisibles };
      }

      // Filtros adicionales (casteados a string: evita operadores como estado[$ne]=)
      const cursoId = queryString(req.query.cursoId);
      const asignaturaId = queryString(req.query.asignaturaId);
      const estado = queryString(req.query.estado);
      const prioridad = queryString(req.query.prioridad);
      const busqueda = queryString(req.query.busqueda);

      if (cursoId) {
        filters.cursoId = cursoId;
      }

      if (asignaturaId) {
        filters.asignaturaId = asignaturaId;
      }

      if (estado) {
        filters.estado = estado;
      }

      if (prioridad) {
        filters.prioridad = prioridad;
      }

      // Búsqueda por texto
      if (busqueda) {
        filters.$or = [
          { titulo: { $regex: escapeRegex(busqueda), $options: 'i' } },
          { descripcion: { $regex: escapeRegex(busqueda), $options: 'i' } },
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

      // ESTUDIANTE / ACUDIENTE: quitar las entregas de otros estudiantes
      if (estudiantesVisibles) {
        const visibles = new Set(estudiantesVisibles);
        tareas.forEach((t: any) => {
          t.entregas = (t.entregas || []).filter((e: any) => visibles.has(idDe(e.estudianteId)));
        });
      }

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

      // Regla de rol (DOCENTE sus cursos, ESTUDIANTE lo suyo, ACUDIENTE sus hijos)
      const acceso = await resolverAccesoTarea(req.user, tarea.toObject());
      if (!acceso) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Actualizar estados de entregas (escribe solo si alguna cambió)
      await sincronizarEstadosEntregas(tarea);

      // ESTUDIANTE / ACUDIENTE: solo sus entregas, sin estadísticas del curso
      if (!acceso.completo) {
        const tareaObj = tarea.toObject();
        const visibles = new Set(acceso.entregas.map((e: any) => idDe(e.estudianteId)));
        tareaObj.entregas = tareaObj.entregas.filter(
          (e: any) => e?.estudianteId && visibles.has(idDe(e.estudianteId))
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

      const referencias = (tarea.archivosReferencia || []).map((a: any) => (a.toObject ? a.toObject() : a));
      const deEntregas = (tarea.entregas || []).flatMap((e: any) => (e.archivos || []).map((a: any) => (a.toObject ? a.toObject() : a)));
      await tarea.deleteOne();

      // Fase 5.5: sus archivos se borran (solo si ningún otro documento los referencia). Antes quedaban huérfanos.
      await eliminarSiNoReferenciados(referencias, 'tareas_referencias');
      await eliminarSiNoReferenciados(deEntregas, 'tareas_entregas');

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

      // Fase 5.2: subida por la capa de almacenamiento (temporales: limpiarTemporales; si una falla, no deja huérfanos)
      const archivosSubidos = await subirAdjuntos(req.files as Express.Multer.File[], 'tareas_entregas', String(req.user._id), {
        estudianteId: String(req.user._id),
        tareaId: String(req.params.id),
      });

      // Encontrar y actualizar la entrega del estudiante
      const entrega = tarea.entregas.find(
        (e: any) => e.estudianteId.toString() === req.user?._id
      );

      if (!entrega) {
        throw new ApiError(404, 'Entrega no encontrada');
      }

      // Fase 5.5: al reenviar, los archivos de la entrega anterior se reemplazan; se borran DESPUÉS de guardar
      const archivosAnteriores = (entrega.archivos || []).map((a: any) => (a.toObject ? a.toObject() : a));
      entrega.fechaEntrega = new Date();
      entrega.estado = esAtrasada ? 'ATRASADA' : 'ENTREGADA';
      entrega.archivos = archivosSubidos as any;
      entrega.comentarioEstudiante = req.body.comentarioEstudiante || '';
      entrega.intentos += 1;

      try {
        await tarea.save();
      } catch (saveError) {
        // No se guardó: los archivos recién subidos quedarían huérfanos (criterio 3.O)
        await eliminarAdjuntos(archivosSubidos, 'tareas_entregas');
        throw saveError;
      }
      await eliminarSiNoReferenciados(archivosAnteriores, 'tareas_entregas');

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
      await sincronizarEstadosEntregas(tarea);

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

      // Fase 5.2: subida por la capa de almacenamiento (temporales: limpiarTemporales; si una falla, no deja huérfanos)
      const archivosSubidos = await subirAdjuntos(req.files as Express.Multer.File[], 'tareas_referencias', String(req.user._id), {
        docenteId: String(req.user._id),
        tareaId: String(req.params.id),
      });

      // Agregar archivos a la tarea
      tarea.archivosReferencia.push(...(archivosSubidos as any[]));
      try {
        await tarea.save();
      } catch (saveError) {
        await eliminarAdjuntos(archivosSubidos, 'tareas_referencias');
        throw saveError;
      }

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
      const tipo = queryString(req.query.tipo); // 'referencia' o 'entrega'

      const tarea = await Tarea.findOne({
        _id: id,
        escuelaId: req.user.escuelaId,
      });

      if (!tarea) {
        throw new ApiError(404, 'Tarea no encontrada');
      }

      // Solo quien puede ver la tarea; en entregas, solo las visibles para su rol
      // (propio estudiante, su acudiente, docente del curso o administrativos)
      const acceso = await resolverAccesoTarea(req.user, tarea.toObject());
      if (!acceso) {
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
        // Buscar solo en las entregas visibles para el usuario
        for (const entrega of acceso.entregas) {
          archivo = (entrega.archivos || []).find(
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

      // Fase 5.2: abrir desde su almacén (GridFS o S3 según la referencia) ANTES de fijar cabeceras
      const downloadStream = await abrirArchivo(archivo, bucketName);

      // Configurar headers (idénticas a las de siempre)
      res.setHeader('Content-Type', archivo.tipo);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(archivo.nombre)}"`
      );

      // Stream del archivo (el backend autoriza y hace stream: no se redirige a una URL firmada)
      downloadStream.on('error', (error) => {
        console.error('Error en stream de descarga:', error);
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

      // Fase 5.2: primero se quita del documento y DESPUÉS se borra el archivo (si el save falla, el archivo sigue
      // referenciado y no se pierde; antes un archivo ya inexistente en GridFS hacía fallar la petición con 500)
      const [archivo] = tarea.archivosReferencia.splice(archivoIndex, 1);
      await tarea.save();
      try {
        await eliminarArchivo(archivo as any, 'tareas_referencias');
      } catch (errorBorrado) {
        console.warn(`[Tareas] No se pudo borrar el archivo ${archivoId} del almacén:`, errorBorrado);
      }

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

    // Agregación: solo la entrega del estudiante (antes se cargaban las entregas de todo el curso
    // y se descartaban en JS). Misma forma: todos los campos de la tarea + miEntrega, sin entregas.
    const uid = new mongoose.Types.ObjectId(req.user._id);
    const matchAgg: any = {
      ...query,
      escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
      'entregas.estudianteId': uid,
    };
    if (matchAgg.entregas?.$elemMatch) {
      matchAgg.entregas = { $elemMatch: { ...matchAgg.entregas.$elemMatch, estudianteId: uid } };
    }
    const tareasAgg = await Tarea.aggregate([
      { $match: matchAgg },
      { $sort: { fechaLimite: 1 } },
      {
        $addFields: {
          miEntrega: {
            $arrayElemAt: [
              { $filter: { input: '$entregas', as: 'e', cond: { $eq: ['$$e.estudianteId', uid] } } },
              0,
            ],
          },
        },
      },
      { $project: { entregas: 0 } },
    ]);
    const tareasConMiEntrega = await Tarea.populate(tareasAgg, [
      { path: 'docenteId', select: 'nombre apellidos' },
      { path: 'asignaturaId', select: 'nombre' },
      { path: 'cursoId', select: 'nombre' },
    ]);

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

      // Filtros opcionales (casteados a string)
      const cursoIdFiltro = queryString(req.query.cursoId);
      const asignaturaIdFiltro = queryString(req.query.asignaturaId);
      if (cursoIdFiltro) {
        filters.cursoId = cursoIdFiltro;
      }

      if (asignaturaIdFiltro) {
        filters.asignaturaId = asignaturaIdFiltro;
      }

      // Solo los campos de entrega que se usan (antes: documentos completos con todo el contenido)
      const tareas = await Tarea.find(filters)
        .select('entregas.fechaEntrega entregas.estado entregas.calificacion')
        .lean();

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