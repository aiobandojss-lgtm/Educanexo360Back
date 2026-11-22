import { body } from 'express-validator';

export const crearEscuelaValidation = [
  body('nombre').notEmpty().withMessage('El nombre es requerido').trim(),

  body('direccion').notEmpty().withMessage('La dirección es requerida').trim(),

  body('telefono').notEmpty().withMessage('El teléfono es requerido').trim(),

  body('email')
    .notEmpty()
    .withMessage('El email es requerido')
    .isEmail()
    .withMessage('Email inválido')
    .trim()
    .toLowerCase(),

  body('configuracion.periodos_academicos')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El número de períodos debe ser al menos 1'),

  body('configuracion.escala_calificacion.minima')
    .optional()
    .isFloat()
    .withMessage('La calificación mínima debe ser un número'),

  body('configuracion.escala_calificacion.maxima')
    .optional()
    .isFloat()
    .withMessage('La calificación máxima debe ser un número')
    .custom((value, { req }) => {
      if (value <= req.body.configuracion?.escala_calificacion?.minima) {
        throw new Error('La calificación máxima debe ser mayor que la mínima');
      }
      return true;
    }),

  body('configuracion.logros_por_periodo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El número de logros debe ser al menos 1'),
];

export const actualizarEscuelaValidation = [
  body('nombre').optional().notEmpty().withMessage('El nombre no puede estar vacío').trim(),

  body('direccion').optional().notEmpty().withMessage('La dirección no puede estar vacía').trim(),

  body('telefono').optional().notEmpty().withMessage('El teléfono no puede estar vacío').trim(),

  body('email').optional().isEmail().withMessage('Email inválido').trim().toLowerCase(),
];

export const actualizarConfiguracionValidation = [
  body('periodos_academicos')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El número de períodos debe ser al menos 1'),

  body('escala_calificacion.minima')
    .optional()
    .isFloat()
    .withMessage('La calificación mínima debe ser un número'),

  body('escala_calificacion.maxima')
    .optional()
    .isFloat()
    .withMessage('La calificación máxima debe ser un número')
    .custom((value, { req }) => {
      if (value <= req.body.escala_calificacion?.minima) {
        throw new Error('La calificación máxima debe ser mayor que la mínima');
      }
      return true;
    }),

  body('logros_por_periodo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El número de logros debe ser al menos 1'),
];

export const actualizarPeriodosValidation = [
  body('periodos_academicos')
    .isArray()
    .withMessage('Los periodos académicos deben ser un array')
    .notEmpty()
    .withMessage('Debe incluir al menos un periodo'),

  body('periodos_academicos.*.numero')
    .isInt({ min: 1 })
    .withMessage('El número de periodo debe ser positivo'),

  body('periodos_academicos.*.nombre').notEmpty().withMessage('El nombre del periodo es requerido'),

  body('periodos_academicos.*.fecha_inicio').isISO8601().withMessage('Fecha de inicio inválida'),

  body('periodos_academicos.*.fecha_fin')
    .isISO8601()
    .withMessage('Fecha de fin inválida')
    .custom((value, { req, path }) => {
      // K3: se compara con la fecha_inicio del MISMO periodo. Antes se leía req.body.fecha_inicio, que no existe
      // (los periodos van en un arreglo): la comparación con una fecha inválida siempre daba false y aceptaba
      // periodos que terminan antes de empezar.
      const indice = Number(/\[(\d+)\]/.exec(path)?.[1]);
      const fechaInicio = new Date(req.body?.periodos_academicos?.[indice]?.fecha_inicio);
      const fechaFin = new Date(value);
      // Sin fecha de inicio válida no se compara: ese error lo reporta la validación de fecha_inicio
      if (!isNaN(fechaInicio.getTime()) && fechaFin <= fechaInicio) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
      return true;
    }),
];
