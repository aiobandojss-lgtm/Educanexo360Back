// src/services/mensaje.service.ts - VERSIÓN OPTIMIZADA CON CACHE Y AGREGACIONES

import mongoose from 'mongoose';
import Usuario from '../models/usuario.model';
import Mensaje from '../models/mensaje.model';
import Curso from '../models/curso.model';
import Asignatura from '../models/asignatura.model';
import ApiError from '../utils/ApiError';
import { TipoMensaje, EstadoMensaje, PrioridadMensaje } from '../interfaces/IMensaje';
import { TipoNotificacion } from '../interfaces/INotificacion';
import { escapeRegex } from '../utils/escapeRegex';
import { construirTrabajosCorreo, esEmailFicticio } from './email.service';
import { preferenciaEmail } from '../utils/preferencias';
import pushNotificationService from './pushNotification.service';
import Notificacion from '../models/notificacion.model';
import { EstadoNotificacion } from '../interfaces/INotificacion';
import { encolar, NuevoTrabajo, ContextoTrabajo } from '../queue/outbox';
import {
  cache,
  invalidateCache,
  invalidateRelatedCache,
  safeCacheSet,
  invalidarCacheUsuarios,
} from '../cache/simpleCache';
import config from '../config/config';
import { aArregloDeIds, obtenerCursosDocente } from '../utils/accesoAcademico';
import { logger } from '../utils/logger';
import { claveDeLote } from '../utils/claveLote';

// Tipo de usuario legible en minúsculas para el texto de las copias a acudientes
const TIPO_LEGIBLE: Record<string, string> = {
  DOCENTE: 'docente',
  RECTOR: 'rector(a)',
  COORDINADOR: 'coordinador(a)',
  ADMINISTRATIVO: 'administrativo(a)',
  ADMIN: 'administrador(a)',
  SUPER_ADMIN: 'administrador(a) del sistema',
  ESTUDIANTE: 'estudiante',
  ACUDIENTE: 'acudiente',
};

/**
 * Único lugar que arma el asunto y la primera línea de las copias automáticas a acudientes
 * (crear, enviar borrador y responder pasan por enviarCopiaAcudientes).
 * Asunto: "<asunto> · <nombres del estudiante>" (sin apellidos).
 */
export const construirCopiaAcudiente = (
  datos: { asunto: string; contenido: string },
  remitente: { tipo?: string; nombre?: string; apellidos?: string },
  estudiante: { nombre?: string; apellidos?: string },
): { asunto: string; contenido: string } => {
  const tipo = TIPO_LEGIBLE[remitente.tipo || ''] || 'personal del colegio';
  const nombreRemitente = `${remitente.nombre ?? ''} ${remitente.apellidos ?? ''}`.trim();
  const nombreEstudiante = `${estudiante.nombre ?? ''} ${estudiante.apellidos ?? ''}`.trim();
  return {
    asunto: `${datos.asunto} · ${(estudiante.nombre ?? '').trim()}`,
    contenido:
      `El/La ${tipo} ${nombreRemitente} le escribió a ${nombreEstudiante}. ` +
      `Usted recibe este mensaje porque es su acudiente.\n\n${datos.contenido}`,
  };
};

class MensajeService {
  // 🚀 CACHE HELPER: Crear clave de cache consistente
  private createCacheKey(type: string, ...params: string[]): string {
    return `${type}_${params.join('_')}`;
  }

  // 🚀 CACHE HELPER: Obtener o establecer con cache
  private async getOrSetCache<T>(
    cacheKey: string,
    ttl: number,
    fetchFunction: () => Promise<T>,
  ): Promise<T> {
    const cached = cache.get<T>(cacheKey);
    if (cached) {
      logger.debug(`📋 CACHE HIT: ${cacheKey}`);
      return cached;
    }

    const result = await fetchFunction();
    if (safeCacheSet(cacheKey, result, ttl)) {
      logger.debug(`💾 CACHE SET: ${cacheKey} (${ttl}s)`);
    }

    return result;
  }

  /**
   * Convierte de forma segura una cadena a ObjectId
   */
  private safeObjectId(id: string | any): mongoose.Types.ObjectId | null {
    try {
      if (!id) return null;
      if (id instanceof mongoose.Types.ObjectId) return id;
      if (typeof id === 'string' && mongoose.isValidObjectId(id)) {
        return new mongoose.Types.ObjectId(id);
      }
      return null;
    } catch (error) {
      console.error('Error al convertir a ObjectId:', error);
      return null;
    }
  }

  /**
   * 🚀 OPTIMIZADO: Obtiene posibles destinatarios con CACHE y AGREGACIÓN
   */
  async getPosiblesDestinatarios(userId: string, escuelaId: string, query: string = '') {
    try {
      logger.debug(`🔍 getPosiblesDestinatarios: userId=${userId}, query='${query}'`);

      // Validar IDs
      if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(escuelaId)) {
        throw new ApiError(400, 'IDs inválidos');
      }

      // ✅ CACHE KEY incluye query para búsquedas específicas
      const cacheKey = this.createCacheKey('destinatarios', userId, escuelaId, query);

      return await this.getOrSetCache(cacheKey, 120, async () => {
        // ✅ UNA SOLA AGREGACIÓN OPTIMIZADA
        const resultado = await Usuario.aggregate([
          {
            $match: {
              escuelaId: new mongoose.Types.ObjectId(escuelaId),
              _id: { $ne: new mongoose.Types.ObjectId(userId) },
              estado: 'ACTIVO', // Solo usuarios activos
              ...(query &&
                query.trim() !== '' && {
                  $or: [
                    { nombre: { $regex: escapeRegex(query), $options: 'i' } },
                    { apellidos: { $regex: escapeRegex(query), $options: 'i' } },
                    { email: { $regex: escapeRegex(query), $options: 'i' } },
                  ],
                }),
            },
          },
          {
            $lookup: {
              from: 'usuarios',
              let: { currentUserId: new mongoose.Types.ObjectId(userId) },
              pipeline: [
                { $match: { $expr: { $eq: ['$_id', '$$currentUserId'] } } },
                { $project: { tipo: 1 } },
              ],
              as: 'usuario_actual',
            },
          },
          {
            $addFields: {
              usuario_tipo: { $arrayElemAt: ['$usuario_actual.tipo', 0] },
            },
          },
          {
            $match: {
              $expr: {
                $cond: [
                  { $eq: ['$usuario_tipo', 'ESTUDIANTE'] },
                  { $in: ['$tipo', ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO']] },
                  true, // Otros tipos pueden ver a todos
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              nombre: 1,
              apellidos: 1,
              email: 1,
              tipo: 1,
              avatar: '$perfil.avatar', // Asumir estructura del perfil
              nombreCompleto: {
                $concat: ['$nombre', ' ', '$apellidos'],
              },
            },
          },
          {
            $sort: { nombreCompleto: 1 },
          },
          {
            $limit: 50,
          },
        ]);

        logger.debug(`✅ Destinatarios encontrados: ${resultado.length}`);
        return resultado;
      });
    } catch (error) {
      console.error('[ERROR] getPosiblesDestinatarios:', error);
      throw this.handleError(error);
    }
  }

  /**
   * 🚀 OPTIMIZADO: Obtiene cursos con CACHE
   */
  async getCursosPosiblesDestinatarios(userId: string, escuelaId: string) {
    try {
      if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(escuelaId)) {
        throw new ApiError(400, 'IDs inválidos');
      }

      const cacheKey = this.createCacheKey('cursos_destinatarios', userId, escuelaId);

      return await this.getOrSetCache(cacheKey, 600, async () => {
        // ✅ AGREGACIÓN OPTIMIZADA para verificar permisos y obtener cursos
        const resultado = await Usuario.aggregate([
          {
            $match: { _id: new mongoose.Types.ObjectId(userId) },
          },
          {
            $project: {
              tipo: 1,
              tienePermisosMasivos: {
                $in: [
                  '$tipo',
                  ['ADMIN', 'SUPER_ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'],
                ],
              },
            },
          },
          {
            $match: { tienePermisosMasivos: true },
          },
          {
            $lookup: {
              from: 'cursos',
              let: { escuela: new mongoose.Types.ObjectId(escuelaId) },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ['$escuelaId', '$$escuela'] },
                  },
                },
                {
                  $project: {
                    _id: 1,
                    nombre: 1,
                    grado: 1,
                    seccion: 1,
                    nivel: 1,
                    estudiantesCount: { $size: { $ifNull: ['$estudiantes', []] } },
                  },
                },
                {
                  $sort: { nivel: 1, grado: 1, seccion: 1 },
                },
              ],
              as: 'cursos',
            },
          },
          {
            $unwind: '$cursos',
          },
          {
            $replaceRoot: { newRoot: '$cursos' },
          },
        ]);

        if (resultado.length === 0) {
          // Si no hay resultados, verificar si es problema de permisos
          const usuario = await Usuario.findById(userId).select('tipo');
          if (!usuario) {
            throw new ApiError(404, 'Usuario no encontrado');
          }

          const rolesMasivos = [
            'ADMIN',
            'SUPER_ADMIN',
            'RECTOR',
            'COORDINADOR',
            'ADMINISTRATIVO',
            'DOCENTE',
          ];
          if (!rolesMasivos.includes(usuario.tipo)) {
            throw new ApiError(403, 'No tiene permisos para enviar mensajes masivos');
          }
        }

        logger.debug(`✅ Cursos encontrados: ${resultado.length}`);
        return resultado;
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 🚀 OPTIMIZADO: Crea mensaje con AGREGACIONES MASIVAS
   */
  async crearMensaje(datos: any, user: any) {
    try {
      const {
        destinatarios = [],
        destinatariosCc = [],
        cursoIds = [],
        asunto,
        contenido,
        adjuntos = [],
        tipo = TipoMensaje.INDIVIDUAL,
        prioridad = PrioridadMensaje.NORMAL,
        estado = EstadoMensaje.ENVIADO,
        etiquetas = [],
        esRespuesta = false,
        mensajeOriginalId = null,
        esCopiaAcudiente = false,
        copiaDe = undefined,
      } = datos;

      // Verificar permisos básicos
      //if (user.tipo === 'ESTUDIANTE') {
        //throw new ApiError(403, 'Los estudiantes no pueden enviar mensajes');
      //}

      if (!user.escuelaId) {
        throw new ApiError(403, 'No tiene una escuela asociada');
      }

      // Acepta string o array (FormData de Flutter envía un solo valor como string)
      let destinatariosFinales: string[] = aArregloDeIds(destinatarios);
      let destinatariosCcFinales: string[] = aArregloDeIds(destinatariosCc);
      const cursoIdsValidos: string[] = aArregloDeIds(cursoIds);

      // 🚀 OPTIMIZACIÓN CRÍTICA: Procesar cursos con UNA SOLA AGREGACIÓN
      if (cursoIdsValidos.length > 0) {
        const rolesMasivos = [
          'ADMIN',
          'SUPER_ADMIN',
          'RECTOR',
          'COORDINADOR',
          'ADMINISTRATIVO',
          'DOCENTE',
        ];

        if (!rolesMasivos.includes(user.tipo)) {
          throw new ApiError(403, 'No tiene permisos para enviar mensajes masivos');
        }

        // Un DOCENTE solo puede enviar a sus cursos (director de grupo o donde dicta asignaturas)
        if (user.tipo === 'DOCENTE') {
          const cursosDocente = await obtenerCursosDocente(
            String(user._id),
            String(user.escuelaId),
            false,
          );
          if (cursoIdsValidos.some((id) => !cursosDocente.includes(id))) {
            throw new ApiError(403, 'Solo puede enviar mensajes a sus cursos');
          }
        }

        // Estudiantes y acudientes activos de los cursos del colegio del remitente
        const cursosDestinatarios = await this.obtenerDestinatariosDeCursos(
          cursoIdsValidos,
          String(user.escuelaId),
        );
        destinatariosFinales.push(...cursosDestinatarios);
      }

      // Eliminar duplicados y validar
      destinatariosFinales = [...new Set(destinatariosFinales)];
      destinatariosCcFinales = [...new Set(destinatariosCcFinales)];

      // Solo destinatarios ACTIVOS del mismo colegio; los demás se descartan en silencio
      const validos = await Usuario.find({
        _id: { $in: [...destinatariosFinales, ...destinatariosCcFinales] },
        escuelaId: user.escuelaId,
        estado: 'ACTIVO',
      })
        .select('_id')
        .lean();
      const idsValidos = new Set(validos.map((u: any) => String(u._id)));
      destinatariosFinales = destinatariosFinales.filter((id) => idsValidos.has(id));
      destinatariosCcFinales = destinatariosCcFinales.filter((id) => idsValidos.has(id));

      if (destinatariosFinales.length === 0) {
        throw new ApiError(400, 'Debe especificar al menos un destinatario válido');
      }

      // Convertir a ObjectId válidos
      const destinatariosObjectIds = destinatariosFinales
        .map((id) => this.safeObjectId(id))
        .filter((id) => id !== null);

      const destinatariosCcObjectIds = destinatariosCcFinales
        .map((id) => this.safeObjectId(id))
        .filter((id) => id !== null);

      // Crear el mensaje
      const nuevoMensaje = (await Mensaje.create({
        remitente: user._id,
        destinatarios: destinatariosObjectIds,
        destinatariosCc: destinatariosCcObjectIds,
        asunto,
        contenido,
        adjuntos,
        escuelaId: user.escuelaId,
        tipo,
        prioridad,
        estado,
        etiquetas,
        esRespuesta,
        mensajeOriginalId,
        lecturas: [],
        esCopiaAcudiente,
        ...(copiaDe && { copiaDe }),
        cursoIds: cursoIdsValidos
          .map((id: string) => this.safeObjectId(id))
          .filter((id: any) => id !== null),
      })) as mongoose.Document & { _id: mongoose.Types.ObjectId };

      // Auditoría 4.D: en el request solo se encola UN trabajo 'despachar-mensaje' (idempotente por mensajeId).
      // El worker inserta la campanita y encola correo y push, con reintentos: un fallo transitorio ya no
      // cancela las notificaciones en silencio.
      if (estado !== EstadoMensaje.BORRADOR) {
        await this.encolarDespacho(nuevoMensaje._id.toString(), user, prioridad);
      }

      // ✅ POPULATE OPTIMIZADO (solo campos necesarios)
      // Destinatarios sin email (ningún cliente lo usa; en masivos eran miles de correos en la respuesta)
      // lean en destinatarios/CC: sin hidratar miles de documentos de Usuario (mismo JSON: solo campos
      // no sensibles y el schema no tiene virtuals). Fase 4.2, mensaje a todo el colegio.
      await nuevoMensaje.populate([
        { path: 'remitente', select: 'nombre apellidos email tipo' },
        { path: 'destinatarios', select: 'nombre apellidos tipo', options: { lean: true } },
        { path: 'destinatariosCc', select: 'nombre apellidos tipo', options: { lean: true } },
      ]);

      // 🔄 INVALIDAR CACHE RELACIONADO
      this.invalidarCacheMensajes(user._id, user.escuelaId);

      // Dashboard de los destinatarios (conteo de no leídos): una sola pasada por la caché
      invalidarCacheUsuarios(
        ['dashboard', 'dashboard_rol', 'dashboard_completo'],
        [...destinatariosFinales, ...destinatariosCcFinales].map(String),
        String(user.escuelaId),
      );

      return nuevoMensaje;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 🚀 NUEVA FUNCIÓN: Obtener destinatarios de múltiples cursos con UNA SOLA AGREGACIÓN
   */
  private async obtenerDestinatariosDeCursos(
    cursoIds: string[],
    escuelaId: string,
  ): Promise<string[]> {
    const validCursoIds = cursoIds.map((id) => this.safeObjectId(id)).filter((id) => id !== null);

    if (validCursoIds.length === 0 || !escuelaId) {
      return [];
    }

    // Solo cursos del colegio del remitente
    const cursos = await Curso.find({ _id: { $in: validCursoIds }, escuelaId })
      .select('estudiantes')
      .lean();
    const idsEnCursos = [...new Set(cursos.flatMap((c: any) => (c.estudiantes || []).map(String)))];
    if (idsEnCursos.length === 0) {
      return [];
    }

    // Consultas simples por colegio (antes: $lookup con $expr sobre TODOS los usuarios de TODOS los colegios)
    const estudiantes = await Usuario.find({
      _id: { $in: idsEnCursos },
      escuelaId,
      tipo: 'ESTUDIANTE',
      estado: 'ACTIVO',
    })
      .select('_id')
      .lean();
    const estudiantesIds = estudiantes.map((e: any) => e._id);

    const acudientes = estudiantesIds.length
      ? await Usuario.find({
          escuelaId,
          tipo: 'ACUDIENTE',
          estado: 'ACTIVO',
          'info_academica.estudiantes_asociados': { $in: estudiantesIds },
        })
          .select('_id')
          .lean()
      : [];

    const destinatarios = [
      ...estudiantesIds.map(String),
      ...acudientes.map((a: any) => String(a._id)),
    ];
    logger.debug(`✅ Destinatarios de cursos obtenidos: ${destinatarios.length}`);

    return destinatarios;
  }

  /**
   * Encola el despacho de un mensaje enviado (auditoría 4.D): UN trabajo 'despachar-mensaje' idempotente por
   * mensajeId (claveUnica). Si no se puede encolar se reintenta una vez y, si aun así falla, se registra con el id
   * del mensaje (el mensaje ya quedó guardado). Con lanzarError (desde un trabajo de la cola) el error se propaga
   * para que ese trabajo se reintente.
   */
  async encolarDespacho(
    mensajeId: string,
    remitente: any,
    _prioridad?: string, // ya no decide la prioridad del despacho (4.AD); se conserva la firma
    opciones: { lanzarError?: boolean } = {},
  ): Promise<void> {
    const trabajo = {
      tipo: 'despachar-mensaje',
      // Auditoría 4.AD: siempre 'alta'. Es barato (campanita + encolar) y así la campanita y el push de un mensaje
      // no esperan detrás de los lotes de correo de un masivo. Los correos/push que genera conservan su prioridad.
      prioridad: 'alta' as const,
      escuelaId: String(remitente.escuelaId),
      claveUnica: `despacho:${mensajeId}`,
      payload: {
        mensajeId,
        remitente: {
          _id: String(remitente._id),
          nombre: remitente.nombre,
          apellidos: remitente.apellidos,
          escuelaId: String(remitente.escuelaId),
        },
      },
    };
    try {
      await encolar(trabajo);
    } catch (error) {
      try {
        await encolar(trabajo);
      } catch (error2) {
        if (opciones.lanzarError) throw error2;
        console.error(`[Mensajes] No se pudo encolar el despacho del mensaje ${mensajeId}:`, error2);
      }
    }
  }

  /**
   * Handler de 'despachar-mensaje' (auditoría 4.D), idempotente:
   * - Campanita: inserta SOLO las notificaciones que falten (un reintento no las duplica).
   * - Correos (destinatarios + CC con correo real, según preferencia) y push (destinatarios con dispositivo), en
   *   lotes de ~50 con claveUnica por lote: un reintento no encola dos veces.
   * - Push urgente (tipo 'urgente', sonido emergency) si la prioridad es ALTA o el asunto dice
   *   "urgente"/"emergencia"; si no, tipo 'mensaje' (mismos datos que antes para la app).
   * Los errores se propagan: el worker reintenta con backoff.
   */
  async procesarDespacho(
    mensajeId: string,
    remitente: any,
    ctx?: Pick<ContextoTrabajo, 'comprobarCancelacion'>,
  ): Promise<void> {
    // Auditoría 4.AJ: entre pasos se revisa si el trabajo fue cancelado por tiempo agotado
    const comprobar = () => ctx?.comprobarCancelacion();
    const mensaje: any = await Mensaje.findById(mensajeId)
      .select('destinatarios destinatariosCc asunto prioridad adjuntos escuelaId')
      .lean();
    if (!mensaje) return; // el mensaje ya no existe: nada que avisar

    const escuelaId = String(mensaje.escuelaId || remitente.escuelaId);
    const idsDest = (mensaje.destinatarios || []).map(String);
    const idsCc = (mensaje.destinatariosCc || []).map(String);
    const usuarios: any[] = await Usuario.find({
      _id: { $in: [...new Set([...idsDest, ...idsCc])] },
      escuelaId,
      estado: 'ACTIVO',
    })
      .select('_id email nombre tipo preferencias fcmToken fcmTokens.token')
      .sort({ _id: 1 }) // auditoría 4.AC: lotes estables entre reintentos
      .lean();
    if (usuarios.length === 0) return;
    const setDest = new Set(idsDest);

    const nombreRemitente = `${remitente.nombre ?? ''} ${remitente.apellidos ?? ''}`.trim();
    const url = `${config.frontendUrl}/mensajes/${mensajeId}`;
    const prioridad = mensaje.prioridad;
    const asunto = mensaje.asunto;
    const tieneAdjuntos = (mensaje.adjuntos || []).length > 0;

    // 1. Campanita: solo las que falten. lean: sin hidratar miles de documentos (tipos y timestamps explícitos).
    const mensajeObjId = new mongoose.Types.ObjectId(mensajeId);
    const yaNotificados = new Set(
      (
        // entidadTipo: sin él MongoDB no puede usar el índice PARCIAL mensaje_usuario_unico (auditoría 4.Y)
        await Notificacion.find({
          entidadTipo: 'Mensaje',
          entidadId: mensajeObjId,
          usuarioId: { $in: usuarios.map((u) => u._id) },
        })
          .select('usuarioId')
          .lean()
      ).map((n: any) => String(n.usuarioId)),
    );
    const faltan = usuarios.filter((u) => !yaNotificados.has(String(u._id)));
    comprobar();
    if (faltan.length > 0) {
      const ahora = new Date();
      const escuelaObjId = new mongoose.Types.ObjectId(escuelaId);
      // Auditoría 4.Y: el índice único { entidadId, usuarioId } descarta en la base las que otra ejecución ya
      // insertó (ordered:false inserta las demás); solo se toleran esos duplicados (11000).
      await Notificacion.insertMany(
        faltan.map((u: any) => ({
          usuarioId: new mongoose.Types.ObjectId(String(u._id)),
          titulo: `Nuevo mensaje: ${asunto}`,
          mensaje: `Has recibido un nuevo mensaje de ${nombreRemitente}`,
          tipo: TipoNotificacion.MENSAJE,
          estado: EstadoNotificacion.PENDIENTE,
          escuelaId: escuelaObjId,
          entidadId: mensajeObjId,
          entidadTipo: 'Mensaje',
          metadata: {
            remitente: nombreRemitente,
            tieneAdjuntos,
            mensajeId,
            url,
            // Fase 4.5: con preferencia 'resumen' no hay correo inmediato; el resumen diario incluye SOLO estas
            ...(this.correoAlResumen(u, prioridad) && { resumen: true }),
          },
          createdAt: ahora,
          updatedAt: ahora,
        })),
        { ordered: false, lean: true },
      ).catch((error: any) => {
        const errores: any[] = error?.writeErrors || [];
        if (errores.length > 0 && errores.every((e) => (e.code ?? e.err?.code) === 11000)) return;
        throw error;
      });
    }

    // 2. Correos + push en un solo insertMany, con claveUnica por lote (idempotente ante reintentos)
    const urgente = prioridad === PrioridadMensaje.ALTA || /urgente|emergencia/i.test(String(asunto || ''));
    // Auditoría 4.AC: la clave del lote sale de QUIÉNES contiene (hash), no de su posición
    const idsDelLote = (t: NuevoTrabajo): string[] =>
      t.payload.usuarioIds || (t.payload.destinatarios || []).map((d: any) => d.usuarioId || d.email);
    const conClave = (trabajos: NuevoTrabajo[], canal: string) =>
      trabajos.map((t) => ({ ...t, claveUnica: claveDeLote(`despacho:${mensajeId}:${canal}`, idsDelLote(t)) }));
    const trabajos: NuevoTrabajo[] = [
      ...conClave(
        construirTrabajosCorreo({
          destinatarios: usuarios
            .filter((u: any) => this.correoInmediato(u, prioridad))
            .map((u: any) => ({ email: u.email, nombre: u.nombre, usuarioId: String(u._id) })),
          plantilla: 'mensaje',
          datos: { remitente: nombreRemitente, asunto, fecha: new Date(), tieneAdjuntos, url },
          prioridad: prioridad === PrioridadMensaje.ALTA ? 'alta' : 'normal',
          escuelaId,
        }),
        'email',
      ),
      ...conClave(
        pushNotificationService.construirTrabajosPush({
          // Solo destinatarios directos con algún dispositivo
          usuarioIds: usuarios
            .filter((u: any) => setDest.has(String(u._id)) && (u.fcmToken || (u.fcmTokens || []).length > 0))
            .map((u: any) => String(u._id)),
          contenido: urgente
            ? {
                titulo: `🚨 URGENTE: ${nombreRemitente}`,
                mensaje: asunto,
                data: { tipo: 'urgente', mensajeId, prioridad: 'ALTA', remitente: nombreRemitente },
                sound: 'emergency',
              }
            : {
                titulo: `💬 Nuevo mensaje de ${nombreRemitente}`,
                mensaje: asunto,
                data: { tipo: 'mensaje', mensajeId, prioridad: prioridad || 'NORMAL', remitente: nombreRemitente },
              },
          prioridad: urgente ? 'alta' : 'normal',
          escuelaId,
        }),
        'push',
      ),
    ];
    comprobar();
    if (trabajos.length > 0) await encolar(trabajos);
  }

  /**
   * ¿Este destinatario recibe el correo del mensaje de inmediato? (Fase 4.5)
   * Prioridad ALTA → siempre. Si no, solo con preferencia 'inmediato'. Nunca a correos ficticios.
   */
  correoInmediato(usuario: any, prioridad?: string): boolean {
    if (!usuario?.email || esEmailFicticio(usuario.email)) return false;
    if (prioridad === PrioridadMensaje.ALTA) return true;
    return preferenciaEmail(usuario) === 'inmediato';
  }

  /** ¿El correo de este mensaje se omite ahora para ir en el resumen diario? (preferencia 'resumen') */
  correoAlResumen(usuario: any, prioridad?: string): boolean {
    if (!usuario?.email || esEmailFicticio(usuario.email)) return false;
    if (prioridad === PrioridadMensaje.ALTA) return false;
    return preferenciaEmail(usuario) === 'resumen';
  }

  /**
   * Encola la generación de las copias a acudientes (Fase 4.2): el request responde sin esperarlas.
   * Un trabajo por cada ~50 estudiantes; el handler es idempotente (copiaDe + índice único).
   */
  async encolarCopiasAcudientes(
    mensajeOriginalId: string,
    estudianteIds: string[],
    datos: any,
    usuarioOrigen: any,
  ): Promise<number> {
    const ids = [...new Set(estudianteIds.map(String))].filter((id) => mongoose.isValidObjectId(id));
    if (ids.length === 0) return 0;
    const usuario = {
      _id: String(usuarioOrigen._id),
      escuelaId: String(usuarioOrigen.escuelaId),
      tipo: usuarioOrigen.tipo,
      nombre: usuarioOrigen.nombre,
      apellidos: usuarioOrigen.apellidos,
    };
    const datosCopia = {
      asunto: datos.asunto,
      contenido: datos.contenido,
      adjuntos: datos.adjuntos || [],
      tipo: datos.tipo,
      prioridad: datos.prioridad,
      etiquetas: datos.etiquetas || [],
    };
    const trabajos: NuevoTrabajo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      trabajos.push({
        tipo: 'copias-acudientes',
        escuelaId: usuario.escuelaId,
        payload: { mensajeOriginalId: String(mensajeOriginalId), estudianteIds: ids.slice(i, i + 50), datos: datosCopia, usuario },
      });
    }
    return encolar(trabajos);
  }

  /**
   * 🚀 OPTIMIZADO: Enviar copia a acudientes con cache
   */
  async enviarCopiaAcudientes(estudianteId: string, datos: any, usuarioOrigen: any, copiaDe?: { mensajeId: string; estudianteId: string }) {
    try {
      if (!mongoose.isValidObjectId(estudianteId)) {
        logger.debug(`[WARNING] ID de estudiante inválido: ${estudianteId}`);
        return null;
      }

      const escuelaId = String(usuarioOrigen?.escuelaId || '');
      if (!mongoose.isValidObjectId(escuelaId)) {
        return null;
      }

      // El estudiante (su nombre va en la copia) debe estar activo en el colegio del remitente
      const estudiante: any = await Usuario.findOne({
        _id: estudianteId,
        escuelaId,
        tipo: 'ESTUDIANTE',
        estado: 'ACTIVO',
      })
        .select('nombre apellidos')
        .lean();
      if (!estudiante) {
        return null;
      }

      const cacheKey = this.createCacheKey('acudientes', escuelaId, estudianteId);

      // No cachear resultados vacíos — podrían contaminar llamadas futuras si la asociación aún no existía
      const cached = cache.get<any[]>(cacheKey);
      let acudientes: any[];
      if (cached && cached.length > 0) {
        logger.debug(`📋 CACHE HIT: ${cacheKey}`);
        acudientes = cached;
      } else {
        // Consulta simple por colegio (antes: $lookup con $expr sobre todos los colegios)
        acudientes = await Usuario.find({
          escuelaId,
          tipo: 'ACUDIENTE',
          'info_academica.estudiantes_asociados': new mongoose.Types.ObjectId(estudianteId),
        })
          .select('_id')
          .lean();
        // Solo cachear si hay resultados
        if (acudientes.length > 0) {
          if (safeCacheSet(cacheKey, acudientes, 300)) {
            logger.debug(`💾 CACHE SET: ${cacheKey} (300s)`);
          }
        }
      }

      if (acudientes.length === 0) {
        logger.debug(`[INFO] enviarCopiaAcudientes: no se encontraron acudientes para estudiante ${estudianteId}`);
        return null;
      }

      const copia = construirCopiaAcudiente(
        { asunto: datos.asunto, contenido: datos.contenido },
        usuarioOrigen || {},
        estudiante,
      );
      const mensajeAcudientes = {
        destinatarios: acudientes.map((a: any) => a._id.toString()),
        asunto: copia.asunto,
        contenido: copia.contenido,
        adjuntos: datos.adjuntos || [],
        tipo: datos.tipo || TipoMensaje.INDIVIDUAL,
        prioridad: datos.prioridad || PrioridadMensaje.NORMAL,
        estado: EstadoMensaje.ENVIADO,
        etiquetas: datos.etiquetas || [],
        esRespuesta: false,
        esCopiaAcudiente: true,
        ...(copiaDe && {
          copiaDe: {
            mensajeId: new mongoose.Types.ObjectId(copiaDe.mensajeId),
            estudianteId: new mongoose.Types.ObjectId(copiaDe.estudianteId),
          },
        }),
      };

      return this.crearMensaje(mensajeAcudientes, usuarioOrigen);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 🔄 INVALIDAR CACHE CUANDO SE CREAN/MODIFICAN MENSAJES
   */
  private invalidarCacheMensajes(usuarioId: string, escuelaId: string): void {
    logger.debug(`🔄 Invalidando cache de mensajes para usuario ${usuarioId}`);

    // Invalidar cache relacionado
    invalidateRelatedCache('mensajes', usuarioId, escuelaId, [
      'destinatarios',
      'cursos_destinatarios',
      'acudientes',
      'dashboard',
      'dashboard_completo',
    ]);
  }

  /**
   * 🚀 NUEVO MÉTODO: Obtener mensajes con cache
   */
  async obtenerMensajes(userId: string, filtros: any = {}) {
    const cacheKey = this.createCacheKey('lista_mensajes', userId, JSON.stringify(filtros));

    return await this.getOrSetCache(cacheKey, 120, async () => {
      // Implementar query optimizada para listar mensajes
      // (esto se puede expandir según tus necesidades específicas)
      return [];
    });
  }

  /**
   * Estadísticas de mensajes enviados por cada docente en un periodo.
   * Arranca desde la colección de docentes para incluir los que enviaron 0 mensajes.
   */
  async obtenerEstadisticasDocentes(
    escuelaId: string,
    params: {
      desde: string;
      hasta: string;
      cursoId?: string;
      docenteId?: string;
    },
  ) {
    try {
      const { desde, hasta, cursoId, docenteId } = params;

      const desdeDate = new Date(desde);
      const hastaDate = new Date(hasta);
      hastaDate.setUTCHours(23, 59, 59, 999);

      const matchDocentes: any = {
        tipo: 'DOCENTE',
        escuelaId: new mongoose.Types.ObjectId(escuelaId),
        estado: 'ACTIVO',
      };

      if (docenteId && mongoose.isValidObjectId(docenteId)) {
        matchDocentes._id = new mongoose.Types.ObjectId(docenteId);
      }

      if (cursoId && mongoose.isValidObjectId(cursoId)) {
        matchDocentes['info_academica.asignaturas_asignadas.cursoId'] =
          new mongoose.Types.ObjectId(cursoId);
      }

      const pipeline: any[] = [
        { $match: matchDocentes },
        {
          $lookup: {
            from: 'asignaturas',
            let: { docenteId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$docenteId', '$$docenteId'] } } },
              { $project: { cursoId: 1, _id: 0 } },
            ],
            as: 'asignaturasDocente',
          },
        },
        {
          $lookup: {
            from: 'mensajes',
            let: { docenteId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$remitente', '$$docenteId'] },
                      { $gte: ['$createdAt', desdeDate] },
                      { $lte: ['$createdAt', hastaDate] },
                      { $ne: ['$tipo', TipoMensaje.INDIVIDUAL] },
                      { $ne: ['$tipo', TipoMensaje.BORRADOR] },
                      { $ne: ['$esCopiaAcudiente', true] },
                    ],
                  },
                },
              },
              { $project: { cursoIds: 1, _id: 0 } },
            ],
            as: 'mensajesMasivosEnPeriodo',
          },
        },
        {
          $lookup: {
            from: 'mensajes',
            let: { docenteId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$remitente', '$$docenteId'] },
                      { $gte: ['$createdAt', desdeDate] },
                      { $lte: ['$createdAt', hastaDate] },
                      { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                      { $ne: ['$esCopiaAcudiente', true] },
                    ],
                  },
                },
              },
              { $unwind: '$destinatarios' },
              { $group: { _id: '$destinatarios' } },
            ],
            as: 'estudiantesContactados',
          },
        },
        {
          $lookup: {
            from: 'cursos',
            let: { studentIds: '$estudiantesContactados._id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $gt: [
                      {
                        $size: {
                          $ifNull: [
                            { $setIntersection: ['$estudiantes', '$$studentIds'] },
                            [],
                          ],
                        },
                      },
                      0,
                    ],
                  },
                },
              },
              { $project: { _id: 1 } },
            ],
            as: 'cursosDeEstudiantesContactados',
          },
        },
        {
          $addFields: {
            cursosIds: {
              $setUnion: [
                { $ifNull: ['$info_academica.cursos', []] },
                {
                  $map: {
                    input: { $ifNull: ['$info_academica.asignaturas_asignadas', []] },
                    as: 'a',
                    in: '$$a.cursoId',
                  },
                },
                {
                  $map: {
                    input: { $ifNull: ['$asignaturasDocente', []] },
                    as: 'a',
                    in: '$$a.cursoId',
                  },
                },
                {
                  $reduce: {
                    input: { $ifNull: ['$mensajesMasivosEnPeriodo', []] },
                    initialValue: [],
                    in: {
                      $concatArrays: [
                        '$$value',
                        { $ifNull: ['$$this.cursoIds', []] },
                      ],
                    },
                  },
                },
                {
                  $map: {
                    input: { $ifNull: ['$cursosDeEstudiantesContactados', []] },
                    as: 'c',
                    in: '$$c._id',
                  },
                },
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'cursos',
            localField: 'cursosIds',
            foreignField: '_id',
            pipeline: [
              {
                $match: {
                  $expr: { $gt: [{ $size: { $ifNull: ['$estudiantes', []] } }, 0] },
                },
              },
              { $project: { _id: 1, nombre: 1, grupo: 1 } },
            ],
            as: 'cursosInfo',
          },
        },
        {
          $lookup: {
            from: 'mensajes',
            let: { docenteId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$remitente', '$$docenteId'] },
                      { $gte: ['$createdAt', desdeDate] },
                      { $lte: ['$createdAt', hastaDate] },
                      { $ne: ['$esCopiaAcudiente', true] },
                      { $ne: ['$tipo', TipoMensaje.BORRADOR] },
                      { $not: [{ $regexMatch: { input: '$asunto', regex: /^\[COPIA\]/i } }] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, createdAt: 1 } },
            ],
            as: 'mensajes',
          },
        },
        {
          $project: {
            docenteId: '$_id',
            nombre: 1,
            apellidos: 1,
            count: { $size: '$mensajes' },
            ultimoMensaje: {
              $cond: {
                if: { $gt: [{ $size: '$mensajes' }, 0] },
                then: { $max: '$mensajes.createdAt' },
                else: null,
              },
            },
            cursos: {
              $map: {
                input: '$cursosInfo',
                as: 'c',
                in: { _id: '$$c._id', nombre: '$$c.nombre', grupo: '$$c.grupo' },
              },
            },
          },
        },
        { $sort: { count: 1 } },
      ];

      const docentes = await Usuario.aggregate(pipeline);

      return {
        data: docentes,
        meta: {
          desde: desdeDate.toISOString(),
          hasta: hastaDate.toISOString(),
          totalDocentes: docentes.length,
        },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Lista paginada de mensajes enviados por un docente en un periodo.
   * Excluye copias automáticas a acudientes y borradores.
   */
  async obtenerMensajesAuditoria(
    escuelaId: string,
    params: {
      remitenteId: string;
      desde: string;
      hasta: string;
      pagina?: number;
      limite?: number;
    },
  ) {
    try {
      const { remitenteId, desde, hasta, pagina = 1, limite = 20 } = params;

      if (!mongoose.isValidObjectId(remitenteId)) {
        throw new ApiError(400, 'remitenteId inválido');
      }

      const desdeDate = new Date(desde);
      const hastaDate = new Date(hasta);
      hastaDate.setUTCHours(23, 59, 59, 999);
      const skip = (pagina - 1) * limite;

      const pipeline: any[] = [
        {
          $match: {
            remitente: new mongoose.Types.ObjectId(remitenteId),
            escuelaId: new mongoose.Types.ObjectId(escuelaId),
            createdAt: { $gte: desdeDate, $lte: hastaDate },
            esCopiaAcudiente: { $ne: true },
            tipo: { $ne: TipoMensaje.BORRADOR },
            asunto: { $not: /^\[COPIA\]/i },
          },
        },
        {
          $lookup: {
            from: 'usuarios',
            let: { dests: '$destinatarios' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $in: ['$_id', '$$dests'] },
                      { $eq: ['$tipo', 'ESTUDIANTE'] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, nombre: 1, apellidos: 1 } },
            ],
            as: 'destinatariosEstudiantes',
          },
        },
        {
          $lookup: {
            from: 'cursos',
            localField: 'cursoIds',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, nombre: 1 } }],
            as: 'cursosInfo',
          },
        },
        {
          $lookup: {
            from: 'cursos',
            let: { estudianteId: { $arrayElemAt: ['$destinatariosEstudiantes._id', 0] } },
            pipeline: [
              {
                $match: {
                  $expr: { $in: ['$$estudianteId', '$estudiantes'] },
                },
              },
              { $project: { _id: 1, nombre: 1 } },
              { $limit: 1 },
            ],
            as: 'cursoEstudianteInfo',
          },
        },
        {
          $project: {
            asunto: 1,
            contenido: 1,
            createdAt: 1,
            tipo: 1,
            destinatario: {
              $cond: {
                if: { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $arrayElemAt: ['$destinatariosEstudiantes', 0] },
                else: '$$REMOVE',
              },
            },
            cursoEstudiante: {
              $cond: {
                if: { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $arrayElemAt: ['$cursoEstudianteInfo', 0] },
                else: null,
              },
            },
            cursoNombre: {
              $cond: {
                if: { $ne: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: {
                  $let: {
                    vars: {
                      curso: {
                        $ifNull: [
                          { $arrayElemAt: ['$cursosInfo', 0] },
                          { $arrayElemAt: ['$cursoEstudianteInfo', 0] },
                        ],
                      },
                    },
                    in: '$$curso.nombre',
                  },
                },
                else: '$$REMOVE',
              },
            },
            cantidadDestinatariosEstudiantes: {
              $cond: {
                if: { $ne: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $size: '$destinatariosEstudiantes' },
                else: '$$REMOVE',
              },
            },
          },
        },
        {
          $addFields: {
            cursoParaOrden: {
              $cond: {
                if: { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                then: { $ifNull: [{ $arrayElemAt: ['$cursoEstudianteInfo.nombre', 0] }, 'ZZZ'] },
                else: { $ifNull: ['$cursoNombre', 'ZZZ'] },
              },
            },
          },
        },
        { $sort: { cursoParaOrden: 1, createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limite }],
            total: [{ $count: 'count' }],
          },
        },
      ];

      const [result] = await Mensaje.aggregate(pipeline);
      const total: number = result.total[0]?.count ?? 0;
      const paginas = Math.ceil(total / limite);

      return {
        data: result.data,
        meta: { total, pagina, limite, paginas },
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Manejador de errores (sin cambios)
   */
  private handleError(error: any) {
    console.error('[Error en MensajeService]', error);

    if (error instanceof ApiError) {
      return error;
    }

    if (error.name === 'CastError') {
      return new ApiError(400, 'Formato de ID inválido: ' + (error.message || ''));
    }

    if (error.response) {
      return new ApiError(
        error.response.status || 500,
        error.response.data.message || 'Error en la solicitud',
      );
    } else if (error.request) {
      return new ApiError(500, 'No se recibió respuesta del servidor');
    } else {
      return new ApiError(500, error.message || 'Error desconocido');
    }
  }
}

export default new MensajeService();
