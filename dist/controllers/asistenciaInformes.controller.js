"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerHistorialEstudiante = exports.obtenerInformePatronDias = exports.obtenerInformeRankingCursos = exports.obtenerInformeTendencia = exports.obtenerInformeRiesgo = void 0;
const express_validator_1 = require("express-validator");
const ApiError_1 = __importDefault(require("../utils/ApiError"));
const asistenciaInformes_service_1 = require("../services/asistenciaInformes.service");
const parsearFechas = (desde, hasta) => {
    const result = {};
    if (desde) {
        const d = new Date(desde);
        if (isNaN(d.getTime()))
            throw new ApiError_1.default(400, 'Formato de fecha inválido para "desde" (use YYYY-MM-DD)');
        result.desde = d;
    }
    if (hasta) {
        const h = new Date(hasta);
        if (isNaN(h.getTime()))
            throw new ApiError_1.default(400, 'Formato de fecha inválido para "hasta" (use YYYY-MM-DD)');
        h.setHours(23, 59, 59, 999);
        result.hasta = h;
    }
    return result;
};
const obtenerInformeRiesgo = async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return next(new ApiError_1.default(400, errors.array()[0].msg));
        const { escuelaId } = req.user;
        const umbral = req.query.umbral ? Number(req.query.umbral) : 80;
        const cursoId = req.query.cursoId;
        const { desde, hasta } = parsearFechas(req.query.desde, req.query.hasta);
        if (umbral < 0 || umbral > 100)
            return next(new ApiError_1.default(400, 'El umbral debe estar entre 0 y 100'));
        const datos = await (0, asistenciaInformes_service_1.informeEstudiantesEnRiesgo)(escuelaId, umbral, cursoId, desde, hasta);
        res.json({
            ok: true,
            umbral,
            total: datos.length,
            criticos: datos.filter(e => e.nivelRiesgo === 'CRITICO').length,
            alertas: datos.filter(e => e.nivelRiesgo === 'ALERTA').length,
            estudiantes: datos,
        });
    }
    catch (err) {
        next(err);
    }
};
exports.obtenerInformeRiesgo = obtenerInformeRiesgo;
const obtenerInformeTendencia = async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return next(new ApiError_1.default(400, errors.array()[0].msg));
        const { escuelaId } = req.user;
        const { desde, hasta } = parsearFechas(req.query.desde, req.query.hasta);
        if (!desde || !hasta)
            return next(new ApiError_1.default(400, 'Los parámetros "desde" y "hasta" son requeridos'));
        const agrupacion = req.query.agrupacion ?? 'semana';
        if (!['semana', 'mes'].includes(agrupacion)) {
            return next(new ApiError_1.default(400, 'agrupacion debe ser "semana" o "mes"'));
        }
        const cursoId = req.query.cursoId;
        const datos = await (0, asistenciaInformes_service_1.informeTendencia)(escuelaId, desde, hasta, agrupacion, cursoId);
        res.json({ ok: true, agrupacion, puntos: datos.length, tendencia: datos });
    }
    catch (err) {
        next(err);
    }
};
exports.obtenerInformeTendencia = obtenerInformeTendencia;
const obtenerInformeRankingCursos = async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return next(new ApiError_1.default(400, errors.array()[0].msg));
        const { escuelaId } = req.user;
        const { desde, hasta } = parsearFechas(req.query.desde, req.query.hasta);
        if (!desde || !hasta)
            return next(new ApiError_1.default(400, 'Los parámetros "desde" y "hasta" son requeridos'));
        const datos = await (0, asistenciaInformes_service_1.informeRankingCursos)(escuelaId, desde, hasta);
        res.json({ ok: true, total: datos.length, ranking: datos });
    }
    catch (err) {
        next(err);
    }
};
exports.obtenerInformeRankingCursos = obtenerInformeRankingCursos;
const obtenerInformePatronDias = async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return next(new ApiError_1.default(400, errors.array()[0].msg));
        const { escuelaId } = req.user;
        const { desde, hasta } = parsearFechas(req.query.desde, req.query.hasta);
        if (!desde || !hasta)
            return next(new ApiError_1.default(400, 'Los parámetros "desde" y "hasta" son requeridos'));
        const cursoId = req.query.cursoId;
        const datos = await (0, asistenciaInformes_service_1.informePatronDias)(escuelaId, desde, hasta, cursoId);
        res.json({ ok: true, dias: datos });
    }
    catch (err) {
        next(err);
    }
};
exports.obtenerInformePatronDias = obtenerInformePatronDias;
const obtenerHistorialEstudiante = async (req, res, next) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty())
            return next(new ApiError_1.default(400, errors.array()[0].msg));
        const { escuelaId } = req.user;
        const { estudianteId } = req.params;
        const { desde, hasta } = parsearFechas(req.query.desde, req.query.hasta);
        if (!desde || !hasta)
            return next(new ApiError_1.default(400, 'Los parámetros "desde" y "hasta" son requeridos'));
        const datos = await (0, asistenciaInformes_service_1.informeHistorialEstudiante)(estudianteId, escuelaId, desde, hasta);
        res.json({ ok: true, ...datos });
    }
    catch (err) {
        next(err);
    }
};
exports.obtenerHistorialEstudiante = obtenerHistorialEstudiante;
//# sourceMappingURL=asistenciaInformes.controller.js.map