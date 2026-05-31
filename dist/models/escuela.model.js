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
const EscuelaSchema = new mongoose_1.Schema({
    codigo: {
        type: String,
        required: [true, 'El código de la escuela es requerido'],
        unique: true,
        trim: true,
        uppercase: true,
        validate: {
            validator: function (value) {
                return /^[A-Z0-9-]+$/.test(value);
            },
            message: 'El código debe contener solo letras, números y guiones',
        },
    },
    nombre: {
        type: String,
        required: [true, 'El nombre es requerido'],
        trim: true,
    },
    direccion: {
        type: String,
        required: [true, 'La dirección es requerida'],
        trim: true,
    },
    telefono: {
        type: String,
        required: [true, 'El teléfono es requerido'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'El email es requerido'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO'],
        default: 'ACTIVO',
    },
    configuracion: {
        periodos_academicos: {
            type: Number,
            required: [true, 'El número de períodos académicos es requerido'],
            default: 4,
        },
        escala_calificacion: {
            minima: {
                type: Number,
                required: [true, 'La calificación mínima es requerida'],
                default: 0,
            },
            maxima: {
                type: Number,
                required: [true, 'La calificación máxima es requerida'],
                default: 5,
            },
        },
        logros_por_periodo: {
            type: Number,
            required: [true, 'El número de logros por período es requerido'],
            default: 3,
        },
    },
    periodos_academicos: [
        {
            numero: {
                type: Number,
                required: true,
            },
            nombre: {
                type: String,
                required: true,
            },
            fecha_inicio: {
                type: Date,
                required: true,
            },
            fecha_fin: {
                type: Date,
                required: true,
            },
        },
    ],
}, {
    timestamps: true,
    versionKey: false,
});
EscuelaSchema.index({ estado: 1 });
const Escuela = mongoose_1.default.model('Escuela', EscuelaSchema);
exports.default = Escuela;
//# sourceMappingURL=escuela.model.js.map