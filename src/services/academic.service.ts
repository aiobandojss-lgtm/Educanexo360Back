// src/services/academic.service.ts - VERSIÓN FINAL OPTIMIZADA

import Calificacion from '../models/calificacion.model';
import Logro from '../models/logro.model';
import Usuario from '../models/usuario.model';
import Curso from '../models/curso.model';
import ApiError from '../utils/ApiError';
import { cache, invalidateCache, invalidateRelatedCache } from '../cache/simpleCache';
import mongoose from 'mongoose';

// Interfaces para tipado fuerte
interface PromedioResult {
  cognitivo: number | null;
  procedimental: number | null;
  actitudinal: number | null;
  promedio_final: number;
  logros_evaluados: number;
  porcentaje_completado: number;
}

interface PromedioAsignaturaResult {
  promedios_periodos: Array<{
    periodo: number;
    promedio_final: number;
    logros_evaluados: number;
    porcentaje_completado: number;
  }>;
  promedio_final: number;
  periodos_evaluados: number;
}

interface EstadisticasGrupoResult {
  total_estudiantes: number;
  promedio_grupo: number;
  desviacion_estandar: number;
  maximo: number;
  minimo: number;
  distribucion: {
    excelente: number;
    bueno: number;
    aceptable: number;
    insuficiente: number;
  };
}

class AcademicService {
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
    // Buscar en cache primero
    const cached = cache.get<T>(cacheKey);
    if (cached) {
      console.log(`📋 CACHE HIT: ${cacheKey}`);
      return cached;
    }

    // Si no está en cache, ejecutar función y cachear resultado
    const result = await fetchFunction();
    cache.set(cacheKey, result, ttl);
    console.log(`💾 CACHE SET: ${cacheKey} (${ttl}s)`);

    return result;
  }

  // 🚀 OPTIMIZACIÓN CRÍTICA #1: Promedio Periodo - SIN N+1 QUERIES
  async calcularPromedioPeriodo(
    estudianteId: string,
    asignaturaId: string,
    periodo: number,
    año_academico: string,
  ): Promise<PromedioResult | null> {
    const cacheKey = this.createCacheKey(
      'promedio_periodo',
      estudianteId,
      asignaturaId,
      periodo.toString(),
      año_academico,
    );

    return await this.getOrSetCache(cacheKey, 300, async () => {
      console.log(
        `🔍 Calculando promedio periodo: ${estudianteId}, ${asignaturaId}, ${periodo}, ${año_academico}`,
      );

      // ✅ UNA SOLA AGREGACIÓN OPTIMIZADA (elimina N+1 queries)
      const resultado = await Calificacion.aggregate([
        {
          $match: {
            estudianteId: new mongoose.Types.ObjectId(estudianteId),
            asignaturaId: new mongoose.Types.ObjectId(asignaturaId),
            periodo,
            año_academico,
          },
        },
        {
          $unwind: {
            path: '$calificaciones_logros',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'logros',
            localField: 'calificaciones_logros.logroId',
            foreignField: '_id',
            as: 'logro_info',
            pipeline: [
              {
                $project: {
                  tipo: 1,
                  porcentaje: 1,
                  descripcion: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: {
            path: '$logro_info',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: null,
            logros_evaluados: { $sum: 1 },
            porcentaje_total: { $sum: '$logro_info.porcentaje' },
            // Calcular promedios por tipo de logro
            calificaciones_cognitivas: {
              $push: {
                $cond: [
                  { $eq: [{ $toLower: '$logro_info.tipo' }, 'cognitivo'] },
                  {
                    calificacion: '$calificaciones_logros.calificacion',
                    porcentaje: '$logro_info.porcentaje',
                  },
                  null,
                ],
              },
            },
            calificaciones_procedimentales: {
              $push: {
                $cond: [
                  { $eq: [{ $toLower: '$logro_info.tipo' }, 'procedimental'] },
                  {
                    calificacion: '$calificaciones_logros.calificacion',
                    porcentaje: '$logro_info.porcentaje',
                  },
                  null,
                ],
              },
            },
            calificaciones_actitudinales: {
              $push: {
                $cond: [
                  { $eq: [{ $toLower: '$logro_info.tipo' }, 'actitudinal'] },
                  {
                    calificacion: '$calificaciones_logros.calificacion',
                    porcentaje: '$logro_info.porcentaje',
                  },
                  null,
                ],
              },
            },
            suma_ponderada_total: {
              $sum: {
                $multiply: [
                  '$calificaciones_logros.calificacion',
                  { $divide: ['$logro_info.porcentaje', 100] },
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            logros_evaluados: 1,
            porcentaje_completado: '$porcentaje_total',

            // Promedio cognitivo
            cognitivo: {
              $let: {
                vars: {
                  califs_filtradas: {
                    $filter: {
                      input: '$calificaciones_cognitivas',
                      cond: { $ne: ['$$this', null] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $size: '$$califs_filtradas' }, 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            {
                              $divide: [
                                {
                                  $reduce: {
                                    input: '$$califs_filtradas',
                                    initialValue: 0,
                                    in: {
                                      $add: [
                                        '$$value',
                                        {
                                          $multiply: [
                                            '$$this.calificacion',
                                            { $divide: ['$$this.porcentaje', 100] },
                                          ],
                                        },
                                      ],
                                    },
                                  },
                                },
                                {
                                  $divide: [
                                    {
                                      $reduce: {
                                        input: '$$califs_filtradas',
                                        initialValue: 0,
                                        in: { $add: ['$$value', '$$this.porcentaje'] },
                                      },
                                    },
                                    100,
                                  ],
                                },
                              ],
                            },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    null,
                  ],
                },
              },
            },

            // Promedio procedimental
            procedimental: {
              $let: {
                vars: {
                  califs_filtradas: {
                    $filter: {
                      input: '$calificaciones_procedimentales',
                      cond: { $ne: ['$$this', null] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $size: '$$califs_filtradas' }, 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            {
                              $divide: [
                                {
                                  $reduce: {
                                    input: '$$califs_filtradas',
                                    initialValue: 0,
                                    in: {
                                      $add: [
                                        '$$value',
                                        {
                                          $multiply: [
                                            '$$this.calificacion',
                                            { $divide: ['$$this.porcentaje', 100] },
                                          ],
                                        },
                                      ],
                                    },
                                  },
                                },
                                {
                                  $divide: [
                                    {
                                      $reduce: {
                                        input: '$$califs_filtradas',
                                        initialValue: 0,
                                        in: { $add: ['$$value', '$$this.porcentaje'] },
                                      },
                                    },
                                    100,
                                  ],
                                },
                              ],
                            },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    null,
                  ],
                },
              },
            },

            // Promedio actitudinal
            actitudinal: {
              $let: {
                vars: {
                  califs_filtradas: {
                    $filter: {
                      input: '$calificaciones_actitudinales',
                      cond: { $ne: ['$$this', null] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $size: '$$califs_filtradas' }, 0] },
                    {
                      $round: [
                        {
                          $multiply: [
                            {
                              $divide: [
                                {
                                  $reduce: {
                                    input: '$$califs_filtradas',
                                    initialValue: 0,
                                    in: {
                                      $add: [
                                        '$$value',
                                        {
                                          $multiply: [
                                            '$$this.calificacion',
                                            { $divide: ['$$this.porcentaje', 100] },
                                          ],
                                        },
                                      ],
                                    },
                                  },
                                },
                                {
                                  $divide: [
                                    {
                                      $reduce: {
                                        input: '$$califs_filtradas',
                                        initialValue: 0,
                                        in: { $add: ['$$value', '$$this.porcentaje'] },
                                      },
                                    },
                                    100,
                                  ],
                                },
                              ],
                            },
                            100,
                          ],
                        },
                        2,
                      ],
                    },
                    null,
                  ],
                },
              },
            },

            // Promedio final general
            promedio_final: {
              $round: [
                {
                  $cond: [
                    { $gt: ['$porcentaje_total', 0] },
                    {
                      $multiply: [
                        {
                          $divide: [
                            '$suma_ponderada_total',
                            { $divide: ['$porcentaje_total', 100] },
                          ],
                        },
                        100,
                      ],
                    },
                    0,
                  ],
                },
                2,
              ],
            },
          },
        },
      ]);

      if (!resultado.length) {
        console.log(
          `❌ No se encontraron calificaciones para: ${estudianteId}, ${asignaturaId}, ${periodo}`,
        );
        return null;
      }

      const data = resultado[0];
      const promedio: PromedioResult = {
        cognitivo: data.cognitivo,
        procedimental: data.procedimental,
        actitudinal: data.actitudinal,
        promedio_final: data.promedio_final || 0,
        logros_evaluados: data.logros_evaluados || 0,
        porcentaje_completado: Number(data.porcentaje_completado?.toFixed(2)) || 0,
      };

      console.log(`✅ Promedio calculado:`, promedio);
      return promedio;
    });
  }

  // 🚀 OPTIMIZACIÓN CRÍTICA #2: Promedio Asignatura - AGREGACIÓN MASIVA
  async calcularPromedioAsignatura(
    estudianteId: string,
    asignaturaId: string,
    año_academico: string,
  ): Promise<PromedioAsignaturaResult> {
    const cacheKey = this.createCacheKey(
      'promedio_asignatura',
      estudianteId,
      asignaturaId,
      año_academico,
    );

    return await this.getOrSetCache(cacheKey, 600, async () => {
      console.log(
        `🔍 Calculando promedio asignatura completa: ${estudianteId}, ${asignaturaId}, ${año_academico}`,
      );

      // ✅ UNA SOLA AGREGACIÓN PARA TODOS LOS PERIODOS
      const resultado = await Calificacion.aggregate([
        {
          $match: {
            estudianteId: new mongoose.Types.ObjectId(estudianteId),
            asignaturaId: new mongoose.Types.ObjectId(asignaturaId),
            año_academico,
          },
        },
        {
          $unwind: '$calificaciones_logros',
        },
        {
          $lookup: {
            from: 'logros',
            localField: 'calificaciones_logros.logroId',
            foreignField: '_id',
            as: 'logro_info',
          },
        },
        {
          $unwind: '$logro_info',
        },
        {
          $group: {
            _id: '$periodo',
            suma_ponderada: {
              $sum: {
                $multiply: [
                  '$calificaciones_logros.calificacion',
                  { $divide: ['$logro_info.porcentaje', 100] },
                ],
              },
            },
            porcentaje_total: { $sum: '$logro_info.porcentaje' },
            logros_evaluados: { $sum: 1 },
          },
        },
        {
          $project: {
            periodo: '$_id',
            promedio_final: {
              $round: [
                {
                  $cond: [
                    { $gt: ['$porcentaje_total', 0] },
                    {
                      $multiply: [
                        { $divide: ['$suma_ponderada', { $divide: ['$porcentaje_total', 100] }] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
                2,
              ],
            },
            logros_evaluados: 1,
            porcentaje_completado: '$porcentaje_total',
          },
        },
        {
          $sort: { periodo: 1 },
        },
        {
          $group: {
            _id: null,
            promedios_periodos: {
              $push: {
                periodo: '$periodo',
                promedio_final: '$promedio_final',
                logros_evaluados: '$logros_evaluados',
                porcentaje_completado: '$porcentaje_completado',
              },
            },
            promedio_final: { $avg: '$promedio_final' },
            periodos_evaluados: { $sum: 1 },
          },
        },
      ]);

      if (!resultado.length) {
        return {
          promedios_periodos: [],
          promedio_final: 0,
          periodos_evaluados: 0,
        };
      }

      const data = resultado[0];
      const promedioAsignatura: PromedioAsignaturaResult = {
        promedios_periodos: data.promedios_periodos,
        promedio_final: Number(data.promedio_final?.toFixed(2)) || 0,
        periodos_evaluados: data.periodos_evaluados,
      };

      console.log(`✅ Promedio asignatura calculado:`, promedioAsignatura);
      return promedioAsignatura;
    });
  }

  // 🚀 OPTIMIZACIÓN CRÍTICA #3: Estadísticas Grupo - AGREGACIÓN MASIVA
  async obtenerEstadisticasGrupo(
    cursoId: string,
    asignaturaId: string,
    periodo: number,
    año_academico: string,
  ): Promise<EstadisticasGrupoResult> {
    const cacheKey = this.createCacheKey(
      'estadisticas_grupo',
      cursoId,
      asignaturaId,
      periodo.toString(),
      año_academico,
    );

    return await this.getOrSetCache(cacheKey, 180, async () => {
      console.log(
        `🔍 Calculando estadísticas grupo: ${cursoId}, ${asignaturaId}, ${periodo}, ${año_academico}`,
      );

      // ✅ UNA SOLA AGREGACIÓN MASIVA PARA TODO EL GRUPO
      const resultado = await Calificacion.aggregate([
        {
          $match: {
            periodo,
            año_academico,
            asignaturaId: new mongoose.Types.ObjectId(asignaturaId),
          },
        },
        {
          $lookup: {
            from: 'usuarios',
            localField: 'estudianteId',
            foreignField: '_id',
            as: 'estudiante_info',
          },
        },
        {
          $unwind: '$estudiante_info',
        },
        {
          $lookup: {
            from: 'cursos',
            let: { estudianteId: '$estudianteId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', new mongoose.Types.ObjectId(cursoId)] },
                      { $in: ['$$estudianteId', '$estudiantes'] },
                    ],
                  },
                },
              },
            ],
            as: 'curso_info',
          },
        },
        {
          $match: { 'curso_info.0': { $exists: true } },
        },
        {
          $unwind: '$calificaciones_logros',
        },
        {
          $lookup: {
            from: 'logros',
            localField: 'calificaciones_logros.logroId',
            foreignField: '_id',
            as: 'logro_info',
          },
        },
        {
          $unwind: '$logro_info',
        },
        {
          $group: {
            _id: '$estudianteId',
            nombre_estudiante: { $first: '$estudiante_info.nombre' },
            apellidos_estudiante: { $first: '$estudiante_info.apellidos' },
            suma_ponderada: {
              $sum: {
                $multiply: [
                  '$calificaciones_logros.calificacion',
                  { $divide: ['$logro_info.porcentaje', 100] },
                ],
              },
            },
            porcentaje_total: { $sum: '$logro_info.porcentaje' },
          },
        },
        {
          $project: {
            nombre_estudiante: 1,
            apellidos_estudiante: 1,
            promedio_final: {
              $round: [
                {
                  $cond: [
                    { $gt: ['$porcentaje_total', 0] },
                    {
                      $multiply: [
                        { $divide: ['$suma_ponderada', { $divide: ['$porcentaje_total', 100] }] },
                        100,
                      ],
                    },
                    0,
                  ],
                },
                2,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            total_estudiantes: { $sum: 1 },
            promedios: { $push: '$promedio_final' },
            promedio_grupo: { $avg: '$promedio_final' },
            maximo: { $max: '$promedio_final' },
            minimo: { $min: '$promedio_final' },
            excelente: {
              $sum: { $cond: [{ $gte: ['$promedio_final', 4.5] }, 1, 0] },
            },
            bueno: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$promedio_final', 4.0] }, { $lt: ['$promedio_final', 4.5] }] },
                  1,
                  0,
                ],
              },
            },
            aceptable: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ['$promedio_final', 3.0] }, { $lt: ['$promedio_final', 4.0] }] },
                  1,
                  0,
                ],
              },
            },
            insuficiente: {
              $sum: { $cond: [{ $lt: ['$promedio_final', 3.0] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            total_estudiantes: 1,
            promedio_grupo: { $round: ['$promedio_grupo', 2] },
            maximo: 1,
            minimo: 1,
            desviacion_estandar: {
              $round: [
                {
                  $sqrt: {
                    $avg: {
                      $map: {
                        input: '$promedios',
                        as: 'promedio',
                        in: {
                          $pow: [{ $subtract: ['$$promedio', '$promedio_grupo'] }, 2],
                        },
                      },
                    },
                  },
                },
                2,
              ],
            },
            distribucion: {
              excelente: '$excelente',
              bueno: '$bueno',
              aceptable: '$aceptable',
              insuficiente: '$insuficiente',
            },
          },
        },
      ]);

      if (!resultado.length) {
        return {
          total_estudiantes: 0,
          promedio_grupo: 0,
          desviacion_estandar: 0,
          maximo: 0,
          minimo: 5,
          distribucion: {
            excelente: 0,
            bueno: 0,
            aceptable: 0,
            insuficiente: 0,
          },
        };
      }

      const estadisticas = resultado[0];
      console.log(`✅ Estadísticas grupo calculadas:`, estadisticas);
      return estadisticas;
    });
  }

  // 🚀 INVALIDACIÓN DE CACHE INTELIGENTE
  invalidarCacheEstudiante(estudianteId: string, asignaturaId?: string, escuelaId?: string) {
    console.log(`🔄 Invalidando cache académico para estudiante ${estudianteId}`);

    // Tipos relacionados a invalidar
    const tiposRelacionados = [
      'promedio_periodo',
      'promedio_asignatura',
      'estadisticas_grupo',
      'dashboard',
      'dashboard_rol',
      'dashboard_completo',
    ];

    if (escuelaId) {
      tiposRelacionados.forEach((tipo) => {
        invalidateCache(tipo, estudianteId, escuelaId);
      });
    } else {
      // Invalidar keys que contengan el estudianteId
      const allKeys = cache.keys();
      tiposRelacionados.forEach((tipo) => {
        const keysToDelete = allKeys.filter(
          (key) => key.includes(tipo) && key.includes(estudianteId),
        );
        keysToDelete.forEach((key) => cache.del(key));
      });
    }

    console.log(`✅ Cache académico invalidado para estudiante ${estudianteId}`);
  }

  // 🚀 INVALIDACIÓN DE CACHE POR CURSO
  invalidarCacheCurso(cursoId: string, escuelaId?: string) {
    console.log(`🔄 Invalidando cache académico para curso ${cursoId}`);

    const allKeys = cache.keys();
    const keysToDelete = allKeys.filter(
      (key) =>
        (key.includes('estadisticas_grupo') || key.includes('dashboard')) && key.includes(cursoId),
    );

    keysToDelete.forEach((key) => cache.del(key));
    console.log(
      `✅ Cache académico invalidado para curso ${cursoId} - ${keysToDelete.length} keys eliminadas`,
    );
  }

  // 🚀 MÉTODO ADICIONAL: Limpiar todo el cache académico
  limpiarCacheAcademico() {
    const tiposAcademicos = ['promedio_periodo', 'promedio_asignatura', 'estadisticas_grupo'];
    const allKeys = cache.keys();

    tiposAcademicos.forEach((tipo) => {
      const keysToDelete = allKeys.filter((key) => key.includes(tipo));
      keysToDelete.forEach((key) => cache.del(key));
    });

    console.log(`🧹 Cache académico completamente limpiado`);
  }
}

export default new AcademicService();
