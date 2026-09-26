"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerInvitacionesEscuela = exports.obtenerInvitacionPorId = exports.revocarInvitacion = exports.obtenerInvitacionesPorCurso = exports.validarCodigo = exports.crearInvitacion = void 0;
const invitacion_service_1 = __importDefault(require("../services/invitacion.service"));
const catchAsync_1 = require("../utils/catchAsync");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const paginacion_1 = require("../utils/paginacion");
const logger_1 = require("../utils/logger");
exports.crearInvitacion = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    logger_1.logger.debug('Creando invitación, datos de usuario:', req.user);
    const { tipo, cursoId, estudianteId, cantidadUsos, fechaExpiracion, datosAdicionales } = req.body;
    const escuelaId = req.user?.tipo === 'SUPER_ADMIN' && req.body.escuelaId
        ? String(req.body.escuelaId)
        : req.user?.escuelaId;
    const creadorId = req.user?._id;
    if (!escuelaId) {
        throw new ApiError_1.default(403, 'No tiene una escuela asociada');
    }
    logger_1.logger.debug('Datos para crear invitación:', {
        tipo,
        escuelaId,
        creadorId,
        cursoId: cursoId || 'No proporcionado',
    });
    const invitacion = await invitacion_service_1.default.crearInvitacion({
        tipo,
        escuelaId,
        cursoId,
        estudianteId,
        creadorId,
        cantidadUsos,
        fechaExpiracion: fechaExpiracion ? new Date(fechaExpiracion) : undefined,
        datosAdicionales,
    });
    res.status(201).json({
        success: true,
        data: invitacion,
        message: 'Invitación creada exitosamente',
    });
});
exports.validarCodigo = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { codigo } = req.body;
    const resultado = await invitacion_service_1.default.validarCodigo(codigo);
    res.status(200).json({
        success: true,
        data: resultado,
        message: 'Código de invitación válido',
    });
});
exports.obtenerInvitacionesPorCurso = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { cursoId } = req.params;
    const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
    const invitaciones = await invitacion_service_1.default.obtenerInvitacionesPorCurso(cursoId, req.user?.escuelaId, estado);
    res.status(200).json({
        success: true,
        data: invitaciones,
        message: 'Invitaciones obtenidas exitosamente',
    });
});
exports.revocarInvitacion = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { id } = req.params;
    const resultado = await invitacion_service_1.default.revocarInvitacion(id, req.user?.escuelaId);
    res.status(200).json({
        success: true,
        message: resultado.message,
    });
});
exports.obtenerInvitacionPorId = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { id } = req.params;
    const invitacion = await invitacion_service_1.default.obtenerInvitacionPorId(id, req.user?.escuelaId);
    res.status(200).json({
        success: true,
        data: invitacion,
        message: 'Invitación obtenida exitosamente',
    });
});
exports.obtenerInvitacionesEscuela = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const escuelaId = req.user?.escuelaId;
    const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
    const pagina = (0, paginacion_1.numeroPagina)(req.query.pagina);
    const limite = (0, paginacion_1.numeroLimite)(req.query.limite, 10);
    logger_1.logger.debug('Obteniendo invitaciones con escuelaId:', escuelaId);
    logger_1.logger.debug('Estado filtro:', estado);
    logger_1.logger.debug('Pagina:', pagina, 'Limite:', limite);
    const resultado = await invitacion_service_1.default.obtenerInvitacionesEscuela(escuelaId, estado, pagina, limite);
    logger_1.logger.debug('Invitaciones encontradas:', resultado.invitaciones.length);
    res.status(200).json({
        success: true,
        data: resultado,
        message: 'Invitaciones obtenidas exitosamente',
    });
});
//# sourceMappingURL=invitacion.controller.js.map