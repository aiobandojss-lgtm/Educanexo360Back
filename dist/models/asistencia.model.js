"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const IAsistencia_1 = require("../interfaces/IAsistencia");
const AsistenciaEstudianteSchema = new mongoose_1.Schema({
    estudianteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El estudiante es requerido'],
    },
    estado: {
        type: String,
        enum: Object.values(IAsistencia_1.EstadoAsistencia),
        default: IAsistencia_1.EstadoAsistencia.PRESENTE,
    },
    justificacion: {
        type: String,
        trim: true,
    },
    observaciones: {
        type: String,
        trim: true,
    },
    registradoPor: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
    },
    fechaRegistro: {
        type: Date,
        default: Date.now,
    },
});
const AsistenciaSchema = new mongoose_1.Schema({
    fecha: {
        type: Date,
        required: [true, 'La fecha es requerida'],
        index: true,
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
        required: [true, 'El curso es requerido'],
        index: true,
    },
    asignaturaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Asignatura',
        index: true,
    },
    docenteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El docente es requerido'],
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: [true, 'La escuela es requerida'],
        index: true,
    },
    periodoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Periodo',
    },
    tipoSesion: {
        type: String,
        enum: ['CLASE', 'ACTIVIDAD', 'EVENTO', 'OTRO'],
        default: 'CLASE',
    },
    horaInicio: {
        type: String,
    },
    horaFin: {
        type: String,
    },
    estudiantes: [AsistenciaEstudianteSchema],
    observacionesGenerales: {
        type: String,
        trim: true,
    },
    finalizado: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
AsistenciaSchema.index({ cursoId: 1, fecha: 1 });
AsistenciaSchema.index({ escuelaId: 1, fecha: 1 });
AsistenciaSchema.index({ asignaturaId: 1, fecha: 1 });
AsistenciaSchema.index({ 'estudiantes.estudianteId': 1, fecha: 1 });
exports.default = mongoose_1.default.model('Asistencia', AsistenciaSchema);
//# sourceMappingURL=asistencia.model.js.map