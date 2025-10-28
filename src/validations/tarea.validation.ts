// src/validations/tarea.validation.ts
import { body, param, query } from 'express-validator';

export const tareaValidation = {
  // Validación para crear tarea
  crear: [
    body('titulo')
      .notEmpty()
      .withMessage('El título es obligatorio')
      .isString()
      .withMessage('El título debe ser texto')
      .isLength({ min: 3, max: 200 })
      .withMessage('El título debe tener entre 3 y 200 caracteres'),

    body('descripcion')
      .notEmpty()
      .withMessage('La descripción es obligatoria')
      .isString()
      .withMessage('La descripción debe ser texto'),

    body('asignaturaId')
      .notEmpty()
      .withMessage('La asignatura es obligatoria')
      .isMongoId()
      .withMessage('ID de asignatura inválido'),

    body('cursoId')
      .notEmpty()
      .withMessage('El curso es obligatorio')
      .isMongoId()
      .withMessage('ID de curso inválido'),

    body('estudiantesIds')
      .optional()
      .isArray()
      .withMessage('estudiantesIds debe ser un array')
      .custom((value) => {
        if (value && value.length > 0) {
          return value.every((id: string) => /^[0-9a-fA-F]{24}$/.test(id));
        }
        return true;
      })
      .withMessage('Todos los IDs de estudiantes deben ser válidos'),

    body('fechaLimite')
      .notEmpty()
      .withMessage('La fecha límite es obligatoria')
      .isISO8601()
      .withMessage('Fecha límite inválida')
      .custom((value) => {
        const fecha = new Date(value);
        const ahora = new Date();
        return fecha > ahora;
      })
      .withMessage('La fecha límite debe ser futura'),

    body('tipo')
      .optional()
      .isIn(['INDIVIDUAL', 'GRUPAL'])
      .withMessage('Tipo de tarea inválido'),

    body('prioridad')
      .optional()
      .isIn(['ALTA', 'MEDIA', 'BAJA'])
      .withMessage('Prioridad inválida'),

    body('permiteTardias')
      .optional()
      .isBoolean()
      .withMessage('permiteTardias debe ser booleano'),

    body('calificacionMaxima')
      .notEmpty()
      .withMessage('La calificación máxima es obligatoria')
      .isFloat({ min: 1, max: 10 })
      .withMessage('La calificación máxima debe estar entre 1 y 10'),

    body('pesoEvaluacion')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('El peso de evaluación debe estar entre 0 y 100'),
  ],

  // Validación para actualizar tarea
  actualizar: [
    param('id').isMongoId().withMessage('ID de tarea inválido'),

    body('titulo')
      .optional()
      .isString()
      .withMessage('El título debe ser texto')
      .isLength({ min: 3, max: 200 })
      .withMessage('El título debe tener entre 3 y 200 caracteres'),

    body('descripcion').optional().isString().withMessage('La descripción debe ser texto'),

    body('fechaLimite')
      .optional()
      .isISO8601()
      .withMessage('Fecha límite inválida')
      .custom((value) => {
        const fecha = new Date(value);
        const ahora = new Date();
        return fecha > ahora;
      })
      .withMessage('La fecha límite debe ser futura'),

    body('prioridad')
      .optional()
      .isIn(['ALTA', 'MEDIA', 'BAJA'])
      .withMessage('Prioridad inválida'),

    body('permiteTardias')
      .optional()
      .isBoolean()
      .withMessage('permiteTardias debe ser booleano'),

    body('calificacionMaxima')
      .optional()
      .isFloat({ min: 1, max: 10 })
      .withMessage('La calificación máxima debe estar entre 1 y 10'),

    body('pesoEvaluacion')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('El peso de evaluación debe estar entre 0 y 100'),
  ],

  // Validación para entregar tarea
  entregar: [
    param('id').isMongoId().withMessage('ID de tarea inválido'),

    body('comentarioEstudiante')
      .optional()
      .isString()
      .withMessage('El comentario debe ser texto')
      .isLength({ max: 500 })
      .withMessage('El comentario no puede exceder 500 caracteres'),
  ],

  // Validación para calificar entrega
  calificar: [
    param('id').isMongoId().withMessage('ID de tarea inválido'),
    param('entregaId').isMongoId().withMessage('ID de entrega inválido'),

    body('calificacion')
      .notEmpty()
      .withMessage('La calificación es obligatoria')
      .isFloat({ min: 0 })
      .withMessage('La calificación debe ser un número positivo'),

    body('comentarioDocente')
      .optional()
      .isString()
      .withMessage('El comentario debe ser texto')
      .isLength({ max: 1000 })
      .withMessage('El comentario no puede exceder 1000 caracteres'),
  ],

  // Validación para obtener por ID
  obtenerPorId: [param('id').isMongoId().withMessage('ID de tarea inválido')],

  // Validación para listar
  listar: [
    query('pagina')
      .optional()
      .isInt({ min: 1 })
      .withMessage('La página debe ser un número mayor a 0')
      .toInt(),

    query('limite')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('El límite debe estar entre 1 y 100')
      .toInt(),

    query('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),

    query('asignaturaId').optional().isMongoId().withMessage('ID de asignatura inválido'),

    query('estado')
      .optional()
      .isIn(['ACTIVA', 'CERRADA', 'CANCELADA'])
      .withMessage('Estado inválido'),

    query('prioridad')
      .optional()
      .isIn(['ALTA', 'MEDIA', 'BAJA'])
      .withMessage('Prioridad inválida'),
  ],

  // Validación para archivos
  archivo: [
    param('id').isMongoId().withMessage('ID de tarea inválido'),
    param('archivoId').isMongoId().withMessage('ID de archivo inválido'),
  ],
};

export default tareaValidation;