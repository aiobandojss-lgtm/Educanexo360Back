"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryString = exports.aArregloDeIds = exports.puedeVerEstudiante = exports.docenteTieneCurso = exports.obtenerAsignaturasDocente = exports.obtenerCursosDocente = exports.obtenerHijosIds = exports.esRolAdministrativo = exports.ROLES_ADMINISTRATIVOS = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const usuario_model_1 = __importDefault(require("../models/usuario.model"));
const curso_model_1 = __importDefault(require("../models/curso.model"));
const asignatura_model_1 = __importDefault(require("../models/asignatura.model"));
exports.ROLES_ADMINISTRATIVOS = ['ADMIN', 'RECTOR', 'COORDINADOR', 'ADMINISTRATIVO'];
const esRolAdministrativo = (tipo) => !!tipo && exports.ROLES_ADMINISTRATIVOS.includes(tipo);
exports.esRolAdministrativo = esRolAdministrativo;
const esIdValido = (id) => typeof id === 'string' && mongoose_1.default.isValidObjectId(id);
const obtenerHijosIds = async (user) => {
    if (user.tipo !== 'ACUDIENTE' || !user.escuelaId)
        return [];
    const acudiente = await usuario_model_1.default.findOne({ _id: user._id, escuelaId: user.escuelaId })
        .select('info_academica.estudiantes_asociados')
        .lean();
    const asociados = acudiente?.info_academica?.estudiantes_asociados || [];
    if (asociados.length === 0)
        return [];
    const hijos = await usuario_model_1.default.find({
        _id: { $in: asociados },
        escuelaId: user.escuelaId,
        tipo: 'ESTUDIANTE',
    })
        .select('_id')
        .lean();
    return hijos.map((h) => String(h._id));
};
exports.obtenerHijosIds = obtenerHijosIds;
const obtenerCursosDocente = async (docenteId, escuelaId, soloAsignaturasActivas = true) => {
    if (!escuelaId)
        return [];
    const filtroAsignaturas = { escuelaId, docenteId };
    if (soloAsignaturasActivas)
        filtroAsignaturas.estado = 'ACTIVO';
    const [dirigidos, asignaturas] = await Promise.all([
        curso_model_1.default.find({ escuelaId, director_grupo: docenteId }).select('_id').lean(),
        asignatura_model_1.default.find(filtroAsignaturas).select('cursoId').lean(),
    ]);
    const ids = new Set();
    dirigidos.forEach((c) => ids.add(String(c._id)));
    asignaturas.forEach((a) => a.cursoId && ids.add(String(a.cursoId)));
    return [...ids];
};
exports.obtenerCursosDocente = obtenerCursosDocente;
const obtenerAsignaturasDocente = async (docenteId, escuelaId) => {
    if (!escuelaId)
        return [];
    const asignaturas = await asignatura_model_1.default.find({ escuelaId, docenteId, estado: 'ACTIVO' })
        .select('_id')
        .lean();
    return asignaturas.map((a) => String(a._id));
};
exports.obtenerAsignaturasDocente = obtenerAsignaturasDocente;
const docenteTieneCurso = async (user, cursoId) => {
    if (!esIdValido(cursoId))
        return false;
    const cursos = await (0, exports.obtenerCursosDocente)(user._id, user.escuelaId);
    return cursos.includes(cursoId);
};
exports.docenteTieneCurso = docenteTieneCurso;
const puedeVerEstudiante = async (user, estudianteId) => {
    if (!esIdValido(estudianteId) || !user.escuelaId)
        return false;
    if (user.tipo === 'ESTUDIANTE') {
        return String(user._id) === estudianteId;
    }
    if (user.tipo === 'ACUDIENTE') {
        const hijos = await (0, exports.obtenerHijosIds)(user);
        return hijos.includes(estudianteId);
    }
    const existe = await usuario_model_1.default.exists({
        _id: estudianteId,
        escuelaId: user.escuelaId,
        tipo: 'ESTUDIANTE',
    });
    if (!existe)
        return false;
    if ((0, exports.esRolAdministrativo)(user.tipo))
        return true;
    if (user.tipo === 'DOCENTE') {
        const cursos = await (0, exports.obtenerCursosDocente)(user._id, user.escuelaId);
        if (cursos.length === 0)
            return false;
        const enCurso = await curso_model_1.default.exists({
            _id: { $in: cursos },
            escuelaId: user.escuelaId,
            estudiantes: estudianteId,
        });
        return !!enCurso;
    }
    return false;
};
exports.puedeVerEstudiante = puedeVerEstudiante;
const aArregloDeIds = (valor) => {
    if (valor === undefined || valor === null || valor === '')
        return [];
    const lista = Array.isArray(valor) ? valor : [valor];
    return lista
        .map((v) => (v && typeof v === 'object' && '_id' in v ? v._id : v))
        .map((v) => String(v))
        .filter((v) => mongoose_1.default.isValidObjectId(v));
};
exports.aArregloDeIds = aArregloDeIds;
const queryString = (valor) => typeof valor === 'string' && valor.trim() !== '' ? valor : undefined;
exports.queryString = queryString;
//# sourceMappingURL=accesoAcademico.js.map