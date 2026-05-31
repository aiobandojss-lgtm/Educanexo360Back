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
const ArchivoSchema = new mongoose_1.Schema({
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
const ImagenPortadaSchema = new mongoose_1.Schema({
    fileId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: true,
    },
    url: {
        type: String,
        required: true,
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
const AnuncioSchema = new mongoose_1.Schema({
    titulo: {
        type: String,
        required: true,
        trim: true,
    },
    contenido: {
        type: String,
        required: true,
    },
    creador: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
    },
    fechaPublicacion: {
        type: Date,
        default: Date.now,
    },
    estaPublicado: {
        type: Boolean,
        default: false,
    },
    paraEstudiantes: {
        type: Boolean,
        default: true,
    },
    paraDocentes: {
        type: Boolean,
        default: false,
    },
    paraPadres: {
        type: Boolean,
        default: true,
    },
    destacado: {
        type: Boolean,
        default: false,
    },
    archivosAdjuntos: [ArchivoSchema],
    imagenPortada: ImagenPortadaSchema,
    lecturas: [LecturaSchema],
}, {
    timestamps: true,
});
AnuncioSchema.index({ escuelaId: 1, estaPublicado: 1 });
AnuncioSchema.index({ creador: 1 });
AnuncioSchema.index({ destacado: 1 });
AnuncioSchema.index({ fechaPublicacion: -1 });
exports.default = mongoose_1.default.model('Anuncio', AnuncioSchema);
//# sourceMappingURL=anuncio.model.js.map