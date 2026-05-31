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
const PeriodoSchema = new mongoose_1.Schema({
    numero: {
        type: Number,
        required: [true, 'El número del periodo es requerido'],
    },
    nombre: {
        type: String,
        required: [true, 'El nombre del periodo es requerido'],
    },
    porcentaje: {
        type: Number,
        required: [true, 'El porcentaje del periodo es requerido'],
        min: [0, 'El porcentaje no puede ser menor a 0'],
        max: [100, 'El porcentaje no puede ser mayor a 100'],
    },
    fecha_inicio: {
        type: Date,
        required: [true, 'La fecha de inicio es requerida'],
    },
    fecha_fin: {
        type: Date,
        required: [true, 'La fecha de fin es requerida'],
    },
});
const AsignaturaSchema = new mongoose_1.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre de la asignatura es requerido'],
        trim: true,
    },
    descripcion: {
        type: String,
        required: [true, 'La descripción es requerida'],
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
        required: [true, 'El curso es requerido'],
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
    },
    intensidad_horaria: {
        type: Number,
        required: [true, 'La intensidad horaria es requerida'],
        min: [1, 'La intensidad horaria debe ser al menos 1 hora'],
    },
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO'],
        default: 'ACTIVO',
    },
    periodos: [PeriodoSchema],
}, {
    timestamps: true,
});
AsignaturaSchema.pre('save', function (next) {
    if (this.periodos && this.periodos.length > 0) {
        const sumaPorcentajes = this.periodos.reduce((sum, periodo) => sum + periodo.porcentaje, 0);
        if (sumaPorcentajes !== 100) {
            next(new Error('La suma de los porcentajes de los períodos debe ser 100%'));
        }
    }
    next();
});
AsignaturaSchema.index({ cursoId: 1, nombre: 1 }, { unique: true });
AsignaturaSchema.index({ docenteId: 1 });
AsignaturaSchema.index({ escuelaId: 1 });
const Asignatura = mongoose_1.default.model('Asignatura', AsignaturaSchema);
exports.default = Asignatura;
//# sourceMappingURL=asignatura.model.js.map