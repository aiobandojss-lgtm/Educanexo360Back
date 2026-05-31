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
const LogroSchema = new mongoose_1.Schema({
    nombre: {
        type: String,
        required: [true, 'El nombre del logro es requerido'],
        trim: true,
    },
    descripcion: {
        type: String,
        required: [true, 'La descripción del logro es requerida'],
        trim: true,
    },
    tipo: {
        type: String,
        enum: ['COGNITIVO', 'PROCEDIMENTAL', 'ACTITUDINAL'],
        required: [true, 'El tipo de logro es requerido'],
    },
    porcentaje: {
        type: Number,
        required: [true, 'El porcentaje del logro es requerido'],
        min: [0, 'El porcentaje no puede ser menor a 0'],
        max: [100, 'El porcentaje no puede ser mayor a 100'],
    },
    asignaturaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Asignatura',
        required: [true, 'La asignatura es requerida'],
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
        required: [true, 'El curso es requerido'],
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: [true, 'La escuela es requerida'],
    },
    periodo: {
        type: Number,
        required: [true, 'El periodo es requerido'],
    },
    año_academico: {
        type: String,
        required: [true, 'El año académico es requerido'],
    },
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO'],
        default: 'ACTIVO',
    },
}, {
    timestamps: true,
    versionKey: false,
});
LogroSchema.pre('save', async function (next) {
    try {
        if (this.isModified('porcentaje') || this.isNew) {
            const Model = this.constructor;
            const otrosLogros = await Model.find({
                asignaturaId: this.asignaturaId,
                periodo: this.periodo,
                año_academico: this.año_academico,
                estado: 'ACTIVO',
                _id: { $ne: this._id },
            });
            const sumaPorcentajes = otrosLogros.reduce((sum, logro) => sum + logro.porcentaje, 0) + this.porcentaje;
            if (sumaPorcentajes > 100) {
                throw new Error('La suma de los porcentajes de los logros no puede exceder el 100%');
            }
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
LogroSchema.index({ asignaturaId: 1, periodo: 1, año_academico: 1 }, { unique: false });
LogroSchema.index({ cursoId: 1 });
LogroSchema.index({ escuelaId: 1 });
exports.default = mongoose_1.default.model('Logro', LogroSchema);
//# sourceMappingURL=logro.model.js.map