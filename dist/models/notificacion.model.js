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
const INotificacion_1 = require("../interfaces/INotificacion");
const NotificacionSchema = new mongoose_1.Schema({
    usuarioId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: [true, 'El usuario destinatario es requerido'],
    },
    titulo: {
        type: String,
        required: [true, 'El título es requerido'],
        trim: true,
    },
    mensaje: {
        type: String,
        required: [true, 'El mensaje es requerido'],
        trim: true,
    },
    tipo: {
        type: String,
        enum: Object.values(INotificacion_1.TipoNotificacion),
        required: [true, 'El tipo de notificación es requerido'],
    },
    estado: {
        type: String,
        enum: Object.values(INotificacion_1.EstadoNotificacion),
        default: INotificacion_1.EstadoNotificacion.PENDIENTE,
    },
    entidadId: {
        type: mongoose_1.Schema.Types.ObjectId,
        refPath: 'entidadTipo',
    },
    entidadTipo: {
        type: String,
        enum: [
            'Mensaje',
            'Calificacion',
            'Curso',
            'Asignatura',
            'Usuario',
            'EventoCalendario',
            'Anuncio',
        ],
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: [true, 'La escuela es requerida'],
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    fechaLectura: {
        type: Date,
    },
}, {
    timestamps: true,
});
NotificacionSchema.index({ usuarioId: 1, estado: 1 });
NotificacionSchema.index({ escuelaId: 1 });
NotificacionSchema.index({ tipo: 1 });
NotificacionSchema.index({ createdAt: -1 });
exports.default = mongoose_1.default.model('Notificacion', NotificacionSchema);
//# sourceMappingURL=notificacion.model.js.map