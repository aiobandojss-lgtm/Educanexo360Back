"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anuncioValidation = void 0;
const express_validator_1 = require("express-validator");
exports.anuncioValidation = {
    crear: [
        (0, express_validator_1.body)('titulo')
            .notEmpty()
            .withMessage('El título es obligatorio')
            .isString()
            .withMessage('El título debe ser texto')
            .isLength({ min: 3, max: 150 })
            .withMessage('El título debe tener entre 3 y 150 caracteres'),
        (0, express_validator_1.body)('contenido')
            .notEmpty()
            .withMessage('El contenido es obligatorio')
            .isString()
            .withMessage('El contenido debe ser texto'),
        (0, express_validator_1.body)('paraEstudiantes')
            .optional()
            .isBoolean()
            .withMessage('El campo paraEstudiantes debe ser un valor booleano'),
        (0, express_validator_1.body)('paraDocentes')
            .optional()
            .isBoolean()
            .withMessage('El campo paraDocentes debe ser un valor booleano'),
        (0, express_validator_1.body)('paraPadres')
            .optional()
            .isBoolean()
            .withMessage('El campo paraPadres debe ser un valor booleano'),
        (0, express_validator_1.body)('destacado')
            .optional()
            .isBoolean()
            .withMessage('El campo destacado debe ser un valor booleano'),
        (0, express_validator_1.body)('estaPublicado')
            .optional()
            .isBoolean()
            .withMessage('El campo estaPublicado debe ser un valor booleano'),
    ],
    actualizar: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de anuncio inválido'),
        (0, express_validator_1.body)('titulo')
            .optional()
            .isString()
            .withMessage('El título debe ser texto')
            .isLength({ min: 3, max: 150 })
            .withMessage('El título debe tener entre 3 y 150 caracteres'),
        (0, express_validator_1.body)('contenido').optional().isString().withMessage('El contenido debe ser texto'),
        (0, express_validator_1.body)('paraEstudiantes')
            .optional()
            .isBoolean()
            .withMessage('El campo paraEstudiantes debe ser un valor booleano'),
        (0, express_validator_1.body)('paraDocentes')
            .optional()
            .isBoolean()
            .withMessage('El campo paraDocentes debe ser un valor booleano'),
        (0, express_validator_1.body)('paraPadres')
            .optional()
            .isBoolean()
            .withMessage('El campo paraPadres debe ser un valor booleano'),
        (0, express_validator_1.body)('destacado')
            .optional()
            .isBoolean()
            .withMessage('El campo destacado debe ser un valor booleano'),
        (0, express_validator_1.body)('estaPublicado')
            .optional()
            .isBoolean()
            .withMessage('El campo estaPublicado debe ser un valor booleano'),
    ],
    obtener: [(0, express_validator_1.param)('id').isMongoId().withMessage('ID de anuncio inválido')],
    adjunto: [
        (0, express_validator_1.param)('id').isMongoId().withMessage('ID de anuncio inválido'),
        (0, express_validator_1.param)('archivoId').isMongoId().withMessage('ID de archivo inválido'),
    ],
    listar: [
        (0, express_validator_1.query)('pagina')
            .optional()
            .isInt({ min: 1 })
            .withMessage('La página debe ser un número mayor a 0')
            .toInt(),
        (0, express_validator_1.query)('limite')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('El límite debe ser un número entre 1 y 100')
            .toInt(),
        (0, express_validator_1.query)('soloDestacados')
            .optional()
            .isBoolean()
            .withMessage('soloDestacados debe ser un valor booleano')
            .toBoolean(),
        (0, express_validator_1.query)('soloPublicados')
            .optional()
            .isBoolean()
            .withMessage('soloPublicados debe ser un valor booleano')
            .toBoolean(),
        (0, express_validator_1.query)('paraRol')
            .optional()
            .isIn(['ESTUDIANTE', 'DOCENTE', 'PADRE'])
            .withMessage('Rol inválido'),
    ],
    publicar: [(0, express_validator_1.param)('id').isMongoId().withMessage('ID de anuncio inválido')],
    eliminar: [(0, express_validator_1.param)('id').isMongoId().withMessage('ID de anuncio inválido')],
};
exports.default = exports.anuncioValidation;
//# sourceMappingURL=anuncio.validation.js.map