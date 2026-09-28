// src/controllers/mensaje.controller.ts

import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Mensaje from '../models/mensaje.model';
import Usuario from '../models/usuario.model';
import emailService from '../services/email.service';
import notificacionService from '../services/notificacion.service';
import mensajeService from '../services/mensaje.service'; // Importamos el nuevo servicio
import { escapeRegex } from '../utils/escapeRegex';
import config from '../config/config';
import ApiError from '../utils/ApiError';
import { TipoMensaje, EstadoMensaje, PrioridadMensaje } from '../interfaces/IMensaje';
import { TipoNotificacion } from '../interfaces/INotificacion';
import { TipoUsuario } from '../interfaces/IUsuario'; // Agregamos la importación
import fs from 'fs';
import path from 'path';
import { numeroPagina, numeroLimite } from '../utils/paginacion';
import { logger } from '../utils/logger';
import { subirAdjuntos, eliminarAdjuntos } from '../utils/adjuntos';
import { abrirArchivo, existeArchivo, eliminarArchivo } from '../services/storage';

// Bucket (GridFS) / prefijo de clave de los adjuntos de mensajes
const BUCKET_MENSAJES = 'uploads';
import { contentDispositionAdjunto } from '../utils/contentDisposition';

export const ROLES_CON_BORRADORES = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'];

interface RequestWithUser extends Request {
  user?: {
    _id: string;
    escuelaId: string;
    tipo: TipoUsuario;
    email: string;
    nombre: string;
    apellidos: string;
    estado: string;
    permisos: string[];
    perfilRolId?: string;
    info_academica?: any;
  };
  files?: Express.Multer.File[];
}

// Interfaz para las lecturas de mensaje
interface ILectura {
  usuarioId: mongoose.Types.ObjectId;
  fechaLectura: Date;
}

/**
 * IDs (string) de los usuarios ACTIVOS del colegio entre los recibidos (mismo criterio que crearMensaje):
 * los destinatarios de otro colegio o inactivos se descartan.
 */
const idsDestinatariosValidos = async (ids: unknown[], escuelaId: string): Promise<Set<string>> => {
  const lista = ids.map((d: any) => String(d?._id ?? d)).filter((d) => mongoose.isValidObjectId(d));
  if (lista.length === 0 || !mongoose.isValidObjectId(escuelaId)) return new Set();
  const validos = await Usuario.find({ _id: { $in: lista }, escuelaId, estado: 'ACTIVO' })
    .select('_id')
    .lean();
  return new Set(validos.map((u: any) => String(u._id)));
};

/**
 * Rollback de adjuntos ya subidos cuando el guardado falla (auditoría 3.O), SOLO si ningún mensaje quedó
 * guardado apuntando a esos archivos (auditoría 3.X): crearMensaje hace Mensaje.create y después populate;
 * si falla lo posterior, el mensaje existe y sus adjuntos deben quedarse. Ante duda (error al consultar),
 * no se borra: un archivo huérfano es preferible a un adjunto roto.
 */
const revertirAdjuntosSinMensaje = async (refs: any[]): Promise<void> => {
  if (refs.length === 0) return;
  const ids = refs.map((r) => r.fileId);
  const referenciado = await Mensaje.exists({ 'adjuntos.fileId': { $in: ids } }).catch(() => true);
  if (referenciado) return;
  await eliminarAdjuntos(refs, BUCKET_MENSAJES);
};

export class MensajeController {
  // Método para obtener posibles destinatarios según el rol del usuario
  async getPosiblesDestinatarios(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Logs de depuración solo en el servidor (LOG_LEVEL=debug); antes se devolvían al cliente
      const logDebug = (message: string) => logger.debug(message);

      // Validar IDs
      if (!mongoose.isValidObjectId(req.user._id)) {
        throw new ApiError(400, 'ID de usuario inválido');
      }

      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(400, 'ID de escuela inválido');
      }

      const queryParam = req.query.q as string;
      const searchQuery = queryParam ? queryParam.trim() : '';

      logDebug(
        `[DEBUG] Controlador - Buscando destinatarios para usuario: ${req.user._id} (${req.user.nombre} ${req.user.apellidos}), escuela: ${req.user.escuelaId}, tipo: ${req.user.tipo}, query: '${searchQuery}'`,
      );

      let destinatarios: any[] = [];
      const tipoUsuario = req.user.tipo;

      // 1. ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO: pueden ver a todos los usuarios
      if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(tipoUsuario)) {
        logDebug('[DEBUG] Usuario administrativo - Mostrando todos los usuarios');

        try {
          const filter: any = {
            escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
            _id: { $ne: new mongoose.Types.ObjectId(req.user._id) },
            estado: 'ACTIVO',
          };

          if (searchQuery) {
            const searchRegex = new RegExp(escapeRegex(searchQuery), 'i');
            filter.$or = [
              { nombre: searchRegex },
              { apellidos: searchRegex },
              { email: searchRegex },
            ];
          }

          // Contar total de usuarios disponibles para información
          const totalUsuarios = await Usuario.countDocuments({
            escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
            _id: { $ne: new mongoose.Types.ObjectId(req.user._id) },
            estado: 'ACTIVO',
          });

          logDebug(`[DEBUG] Total usuarios disponibles en la escuela: ${totalUsuarios}`);

          // Estrategia inteligente de límites
          let limite = 500; // Límite por defecto

          if (totalUsuarios > 1000 && !searchQuery) {
            limite = 250; // Menos usuarios sin búsqueda en escuelas grandes
            logDebug(
              `[DEBUG] Escuela grande (${totalUsuarios} usuarios), aplicando límite de ${limite} sin búsqueda`,
            );
          } else if (searchQuery) {
            limite = 100; // Límite para búsquedas específicas
            logDebug(`[DEBUG] Búsqueda activa, aplicando límite de ${limite}`);
          }

          destinatarios = await Usuario.find(filter)
            .select('_id nombre apellidos email tipo')
            .limit(limite)
            .sort({ nombre: 1, apellidos: 1 });

          logDebug(
            `[DEBUG] Usuarios encontrados: ${destinatarios.length} de ${totalUsuarios} totales`,
          );
        } catch (error) {
          logDebug(`[DEBUG ERROR] Error en consulta: ${error}`);
          destinatarios = [];
        }
      }

      // 2. DOCENTES: lógica mejorada con validación de IDs
      else if (tipoUsuario === 'DOCENTE') {
        logDebug(
          `[DEBUG] Usuario docente - Obteniendo destinatarios para: ${req.user.nombre} ${req.user.apellidos}`,
        );

        try {
          // Sets para recolectar IDs válidos
          const estudiantesIds = new Set<string>();
          const acudientesIds = new Set<string>();
          const personalIds = new Set<string>();

          // 2.1 Obtener cursos donde es director de grupo
          logDebug('[DEBUG] 2.1 - Buscando cursos donde es director de grupo...');

          try {
            const cursosDirigidos = await mongoose
              .model('Curso')
              .find({
                director_grupo: new mongoose.Types.ObjectId(req.user._id),
                escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
                estado: 'ACTIVO',
              })
              .select('_id estudiantes nombre');

            logDebug(`[DEBUG] 2.1 - Cursos dirigidos encontrados: ${cursosDirigidos.length}`);

            for (const curso of cursosDirigidos) {
              logDebug(
                `[DEBUG] 2.1 - Procesando curso dirigido: ${curso.nombre} con ${
                  curso.estudiantes?.length || 0
                } estudiantes`,
              );
              if (Array.isArray(curso.estudiantes)) {
                curso.estudiantes.forEach((estudianteId: any) => {
                  if (estudianteId && mongoose.isValidObjectId(estudianteId)) {
                    estudiantesIds.add(estudianteId.toString());
                    logDebug(
                      `[DEBUG] 2.1 - Agregado estudiante de curso dirigido: ${estudianteId}`,
                    );
                  }
                });
              }
            }
          } catch (error) {
            logDebug(`[DEBUG ERROR] Error obteniendo cursos dirigidos: ${error}`);
          }

          // 2.2 Obtener asignaturas que dicta
          logDebug('[DEBUG] 2.2 - Buscando asignaturas que dicta...');

          try {
            const asignaturas = await mongoose
              .model('Asignatura')
              .find({
                docenteId: new mongoose.Types.ObjectId(req.user._id),
                escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
                estado: 'ACTIVO',
              })
              .select('_id cursoId nombre');

            logDebug(`[DEBUG] 2.2 - Asignaturas encontradas: ${asignaturas.length}`);

            const cursosAsignaturas = new Set<string>();
            asignaturas.forEach((asig, index) => {
              if (asig.cursoId && mongoose.isValidObjectId(asig.cursoId)) {
                cursosAsignaturas.add(asig.cursoId.toString());
                logDebug(
                  `[DEBUG] 2.2.${index + 1} - Asignatura: "${asig.nombre}" en curso: ${
                    asig.cursoId
                  }`,
                );
              } else {
                logDebug(
                  `[DEBUG] 2.2.${index + 1} - Asignatura: "${asig.nombre}" SIN CURSO VÁLIDO`,
                );
              }
            });

            logDebug(`[DEBUG] 2.2 - Cursos únicos de asignaturas: ${cursosAsignaturas.size}`);

            // 2.3 Obtener estudiantes de los cursos donde dicta asignaturas
            if (cursosAsignaturas.size > 0) {
              logDebug('[DEBUG] 2.3 - Obteniendo estudiantes de cursos de asignaturas...');

              const cursosConEstudiantes = await mongoose
                .model('Curso')
                .find({
                  _id: {
                    $in: Array.from(cursosAsignaturas).map((id) => new mongoose.Types.ObjectId(id)),
                  },
                  estado: 'ACTIVO',
                })
                .select('_id estudiantes nombre');

              logDebug(
                `[DEBUG] 2.3 - Cursos con estudiantes encontrados: ${cursosConEstudiantes.length}`,
              );

              for (const curso of cursosConEstudiantes) {
                logDebug(
                  `[DEBUG] 2.3 - Procesando curso de asignatura: ${curso.nombre} con ${
                    curso.estudiantes?.length || 0
                  } estudiantes`,
                );

                if (Array.isArray(curso.estudiantes)) {
                  curso.estudiantes.forEach((estudianteId: any) => {
                    if (estudianteId && mongoose.isValidObjectId(estudianteId)) {
                      estudiantesIds.add(estudianteId.toString());
                      logDebug(`[DEBUG] 2.3 - Agregado estudiante: ${estudianteId}`);
                    } else {
                      logDebug(`[DEBUG] 2.3 - ID de estudiante inválido: ${estudianteId}`);
                    }
                  });
                }
              }
            } else {
              logDebug('[DEBUG] 2.3 - NO HAY CURSOS DE ASIGNATURAS PARA PROCESAR');
            }
          } catch (error) {
            logDebug(`[DEBUG ERROR] Error obteniendo asignaturas: ${error}`);
          }

          logDebug(`[DEBUG] 2.4 - Total estudiantes únicos encontrados: ${estudiantesIds.size}`);

          // 2.4 VALIDAR Y FILTRAR ESTUDIANTES EXISTENTES
          if (estudiantesIds.size > 0) {
            logDebug('[DEBUG] 2.4 - Validando estudiantes existentes...');

            try {
              // Consulta para verificar qué estudiantes realmente existen
              const estudiantesValidos = await Usuario.find({
                _id: {
                  $in: Array.from(estudiantesIds).map((id) => new mongoose.Types.ObjectId(id)),
                },
                tipo: 'ESTUDIANTE',
                estado: 'ACTIVO',
                escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
              }).select('_id nombre apellidos');

              logDebug(
                `[DEBUG] 2.4 - Estudiantes válidos encontrados: ${estudiantesValidos.length}`,
              );

              // Actualizar el set solo con estudiantes válidos
              estudiantesIds.clear();
              estudiantesValidos.forEach((estudiante) => {
                if (estudiante._id) {
                  const estudianteId = estudiante._id.toString();
                  estudiantesIds.add(estudianteId);
                  logDebug(
                    `[DEBUG] 2.4 - Estudiante válido: ${estudianteId} (${estudiante.nombre} ${estudiante.apellidos})`,
                  );
                }
              });

              // 2.5 Obtener acudientes de estudiantes válidos
              if (estudiantesIds.size > 0) {
                logDebug('[DEBUG] 2.5 - Buscando acudientes de estudiantes válidos...');

                const estudiantesIdsArray = Array.from(estudiantesIds);
                const acudientesInfo = await Usuario.find({
                  'info_academica.estudiantes_asociados': {
                    $in: estudiantesIdsArray.map((id) => new mongoose.Types.ObjectId(id)),
                  },
                  tipo: 'ACUDIENTE',
                  estado: 'ACTIVO',
                  escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
                }).select('_id nombre apellidos');

                logDebug(`[DEBUG] 2.5 - Acudientes encontrados: ${acudientesInfo.length}`);

                acudientesInfo.forEach((acudiente) => {
                  if (acudiente._id) {
                    const acudienteId = acudiente._id.toString();
                    acudientesIds.add(acudienteId);
                    logDebug(
                      `[DEBUG] 2.5 - Agregado acudiente: ${acudienteId} (${acudiente.nombre} ${acudiente.apellidos})`,
                    );
                  }
                });
              } else {
                logDebug('[DEBUG] 2.5 - NO HAY ESTUDIANTES VÁLIDOS, NO SE BUSCAN ACUDIENTES');
              }
            } catch (error) {
              logDebug(`[DEBUG ERROR] Error validando estudiantes: ${error}`);
            }
          } else {
            logDebug('[DEBUG] 2.4 - NO HAY ESTUDIANTES PARA VALIDAR');
          }

          // 2.6 Obtener personal administrativo y otros docentes
          logDebug('[DEBUG] 2.6 - Obteniendo personal administrativo y docentes...');

          try {
            const personalYDocentes = await Usuario.find({
              tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'] },
              _id: { $ne: new mongoose.Types.ObjectId(req.user._id) },
              estado: 'ACTIVO',
              escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
            }).select('_id nombre apellidos tipo');

            logDebug(`[DEBUG] 2.6 - Personal y docentes encontrados: ${personalYDocentes.length}`);

            personalYDocentes.forEach((p) => {
              if (p._id) {
                const personalId = p._id.toString();
                personalIds.add(personalId);
                logDebug(
                  `[DEBUG] 2.6 - Agregado ${p.tipo}: ${personalId} (${p.nombre} ${p.apellidos})`,
                );
              }
            });
          } catch (error) {
            logDebug(`[DEBUG ERROR] Error obteniendo personal: ${error}`);
          }

          // 2.7 COMBINAR TODOS LOS IDS VÁLIDOS
          const todosLosIds = new Set<string>();

          // Agregar estudiantes válidos
          estudiantesIds.forEach((id) => todosLosIds.add(id));

          // Agregar acudientes válidos
          acudientesIds.forEach((id) => todosLosIds.add(id));

          // Agregar personal válido
          personalIds.forEach((id) => todosLosIds.add(id));

          logDebug(`[DEBUG] 2.7 - Total IDs únicos recolectados: ${todosLosIds.size}`);
          logDebug(
            `[DEBUG] 2.7 - Distribución: Estudiantes=${estudiantesIds.size}, Acudientes=${acudientesIds.size}, Personal=${personalIds.size}`,
          );

          // 2.8 Consulta final con filtro de búsqueda
          if (todosLosIds.size > 0) {
            logDebug('[DEBUG] 2.8 - Ejecutando consulta final...');

            try {
              // Crear el filtro base
              const filter: any = {
                _id: {
                  $in: Array.from(todosLosIds).map((id) => new mongoose.Types.ObjectId(id)),
                },
                escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
                estado: 'ACTIVO',
              };

              // Aplicar filtro de búsqueda si existe
              if (searchQuery) {
                const searchRegex = new RegExp(escapeRegex(searchQuery), 'i');
                filter.$or = [
                  { nombre: searchRegex },
                  { apellidos: searchRegex },
                  { email: searchRegex },
                ];
                logDebug(`[DEBUG] 2.8 - Aplicando filtro de búsqueda: "${searchQuery}"`);
              }

              // CONSULTA FINAL - SIN LÍMITE PARA VER TODOS LOS RESULTADOS
              destinatarios = await Usuario.find(filter)
                .select('_id nombre apellidos email tipo')
                .sort({ tipo: 1, nombre: 1 });

              logDebug(
                `[DEBUG] 2.8 - Destinatarios finales después del filtrado: ${destinatarios.length}`,
              );

              // Debug final por tipo
              const tiposCount = destinatarios.reduce((acc: any, dest: any) => {
                acc[dest.tipo] = (acc[dest.tipo] || 0) + 1;
                return acc;
              }, {});
              logDebug(`[DEBUG] 2.8 - Distribución por tipo: ${JSON.stringify(tiposCount)}`);

              // Aplicar límite final después de debug
              if (destinatarios.length > 150) {
                destinatarios = destinatarios.slice(0, 150);
                logDebug(`[DEBUG] 2.8 - Aplicado límite final: ${destinatarios.length} resultados`);
              }

              // Mostrar algunos ejemplos de cada tipo
              Object.keys(tiposCount).forEach((tipo) => {
                const ejemplosTipo = destinatarios.filter((d) => d.tipo === tipo).slice(0, 2);
                ejemplosTipo.forEach((dest, index) => {
                  logDebug(
                    `[DEBUG] 2.8 - Ejemplo ${tipo} ${index + 1}: ${dest.nombre} ${dest.apellidos}`,
                  );
                });
              });
            } catch (error) {
              logDebug(`[DEBUG ERROR] Error en consulta final: ${error}`);
              destinatarios = [];
            }
          } else {
            logDebug('[DEBUG] 2.8 - NO HAY IDS VÁLIDOS PARA CONSULTAR');
            destinatarios = [];
          }
        } catch (error) {
          logDebug(`[DEBUG ERROR] Error general en lógica de docente: ${error}`);
          destinatarios = [];
        }
      }

      // 3. ACUDIENTES Y ESTUDIANTES: redirigir al método especializado
      else if (tipoUsuario === 'ACUDIENTE' || tipoUsuario === 'ESTUDIANTE') {
        logDebug(`[DEBUG] Usuario ${tipoUsuario} - usando lógica de acudiente`);
        return this.getDestinatariosParaAcudiente(req, res, next);
      }

      // 5. Tipo de usuario no reconocido
      else {
        logDebug(`[DEBUG] Tipo de usuario no reconocido: ${tipoUsuario}`);
        destinatarios = [];
      }

      logDebug(`[DEBUG] RESULTADO FINAL - Destinatarios encontrados: ${destinatarios.length}`);

      return res.json({
        success: true,
        data: destinatarios,
      });
    } catch (error: any) {
      console.error('[DEBUG ERROR] Error general al obtener destinatarios:', error);

      const errorMessage =
        error instanceof ApiError
          ? error.message
          : 'Error interno del servidor al obtener destinatarios';

      const statusCode = error instanceof ApiError ? error.statusCode : 500;

      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        data: [],
        debug: [`[DEBUG ERROR] Error general: ${error.message || error}`],
      });
    }
  }

  async guardarBorrador(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario tiene permiso para crear borradores
      if (!ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para guardar borradores');
      }

      // ===== DEBUG: Ver EXACTAMENTE qué llega =====
      logger.debug('=== DEBUG DESTINATARIOS ===');
      logger.debug('req.body completo:', JSON.stringify(req.body, null, 2));
      logger.debug('req.files:', req.files ? req.files.length : 0);
      logger.debug('Tipo de destinatarios:', typeof req.body.destinatarios);
      logger.debug('Valor destinatarios:', req.body.destinatarios);
      logger.debug('Es array destinatarios:', Array.isArray(req.body.destinatarios));

      // ===== EXTRACCIÓN MEJORADA DE DESTINATARIOS =====
      let destinatariosArray: string[] = [];
      let destinatariosCcArray: string[] = [];

      // Procesar destinatarios - manejo robusto para FormData y JSON
      if (req.body.destinatarios) {
        logger.debug('Procesando destinatarios...');

        if (typeof req.body.destinatarios === 'string') {
          try {
            // Intentar parsear como JSON primero
            destinatariosArray = JSON.parse(req.body.destinatarios);
            logger.debug('Destinatarios parseados desde JSON:', destinatariosArray);
          } catch (error) {
            // Si falla, asumir que es un solo ID
            destinatariosArray = [req.body.destinatarios];
            logger.debug('Destinatarios como string único:', destinatariosArray);
          }
        } else if (Array.isArray(req.body.destinatarios)) {
          destinatariosArray = req.body.destinatarios;
          logger.debug('Destinatarios como array directo:', destinatariosArray);
        } else {
          logger.debug('Destinatarios en formato desconocido, usando array vacío');
          destinatariosArray = [];
        }
      }

      // Procesar destinatarios CC de manera similar
      if (req.body.destinatariosCc) {
        if (typeof req.body.destinatariosCc === 'string') {
          try {
            destinatariosCcArray = JSON.parse(req.body.destinatariosCc);
          } catch (error) {
            destinatariosCcArray = [req.body.destinatariosCc];
          }
        } else if (Array.isArray(req.body.destinatariosCc)) {
          destinatariosCcArray = req.body.destinatariosCc;
        }
      }

      logger.debug('Destinatarios finales (string array):', destinatariosArray);
      logger.debug('Destinatarios CC finales (string array):', destinatariosCcArray);

      // ===== CONVERSIÓN A OBJECTID CON DEBUG =====
      const destinatariosObjectIds: mongoose.Types.ObjectId[] = [];
      if (destinatariosArray.length > 0) {
        logger.debug('Convirtiendo destinatarios a ObjectId...');

        for (let i = 0; i < destinatariosArray.length; i++) {
          const dest = destinatariosArray[i];
          logger.debug(`Destinatario ${i}: "${dest}" (tipo: ${typeof dest})`);

          if (dest && typeof dest === 'string' && dest.trim() !== '') {
            if (mongoose.isValidObjectId(dest)) {
              destinatariosObjectIds.push(new mongoose.Types.ObjectId(dest));
              logger.debug(`✓ Destinatario ${i} válido agregado`);
            } else {
              logger.debug(`✗ Destinatario ${i} no es ObjectId válido: ${dest}`);
            }
          } else {
            logger.debug(`✗ Destinatario ${i} vacío o inválido`);
          }
        }
      }

      const destinatariosCcObjectIds: mongoose.Types.ObjectId[] = [];
      if (destinatariosCcArray.length > 0) {
        for (const dest of destinatariosCcArray) {
          if (dest && typeof dest === 'string' && mongoose.isValidObjectId(dest)) {
            destinatariosCcObjectIds.push(new mongoose.Types.ObjectId(dest));
          }
        }
      }

      // Solo destinatarios ACTIVOS del mismo colegio (auditoría 3.C; mismo criterio que crearMensaje)
      const validosBorrador = await idsDestinatariosValidos(
        [...destinatariosObjectIds, ...destinatariosCcObjectIds],
        String(req.user.escuelaId),
      );
      const filtrarValidos = (lista: mongoose.Types.ObjectId[]) => {
        const filtrados = lista.filter((id) => validosBorrador.has(String(id)));
        lista.splice(0, lista.length, ...filtrados);
      };
      filtrarValidos(destinatariosObjectIds);
      filtrarValidos(destinatariosCcObjectIds);

      logger.debug('Destinatarios ObjectId finales:', destinatariosObjectIds.length);
      logger.debug('Destinatarios CC ObjectId finales:', destinatariosCcObjectIds.length);

      // ===== RESTO DE LA LÓGICA (sin cambios) =====
      const {
        asunto = '(Sin asunto)',
        contenido = '',
        prioridad = PrioridadMensaje.NORMAL,
        etiquetas = [],
      } = req.body;

      // Validar prioridad
      const prioridadesValidas = ['ALTA', 'NORMAL', 'BAJA'];
      const prioridadFinal = prioridadesValidas.includes(prioridad)
        ? prioridad
        : PrioridadMensaje.NORMAL;

      // Verificar si es un borrador existente
      const borradorId = req.query.id || req.body.id;
      let borrador;

      if (borradorId && mongoose.isValidObjectId(borradorId)) {
        // ===== ACTUALIZAR BORRADOR EXISTENTE =====
        borrador = await Mensaje.findOne({
          _id: borradorId,
          remitente: req.user._id,
          tipo: TipoMensaje.BORRADOR,
        });

        if (!borrador) {
          throw new ApiError(404, 'Borrador no encontrado');
        }

        logger.debug(
          'Actualizando borrador existente con destinatarios:',
          destinatariosObjectIds.length,
        );

        // Actualizar campos básicos
        borrador.asunto = asunto;
        borrador.contenido = contenido;
        borrador.prioridad = prioridadFinal as any;
        borrador.destinatarios = destinatariosObjectIds;
        borrador.destinatariosCc = destinatariosCcObjectIds;
        borrador.etiquetas = Array.isArray(etiquetas) ? etiquetas : [etiquetas].filter(Boolean);

        // ===== MANEJO DE ADJUNTOS =====
        // Orden (auditoría 3.P): validar → subir los nuevos → guardar → solo entonces borrar los anteriores.
        // Antes se borraban primero: si la subida o el guardado fallaban, el borrador quedaba apuntando a
        // archivos que ya no existían.
        let adjuntosAnteriores: { fileId: any; nombre: string }[] = [];
        let idsNuevos: any[] = [];
        if (req.files && req.files.length > 0) {
          logger.debug('Se enviaron nuevos adjuntos, reemplazando adjuntos anteriores...');

          // PASO 1: Validar y subir los nuevos adjuntos
          const nuevosAdjuntos = [];

          const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
          const MAX_TOTAL_SIZE = 15 * 1024 * 1024;

          if (totalSize > MAX_TOTAL_SIZE) {
            throw new ApiError(
              400,
              `El tamaño total de los archivos adjuntos no puede superar los 15MB`,
            );
          }

          // Sube por la capa de almacenamiento (5.2); si falla, no deja archivos huérfanos (temporales: limpiarTemporales)
          nuevosAdjuntos.push(...(await subirAdjuntos(req.files as any[], BUCKET_MENSAJES, String(req.user._id))));

          idsNuevos = nuevosAdjuntos;

          // PASO 2: REEMPLAZAR (no concatenar) los adjuntos
          adjuntosAnteriores = (borrador.adjuntos || []).map((a: any) => ({
            fileId: a.fileId,
            nombre: a.nombre,
            almacen: a.almacen,
            clave: a.clave,
          }));
          borrador.adjuntos = nuevosAdjuntos; // ← CAMBIO CLAVE: Reemplazar en lugar de concatenar
          logger.debug(`Adjuntos reemplazados: ${nuevosAdjuntos.length} nuevos adjuntos`);
        } else {
          // Si no se enviaron nuevos archivos, mantener los adjuntos existentes
          logger.debug(
            'No se enviaron nuevos adjuntos, manteniendo adjuntos existentes:',
            borrador.adjuntos?.length || 0,
          );
        }

        try {
          await borrador.save();
        } catch (saveError) {
          // No se guardó: los nuevos quedarían huérfanos; los anteriores siguen referenciados (auditoría 3.O)
          await revertirAdjuntosSinMensaje(idsNuevos);
          throw saveError;
        }

        // PASO 3: Ya guardado, eliminar los adjuntos anteriores (si falla, solo se registra)
        if (adjuntosAnteriores.length > 0) {
          logger.debug(`Eliminando ${adjuntosAnteriores.length} adjuntos anteriores...`);
          for (const adjuntoAnterior of adjuntosAnteriores) {
            try {
              await eliminarArchivo(adjuntoAnterior, BUCKET_MENSAJES);
              logger.debug(`Adjunto eliminado: ${adjuntoAnterior.nombre}`);
            } catch (deleteError) {
              console.warn(`No se pudo eliminar adjunto ${adjuntoAnterior.nombre}:`, deleteError);
              // Continuar aunque falle la eliminación
            }
          }
        }
      } else {
        // ===== CREAR NUEVO BORRADOR =====
        logger.debug('Creando nuevo borrador con destinatarios:', destinatariosObjectIds.length);

        // PASO 1: Crear borrador básico SIN adjuntos pero CON destinatarios
        const borradorData = {
          remitente: new mongoose.Types.ObjectId(req.user._id),
          destinatarios: destinatariosObjectIds, // ← IMPORTANTE: Incluir aquí
          destinatariosCc: destinatariosCcObjectIds, // ← IMPORTANTE: Incluir aquí
          asunto,
          contenido,
          tipo: TipoMensaje.BORRADOR,
          estado: EstadoMensaje.BORRADOR,
          prioridad: prioridadFinal as any,
          etiquetas: Array.isArray(etiquetas) ? etiquetas : [etiquetas].filter(Boolean),
          escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
          adjuntos: [],
        };

        logger.debug('Datos para crear borrador:', {
          ...borradorData,
          destinatarios: `${borradorData.destinatarios.length} destinatarios`,
          destinatariosCc: `${borradorData.destinatariosCc.length} destinatarios CC`,
        });

        const borradorBasico = await Mensaje.create(borradorData);

        logger.debug('Borrador creado con ID:', borradorBasico._id);
        logger.debug('Destinatarios guardados:', borradorBasico.destinatarios.length);

        // PASO 2: Si hay adjuntos, procesarlos y actualizar el borrador
        if (req.files && req.files.length > 0) {
          logger.debug('Procesando adjuntos para borrador nuevo...');

          const adjuntos = [];

          const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
          const MAX_TOTAL_SIZE = 15 * 1024 * 1024;

          if (totalSize > MAX_TOTAL_SIZE) {
            await Mensaje.deleteOne({ _id: borradorBasico._id });
            throw new ApiError(
              400,
              `El tamaño total de los archivos adjuntos no puede superar los 15MB`,
            );
          }

          try {
            // Sube por la capa (5.2); si falla, no deja archivos huérfanos (temporales: limpiarTemporales)
            adjuntos.push(...(await subirAdjuntos(req.files as any[], BUCKET_MENSAJES, String(req.user._id))));

            borradorBasico.adjuntos = adjuntos;
            await borradorBasico.save();
          } catch (adjuntosError) {
            // Si lo que falló fue el save, los adjuntos ya subidos quedarían huérfanos (auditoría 3.O)
            await eliminarAdjuntos(adjuntos, BUCKET_MENSAJES);
            await Mensaje.deleteOne({ _id: borradorBasico._id });
            throw adjuntosError;
          }
        }

        borrador = borradorBasico;
      }

      logger.debug('=== ANTES DE POPULAR ===');
      logger.debug('Borrador final destinatarios:', borrador.destinatarios.length);

      // Poblar información para la respuesta
      await borrador.populate([
        { path: 'remitente', select: 'nombre apellidos email tipo' },
        { path: 'destinatarios', select: 'nombre apellidos email tipo' },
        { path: 'destinatariosCc', select: 'nombre apellidos email tipo' },
      ]);

      logger.debug('=== DESPUÉS DE POPULAR ===');
      logger.debug('Borrador final destinatarios:', borrador.destinatarios.length);

      res.status(200).json({
        success: true,
        data: borrador,
        message: 'Borrador guardado correctamente',
      });
    } catch (error: any) {
      console.error('Error en guardarBorrador:', error);

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map((err: any) => err.message);
        return next(new ApiError(400, `Error de validación: ${errors.join(', ')}`));
      }

      if (error.name === 'CastError') {
        return next(new ApiError(400, `Error de formato: ${error.message}`));
      }

      next(error);
    }
  }

  async enviarBorrador(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario tiene permiso para crear borradores
      if (!ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para usar borradores');
      }

      const { id } = req.params;

      // Verificar que el borrador existe y pertenece al usuario
      const borrador = await Mensaje.findOne({
        _id: id,
        remitente: req.user._id,
        escuelaId: req.user.escuelaId,
        tipo: TipoMensaje.BORRADOR,
        estado: EstadoMensaje.BORRADOR,
      });

      if (!borrador) {
        throw new ApiError(404, 'Borrador no encontrado');
      }

      // Solo destinatarios ACTIVOS del mismo colegio (auditoría 3.C): se revalida al enviar porque el
      // borrador pudo guardarse antes de este control o un destinatario pudo desactivarse después
      const validosEnvio = await idsDestinatariosValidos(
        [...(borrador.destinatarios || []), ...(borrador.destinatariosCc || [])],
        String(req.user.escuelaId),
      );
      borrador.destinatarios = (borrador.destinatarios || []).filter((d: any) =>
        validosEnvio.has(String(d?._id ?? d)),
      ) as any;
      borrador.destinatariosCc = (borrador.destinatariosCc || []).filter((d: any) =>
        validosEnvio.has(String(d?._id ?? d)),
      ) as any;

      // Verificar que tenga al menos un destinatario
      if (!borrador.destinatarios || borrador.destinatarios.length === 0) {
        throw new ApiError(400, 'El mensaje debe tener al menos un destinatario válido');
      }

      // Obtener todos los usuarios involucrados en el mensaje
      const usuarios = new Set<string>();

      // Añadir remitente
      usuarios.add(borrador.remitente.toString());

      // Añadir destinatarios
      if (borrador.destinatarios && Array.isArray(borrador.destinatarios)) {
        borrador.destinatarios.forEach((dest: any) => {
          const destId =
            typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
          usuarios.add(destId);
        });
      }

      // Añadir destinatarios en copia
      if (borrador.destinatariosCc && Array.isArray(borrador.destinatariosCc)) {
        borrador.destinatariosCc.forEach((dest: any) => {
          const destId =
            typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
          usuarios.add(destId);
        });
      }

      // Establecer estado para todos los usuarios
      const ahora = new Date();
      const estadosUsuarios = Array.from(usuarios).map((userId) => ({
        usuarioId: new mongoose.Types.ObjectId(userId),
        estado: EstadoMensaje.ENVIADO,
        fechaAccion: ahora,
      }));

      // Actualizar directamente en la base de datos con un filtro más específico
      const resultado = await Mensaje.updateOne(
        {
          _id: id,
          remitente: new mongoose.Types.ObjectId(req.user._id),
          tipo: TipoMensaje.BORRADOR,
          estado: EstadoMensaje.BORRADOR,
        },
        {
          $set: {
            tipo: TipoMensaje.INDIVIDUAL,
            estado: EstadoMensaje.ENVIADO,
            estadosUsuarios: estadosUsuarios,
            destinatarios: borrador.destinatarios,
            destinatariosCc: borrador.destinatariosCc,
            fechaAccion: ahora,
          },
        },
      );

      // Verificar que la actualización funcionó
      if (resultado.matchedCount === 0 || resultado.modifiedCount === 0) {
        console.error('Error al enviar borrador:', resultado);
        throw new ApiError(500, 'No se pudo enviar el borrador. Por favor intenta nuevamente.');
      }

      // Obtener el mensaje actualizado para respuesta
      const mensajeEnviado = await Mensaje.findById(id)
        .populate('remitente', 'nombre apellidos email')
        .populate('destinatarios', 'nombre apellidos email');

      if (!mensajeEnviado) {
        throw new ApiError(404, 'No se pudo encontrar el mensaje después de enviarlo');
      }

      // Verificamos que los cambios se aplicaron correctamente
      if (
        mensajeEnviado.tipo !== TipoMensaje.INDIVIDUAL ||
        mensajeEnviado.estado !== EstadoMensaje.ENVIADO
      ) {
        console.error('Error: El mensaje no se actualizó correctamente:', mensajeEnviado);
        throw new ApiError(500, 'El mensaje no se actualizó correctamente');
      }

      // Fase 4.2: al enviarse, el borrador notifica a sus destinatarios como cualquier mensaje (antes no se
      // avisaba a nadie: ni campanita, ni correo, ni push) y las copias a acudientes van por la cola.
      try {
        const destinatariosIds = (mensajeEnviado.destinatarios as any[]).map((d: any) => String(d?._id ?? d));
        const ccIds = ((mensajeEnviado as any).destinatariosCc || []).map((d: any) => String(d?._id ?? d));
        const usuariosDestino = await Usuario.find({
          _id: { $in: [...destinatariosIds, ...ccIds] },
          escuelaId: req.user.escuelaId,
          estado: 'ACTIVO',
        })
          .select('_id tipo')
          .lean();
        const setDest = new Set(destinatariosIds);

        // Auditoría 4.D: el despacho (campanita, correo, push) va en un trabajo idempotente de la cola
        await mensajeService.encolarDespacho(String(mensajeEnviado._id), req.user, mensajeEnviado.prioridad);

        // Auditoría 4.O: como al crear, un mensaje masivo por curso (cursoIds) NO genera copias a acudientes
        const esMasivoPorCurso = ((mensajeEnviado as any).cursoIds || []).length > 0;
        const estudiantesIds = esMasivoPorCurso
          ? []
          : usuariosDestino
              .filter((u: any) => u.tipo === 'ESTUDIANTE' && setDest.has(String(u._id)))
              .map((u: any) => String(u._id));
        await mensajeService.encolarCopiasAcudientes(
          String(mensajeEnviado._id),
          estudiantesIds,
          {
            asunto: mensajeEnviado.asunto,
            contenido: mensajeEnviado.contenido,
            adjuntos: mensajeEnviado.adjuntos || [],
            tipo: mensajeEnviado.tipo,
            prioridad: mensajeEnviado.prioridad,
            etiquetas: mensajeEnviado.etiquetas || [],
          },
          req.user,
        );
      } catch (errorDespacho) {
        console.error('[ERROR] Notificaciones/copias del borrador enviado fallaron (el mensaje sí se envió):', errorDespacho);
      }

      res.status(200).json({
        success: true,
        data: mensajeEnviado,
        message: 'Mensaje enviado correctamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // Método para obtener borradores del usuario
  async obtenerBorradores(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario tiene permiso para usar borradores
      if (!ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para usar borradores');
      }

      const pagina = numeroPagina(req.query.pagina);
      const limite = numeroLimite(req.query.limite, 20);
      const skip = (pagina - 1) * limite;

      // Buscar borradores del usuario
      const borradores = await Mensaje.find({
        remitente: req.user._id,
        tipo: TipoMensaje.BORRADOR,
      })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limite)
        .populate('destinatarios', 'nombre apellidos email tipo');

      // Contar total de borradores
      const total = await Mensaje.countDocuments({
        remitente: req.user._id,
        tipo: TipoMensaje.BORRADOR,
      });

      res.json({
        success: true,
        data: borradores,
        meta: {
          total,
          pagina,
          limite,
          totalPaginas: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Método para eliminar un borrador
  async eliminarBorrador(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario tiene permiso para usar borradores
      if (!ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para usar borradores');
      }

      const { id } = req.params;

      // Verificar que el borrador existe y pertenece al usuario
      const borrador = await Mensaje.findOne({
        _id: id,
        remitente: req.user._id,
        tipo: TipoMensaje.BORRADOR,
      });

      if (!borrador) {
        throw new ApiError(404, 'Borrador no encontrado');
      }

      // Eliminar el borrador
      await Mensaje.deleteOne({ _id: id });

      // Si el borrador tiene adjuntos, eliminarlos también
      if (borrador.adjuntos && borrador.adjuntos.length > 0) {
        for (const adjunto of borrador.adjuntos) {
          try {
            await eliminarArchivo(adjunto as any, BUCKET_MENSAJES);
          } catch (err) {
            console.error(`Error al eliminar adjunto con ID ${adjunto.fileId}:`, err);
            // Continúa con el siguiente adjunto aunque falle este
          }
        }
      }

      res.json({
        success: true,
        message: 'Borrador eliminado correctamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // Método específico para ACUDIENTES mejorado con información contextual
  async getDestinatariosParaAcudiente(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario es un acudiente o estudiante
      if (req.user.tipo !== 'ACUDIENTE' && req.user.tipo !== 'ESTUDIANTE') {
        throw new ApiError(403, 'Solo los acudientes y estudiantes pueden acceder a esta funcionalidad');
      }

      logger.debug(`[DEBUG] Obteniendo destinatarios para ${req.user.tipo} ID: ${req.user._id}`);

      // Si es un estudiante, usar lógica compleja similar a acudiente
      if (req.user.tipo === 'ESTUDIANTE') {
        logger.debug(`[DEBUG] Usuario estudiante - obteniendo destinatarios con información contextual`);
        
        try {
          // Para estudiantes: usar lógica similar a acudientes pero para SUS propios cursos
          
          // 1. Buscar cursos donde está el estudiante
          const cursosEstudiante = await mongoose
            .model('Curso')
            .find({
              estudiantes: new mongoose.Types.ObjectId(req.user._id),
              escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
              estado: { $ne: 'INACTIVO' },
            })
            .select('_id nombre grado seccion director_grupo grupo jornada nivel estudiantes');

          logger.debug(`[DEBUG] Cursos del estudiante encontrados: ${cursosEstudiante.length}`);

          if (cursosEstudiante.length === 0) {
            // Si no hay cursos, solo mostrar personal administrativo
            const personalEscuela = await Usuario.find({
              escuelaId: req.user.escuelaId,
              tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
              estado: 'ACTIVO',
            }).select('_id nombre apellidos email tipo');

            const destinatariosFinales = personalEscuela.map((persona) => ({
              _id: persona._id,
              nombre: persona.nombre,
              apellidos: persona.apellidos,
              email: persona.email,
              tipo: persona.tipo,
            }));

            return res.json({
              success: true,
              data: destinatariosFinales,
              count: destinatariosFinales.length,
              message: 'No se encontraron cursos. Mostrando solo personal administrativo.',
            });
          }

          const cursosIds = cursosEstudiante.map(c => c._id);
          const docentesIds = new Set<string>();
          const directorGrupoInfo = new Map<string, string>();

          // 2. Agregar directores de grupo
          cursosEstudiante.forEach((curso) => {
            if (curso.director_grupo) {
              docentesIds.add(curso.director_grupo.toString());
              let nombreCurso = curso.nombre || '';
              if (curso.grado && curso.seccion) {
                nombreCurso = `${curso.grado}${curso.seccion}`;
              }
              directorGrupoInfo.set(curso.director_grupo.toString(), nombreCurso);
            }
          });

          // 3. Buscar asignaturas SOLO de los cursos del estudiante
          const asignaturas = await mongoose
            .model('Asignatura')
            .find({
              cursoId: { $in: cursosIds },
              estado: 'ACTIVO',
            })
            .select('_id nombre docenteId cursoId');

          logger.debug(`[DEBUG] Asignaturas encontradas: ${asignaturas.length}`);

          // 4. Mapear información de asignaturas y SOLO agregar docentes de estas asignaturas
          const asignaturasMap = new Map<string, { nombre: string; docenteId: string | null }>();
          const asignaturasPorCurso = new Map<string, string[]>();

          asignaturas.forEach((asignatura) => {
            if (asignatura._id) {
              asignaturasMap.set(asignatura._id.toString(), {
                nombre: asignatura.nombre || '',
                docenteId: asignatura.docenteId ? asignatura.docenteId.toString() : null,
              });

              // SOLO agregar docentes que realmente dictan asignaturas en los cursos del estudiante
              if (asignatura.docenteId) {
                docentesIds.add(asignatura.docenteId.toString());
              }

              if (asignatura.cursoId) {
                const cursoId = asignatura.cursoId.toString();
                if (!asignaturasPorCurso.has(cursoId)) {
                  asignaturasPorCurso.set(cursoId, []);
                }
                const asignaturasDelCurso = asignaturasPorCurso.get(cursoId);
                if (asignaturasDelCurso) {
                  asignaturasDelCurso.push(asignatura._id.toString());
                }
              }
            }
          });

          // 5. Obtener personal administrativo
          const personalAdministrativo = await Usuario.find({
            escuelaId: req.user.escuelaId,
            tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
            estado: 'ACTIVO',
          }).select('_id nombre apellidos email tipo');

          // 6. Obtener información SOLO de los docentes relacionados
          const docentes = await Usuario.find({
            _id: { $in: Array.from(docentesIds).map((id) => new mongoose.Types.ObjectId(id)) },
            tipo: 'DOCENTE',
            estado: 'ACTIVO',
          }).select('_id nombre apellidos email tipo');

          logger.debug(`[DEBUG] Docentes encontrados: ${docentes.length}`);

          // 7. Mapear asignaturas y cursos por docente
          const docenteAsignaturas = new Map<string, Set<string>>();
          const docenteCursos = new Map<string, Set<string>>();

          asignaturas.forEach((asignatura) => {
            if (asignatura.docenteId && asignatura.cursoId) {
              const docenteId = asignatura.docenteId.toString();
              const cursoId = asignatura.cursoId.toString();

              const curso = cursosEstudiante.find((c) => c._id.toString() === cursoId);

              if (curso) {
                if (!docenteAsignaturas.has(docenteId)) {
                  docenteAsignaturas.set(docenteId, new Set<string>());
                }
                const asignaturasSet = docenteAsignaturas.get(docenteId);
                if (asignaturasSet && asignatura.nombre) {
                  asignaturasSet.add(asignatura.nombre);
                }

                if (!docenteCursos.has(docenteId)) {
                  docenteCursos.set(docenteId, new Set<string>());
                }
                const cursosSet = docenteCursos.get(docenteId);
                if (cursosSet) {
                  let nombreCurso = curso.nombre || '';
                  if (curso.grado && curso.seccion) {
                    nombreCurso = `${curso.grado}${curso.seccion}`;
                  }
                  cursosSet.add(nombreCurso);
                }
              }
            }
          });

          // 8. Construir lista final con información contextual
          const destinatariosFinales: any[] = [];

          // Añadir docentes con información contextual
          docentes.forEach((docente) => {
            if (docente._id && req.user) {
              const docenteId = docente._id.toString();

              const asignaturasSet = docenteAsignaturas.get(docenteId);
              const cursosSet = docenteCursos.get(docenteId);

              const asignaturas = asignaturasSet && asignaturasSet.size > 0 ? Array.from(asignaturasSet).join(', ') : '';
              let cursosStr = cursosSet && cursosSet.size > 0 ? Array.from(cursosSet).join(', ') : '';

              const cursoDirector = directorGrupoInfo.get(docenteId);
              if (cursoDirector) {
                if (cursosStr) {
                  cursosStr += ` (Director de ${cursoDirector})`;
                } else {
                  cursosStr = `Director de ${cursoDirector}`;
                }
              }

              // Información contextual para estudiante
              const nombreEstudiante = `${req.user.nombre} ${req.user.apellidos}`;
              const infoContextual = `Docente de ${nombreEstudiante}`;

              destinatariosFinales.push({
                _id: docente._id,
                nombre: docente.nombre || '',
                apellidos: docente.apellidos || '',
                email: docente.email || '',
                tipo: docente.tipo || '',
                asignatura: asignaturas,
                curso: cursosStr,
                infoContextual: infoContextual,
              });
            }
          });

          // Añadir personal administrativo
          personalAdministrativo.forEach((admin) => {
            if (admin._id) {
              destinatariosFinales.push({
                _id: admin._id,
                nombre: admin.nombre || '',
                apellidos: admin.apellidos || '',
                email: admin.email || '',
                tipo: admin.tipo || '',
              });
            }
          });

          logger.debug(`[DEBUG] Total destinatarios para estudiante: ${destinatariosFinales.length}`);

          return res.json({
            success: true,
            data: destinatariosFinales,
            count: destinatariosFinales.length,
          });
        } catch (error) {
          console.error('Error obteniendo destinatarios para estudiante:', error);
          return res.json({
            success: true,
            data: [],
            message: 'Error obteniendo destinatarios',
          });
        }
      }

      // Definir interfaces para tipos
      interface ICurso {
        _id: mongoose.Types.ObjectId;
        nombre: string;
        grado: string;
        seccion: string;
        director_grupo?: mongoose.Types.ObjectId;
        estudiantes?: mongoose.Types.ObjectId[];
        grupo?: string;
        jornada?: string;
        nivel?: string;
      }

      interface IAsignatura {
        _id: mongoose.Types.ObjectId;
        nombre: string;
        docenteId?: mongoose.Types.ObjectId;
        cursoId?: mongoose.Types.ObjectId;
      }

      interface IUsuario {
        _id: mongoose.Types.ObjectId;
        nombre: string;
        apellidos: string;
        email: string;
        tipo: string;
        info_academica?: any;
      }

      interface IEstudiante {
        _id: mongoose.Types.ObjectId;
        nombre: string;
        apellidos: string;
      }

      interface IDestinatario {
        _id: mongoose.Types.ObjectId;
        nombre: string;
        apellidos: string;
        email: string;
        tipo: string;
        asignatura?: string;
        curso?: string;
        infoContextual?: string;
      }

      // Obtener los estudiantes asociados al acudiente
      const usuario = await Usuario.findById(req.user._id).select('info_academica');

      if (!usuario || !usuario.info_academica) {
        return res.json({
          success: true,
          data: [],
          message: 'No se encontró información académica del acudiente',
        });
      }

      // Extraer estudiantes asociados (usamos any para evitar problemas de tipo)
      const infoAcademica = usuario.info_academica as any;
      const estudiantesIds = infoAcademica.estudiantes_asociados || [];

      if (!Array.isArray(estudiantesIds) || estudiantesIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: 'No tiene estudiantes asociados',
        });
      }

      logger.debug(`[DEBUG] Estudiantes asociados: ${estudiantesIds.length}`);

      // Obtener información de los estudiantes
      const estudiantes = (await Usuario.find({
        _id: { $in: estudiantesIds },
        tipo: 'ESTUDIANTE',
        estado: { $ne: 'INACTIVO' },
      }).select('_id nombre apellidos')) as IEstudiante[];

      // Crear un mapa con nombres de estudiantes para referencia
      const estudiantesNombres = new Map<string, string>();
      estudiantes.forEach((estudiante) => {
        estudiantesNombres.set(
          estudiante._id.toString(),
          `${estudiante.nombre || ''} ${estudiante.apellidos || ''}`,
        );
      });

      // *** CAMBIO IMPORTANTE: Buscar cursos directamente por los IDs de estudiantes ***
      const estudiantesIdsString = estudiantes.map((est) => est._id.toString());
      logger.debug(
        `[DEBUG] Buscando cursos para los estudiantes: ${estudiantesIdsString.join(', ')}`,
      );

      // Buscar directamente los cursos donde estos estudiantes están incluidos en el array 'estudiantes'
      const cursos = (await mongoose
        .model('Curso')
        .find({
          estudiantes: { $in: estudiantesIds.map((id) => new mongoose.Types.ObjectId(id)) },
          escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
          estado: { $ne: 'INACTIVO' },
        })
        .select(
          '_id nombre grado seccion director_grupo grupo jornada nivel estudiantes',
        )) as ICurso[];

      logger.debug(`[DEBUG] Cursos encontrados: ${cursos.length}`);

      // Recolectar los IDs de cursos
      const cursosIds = new Set<string>();
      cursos.forEach((curso) => {
        if (curso._id) {
          cursosIds.add(curso._id.toString());
        }
      });

      // Si no hay cursos, solo mostrar personal administrativo (no docentes)
      if (cursosIds.size === 0) {
        logger.debug(
          '[DEBUG] No se encontraron cursos, obteniendo solo personal administrativo (sin docentes)',
        );

        // Obtener SOLO personal administrativo de la escuela (sin docentes)
        const personalEscuela = (await Usuario.find({
          escuelaId: req.user.escuelaId,
          tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] }, // Eliminamos 'DOCENTE'
          estado: 'ACTIVO',
        }).select('_id nombre apellidos email tipo')) as IUsuario[];

        // Convertir a formato de destinatario
        const destinatariosFinales: IDestinatario[] = personalEscuela.map((persona) => ({
          _id: persona._id,
          nombre: persona.nombre,
          apellidos: persona.apellidos,
          email: persona.email,
          tipo: persona.tipo,
        }));

        return res.json({
          success: true,
          data: destinatariosFinales,
          count: destinatariosFinales.length,
          message:
            'No se encontraron cursos para sus estudiantes. Mostrando solo personal administrativo.',
        });
      }

      // Recolectar docentes asociados (directores de grupo y profesores de asignaturas)
      const docentesIds = new Set<string>();
      const directorGrupoInfo = new Map<string, string>(); // Mapa: docenteId -> cursoNombre

      // Añadir directores de grupo y registrar la información
      cursos.forEach((curso) => {
        if (curso.director_grupo) {
          docentesIds.add(curso.director_grupo.toString());
          // Guardar información del curso para este director
          let nombreCurso = curso.nombre || '';
          if (curso.grado && curso.seccion) {
            nombreCurso = `${curso.grado}${curso.seccion}`;
          }
          directorGrupoInfo.set(curso.director_grupo.toString(), nombreCurso);
        }
      });

      // *** CAMBIO IMPORTANTE: Buscar asignaturas directamente por cursoId en lugar de usar campo asignaturas ***
      logger.debug(
        `[DEBUG] Buscando asignaturas para los cursos: ${Array.from(cursosIds).join(', ')}`,
      );

      // Consulta directa a la colección de asignaturas por cursoId
      const asignaturas = (await mongoose
        .model('Asignatura')
        .find({
          cursoId: { $in: Array.from(cursosIds).map((id) => new mongoose.Types.ObjectId(id)) },
          estado: 'ACTIVO',
        })
        .select('_id nombre docenteId cursoId')) as IAsignatura[];

      logger.debug(`[DEBUG] Asignaturas encontradas por consulta directa: ${asignaturas.length}`);

      if (asignaturas.length > 0) {
        logger.debug(
          '[DEBUG] Ejemplo de primera asignatura:',
          JSON.stringify({
            id: asignaturas[0]._id.toString(),
            nombre: asignaturas[0].nombre,
            docenteId: asignaturas[0].docenteId
              ? asignaturas[0].docenteId.toString()
              : 'no docente',
            cursoId: asignaturas[0].cursoId ? asignaturas[0].cursoId.toString() : 'no curso',
          }),
        );
      }

      // Mapear información de asignaturas
      const asignaturasMap = new Map<string, { nombre: string; docenteId: string | null }>();
      const asignaturasPorCurso = new Map<string, string[]>();

      // Procesar las asignaturas y recolectar los IDs de docentes
      asignaturas.forEach((asignatura) => {
        if (asignatura._id) {
          // Guardar información sobre la asignatura
          asignaturasMap.set(asignatura._id.toString(), {
            nombre: asignatura.nombre || '',
            docenteId: asignatura.docenteId ? asignatura.docenteId.toString() : null,
          });

          // Agregar el docente a la lista de docentes
          if (asignatura.docenteId) {
            docentesIds.add(asignatura.docenteId.toString());
          }

          // Asociar asignatura con su curso
          if (asignatura.cursoId) {
            const cursoId = asignatura.cursoId.toString();
            if (!asignaturasPorCurso.has(cursoId)) {
              asignaturasPorCurso.set(cursoId, []);
            }

            const asignaturasDelCurso = asignaturasPorCurso.get(cursoId);
            if (asignaturasDelCurso) {
              asignaturasDelCurso.push(asignatura._id.toString());
            }
          }
        }
      });

      // Log para debugging
      logger.debug(`[DEBUG] Docentes encontrados (IDs): ${Array.from(docentesIds).join(', ')}`);

      // Obtener información de coordinadores, administrativos y directivos de la escuela
      const personalAdministrativo = (await Usuario.find({
        escuelaId: req.user.escuelaId,
        tipo: { $in: ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'] },
        estado: 'ACTIVO',
      }).select('_id nombre apellidos email tipo')) as IUsuario[];

      // Obtener información de los docentes
      const docentes = (await Usuario.find({
        _id: { $in: Array.from(docentesIds).map((id) => new mongoose.Types.ObjectId(id)) },
        tipo: 'DOCENTE',
        estado: 'ACTIVO',
      }).select('_id nombre apellidos email tipo')) as IUsuario[];

      logger.debug(`[DEBUG] Docentes recuperados de la base de datos: ${docentes.length}`);

      if (docentes.length > 0) {
        logger.debug('[DEBUG] Lista de docentes encontrados:');
        docentes.forEach((docente) => {
          logger.debug(`- ${docente._id.toString()}: ${docente.nombre} ${docente.apellidos}`);
        });
      }

      // Mapear asignaturas por docente
      const docenteAsignaturas = new Map<string, Set<string>>();
      const docenteCursos = new Map<string, Set<string>>();

      // Para cada asignatura, asignar docentes
      asignaturas.forEach((asignatura) => {
        if (asignatura.docenteId && asignatura.cursoId) {
          const docenteId = asignatura.docenteId.toString();
          const cursoId = asignatura.cursoId.toString();

          // Obtener el curso correspondiente
          const curso = cursos.find((c) => c._id.toString() === cursoId);

          if (curso) {
            // Añadir asignatura al docente
            if (!docenteAsignaturas.has(docenteId)) {
              docenteAsignaturas.set(docenteId, new Set<string>());
            }
            const asignaturasSet = docenteAsignaturas.get(docenteId);
            if (asignaturasSet && asignatura.nombre) {
              asignaturasSet.add(asignatura.nombre);
            }

            // Añadir curso al docente
            if (!docenteCursos.has(docenteId)) {
              docenteCursos.set(docenteId, new Set<string>());
            }
            const cursosSet = docenteCursos.get(docenteId);
            if (cursosSet) {
              let nombreCurso = curso.nombre || '';
              if (curso.grado && curso.seccion) {
                nombreCurso = `${curso.grado}${curso.seccion}`;
              }
              cursosSet.add(nombreCurso);
            }
          }
        }
      });

      // Construir lista final de destinatarios con información contextual
      const destinatariosFinales: IDestinatario[] = [];

      // Añadir docentes con información de asignaturas y cursos
      docentes.forEach((docente) => {
        if (docente._id) {
          const docenteId = docente._id.toString();

          // Información de asignaturas
          const asignaturasSet = docenteAsignaturas.get(docenteId);
          const cursosSet = docenteCursos.get(docenteId);

          const asignaturas =
            asignaturasSet && asignaturasSet.size > 0 ? Array.from(asignaturasSet).join(', ') : '';

          // Información de cursos y si es director de grupo
          let cursosStr = cursosSet && cursosSet.size > 0 ? Array.from(cursosSet).join(', ') : '';

          // Añadir información de director de grupo si aplica
          const cursoDirector = directorGrupoInfo.get(docenteId);
          if (cursoDirector) {
            if (cursosStr) {
              cursosStr += ` (Director de ${cursoDirector})`;
            } else {
              cursosStr = `Director de ${cursoDirector}`;
            }
          }

          // Obtener los estudiantes relacionados para este docente
          const estudiantesRelacionados: string[] = [];

          // Verificar estudiantes en cursos donde este docente es director de grupo
          const cursosDirector = cursos.filter(
            (curso) => curso.director_grupo && curso.director_grupo.toString() === docenteId,
          );

          for (const curso of cursosDirector) {
            if (Array.isArray(curso.estudiantes)) {
              const estudiantesEnCurso = estudiantes.filter((est: IEstudiante) =>
                curso.estudiantes?.some(
                  (id: mongoose.Types.ObjectId) => id.toString() === est._id.toString(),
                ),
              );

              estudiantesEnCurso.forEach((est) => {
                estudiantesRelacionados.push(`${est.nombre} ${est.apellidos}`);
              });
            }
          }

          // Verificar estudiantes en cursos donde este docente enseña asignaturas
          const cursosAsignaturas = cursos.filter((curso) => {
            if (!curso._id) return false;

            // Obtener asignaturas de este curso y docente
            const asignaturasDelCurso = asignaturasPorCurso.get(curso._id.toString()) || [];

            // Verificar si alguna asignatura tiene a este docente como profesor
            return asignaturasDelCurso.some((asigId) => {
              const asigInfo = asignaturasMap.get(asigId);
              return asigInfo && asigInfo.docenteId === docenteId;
            });
          });

          for (const curso of cursosAsignaturas) {
            if (Array.isArray(curso.estudiantes)) {
              const estudiantesEnCurso = estudiantes.filter((est: IEstudiante) =>
                curso.estudiantes?.some(
                  (id: mongoose.Types.ObjectId) => id.toString() === est._id.toString(),
                ),
              );

              estudiantesEnCurso.forEach((est) => {
                if (!estudiantesRelacionados.includes(`${est.nombre} ${est.apellidos}`)) {
                  estudiantesRelacionados.push(`${est.nombre} ${est.apellidos}`);
                }
              });
            }
          }

          // Información contextualizada
          let infoContextual = '';
          if (estudiantesRelacionados.length > 0) {
            infoContextual = `Docente de ${estudiantesRelacionados.join(', ')}`;
          }

          destinatariosFinales.push({
            _id: docente._id,
            nombre: docente.nombre || '',
            apellidos: docente.apellidos || '',
            email: docente.email || '',
            tipo: docente.tipo || '',
            asignatura: asignaturas,
            curso: cursosStr,
            infoContextual: infoContextual,
          });
        }
      });

      // Añadir personal administrativo
      personalAdministrativo.forEach((admin) => {
        if (admin._id) {
          destinatariosFinales.push({
            _id: admin._id,
            nombre: admin.nombre || '',
            apellidos: admin.apellidos || '',
            email: admin.email || '',
            tipo: admin.tipo || '',
          });
        }
      });

      logger.debug(`[DEBUG] Total destinatarios encontrados: ${destinatariosFinales.length}`);

      return res.json({
        success: true,
        data: destinatariosFinales,
        count: destinatariosFinales.length,
      });
    } catch (error) {
      console.error('Error al obtener destinatarios para acudiente:', error);
      return next(error);
    }
  }

  // Método para obtener cursos disponibles para mensajes masivos
  async getCursosPosiblesDestinatarios(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      logger.debug(
        `[DEBUG] Obteniendo cursos disponibles para usuario: ${req.user._id}, tipo: ${req.user.tipo}`,
      );

      // Definir roles que pueden enviar mensajes masivos
      const rolesMasivos = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO', 'DOCENTE'];

      if (!rolesMasivos.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para enviar mensajes masivos');
      }

      // Aplicar lógica según el rol
      let cursos: any[] = [];

      // 1. ADMIN, RECTOR, COORDINADOR, ADMINISTRATIVO: pueden ver todos los cursos
      if (['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'].includes(req.user.tipo)) {
        logger.debug('[DEBUG] Usuario administrativo - Mostrando todos los cursos');

        // Obtener todos los cursos de la escuela
        cursos = await mongoose
          .model('Curso')
          .find({
            escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
          })
          .select('_id nombre grado seccion grupo estudiantes director_grupo')
          .populate('director_grupo', 'nombre apellidos')
          .populate({
            path: 'estudiantes',
            select: '_id',
            match: { estado: 'ACTIVO' },
          })
          .sort({ grado: 1, seccion: 1 });
      }

      // 2. DOCENTES: solo pueden ver cursos donde dictan asignaturas
      else if (req.user.tipo === 'DOCENTE') {
        logger.debug('[DEBUG] Usuario docente - Obteniendo cursos donde dicta asignaturas');

        // 2.1 Primero, buscar cursos donde es director de grupo
        const cursosDirigidos = await mongoose
          .model('Curso')
          .find({
            director_grupo: new mongoose.Types.ObjectId(req.user._id),
            escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
          })
          .select('_id');

        // 2.2 Luego, buscar asignaturas que dicta
        const asignaturas = await mongoose
          .model('Asignatura')
          .find({
            docenteId: new mongoose.Types.ObjectId(req.user._id),
            escuelaId: new mongoose.Types.ObjectId(req.user.escuelaId),
          })
          .select('cursoId');

        // 2.3 Recolectar todos los IDs de cursos únicos
        const cursosIds = new Set<string>();

        cursosDirigidos.forEach((curso) => {
          cursosIds.add(curso._id.toString());
        });

        asignaturas.forEach((asig) => {
          if (asig.cursoId) {
            cursosIds.add(asig.cursoId.toString());
          }
        });

        if (cursosIds.size === 0) {
          logger.debug('[DEBUG] Docente no tiene cursos asignados');
          return res.json({
            success: true,
            data: [],
            message: 'No tiene cursos asignados para enviar mensajes masivos',
          });
        }

        // 2.4 Obtener información completa de esos cursos
        cursos = await mongoose
          .model('Curso')
          .find({
            _id: { $in: Array.from(cursosIds).map((id) => new mongoose.Types.ObjectId(id)) },
          })
          .select('_id nombre grado seccion grupo estudiantes director_grupo')
          .populate('director_grupo', 'nombre apellidos')
          .populate({
            path: 'estudiantes',
            select: '_id',
            match: { estado: 'ACTIVO' },
          })
          .sort({ grado: 1, seccion: 1 });
      }

      // Formatear respuesta con conteo de estudiantes y más información
      const cursosFormateados = cursos.map((curso) => {
        const cantidadEstudiantes = Array.isArray(curso.estudiantes) ? curso.estudiantes.length : 0;

        // Construir un nombre más informativo que incluya grado, sección y grupo
        let nombreCompleto = curso.nombre || '';

        // Si el nombre no incluye ya el grado y sección, añadirlos
        if (!nombreCompleto.includes(curso.grado) && curso.grado) {
          nombreCompleto = `${curso.grado}`;
          if (curso.seccion) {
            nombreCompleto += `${curso.seccion}`;
          }
        }

        // Añadir el grupo si existe y no está ya incluido en el nombre
        if (curso.grupo && !nombreCompleto.includes(curso.grupo)) {
          nombreCompleto += ` - Grupo ${curso.grupo}`;
        }

        // Si hay un director de grupo, incluir su nombre
        let infoAdicional = '';
        if (curso.director_grupo) {
          try {
            // Si director_grupo está populado, usar directamente; si no, buscar información
            const directorInfo =
              typeof curso.director_grupo === 'object' && curso.director_grupo.nombre
                ? `${curso.director_grupo.nombre} ${curso.director_grupo.apellidos || ''}`
                : ''; // Si no podemos obtener el nombre, dejarlo vacío

            if (directorInfo) {
              infoAdicional = `Director: ${directorInfo}`;
            }
          } catch (err) {
            console.error('Error obteniendo información del director de grupo:', err);
          }
        }

        return {
          _id: curso._id,
          nombre: nombreCompleto,
          grado: curso.grado || '',
          seccion: curso.seccion || '',
          grupo: curso.grupo || '',
          cantidadEstudiantes,
          infoAdicional,
        };
      });

      logger.debug(`[DEBUG] Cursos encontrados: ${cursosFormateados.length}`);

      return res.json({
        success: true,
        data: cursosFormateados,
      });
    } catch (error) {
      console.error('Error al obtener cursos para mensajes masivos:', error);
      return next(error);
    }
  }

  // Crear un nuevo mensaje (actualizado para usar el servicio)
  async crear(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario es estudiante

      // Obtener datos del mensaje
      const {
        destinatarios,
        destinatariosCc,
        cursoIds,
        asunto,
        contenido,
        tipo = TipoMensaje.INDIVIDUAL,
        prioridad,
        etiquetas,
        esRespuesta,
        mensajeOriginalId,
      } = req.body;

      // Comprobar que el mensaje tenga al menos un destinatario
      if (
        (!destinatarios || (Array.isArray(destinatarios) && destinatarios.length === 0)) &&
        (!cursoIds || (Array.isArray(cursoIds) && cursoIds.length === 0))
      ) {
        throw new ApiError(400, 'Debe especificar al menos un destinatario o curso');
      }

      // Crear adjuntos si hay archivos
      const adjuntos = [];
      if (req.files && req.files.length > 0) {
        // Verificación de tamaño total
        const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
        const MAX_TOTAL_SIZE = 15 * 1024 * 1024; // 15MB

        if (totalSize > MAX_TOTAL_SIZE) {
          throw new ApiError(
            400,
            `El tamaño total de los archivos adjuntos no puede superar los 15MB (tamaño actual: ${(
              totalSize /
              (1024 * 1024)
            ).toFixed(2)}MB)`,
          );
        }

        // Sube por la capa (5.2); si falla, no deja archivos huérfanos (temporales: limpiarTemporales)
        adjuntos.push(...(await subirAdjuntos(req.files as any[], BUCKET_MENSAJES, String(req.user._id))));
      }

      // Verificar si es borrador
      let estado = EstadoMensaje.ENVIADO;
      if (tipo === 'BORRADOR') {
        estado = EstadoMensaje.BORRADOR;
      }

      // Parsear destinatarios
      let destinatariosArray: string[] = [];
      if (typeof destinatarios === 'string') {
        // Si es un JSON string
        try {
          destinatariosArray = JSON.parse(destinatarios);
        } catch (error) {
          // Si es un solo ID
          destinatariosArray = [destinatarios];
        }
      } else if (Array.isArray(destinatarios)) {
        destinatariosArray = destinatarios;
      }

      // Parsear destinatariosCc
      let destinatariosCcArray: string[] = [];
      if (destinatariosCc) {
        if (typeof destinatariosCc === 'string') {
          try {
            destinatariosCcArray = JSON.parse(destinatariosCc);
          } catch (error) {
            destinatariosCcArray = [destinatariosCc];
          }
        } else if (Array.isArray(destinatariosCc)) {
          destinatariosCcArray = destinatariosCc;
        }
      }

      // Parsear cursoIds
      let cursoIdsArray: string[] = [];
      if (cursoIds) {
        if (typeof cursoIds === 'string') {
          try {
            cursoIdsArray = JSON.parse(cursoIds);
          } catch (error) {
            cursoIdsArray = [cursoIds];
          }
        } else if (Array.isArray(cursoIds)) {
          cursoIdsArray = cursoIds;
        }
      }

      // Datos completos para el servicio
      const datosMensaje = {
        destinatarios: destinatariosArray,
        destinatariosCc: destinatariosCcArray,
        cursoIds: cursoIdsArray,
        asunto,
        contenido,
        adjuntos,
        tipo,
        prioridad: prioridad || PrioridadMensaje.NORMAL,
        estado,
        etiquetas: etiquetas || [],
        esRespuesta: esRespuesta === 'true' || esRespuesta === true,
        mensajeOriginalId: mensajeOriginalId || null,
      };

      // Usar el servicio para crear el mensaje; si falla, los adjuntos ya subidos quedarían huérfanos (auditoría 3.O)
      let nuevoMensaje;
      try {
        nuevoMensaje = await mensajeService.crearMensaje(datosMensaje, req.user);
      } catch (crearError) {
        await revertirAdjuntosSinMensaje(adjuntos);
        throw crearError;
      }

      // Fase 4.2: las notificaciones (campanita, correo y push) ya quedaron encoladas en crearMensaje.
      // Copias a acudientes de los estudiantes destinatarios: por la cola (el request no las espera).
      // Solo si no hay cursos (con cursos el servicio ya incluye a los acudientes) y no es un borrador.
      if (estado !== EstadoMensaje.BORRADOR && cursoIdsArray.length === 0 && destinatariosArray.length > 0) {
        try {
          const estudiantesInfo = await Usuario.find({
            _id: { $in: destinatariosArray },
            tipo: 'ESTUDIANTE',
            escuelaId: req.user.escuelaId,
          }).select('_id');

          await mensajeService.encolarCopiasAcudientes(
            nuevoMensaje._id.toString(),
            estudiantesInfo.map((est: any) => est._id.toString()),
            datosMensaje,
            req.user,
          );
        } catch (errorCopia) {
          // El mensaje principal ya fue guardado — no bloquear la respuesta por un error en la copia
          console.error('[ERROR] No se pudieron encolar las copias a acudientes (el mensaje sí se envió):', errorCopia);
        }
      }

      res.status(201).json({
        success: true,
        data: nuevoMensaje,
      });
    } catch (error) {
      console.error('Error creating message:', error);
      next(error);
    }
  }

  async obtenerTodos(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const {
        tipo,
        bandeja = 'recibidos',
        pagina = 1,
        limite = 20,
        busqueda,
        desde,
        hasta,
      } = req.query;

      // Paginación con tope (máx. 100: el widget del dashboard web pide 100) y protección contra NaN
      const paginaNum = Math.max(parseInt(pagina as string, 10) || 1, 1);
      const limiteNum = Math.min(Math.max(parseInt(limite as string, 10) || 20, 1), 100);
      const opciones = { pagina: paginaNum, limite: limiteNum };

      const usuarioId = new mongoose.Types.ObjectId(req.user._id);
      const escuelaId = new mongoose.Types.ObjectId(req.user.escuelaId);

      if (bandeja === 'borradores' && !ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        return res.json({
          success: true,
          data: [],
          meta: { total: 0, pagina: opciones.pagina, limite: opciones.limite, totalPaginas: 0 },
          message: 'No tiene permisos para acceder a borradores',
        });
      }

      // 1) $match inicial POR USUARIO (usa los índices destinatarios/destinatariosCc/remitente + createdAt).
      //    Antes: $match solo por escuelaId y $filter/$lookup sobre todos los mensajes del colegio.
      const comoDestinatario = [{ destinatarios: usuarioId }, { destinatariosCc: usuarioId }];
      const matchInicial: any = { escuelaId };
      if (bandeja === 'recibidos') {
        matchInicial.$or = comoDestinatario;
      } else if (bandeja === 'enviados' || bandeja === 'borradores') {
        matchInicial.remitente = usuarioId;
      } else {
        matchInicial.$or = [{ remitente: usuarioId }, ...comoDestinatario];
      }

      const pipeline: any[] = [{ $match: matchInicial }];

      // Filtro por tipo de mensaje (solo string: evita operadores)
      if (typeof tipo === 'string' && tipo) {
        pipeline.push({ $match: { tipo } });
      }

      // Filtro por fecha
      if (desde || hasta) {
        const matchFecha: any = {};
        if (desde) {
          matchFecha.createdAt = { $gte: new Date(desde as string) };
        }
        if (hasta) {
          if (matchFecha.createdAt) {
            matchFecha.createdAt.$lte = new Date(hasta as string);
          } else {
            matchFecha.createdAt = { $lte: new Date(hasta as string) };
          }
        }
        pipeline.push({ $match: matchFecha });
      }

      // Filtro de búsqueda por asunto o contenido
      if (typeof busqueda === 'string' && busqueda) {
        const regex = new RegExp(escapeRegex(busqueda), 'i');
        pipeline.push({
          $match: {
            $or: [{ asunto: regex }, { contenido: regex }],
          },
        });
      }

      // 2) Misma lógica de estado por usuario que antes (estado propio o, si no existe, el global)
      pipeline.push({
        $addFields: {
          esRemitente: { $eq: ['$remitente', usuarioId] },
          esDestinatario: { $in: [usuarioId, { $ifNull: ['$destinatarios', []] }] },
          esDestinatarioCc: { $in: [usuarioId, { $ifNull: ['$destinatariosCc', []] }] },
          estadoUsuario: {
            $let: {
              vars: {
                estadoObj: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: { $ifNull: ['$estadosUsuarios', []] },
                        as: 'estado',
                        cond: { $eq: ['$$estado.usuarioId', usuarioId] },
                      },
                    },
                    0,
                  ],
                },
              },
              in: { $ifNull: ['$$estadoObj.estado', '$estado'] }, // Fallback al estado global
            },
          },
        },
      });

      // Filtros específicos según la bandeja (misma semántica que antes)
      const matchBandeja: any = {};

      if (bandeja === 'recibidos') {
        matchBandeja.$or = [{ esDestinatario: true }, { esDestinatarioCc: true }];
        // Solo mostrar mensajes ENVIADOS (excluir ARCHIVADOS, ELIMINADOS y BORRADORES)
        matchBandeja.estadoUsuario = EstadoMensaje.ENVIADO;
        matchBandeja.tipo = { $ne: TipoMensaje.BORRADOR };
      } else if (bandeja === 'enviados') {
        matchBandeja.esRemitente = true;
        matchBandeja.estadoUsuario = { $ne: EstadoMensaje.ELIMINADO };
        matchBandeja.tipo = { $ne: TipoMensaje.BORRADOR };
        matchBandeja.esCopiaAcudiente = { $ne: true };
      } else if (bandeja === 'borradores') {
        matchBandeja.esRemitente = true;
        matchBandeja.tipo = TipoMensaje.BORRADOR;
      } else if (bandeja === 'archivados') {
        matchBandeja.$or = [
          { esRemitente: true },
          { esDestinatario: true },
          { esDestinatarioCc: true },
        ];
        matchBandeja.estadoUsuario = EstadoMensaje.ARCHIVADO;
      } else if (bandeja === 'eliminados') {
        matchBandeja.$or = [
          { esRemitente: true },
          { esDestinatario: true },
          { esDestinatarioCc: true },
        ];
        matchBandeja.estadoUsuario = EstadoMensaje.ELIMINADO;
      }

      // Recorte de arreglos ANTES del $sort (auditoría 3.M): el sort no carga estadosUsuarios/lecturas/
      // destinatarios completos (miles en masivos; límite de 100 MB de memoria del sort en M0).
      // Es la misma etapa que antes corría en la página; la salida no cambia.
      pipeline.push(
        { $match: matchBandeja },
        {
          $addFields: {
            totalDestinatarios: { $size: { $ifNull: ['$destinatarios', []] } },
            // leido: destinatario → si ÉL lo leyó; remitente → si alguien lo leyó (como lo interpretaba el web)
            leido: {
              $cond: [
                '$esRemitente',
                { $gt: [{ $size: { $ifNull: ['$lecturas', []] } }, 0] },
                { $in: [usuarioId, { $ifNull: ['$lecturas.usuarioId', []] }] },
              ],
            },
            // Solo la entrada del propio usuario (el web filtra archivados/eliminados con ella;
            // Flutter calcula "leído por mí" con lecturas). Antes: arreglos completos (miles en masivos).
            estadosUsuarios: {
              $filter: {
                input: { $ifNull: ['$estadosUsuarios', []] },
                as: 'e',
                cond: { $eq: ['$$e.usuarioId', usuarioId] },
              },
            },
            lecturas: {
              $filter: {
                input: { $ifNull: ['$lecturas', []] },
                as: 'l',
                cond: { $eq: ['$$l.usuarioId', usuarioId] },
              },
            },
            // Destinatarios visibles: remitente → los 3 primeros (borradores: TODOS, porque Flutter
            // edita el borrador desde el item de la lista y al guardar perdería los demás);
            // individual con ≤10 → todos; masivo o >10 → solo el propio usuario (privacidad).
            // El conteo va en totalDestinatarios.
            destinatarios: {
              $cond: [
                '$esRemitente',
                {
                  $cond: [
                    {
                      $or: [
                        bandeja === 'borradores',
                        { $eq: ['$tipo', TipoMensaje.BORRADOR] },
                        { $eq: ['$estado', EstadoMensaje.BORRADOR] },
                      ],
                    },
                    { $ifNull: ['$destinatarios', []] },
                    { $slice: [{ $ifNull: ['$destinatarios', []] }, 3] },
                  ],
                },
                {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$tipo', TipoMensaje.INDIVIDUAL] },
                        { $lte: [{ $size: { $ifNull: ['$destinatarios', []] } }, 10] },
                      ],
                    },
                    { $ifNull: ['$destinatarios', []] },
                    {
                      $filter: {
                        input: { $ifNull: ['$destinatarios', []] },
                        as: 'd',
                        cond: { $eq: ['$$d', usuarioId] },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
        { $sort: { createdAt: -1 } },
      );

      // 3) Página + conteo en una sola consulta; el $lookup solo corre sobre la página
      const proyeccionUsuario = (prefijo: string) => ({
        _id: `${prefijo}._id`,
        nombre: `${prefijo}.nombre`,
        apellidos: `${prefijo}.apellidos`,
        email: `${prefijo}.email`,
        tipo: `${prefijo}.tipo`,
        perfil: { foto: `${prefijo}.perfil.foto` },
      });

      pipeline.push({
        $facet: {
          datos: [
            { $skip: (opciones.pagina - 1) * opciones.limite },
            { $limit: opciones.limite },
            {
              $lookup: {
                from: 'usuarios',
                localField: 'remitente',
                foreignField: '_id',
                as: 'remitenteInfo',
                pipeline: [{ $project: { nombre: 1, apellidos: 1, email: 1, tipo: 1, 'perfil.foto': 1 } }],
              },
            },
            {
              $lookup: {
                from: 'usuarios',
                localField: 'destinatarios',
                foreignField: '_id',
                as: 'destinatariosInfo',
                pipeline: [{ $project: { nombre: 1, apellidos: 1, email: 1, tipo: 1, 'perfil.foto': 1 } }],
              },
            },
            {
              // $lookup se salta el toJSON del modelo: proyectar solo los datos públicos del usuario
              $addFields: {
                remitente: {
                  $let: {
                    vars: { r: { $arrayElemAt: ['$remitenteInfo', 0] } },
                    in: {
                      $cond: [{ $ifNull: ['$$r._id', false] }, proyeccionUsuario('$$r'), '$$REMOVE'],
                    },
                  },
                },
                destinatarios: {
                  $map: { input: '$destinatariosInfo', as: 'd', in: proyeccionUsuario('$$d') },
                },
              },
            },
            { $project: { remitenteInfo: 0, destinatariosInfo: 0 } },
          ],
          total: [{ $count: 'total' }],
        },
      });

      const [resultado] = await Mensaje.aggregate(pipeline);
      const mensajes = resultado?.datos || [];
      const total = resultado?.total?.[0]?.total || 0;

      return res.json({
        success: true,
        data: mensajes,
        meta: {
          total,
          pagina: opciones.pagina,
          limite: opciones.limite,
          totalPaginas: Math.ceil(total / opciones.limite),
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async obtenerPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Validar ID antes de usar
      if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'ID de mensaje inválido');
      }

      // Validar también el ID del usuario
      const userObjId = mongoose.isValidObjectId(req.user._id)
        ? new mongoose.Types.ObjectId(req.user._id)
        : null;

      if (!userObjId) {
        throw new ApiError(400, 'ID de usuario inválido');
      }

      // Cuentas sin colegio (SUPER_ADMIN con escuelaId '') no tienen mensajes: antes daba 500 (CastError)
      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'El usuario no tiene un colegio asociado');
      }

      // Construir una consulta más segura
      const matchQuery = {
        _id: new mongoose.Types.ObjectId(id),
        // Solo mensajes del colegio del usuario (auditoría 3.C)
        escuelaId: req.user.escuelaId,
        $or: [
          { remitente: userObjId },
          { destinatarios: userObjId },
          { destinatariosCc: userObjId },
        ],
      };

      // Documento plano (sin poblar los arreglos completos: un mensaje a todo el colegio tiene miles)
      const mensaje: any = await Mensaje.findOne(matchQuery)
        .populate({
          path: 'mensajeOriginalId',
          select: '-destinatarios -destinatariosCc -estadosUsuarios -lecturas',
        })
        .lean();

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      const userIdStr = req.user._id.toString();
      const esRemitente = String(mensaje.remitente) === userIdStr;
      const idsDest: string[] = (mensaje.destinatarios || []).map(String);
      const idsCc: string[] = (mensaje.destinatariosCc || []).map(String);
      const esDestinatario = idsDest.includes(userIdStr) || idsCc.includes(userIdStr);

      // Destinatarios visibles (privacidad): el remitente ve todos; en mensajes individuales con
      // ≤10 destinatarios se ven todos (como un "Para:" de correo); en masivos solo el propio usuario.
      // El usuario actual SIEMPRE se incluye (Flutter lo usa para Responder y marcar leído).
      const verTodos =
        esRemitente || (mensaje.tipo === TipoMensaje.INDIVIDUAL && idsDest.length + idsCc.length <= 10);
      const visiblesDest = verTodos ? idsDest : idsDest.filter((d) => d === userIdStr);
      const visiblesCc = verTodos ? idsCc : idsCc.filter((d) => d === userIdStr);

      const personas = await Usuario.find({
        _id: { $in: [String(mensaje.remitente), ...visiblesDest, ...visiblesCc] },
      })
        .select('nombre apellidos email tipo')
        .lean();
      const porId = new Map(personas.map((p: any) => [String(p._id), p]));
      // Destinatarios sin email (ningún cliente lo muestra); el remitente conserva email (responder en web)
      const sinEmail = (id: string) => {
        const p: any = porId.get(id);
        return p ? { _id: p._id, nombre: p.nombre, apellidos: p.apellidos, tipo: p.tipo } : null;
      };

      // Si el usuario es destinatario y no ha leído el mensaje, marcarlo como leído
      const lecturas: any[] = mensaje.lecturas || [];
      let lecturasRespuesta = lecturas;
      if (esDestinatario) {
        const propia = lecturas.filter((l: any) => l?.usuarioId && String(l.usuarioId) === userIdStr);
        if (propia.length === 0) {
          const nueva = { usuarioId: userObjId, fechaLectura: new Date() };
          await Mensaje.updateOne(
            { _id: id, 'lecturas.usuarioId': { $ne: userObjId } },
            { $push: { lecturas: nueva } },
          );
          propia.push(nueva);
        }
        // Quien no es remitente solo ve su propia lectura (antes: las de todos los destinatarios)
        lecturasRespuesta = esRemitente ? [...lecturas, ...propia.filter((l) => !lecturas.includes(l))] : propia;
      }

      const remitente: any = porId.get(String(mensaje.remitente));
      const respuesta = {
        ...mensaje,
        remitente: remitente
          ? { _id: remitente._id, nombre: remitente.nombre, apellidos: remitente.apellidos, email: remitente.email, tipo: remitente.tipo }
          : mensaje.remitente,
        destinatarios: visiblesDest.map(sinEmail).filter(Boolean),
        destinatariosCc: visiblesCc.map(sinEmail).filter(Boolean),
        totalDestinatarios: idsDest.length,
        totalDestinatariosCc: idsCc.length,
        lecturas: lecturasRespuesta,
        estadosUsuarios: (mensaje.estadosUsuarios || []).filter(
          (e: any) => String(e.usuarioId) === userIdStr,
        ),
      };

      res.json({
        success: true,
        data: respuesta,
      });
    } catch (error) {
      console.error('Error al obtener mensaje por ID:', error);
      next(error);
    }
  }

  async archivar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: id,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Verificar si el usuario puede archivar este mensaje (no debe estar eliminado)
      if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
        const estadoUsuario = mensaje.estadosUsuarios.find(
          (eu: any) => eu.usuarioId.toString() === (req.user as NonNullable<typeof req.user>)._id,
        );

        if (estadoUsuario && estadoUsuario.estado === EstadoMensaje.ELIMINADO) {
          throw new ApiError(400, 'No se puede archivar un mensaje que está en la papelera');
        }
      }

      // Usar $set directamente en vez de método del modelo para evitar problemas con tipos
      await Mensaje.updateOne(
        {
          _id: id,
          $or: [
            { 'estadosUsuarios.usuarioId': new mongoose.Types.ObjectId(req.user._id) },
            { 'estadosUsuarios.usuarioId': { $exists: false } },
          ],
        },
        {
          $set: {
            'estadosUsuarios.$[elem].estado': EstadoMensaje.ARCHIVADO,
            'estadosUsuarios.$[elem].fechaAccion': new Date(),
            fechaAccion: new Date(),
          },
        },
        {
          arrayFilters: [{ 'elem.usuarioId': new mongoose.Types.ObjectId(req.user._id) }],
          upsert: true,
        },
      );

      res.json({
        success: true,
        message: 'Mensaje archivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  async desarchivar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: id,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Verificar si el mensaje está archivado para este usuario
      let estaArchivado = false;

      if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
        const estadoUsuario = mensaje.estadosUsuarios.find(
          (eu: any) => eu.usuarioId.toString() === req.user!._id,
        );

        if (estadoUsuario && estadoUsuario.estado === EstadoMensaje.ARCHIVADO) {
          estaArchivado = true;
        }
      } else if (mensaje.estado === EstadoMensaje.ARCHIVADO) {
        estaArchivado = true;
      }

      if (!estaArchivado) {
        throw new ApiError(400, 'El mensaje no está archivado');
      }

      // Usar $set directamente
      await Mensaje.updateOne(
        {
          _id: id,
          'estadosUsuarios.usuarioId': new mongoose.Types.ObjectId(req.user._id),
        },
        {
          $set: {
            'estadosUsuarios.$[elem].estado': EstadoMensaje.ENVIADO,
            'estadosUsuarios.$[elem].fechaAccion': new Date(),
            fechaAccion: new Date(),
          },
        },
        {
          arrayFilters: [{ 'elem.usuarioId': new mongoose.Types.ObjectId(req.user._id) }],
        },
      );

      res.json({
        success: true,
        message: 'Mensaje desarchivado exitosamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // Método para eliminar mensaje (mover a la papelera)
  async eliminar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: id,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Actualizar directamente en la base de datos
      await Mensaje.updateOne(
        {
          _id: id,
          $or: [
            { 'estadosUsuarios.usuarioId': new mongoose.Types.ObjectId(req.user._id) },
            { 'estadosUsuarios.usuarioId': { $exists: false } },
          ],
        },
        {
          $set: {
            'estadosUsuarios.$[elem].estado': EstadoMensaje.ELIMINADO,
            'estadosUsuarios.$[elem].fechaAccion': new Date(),
            fechaAccion: new Date(),
          },
        },
        {
          arrayFilters: [{ 'elem.usuarioId': new mongoose.Types.ObjectId(req.user._id) }],
          upsert: true,
        },
      );

      res.json({
        success: true,
        message: 'Mensaje movido a la papelera',
      });
    } catch (error) {
      next(error);
    }
  }

  // Método para restaurar mensaje desde la papelera
  async restaurar(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: id,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Verificar si el mensaje está eliminado para este usuario
      let estaEliminado = false;

      if (mensaje.estadosUsuarios && mensaje.estadosUsuarios.length > 0) {
        const userId = req.user._id; // Store ID since we know req.user exists
        const estadoUsuario = mensaje.estadosUsuarios.find(
          (eu: any) => eu.usuarioId.toString() === userId,
        );

        if (estadoUsuario && estadoUsuario.estado === EstadoMensaje.ELIMINADO) {
          estaEliminado = true;
        }
      } else if (mensaje.estado === EstadoMensaje.ELIMINADO) {
        estaEliminado = true;
      }

      if (!estaEliminado) {
        throw new ApiError(400, 'El mensaje no está en la papelera');
      }

      // Actualizar el estado directamente
      await Mensaje.updateOne(
        {
          _id: id,
          'estadosUsuarios.usuarioId': new mongoose.Types.ObjectId(req.user._id),
        },
        {
          $set: {
            'estadosUsuarios.$[elem].estado': EstadoMensaje.ENVIADO,
            'estadosUsuarios.$[elem].fechaAccion': new Date(),
            fechaAccion: new Date(),
          },
        },
        {
          arrayFilters: [{ 'elem.usuarioId': new mongoose.Types.ObjectId(req.user._id) }],
        },
      );

      res.json({
        success: true,
        message: 'Mensaje restaurado correctamente',
      });
    } catch (error) {
      next(error);
    }
  }

  // Método para eliminar permanentemente un mensaje
  async eliminarPermanentemente(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;

      // Buscar el mensaje que incluya al usuario y que esté en estado ELIMINADO para él
      const mensaje = await Mensaje.findOne({
        _id: id,
        estadosUsuarios: {
          $elemMatch: {
            usuarioId: req.user._id,
            estado: 'ELIMINADO',
          },
        },
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado o no está en la papelera');
      }

      // Actualizar el estado para este usuario específico a ELIMINADO_PERMANENTE
      await Mensaje.updateOne(
        {
          _id: id,
          'estadosUsuarios.usuarioId': req.user._id,
        },
        {
          $set: { 'estadosUsuarios.$.estado': 'ELIMINADO_PERMANENTE' },
        },
      );

      res.json({
        success: true,
        message: 'Mensaje eliminado permanentemente para este usuario',
      });
    } catch (error) {
      next(error);
    }
  }

  async descargarAdjunto(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { mensajeId, adjuntoId } = req.params;

      // Fase 5.8: mismas reglas que el detalle (obtenerPorId): colegio del usuario Y participante. Antes faltaba el
      // filtro por colegio. Cuentas sin colegio (SUPER_ADMIN sin escuelaId) no tienen mensajes.
      if (!mongoose.isValidObjectId(req.user.escuelaId)) {
        throw new ApiError(403, 'El usuario no tiene un colegio asociado');
      }

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: mensajeId,
        escuelaId: req.user.escuelaId,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Buscar el adjunto en el mensaje
      if (!mensaje.adjuntos || mensaje.adjuntos.length === 0) {
        throw new ApiError(404, 'El mensaje no tiene adjuntos');
      }

      const adjunto = mensaje.adjuntos.find((a) => a.fileId.toString() === adjuntoId);
      if (!adjunto) {
        throw new ApiError(404, 'Adjunto no encontrado');
      }

      // Existencia en su almacén (Fase 5.2: GridFS o S3 según la referencia)
      if (!(await existeArchivo(adjunto as any, BUCKET_MENSAJES))) {
        throw new ApiError(404, 'Archivo no encontrado en el sistema');
      }

      // Configurar respuesta (Content-Disposition RFC 5987, ver utils/contentDisposition)
      res.set({
        'Content-Type': adjunto.tipo,
        'Content-Disposition': contentDispositionAdjunto(adjunto.nombre),
      });

      // Devolver el stream del archivo (el backend autoriza y hace stream: no se redirige a una URL firmada)
      const downloadStream = await abrirArchivo(adjunto as any, BUCKET_MENSAJES);
      // Sin handler, un error del almacén con las cabeceras ya enviadas era un error de stream no manejado
      downloadStream.on('error', (error) => {
        console.error('Error en stream de descarga:', error);
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

  // Método para actualizar estado de lectura (agregar dentro de la clase MensajeController)

  async actualizarEstadoLectura(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      const { id } = req.params;
      const { leido } = req.body;

      // Validar parámetros
      if (leido === undefined || leido === null) {
        throw new ApiError(400, 'El parámetro "leido" es requerido');
      }

      // Verificar que el mensaje existe y el usuario tiene acceso
      const mensaje = await Mensaje.findOne({
        _id: id,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      });

      if (!mensaje) {
        throw new ApiError(404, 'Mensaje no encontrado');
      }

      // Verificar si el usuario tiene derecho a cambiar el estado de lectura
      const esRemitente = mensaje.remitente.toString() === req.user._id.toString();
      const esDestinatario =
        mensaje.destinatarios &&
        Array.isArray(mensaje.destinatarios) &&
        mensaje.destinatarios.some((dest: any) => {
          const destId =
            typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
          return destId === req.user!._id.toString();
        });
      const esDestinatarioCc =
        mensaje.destinatariosCc &&
        Array.isArray(mensaje.destinatariosCc) &&
        mensaje.destinatariosCc.some((dest: any) => {
          const destId =
            typeof dest === 'object' && dest._id ? dest._id.toString() : dest.toString();
          return destId === req.user!._id.toString();
        });

      // Mejorar mensaje de error para depuración
      if (!esDestinatario && !esDestinatarioCc && !esRemitente) {
        logger.debug(
          `[DEBUG] Usuario ${req.user._id} (${req.user.tipo}) no puede marcar mensaje ${id}`,
        );
        logger.debug(
          `[DEBUG] Es remitente: ${esRemitente}, Es destinatario: ${esDestinatario}, Es destinatarioCc: ${esDestinatarioCc}`,
        );
        logger.debug(`[DEBUG] Mensaje.remitente: ${mensaje.remitente}`);
        throw new ApiError(
          403,
          'No tiene permisos para cambiar el estado de lectura de este mensaje',
        );
      }

      // Actualizar el estado de lectura
      if (leido) {
        // Solo los destinatarios pueden marcar como leído
        if (!esDestinatario && !esDestinatarioCc) {
          throw new ApiError(403, 'Solo los destinatarios pueden marcar como leído');
        }

        // Si marcar como leído - Añadir a lecturas si no existe
        const yaLeido =
          mensaje.lecturas &&
          Array.isArray(mensaje.lecturas) &&
          mensaje.lecturas.some(
            (l: any) => l.usuarioId && l.usuarioId.toString() === req.user!._id.toString(),
          );

        if (!yaLeido) {
          await Mensaje.updateOne(
            { _id: id },
            {
              $push: {
                lecturas: {
                  usuarioId: req.user._id,
                  fechaLectura: new Date(),
                },
              },
            },
          );
        }

        res.json({
          success: true,
          message: 'Mensaje marcado como leído',
        });
      } else {
        // Solo los destinatarios pueden marcar como no leído
        if (!esDestinatario && !esDestinatarioCc) {
          throw new ApiError(403, 'Solo los destinatarios pueden marcar como no leído');
        }

        // Si marcar como no leído - Eliminar de lecturas
        await Mensaje.updateOne(
          { _id: id },
          {
            $pull: {
              lecturas: {
                usuarioId: req.user._id,
              },
            },
          },
        );

        res.json({
          success: true,
          message: 'Mensaje marcado como no leído',
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async obtenerBorradorPorId(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar que el usuario tiene permiso para usar borradores
      if (!ROLES_CON_BORRADORES.includes(req.user.tipo)) {
        throw new ApiError(403, 'No tiene permisos para usar borradores');
      }

      const { id } = req.params;

      // Validar que el ID sea válido
      if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'ID de borrador inválido');
      }

      // Buscar el borrador del usuario
      const borrador = await Mensaje.findOne({
        _id: id,
        remitente: req.user._id,
        tipo: TipoMensaje.BORRADOR,
      }).populate('destinatarios', 'nombre apellidos email tipo');

      if (!borrador) {
        throw new ApiError(404, 'Borrador no encontrado');
      }

      res.json({
        success: true,
        data: borrador,
      });
    } catch (error) {
      console.error('Error al obtener borrador por ID:', error);
      next(error);
    }
  }

  /**
   * Obtener últimos mensajes sin leer (optimizado para dashboard)
   * GET /api/mensajes/ultimos?limit=3
   */
  async obtenerUltimos(req: RequestWithUser, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new ApiError(401, 'No autorizado');
    }

    const limit = numeroLimite(req.query.limit, 3, 50);
    const userId = req.user._id;

    logger.debug(`📬 Obteniendo últimos ${limit} mensajes para usuario: ${userId}`);

    // Buscar mensajes donde el usuario es destinatario Y no ha leído
    const mensajes = await Mensaje.find({
      destinatarios: userId,
      tipo: { $ne: TipoMensaje.BORRADOR },
      'lecturas.usuarioId': { $ne: userId }
    })
      .sort({ createdAt: -1 }) // ← CAMBIO: usar createdAt en vez de fechaEnvio
      .limit(limit)
      .populate('remitente', 'nombre apellidos')
      .select('asunto contenido createdAt fechaEnvio remitente') // ← Agregar createdAt
      .lean();

    logger.debug(`✅ Encontrados ${mensajes.length} mensajes sin leer`);

    // Formatear respuesta con preview y tiempo relativo
    const formatted = mensajes.map((mensaje: any) => {
      const remitente = mensaje.remitente;
      const nombre = remitente?.nombre || '';
      const apellidos = remitente?.apellidos || '';
      
      // Crear iniciales
      const iniciales = `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase();
      
      // Preview del contenido (primeros 50 caracteres)
      const preview = mensaje.contenido 
        ? mensaje.contenido.substring(0, 50).trim() + '...'
        : 'Sin contenido';
      
      // 🔍 DEBUG: Ver qué fechas tiene el mensaje
      logger.debug(`🔍 Mensaje ${mensaje._id}:`);
      logger.debug(`   fechaEnvio: ${mensaje.fechaEnvio}`);
      logger.debug(`   createdAt: ${mensaje.createdAt}`);
      
      // Usar createdAt si no hay fechaEnvio
      const fechaReal = mensaje.fechaEnvio || mensaje.createdAt;
      logger.debug(`   ✅ Fecha a usar: ${fechaReal}`);
      
      // Calcular tiempo relativo
      const ahora = new Date();
      const fechaMensaje = new Date(fechaReal);
      const diffMs = ahora.getTime() - fechaMensaje.getTime();
      const diffMinutos = Math.floor(diffMs / 60000);
      
      logger.debug(`   ⏱️ Diferencia en minutos: ${diffMinutos}`);
      
      let tiempoRelativo: string;
      if (diffMinutos < 1) {
        tiempoRelativo = 'Justo ahora';
      } else if (diffMinutos < 60) {
        tiempoRelativo = `Hace ${diffMinutos} min`;
      } else if (diffMinutos < 1440) {
        const horas = Math.floor(diffMinutos / 60);
        tiempoRelativo = `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
      } else {
        const dias = Math.floor(diffMinutos / 1440);
        tiempoRelativo = `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
      }

      logger.debug(`   ⏰ Tiempo calculado: ${tiempoRelativo}`);

      const resultado = {
        id: mensaje._id,
        remitente: {
          nombre: nombre,
          apellidos: apellidos,
          nombreCompleto: `${nombre} ${apellidos}`.trim(),
          iniciales: iniciales
        },
        asunto: mensaje.asunto,
        preview: preview,
        fechaEnvio: fechaReal, // ← Usar la fecha real
        tiempoRelativo: tiempoRelativo
      };
      
      logger.debug(`   📦 Resultado:`, JSON.stringify(resultado, null, 2));
      
      return resultado;
    });

    logger.debug(`📤 Enviando ${formatted.length} mensajes formateados`);

    res.json({
      success: true,
      data: formatted
    });

  } catch (error) {
    console.error('❌ Error obteniendo últimos mensajes:', error);
    next(error);
  }
}

  async responder(req: RequestWithUser, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new ApiError(401, 'No autorizado');
      }

      // Verificar si el usuario es estudiante

      const { mensajeId } = req.params;
      const { asunto, contenido, destinatariosCc } = req.body;

      // Verificar que el mensaje original existe
      const mensajeOriginal = await Mensaje.findOne({
        _id: mensajeId,
        $or: [
          { remitente: req.user._id },
          { destinatarios: req.user._id },
          { destinatariosCc: req.user._id },
        ],
      }).populate('remitente', 'nombre apellidos email tipo');

      if (!mensajeOriginal) {
        throw new ApiError(404, 'Mensaje original no encontrado');
      }

      // Determinar destinatarios
      // Si el usuario es el remitente, responder a los destinatarios originales
      // Si el usuario es un destinatario, responder al remitente original
      let destinatarios = [];
      if ((mensajeOriginal.remitente as any)._id.toString() === req.user._id) {
        destinatarios = mensajeOriginal.destinatarios.map((d) => (d as any).toString());
      } else {
        destinatarios = [(mensajeOriginal.remitente as any)._id.toString()];
      }

      // Crear adjuntos si hay archivos
      const adjuntos = [];
      if (req.files && req.files.length > 0) {
        const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
        const MAX_TOTAL_SIZE = 15 * 1024 * 1024; // 15MB

        if (totalSize > MAX_TOTAL_SIZE) {
          throw new ApiError(
            400,
            `El tamaño total de los archivos adjuntos no puede superar los 15MB (tamaño actual: ${(
              totalSize /
              (1024 * 1024)
            ).toFixed(2)}MB)`,
          );
        }

        // Sube por la capa (5.2); si falla, no deja archivos huérfanos (temporales: limpiarTemporales)
        adjuntos.push(...(await subirAdjuntos(req.files as any[], BUCKET_MENSAJES, String(req.user._id))));
      }

      // Parsear destinatariosCc
      let destinatariosCcArray: string[] = [];
      if (destinatariosCc) {
        if (typeof destinatariosCc === 'string') {
          try {
            destinatariosCcArray = JSON.parse(destinatariosCc);
          } catch (error) {
            destinatariosCcArray = [destinatariosCc];
          }
        } else if (Array.isArray(destinatariosCc)) {
          destinatariosCcArray = destinatariosCc;
        }
      }

      // Datos para el servicio
      const datosRespuesta = {
        destinatarios,
        destinatariosCc: destinatariosCcArray,
        asunto: asunto || `Re: ${mensajeOriginal.asunto}`,
        contenido,
        adjuntos,
        tipo: TipoMensaje.INDIVIDUAL,
        prioridad: PrioridadMensaje.NORMAL,
        estado: EstadoMensaje.ENVIADO,
        esRespuesta: true,
        mensajeOriginalId: mensajeId,
      };

      // Usar el servicio para crear la respuesta; si falla, los adjuntos ya subidos quedarían huérfanos (auditoría 3.O)
      let respuesta;
      try {
        respuesta = await mensajeService.crearMensaje(datosRespuesta, req.user);
      } catch (crearError) {
        await revertirAdjuntosSinMensaje(adjuntos);
        throw crearError;
      }
      
      // Fase 4.2: notificaciones ya encoladas en crearMensaje. Copias a acudientes por la cola.
      try {
        const estudiantesInfo = await Usuario.find({
          _id: { $in: destinatarios },
          tipo: 'ESTUDIANTE',
          escuelaId: req.user.escuelaId,
        }).select('_id');

        await mensajeService.encolarCopiasAcudientes(
          respuesta._id.toString(),
          estudiantesInfo.map((est: any) => est._id.toString()),
          datosRespuesta,
          req.user,
        );
      } catch (errorCopia) {
        console.error('[ERROR] No se pudieron encolar las copias a acudientes de la respuesta:', errorCopia);
      }

      res.status(201).json({
        success: true,
        data: respuesta,
      });
    } catch (error) {
      next(error);
    }
  }

  async estadisticasDocentes(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');

      const { desde, hasta, cursoId, docenteId } = req.query as {
        desde?: string;
        hasta?: string;
        cursoId?: string;
        docenteId?: string;
      };

      if (!desde || !hasta) {
        throw new ApiError(400, 'Los parámetros desde y hasta son requeridos');
      }

      if (cursoId && !mongoose.isValidObjectId(cursoId)) {
        throw new ApiError(400, 'cursoId inválido');
      }

      if (docenteId && !mongoose.isValidObjectId(docenteId)) {
        throw new ApiError(400, 'docenteId inválido');
      }

      const result = await mensajeService.obtenerEstadisticasDocentes(req.user.escuelaId, {
        desde,
        hasta,
        cursoId,
        docenteId,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async auditoriaDocente(
    req: RequestWithUser,
    res: Response,
    next: NextFunction,
  ): Promise<any> {
    try {
      if (!req.user) throw new ApiError(401, 'No autorizado');

      const { remitenteId, desde, hasta, pagina, limite } = req.query as {
        remitenteId?: string;
        desde?: string;
        hasta?: string;
        pagina?: string;
        limite?: string;
      };

      if (!remitenteId || !desde || !hasta) {
        throw new ApiError(400, 'Los parámetros remitenteId, desde y hasta son requeridos');
      }

      if (!mongoose.isValidObjectId(remitenteId)) {
        throw new ApiError(400, 'remitenteId inválido');
      }

      const result = await mensajeService.obtenerMensajesAuditoria(req.user.escuelaId, {
        remitenteId,
        desde,
        hasta,
        pagina: numeroPagina(pagina),
        limite: numeroLimite(limite, 20),
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}

// Exportar una instancia de la clase
const mensajeController = new MensajeController();
export default mensajeController;