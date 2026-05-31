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
const ICalendario_1 = require("../interfaces/ICalendario");
const InvitadoSchema = new mongoose_1.Schema({
    usuarioId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    confirmado: {
        type: Boolean,
        default: false,
    },
    fechaConfirmacion: {
        type: Date,
    },
});
const RecordatorioSchema = new mongoose_1.Schema({
    tiempo: {
        type: Number,
        required: true,
        min: 0,
    },
    tipo: {
        type: String,
        enum: ['EMAIL', 'NOTIFICACION', 'AMBOS'],
        default: 'NOTIFICACION',
    },
});
const ArchivoAdjuntoSchema = new mongoose_1.Schema({
    fileId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
    },
    nombre: {
        type: String,
        required: true,
    },
    tipo: {
        type: String,
        required: true,
    },
    tamaño: {
        type: Number,
        required: true,
    },
});
const EventoCalendarioSchema = new mongoose_1.Schema({
    titulo: {
        type: String,
        required: [true, 'El título del evento es requerido'],
        trim: true,
    },
    descripcion: {
        type: String,
        required: [true, 'La descripción del evento es requerida'],
        trim: true,
    },
    fechaInicio: {
        type: Date,
        required: [true, 'La fecha de inicio es requerida'],
    },
    fechaFin: {
        type: Date,
        required: [true, 'La fecha de fin es requerida'],
    },
    todoElDia: {
        type: Boolean,
        default: false,
    },
    lugar: {
        type: String,
        trim: true,
    },
    tipo: {
        type: String,
        enum: Object.values(ICalendario_1.TipoEvento),
        default: ICalendario_1.TipoEvento.ACADEMICO,
    },
    estado: {
        type: String,
        enum: Object.values(ICalendario_1.EstadoEvento),
        default: ICalendario_1.EstadoEvento.PENDIENTE,
    },
    creadorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El creador del evento es requerido'],
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: [true, 'La escuela es requerida'],
    },
    color: {
        type: String,
        default: '#3788d8',
    },
    invitados: [InvitadoSchema],
    recordatorios: [RecordatorioSchema],
    archivoAdjunto: ArchivoAdjuntoSchema,
}, {
    timestamps: true,
});
EventoCalendarioSchema.pre('save', function (next) {
    if (this.fechaFin < this.fechaInicio) {
        next(new Error('La fecha de fin no puede ser anterior a la fecha de inicio'));
    }
    next();
});
EventoCalendarioSchema.index({ escuelaId: 1, fechaInicio: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, creadorId: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, cursoId: 1 });
EventoCalendarioSchema.index({ escuelaId: 1, estado: 1 });
exports.default = mongoose_1.default.model('EventoCalendario', EventoCalendarioSchema);
//# sourceMappingURL=calendario.model.js.map