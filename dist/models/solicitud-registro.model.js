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
exports.EstadoSolicitud = void 0;
const mongoose_1 = __importStar(require("mongoose"));
var EstadoSolicitud;
(function (EstadoSolicitud) {
    EstadoSolicitud["PENDIENTE"] = "PENDIENTE";
    EstadoSolicitud["APROBADA"] = "APROBADA";
    EstadoSolicitud["RECHAZADA"] = "RECHAZADA";
})(EstadoSolicitud || (exports.EstadoSolicitud = EstadoSolicitud = {}));
const SolicitudRegistroSchema = new mongoose_1.Schema({
    invitacionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Invitacion',
        required: true,
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
    },
    nombre: {
        type: String,
        required: true,
        trim: true,
    },
    apellidos: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },
    telefono: {
        type: String,
    },
    estudiantes: [
        {
            nombre: {
                type: String,
                required: true,
                trim: true,
            },
            apellidos: {
                type: String,
                required: true,
                trim: true,
            },
            fechaNacimiento: {
                type: Date,
            },
            cursoId: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Curso',
                required: true,
            },
            codigo_estudiante: {
                type: String,
            },
            email: {
                type: String,
                trim: true,
                lowercase: true,
            },
            esExistente: {
                type: Boolean,
                default: false,
            },
            estudianteExistenteId: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Usuario',
            },
        },
    ],
    estado: {
        type: String,
        enum: Object.values(EstadoSolicitud),
        default: EstadoSolicitud.PENDIENTE,
    },
    fechaSolicitud: {
        type: Date,
        default: Date.now,
    },
    fechaRevision: {
        type: Date,
    },
    revisadoPor: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
    },
    comentarios: {
        type: String,
    },
    advertencias: [
        {
            type: String,
        },
    ],
    usuariosCreados: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Usuario',
        },
    ],
}, {
    timestamps: true,
    collection: 'solicitudregistros',
});
SolicitudRegistroSchema.index({ escuelaId: 1, estado: 1 });
SolicitudRegistroSchema.index({ email: 1, escuelaId: 1 });
const SolicitudRegistro = mongoose_1.default.model('SolicitudRegistro', SolicitudRegistroSchema);
exports.default = SolicitudRegistro;
//# sourceMappingURL=solicitud-registro.model.js.map