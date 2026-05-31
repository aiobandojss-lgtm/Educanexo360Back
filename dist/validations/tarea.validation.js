"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tareaValidation = void 0;
const express_validator_1 = require("express-validator");
exports.tareaValidation = {
    crear: [
        (0, express_validator_1.body)('titulo')
            .notEmpty()
            .withMessage('El título es obligatorio')
            .isString()
            .withMessage('El título debe ser texto')
            .isLength({ min: 3, max: 200 })
            .withMessage('El título debe tener entre 3 y 200 caracteres'),
        (0, express_validator_1.body)('descripcion')
            .notEmpty()
            .withMessage('La descripción es obligatoria')
            .isString()
            .withMessage('La descripción debe ser texto'),
        (0, express_validator_1.body)('asignaturaId')
            .notEmpty()
            .withMessage('La asignatura es obligatoria')
            .isMongoId()
            .withMessage('ID de asignatura inválido'),
        (0, express_validator_1.body)('cursoId')
            .notEmpty()
            .withMessage('El curso es obligatorio')
            .isMongoId()
            .withMessage('ID de curso inválido'),
        (0, express_validator_1.body)('estudiantesIds')
            .optional()
            .isArray()
            .withMessage('estudiantesIds debe ser un array')
            .custom((value) => {
            if (value && value.length > 0) {
                return value.every((id) => /^[0-9a-fA-F]{24}$/.test(id));
            }
            return true;
        })
            .withMessage('Todos los IDs de estudiantes deben ser válidos'),
        (0, express_validator_1.body)('fechaLimite')
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
        (0, express_validator_1.body)('tipo')
            .optional()
            .isIn(['INDIVIDUAL', 'GRUPAL'])
            .withMessage('Tipo de tarea inválido'),
        (0, express_validator_1.body)('prioridad')
            .optional()
            .isIn(['ALTA', 'MEDIA', 'BAJA'])
            .withMessage('Prioridad inválida'),
        (0, express_validator_1.body)('permiteTardias')
            .optional()
            .isBoolean()
            .withMessage('permiteTardias debe ser booleano'),
        (0, express_validator_1.body)('calificacionMaxima')
            .notEmpty()
            .withMessage('La calificación máxima es obligatoria')
            .isFloat({ min: 1, max: 10 })
            .withMessage('La calificación máxima debe estar entre 1 y 10'),
        (0, express_validator_1.body)('pesoEvaluacion')
            .optional()
            .isFloat({ min: 0, max: 100 })
            .withMessage('El peso de evaluación debe estar entre 0 y 100'),
    ],
    actualizar: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de tarea inválido'),
        (0, express_validator_1.body)('titulo')
            .optional()
            .isString()
            .withMessage('El título debe ser texto')
            .isLength({ min: 3, max: 200 })
            .withMessage('El título debe tener entre 3 y 200 caracteres'),
        (0, express_validator_1.body)('descripcion').optional().isString().withMessage('La descripción debe ser texto'),
        (0, express_validator_1.body)('fechaLimite')
            .optional()
            .isISO8601()
            .withMessage('Fecha límite inválida')
            .custom((value) => {
            const fecha = new Date(value);
            const ahora = new Date();
            return fecha > ahora;
        })
            .withMessage('La fecha límite debe ser futura'),
        (0, express_validator_1.body)('prioridad')
            .optional()
            .isIn(['ALTA', 'MEDIA', 'BAJA'])
            .withMessage('Prioridad inválida'),
        (0, express_validator_1.body)('permiteTardias')
            .optional()
            .isBoolean()
            .withMessage('permiteTardias debe ser booleano'),
        (0, express_validator_1.body)('calificacionMaxima')
            .optional()
            .isFloat({ min: 1, max: 10 })
            .withMessage('La calificación máxima debe estar entre 1 y 10'),
        (0, express_validator_1.body)('pesoEvaluacion')
            .optional()
            .isFloat({ min: 0, max: 100 })
            .withMessage('El peso de evaluación debe estar entre 0 y 100'),
    ],
    entregar: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de tarea inválido'),
        (0, express_validator_1.body)('comentarioEstudiante')
            .optional()
            .isString()
            .withMessage('El comentario debe ser texto')
            .isLength({ max: 500 })
            .withMessage('El comentario no puede exceder 500 caracteres'),
    ],
    calificar: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de tarea inválido'),
        (0, express_validator_1.param)('entregaId').isMongoId().withMessage('ID de entrega inválido'),
        (0, express_validator_1.body)('calificacion')
            .notEmpty()
            .withMessage('La calificación es obligatoria')
            .isFloat({ min: 0 })
            .withMessage('La calificación debe ser un número positivo'),
        (0, express_validator_1.body)('comentarioDocente')
            .optional()
            .isString()
            .withMessage('El comentario debe ser texto')
            .isLength({ max: 1000 })
            .withMessage('El comentario no puede exceder 1000 caracteres'),
    ],
    obtenerPorId: [(0, express_validator_1.param)('id').isMongoId().withMessage('ID de tarea inválido')],
    listar: [
        (0, express_validator_1.query)('pagina')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número mayor a 0')
            .toInt(),
        (0, express_validator_1.query)('limite')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe estar entre 1 y 100')
            .toInt(),
        (0, express_validator_1.query)('cursoId').optional().isMongoId().withMessage('ID de curso inválido'),
        (0, express_validator_1.query)('asignaturaId').optional().isMongoId().withMessage('ID de asignatura inválido'),
        (0, express_validator_1.query)('estado')
            .optional()
            .isIn(['ACTIVA', 'CERRADA', 'CANCELADA'])
            .withMessage('Estado inválido'),
        (0, express_validator_1.query)('prioridad')
            .optional()
            .isIn(['ALTA', 'MEDIA', 'BAJA'])
            .withMessage('Prioridad inválida'),
    ],
    archivo: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de tarea inválido'),
        (0, express_validator_1.param)('archivoId').isMongoId().withMessage('ID de archivo inválido'),
    ],
};
exports.default = exports.tareaValidation;
//# sourceMappingURL=tarea.validation.js.map