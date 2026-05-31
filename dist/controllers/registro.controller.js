"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerHistorialSolicitudes = exports.obtenerSolicitudPorId = exports.obtenerSolicitudesPendientes = exports.rechazarSolicitud = exports.aprobarSolicitud = exports.crearSolicitud = void 0;
const registro_service_1 = __importDefault(require("../services/registro.service"));
const catchAsync_1 = require("../utils/catchAsync");
exports.crearSolicitud = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { invitacionId, nombre, apellidos, email, telefono, estudiantes } = req.body;
    const resultado = await registro_service_1.default.crearSolicitud({
        invitacionId,
        nombre,
        apellidos,
        email,
        telefono,
        estudiantes,
    });
    const response = {
        success: true,
        data: resultado.solicitud,
        message: 'Solicitud de registro creada exitosamente. Un administrador revisará su solicitud en breve.',
    };
    if (resultado.advertencias && resultado.advertencias.length > 0) {
        response.advertencias = resultado.advertencias;
        response.message +=
            ' Nota: Se han realizado algunos ajustes automáticos en los emails de los estudiantes.';
    }
    res.status(201).json(response);
});
exports.aprobarSolicitud = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { id } = req.params;
    const usuarioAdminId = req.usuario?._id;
    const resultado = await registro_service_1.default.aprobarSolicitud(id, usuarioAdminId);
    res.status(200).json({
        success: true,
        data: resultado,
        message: 'Solicitud aprobada exitosamente',
    });
});
exports.rechazarSolicitud = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuarioAdminId = req.usuario?._id;
    const resultado = await registro_service_1.default.rechazarSolicitud(id, usuarioAdminId, motivo);
    res.status(200).json({
        success: true,
        message: 'Solicitud rechazada exitosamente',
    });
});
exports.obtenerSolicitudesPendientes = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const escuelaId = req.params.escuelaId || req.usuario?.escuelaId;
    const pagina = parseInt(req.query.pagina) || 1;
    const limite = parseInt(req.query.limite) || 10;
    const resultado = await registro_service_1.default.obtenerSolicitudesPendientes(escuelaId, pagina, limite);
    res.status(200).json({
        success: true,
        data: resultado,
        message: 'Solicitudes pendientes obtenidas exitosamente',
    });
});
exports.obtenerSolicitudPorId = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const { id } = req.params;
    const solicitud = await registro_service_1.default.obtenerSolicitudPorId(id);
    res.status(200).json({
        success: true,
        data: solicitud,
        message: 'Solicitud obtenida exitosamente',
    });
});
exports.obtenerHistorialSolicitudes = (0, catchAsync_1.catchAsync)(async (req, res, next) => {
    const escuelaId = req.params.escuelaId || req.usuario?.escuelaId;
    const { estado } = req.query;
    const pagina = parseInt(req.query.pagina) || 1;
    const limite = parseInt(req.query.limite) || 10;
    const resultado = await registro_service_1.default.obtenerHistorialSolicitudes(escuelaId, estado, pagina, limite);
    res.status(200).json({
        success: true,
        data: resultado,
        message: 'Historial de solicitudes obtenido exitosamente',
    });
});
//# sourceMappingURL=registro.controller.js.map