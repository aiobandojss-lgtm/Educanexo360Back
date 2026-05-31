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
const CursoSchema = new mongoose_1.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre del curso es requerido'],
        trim: true,
    },
    nivel: {
        type: String,
        required: [true, 'El nivel es requerido'],
        trim: true,
        enum: ['PREESCOLAR', 'PRIMARIA', 'SECUNDARIA', 'MEDIA'],
    },
    grado: {
        type: String,
        required: [true, 'El grado es requerido'],
        trim: true,
    },
    grupo: {
        type: String,
        required: [true, 'El grupo es requerido'],
        trim: true,
    },
    jornada: {
        type: String,
        enum: ['MATUTINA', 'VESPERTINA', 'NOCTURNA', 'COMPLETA'],
        default: 'MATUTINA',
        required: [true, 'La jornada es requerida'],
    },
    año_academico: {
        type: String,
        required: [true, 'El año académico es requerido'],
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: [true, 'La escuela es requerida'],
    },
    director_grupo: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El director de grupo es requerido'],
    },
    estudiantes: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Usuario',
        },
    ],
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO'],
        default: 'ACTIVO',
    },
}, {
    timestamps: true,
});
CursoSchema.index({ escuelaId: 1, año_academico: 1 });
CursoSchema.index({ director_grupo: 1 });
CursoSchema.index({ nombre: 1, escuelaId: 1, grado: 1, grupo: 1, jornada: 1 }, { unique: true });
const Curso = mongoose_1.default.model('Curso', CursoSchema);
exports.default = Curso;
//# sourceMappingURL=curso.model.js.map