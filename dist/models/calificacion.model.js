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
const CalificacionLogroSchema = new mongoose_1.Schema({
    logroId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Logro',
        required: [true, 'El logro es requerido'],
    },
    calificacion: {
        type: Number,
        required: [true, 'La calificación es requerida'],
        min: [0, 'La calificación no puede ser menor a 0'],
        max: [5, 'La calificación no puede ser mayor a 5'],
    },
    observacion: {
        type: String,
    },
    fecha_calificacion: {
        type: Date,
        default: Date.now,
    },
});
const CalificacionSchema = new mongoose_1.Schema({
    estudianteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El estudiante es requerido'],
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
    calificaciones_logros: [CalificacionLogroSchema],
    promedio_periodo: {
        type: Number,
        default: 0,
    },
    observaciones: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
    versionKey: false,
});
CalificacionSchema.pre('save', async function (next) {
    try {
        const calificacion = this;
        if (Array.isArray(calificacion.calificaciones_logros) &&
            calificacion.calificaciones_logros.length > 0) {
            const Logro = mongoose_1.default.model('Logro');
            const logrosIds = calificacion.calificaciones_logros.map((cal) => cal.logroId);
            const logros = await Logro.find({
                _id: { $in: logrosIds },
                asignaturaId: calificacion.asignaturaId,
                periodo: calificacion.periodo,
                año_academico: calificacion.año_academico,
            });
            if (logros.length === 0) {
                throw new Error('No se encontraron logros válidos para esta calificación');
            }
            let sumaPonderada = 0;
            let pesoTotal = 0;
            calificacion.calificaciones_logros.forEach((calificacionLogro) => {
                const logro = logros.find((l) => l._id.toString() === calificacionLogro.logroId.toString());
                if (logro) {
                    sumaPonderada += calificacionLogro.calificacion * (logro.porcentaje / 100);
                    pesoTotal += logro.porcentaje;
                }
            });
            if (pesoTotal > 0) {
                calificacion.promedio_periodo = Number(((sumaPonderada * 100) / pesoTotal).toFixed(2));
            }
        }
        next();
    }
    catch (error) {
        next(error);
    }
});
CalificacionSchema.index({ estudianteId: 1, asignaturaId: 1, periodo: 1, año_academico: 1 }, { unique: true });
CalificacionSchema.index({ cursoId: 1, periodo: 1 });
CalificacionSchema.index({ escuelaId: 1 });
exports.default = mongoose_1.default.model('Calificacion', CalificacionSchema);
//# sourceMappingURL=calificacion.model.js.map