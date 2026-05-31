"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_middleware_1 = require("../middleware/auth.middleware");
const asistenciaInformes_controller_1 = require("../controllers/asistenciaInformes.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
const validarFechaOpcional = (campo) => (0, express_validator_1.query)(campo).optional().isISO8601().withMessage(`${campo} debe ser una fecha válida (YYYY-MM-DD)`);
const validarFechaRequerida = (campo) => (0, express_validator_1.query)(campo).notEmpty().withMessage(`${campo} es requerido`).isISO8601().withMessage(`${campo} debe ser una fecha válida (YYYY-MM-DD)`);
const validarMongoId = (campo) => (0, express_validator_1.query)(campo).optional().isMongoId().withMessage(`${campo} debe ser un ID válido`);
router.get('/riesgo', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'), [
    (0, express_validator_1.query)('umbral').optional().isInt({ min: 0, max: 100 }).withMessage('umbral debe ser un entero entre 0 y 100'),
    validarFechaOpcional('desde'),
    validarFechaOpcional('hasta'),
    validarMongoId('cursoId'),
], asistenciaInformes_controller_1.obtenerInformeRiesgo);
router.get('/tendencia', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'), [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
    (0, express_validator_1.query)('agrupacion').optional().isIn(['semana', 'mes']).withMessage('agrupacion debe ser "semana" o "mes"'),
    validarMongoId('cursoId'),
], asistenciaInformes_controller_1.obtenerInformeTendencia);
router.get('/ranking-cursos', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'), [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
], asistenciaInformes_controller_1.obtenerInformeRankingCursos);
router.get('/patron-dias', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'), [
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
    validarMongoId('cursoId'),
], asistenciaInformes_controller_1.obtenerInformePatronDias);
router.get('/historial/:estudianteId', (0, auth_middleware_1.authorize)('ADMIN', 'RECTOR', 'COORDINADOR', 'DOCENTE'), [
    (0, express_validator_1.param)('estudianteId').isMongoId().withMessage('estudianteId debe ser un ID válido'),
    validarFechaRequerida('desde'),
    validarFechaRequerida('hasta'),
], asistenciaInformes_controller_1.obtenerHistorialEstudiante);
exports.default = router;
//# sourceMappingURL=asistenciaInformes.routes.js.map