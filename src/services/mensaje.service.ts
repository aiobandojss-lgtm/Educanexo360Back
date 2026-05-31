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
import emailService, { esEmailFicticio } from './email.service';
import notificacionService from './notificacion.service';
import { cache, invalidateCache, invalidateRelatedCache } from '../cache/simpleCache';
import config from '../config/config';

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
      console.log(`📋 CACHE HIT: ${cacheKey}`);
      return cached;
    }

    const result = await fetchFunction();
    cache.set(cacheKey, result, ttl);
    console.log(`💾 CACHE SET: ${cacheKey} (${ttl}s)`);

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
      console.log(`🔍 getPosiblesDestinatarios: userId=${userId}, query='${query}'`);

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

        console.log(`✅ Destinatarios encontrados: ${resultado.length}`);
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

        console.log(`✅ Cursos encontrados: ${resultado.length}`);
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
      } = datos;

      // Verificar permisos básicos
      //if (user.tipo === 'ESTUDIANTE') {
        //throw new ApiError(403, 'Los estudiantes no pueden enviar mensajes');
      //}

      let destinatariosFinales = [...destinatarios];
      let destinatariosCcFinales = [...destinatariosCc];

      // 🚀 OPTIMIZACIÓN CRÍTICA: Procesar cursos con UNA SOLA AGREGACIÓN
      if (cursoIds && cursoIds.length > 0) {
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

        // ✅ UNA SOLA AGREGACIÓN MASIVA para obtener TODOS los destinatarios de TODOS los cursos
        const cursosDestinatarios = await this.obtenerDestinatariosDeCursos(cursoIds);
        destinatariosFinales.push(...cursosDestinatarios);
      }

      // Eliminar duplicados y validar
      destinatariosFinales = [...new Set(destinatariosFinales)];
      destinatariosCcFinales = [...new Set(destinatariosCcFinales)];

      if (destinatariosFinales.length === 0) {
        throw new ApiError(400, 'Debe especificar al menos un destinatario');
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
        cursoIds: cursoIds
          .map((id: string) => this.safeObjectId(id))
          .filter((id: any) => id !== null),
      })) as mongoose.Document & { _id: mongoose.Types.ObjectId };

      // 🚀 OPTIMIZACIÓN: Envío de notificaciones en BATCH
      if (estado !== EstadoMensaje.BORRADOR) {
        await this.enviarNotificacionesEnBatch(
          nuevoMensaje._id.toString(),
          [...destinatariosFinales, ...destinatariosCcFinales],
          asunto,
          user,
          adjuntos.length > 0,
        );
      }

      // ✅ POPULATE OPTIMIZADO (solo campos necesarios)
      await nuevoMensaje.populate([
        { path: 'remitente', select: 'nombre apellidos email tipo' },
        { path: 'destinatarios', select: 'nombre apellidos email tipo' },
        { path: 'destinatariosCc', select: 'nombre apellidos email tipo' },
      ]);

      // 🔄 INVALIDAR CACHE RELACIONADO
      this.invalidarCacheMensajes(user._id, user.escuelaId);

      return nuevoMensaje;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * 🚀 NUEVA FUNCIÓN: Obtener destinatarios de múltiples cursos con UNA SOLA AGREGACIÓN
   */
  private async obtenerDestinatariosDeCursos(cursoIds: string[]): Promise<string[]> {
    const validCursoIds = cursoIds.map((id) => this.safeObjectId(id)).filter((id) => id !== null);

    if (validCursoIds.length === 0) {
      return [];
    }

    // ✅ UNA SOLA AGREGACIÓN MASIVA para TODOS los cursos
    const resultado = await Curso.aggregate([
      {
        $match: {
          _id: { $in: validCursoIds },
        },
      },
      {
        $unwind: {
          path: '$estudiantes',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: null,
          estudiantesIds: { $addToSet: '$estudiantes' },
        },
      },
      {
        $lookup: {
          from: 'usuarios',
          let: { estudiantesIds: '$estudiantesIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $in: ['$_id', '$$estudiantesIds'] },
                    { $eq: ['$tipo', 'ESTUDIANTE'] },
                    { $eq: ['$estado', 'ACTIVO'] },
                  ],
                },
              },
            },
            {
              $project: { _id: 1 },
            },
          ],
          as: 'estudiantes_activos',
        },
      },
      {
        $lookup: {
          from: 'usuarios',
          let: { estudiantesIds: '$estudiantesIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$tipo', 'ACUDIENTE'] },
                    {
                      $ne: [
                        {
                          $size: {
                            $setIntersection: [
                              '$info_academica.estudiantes_asociados',
                              '$$estudiantesIds',
                            ],
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            {
              $project: { _id: 1 },
            },
          ],
          as: 'acudientes',
        },
      },
      {
        $project: {
          _id: 0,
          todos_destinatarios: {
            $concatArrays: [
              { $map: { input: '$estudiantes_activos', as: 'e', in: { $toString: '$$e._id' } } },
              { $map: { input: '$acudientes', as: 'a', in: { $toString: '$$a._id' } } },
            ],
          },
        },
      },
    ]);

    const destinatarios = resultado.length > 0 ? resultado[0].todos_destinatarios : [];
    console.log(`✅ Destinatarios de cursos obtenidos: ${destinatarios.length}`);

    return destinatarios;
  }

  /**
   * 🚀 NUEVA FUNCIÓN: Envío de notificaciones optimizado EN BATCH
   */
  private async enviarNotificacionesEnBatch(
    mensajeId: string,
    destinatariosIds: string[],
    asunto: string,
    remitente: any,
    tieneAdjuntos: boolean,
  ): Promise<void> {
    try {
      const validDestinatariosIds = destinatariosIds
        .map((id) => this.safeObjectId(id))
        .filter((id) => id !== null);

      if (validDestinatariosIds.length === 0) return;

      // ✅ UNA SOLA QUERY para obtener TODOS los destinatarios
      const usuarios = await Usuario.find({
        _id: { $in: validDestinatariosIds },
        estado: 'ACTIVO',
      }).select('_id email nombre apellidos');

      const nombreRemitente = `${remitente.nombre} ${remitente.apellidos}`.trim();

      // 🚀 PROCESAR NOTIFICACIONES EN PARALELO CON LÍMITE
      const batchSize = 20; // Procesar de 20 en 20 para no sobrecargar

      for (let i = 0; i < usuarios.length; i += batchSize) {
        const batch = usuarios.slice(i, i + batchSize);

        const promesasBatch = batch.map(async (destinatario: any) => {
          const destId = destinatario._id.toString();

          // Notificación interna y email en paralelo
          const [,] = await Promise.all([
            notificacionService.crearNotificacion({
              usuarioId: destId,
              titulo: `Nuevo mensaje: ${asunto}`,
              mensaje: `Has recibido un nuevo mensaje de ${nombreRemitente}`,
              tipo: TipoNotificacion.MENSAJE,
              escuelaId: remitente.escuelaId,
              entidadId: mensajeId,
              entidadTipo: 'Mensaje',
              metadata: {
                remitente: nombreRemitente,
                tieneAdjuntos,
                mensajeId,
                url: `${config.frontendUrl}/mensajes/${mensajeId}`,
              },
              enviarEmail: false,
            }),

            // Email solo si tiene correo real (excluye correos ficticios de estudiantes)
            destinatario.email && !esEmailFicticio(destinatario.email)
              ? emailService.sendMensajeNotification(destinatario.email, {
                  remitente: nombreRemitente,
                  asunto,
                  fecha: new Date(),
                  tieneAdjuntos,
                  url: `${config.frontendUrl}/mensajes/${mensajeId}`,
                })
              : Promise.resolve(),
          ]);
        });

        // Esperar que termine el batch antes del siguiente
        await Promise.all(promesasBatch);

        // Pequeña pausa entre batches para no sobrecargar
        if (i + batchSize < usuarios.length) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Notificaciones enviadas a ${usuarios.length} destinatarios`);
    } catch (error) {
      console.error('Error enviando notificaciones en batch:', error);
      // No lanzar error para no afectar la creación del mensaje
    }
  }

  /**
   * 🚀 OPTIMIZADO: Enviar copia a acudientes con cache
   */
  async enviarCopiaAcudientes(estudianteId: string, datos: any, usuarioOrigen: any) {
    try {
      if (!mongoose.isValidObjectId(estudianteId)) {
        console.log(`[WARNING] ID de estudiante inválido: ${estudianteId}`);
        return null;
      }

      const cacheKey = this.createCacheKey('acudientes', estudianteId);

      // No cachear resultados vacíos — podrían contaminar llamadas futuras si la asociación aún no existía
      const cached = cache.get<any[]>(cacheKey);
      let acudientes: any[];
      if (cached && cached.length > 0) {
        console.log(`📋 CACHE HIT: ${cacheKey}`);
        acudientes = cached;
      } else {
        acudientes = await Usuario.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(estudianteId),
              tipo: 'ESTUDIANTE',
              estado: 'ACTIVO',
            },
          },
          {
            $lookup: {
              from: 'usuarios',
              let: { estudianteId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$tipo', 'ACUDIENTE'] },
                        { $in: ['$$estudianteId', '$info_academica.estudiantes_asociados'] },
                      ],
                    },
                  },
                },
                {
                  $project: { _id: 1 },
                },
              ],
              as: 'acudientes',
            },
          },
          {
            $unwind: '$acudientes',
          },
          {
            $replaceRoot: { newRoot: '$acudientes' },
          },
        ]);
        // Solo cachear si hay resultados
        if (acudientes.length > 0) {
          cache.set(cacheKey, acudientes, 300);
          console.log(`💾 CACHE SET: ${cacheKey} (300s)`);
        }
      }

      if (acudientes.length === 0) {
        console.log(`[INFO] enviarCopiaAcudientes: no se encontraron acudientes para estudiante ${estudianteId}`);
        return null;
      }

      const mensajeAcudientes = {
        destinatarios: acudientes.map((a: any) => a._id.toString()),
        asunto: `[COPIA] ${datos.asunto}`,
        contenido: `Este mensaje ha sido enviado automáticamente como copia del mensaje enviado a su acudido.\n\n${datos.contenido}`,
        adjuntos: datos.adjuntos || [],
        tipo: datos.tipo || TipoMensaje.INDIVIDUAL,
        prioridad: datos.prioridad || PrioridadMensaje.NORMAL,
        estado: EstadoMensaje.ENVIADO,
        etiquetas: datos.etiquetas || [],
        esRespuesta: false,
        esCopiaAcudiente: true,
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
    console.log(`🔄 Invalidando cache de mensajes para usuario ${usuarioId}`);

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
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'cursos',
            localField: 'cursosIds',
            foreignField: '_id',
            pipeline: [{ $project: { _id: 1, nombre: 1 } }],
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
                in: { _id: '$$c._id', nombre: '$$c.nombre' },
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
                    vars: { curso: { $arrayElemAt: ['$cursosInfo', 0] } },
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
