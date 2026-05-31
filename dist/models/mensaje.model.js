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
const IMensaje_1 = require("../interfaces/IMensaje");
const AdjuntoSchema = new mongoose_1.Schema({
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
    fileId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
    },
    fechaSubida: {
        type: Date,
        default: Date.now,
    },
});
const LecturaSchema = new mongoose_1.Schema({
    usuarioId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    fechaLectura: {
        type: Date,
        default: Date.now,
    },
});
const EstadoUsuarioSchema = new mongoose_1.Schema({
    usuarioId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    estado: {
        type: String,
        enum: Object.values(IMensaje_1.EstadoMensaje),
        default: IMensaje_1.EstadoMensaje.ENVIADO,
    },
    fechaAccion: {
        type: Date,
        default: Date.now,
    },
});
const MensajeSchema = new mongoose_1.Schema({
    remitente: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    destinatarios: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Usuario',
        },
    ],
    destinatariosCc: [
        {
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'Usuario',
        },
    ],
    asunto: {
        type: String,
        required: true,
        trim: true,
    },
    contenido: {
        type: String,
        required: true,
    },
    tipo: {
        type: String,
        enum: Object.values(IMensaje_1.TipoMensaje),
        default: IMensaje_1.TipoMensaje.INDIVIDUAL,
    },
    prioridad: {
        type: String,
        enum: Object.values(IMensaje_1.PrioridadMensaje),
        default: IMensaje_1.PrioridadMensaje.NORMAL,
    },
    estado: {
        type: String,
        enum: Object.values(IMensaje_1.EstadoMensaje),
        default: IMensaje_1.EstadoMensaje.ENVIADO,
    },
    estadoActual: {
        type: String,
        enum: Object.values(IMensaje_1.EstadoMensaje),
    },
    estadosUsuarios: [EstadoUsuarioSchema],
    fechaAccion: {
        type: Date,
    },
    etiquetas: [
        {
            type: String,
            trim: true,
        },
    ],
    adjuntos: [AdjuntoSchema],
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
    },
    esRespuesta: {
        type: Boolean,
        default: false,
    },
    mensajeOriginalId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Mensaje',
    },
    lecturas: [LecturaSchema],
    eliminadoPorRemitente: {
        type: Boolean,
        default: false,
    },
    fechaEliminacion: {
        type: Date,
        default: null,
    },
    esCopiaAcudiente: {
        type: Boolean,
        default: false,
    },
    cursoIds: {
        type: [
            {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Curso',
            },
        ],
        default: [],
    },
}, {
    timestamps: true,
});
MensajeSchema.methods.getEstadoParaUsuario = function (usuarioId) {
    if (!this.estadosUsuarios || this.estadosUsuarios.length === 0) {
        return this.estado;
    }
    const estadoUsuario = this.estadosUsuarios.find((eu) => eu.usuarioId.toString() === usuarioId.toString());
    return estadoUsuario ? estadoUsuario.estado : IMensaje_1.EstadoMensaje.ENVIADO;
};
MensajeSchema.methods.actualizarEstadoUsuario = function (usuarioId, nuevoEstado) {
    const ahora = new Date();
    const indice = this.estadosUsuarios
        ? this.estadosUsuarios.findIndex((eu) => eu.usuarioId.toString() === usuarioId.toString())
        : -1;
    if (indice !== -1 && this.estadosUsuarios) {
        this.estadosUsuarios[indice].estado = nuevoEstado;
        this.estadosUsuarios[indice].fechaAccion = ahora;
    }
    else {
        const nuevoEstadoUsuario = {
            usuarioId: new mongoose_1.default.Types.ObjectId(usuarioId),
            estado: nuevoEstado,
            fechaAccion: ahora,
        };
        this.$set('estadosUsuarios', this.estadosUsuarios ? [...this.estadosUsuarios, nuevoEstadoUsuario] : [nuevoEstadoUsuario]);
    }
    this.fechaAccion = ahora;
};
MensajeSchema.pre('save', function (next) {
    if (!this.isNew) {
        return next();
    }
    try {
        const usuarios = new Set();
        const ahora = new Date();
        if (this.remitente) {
            usuarios.add(this.remitente.toString());
        }
        if (this.destinatarios && Array.isArray(this.destinatarios)) {
            this.destinatarios.forEach((dest) => {
                const destId = dest._id ? dest._id.toString() : dest.toString();
                usuarios.add(destId);
            });
        }
        if (this.destinatariosCc && Array.isArray(this.destinatariosCc)) {
            this.destinatariosCc.forEach((dest) => {
                const destId = dest._id ? dest._id.toString() : dest.toString();
                usuarios.add(destId);
            });
        }
        const estadosUsuariosArray = Array.from(usuarios).map((userId) => ({
            usuarioId: new mongoose_1.default.Types.ObjectId(userId),
            estado: this.estado || IMensaje_1.EstadoMensaje.ENVIADO,
            fechaAccion: ahora,
        }));
        this.$set('estadosUsuarios', estadosUsuariosArray);
        this.fechaAccion = ahora;
        next();
    }
    catch (error) {
        next(error);
    }
});
MensajeSchema.index({ remitente: 1 });
MensajeSchema.index({ destinatarios: 1 });
MensajeSchema.index({ escuelaId: 1 });
MensajeSchema.index({ estado: 1 });
MensajeSchema.index({ createdAt: -1 });
MensajeSchema.index({ asunto: 'text', contenido: 'text' });
MensajeSchema.index({ 'estadosUsuarios.usuarioId': 1 });
MensajeSchema.index({ 'estadosUsuarios.estado': 1 });
MensajeSchema.index({ 'estadosUsuarios.usuarioId': 1, 'estadosUsuarios.estado': 1 });
const Mensaje = mongoose_1.default.model('Mensaje', MensajeSchema);
exports.default = Mensaje;
//# sourceMappingURL=mensaje.model.js.map