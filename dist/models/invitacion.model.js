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
exports.EstadoInvitacion = exports.TipoInvitacion = void 0;
const mongoose_1 = __importStar(require("mongoose"));
var TipoInvitacion;
(function (TipoInvitacion) {
    TipoInvitacion["CURSO"] = "CURSO";
    TipoInvitacion["ESTUDIANTE_ESPECIFICO"] = "ESTUDIANTE_ESPECIFICO";
    TipoInvitacion["PERSONAL"] = "PERSONAL";
})(TipoInvitacion || (exports.TipoInvitacion = TipoInvitacion = {}));
var EstadoInvitacion;
(function (EstadoInvitacion) {
    EstadoInvitacion["ACTIVO"] = "ACTIVO";
    EstadoInvitacion["UTILIZADO"] = "UTILIZADO";
    EstadoInvitacion["REVOCADO"] = "REVOCADO";
    EstadoInvitacion["EXPIRADO"] = "EXPIRADO";
})(EstadoInvitacion || (exports.EstadoInvitacion = EstadoInvitacion = {}));
const InvitacionSchema = new mongoose_1.Schema({
    codigo: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true,
    },
    tipo: {
        type: String,
        enum: Object.values(TipoInvitacion),
        required: true,
    },
    escuelaId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: true,
    },
    cursoId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Curso',
    },
    estudianteId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
    },
    estado: {
        type: String,
        enum: Object.values(EstadoInvitacion),
        default: EstadoInvitacion.ACTIVO,
    },
    fechaCreacion: {
        type: Date,
        default: Date.now,
    },
    fechaExpiracion: {
        type: Date,
    },
    fechaUtilizacion: {
        type: Date,
    },
    creadorId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true,
    },
    datosAdicionales: {
        type: mongoose_1.Schema.Types.Mixed,
    },
    cantidadUsos: {
        type: Number,
        default: 1,
    },
    usosActuales: {
        type: Number,
        default: 0,
    },
    registros: [
        {
            usuarioId: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'Usuario',
            },
            fechaRegistro: {
                type: Date,
                default: Date.now,
            },
            tipoCuenta: {
                type: String,
                enum: ['ESTUDIANTE', 'ACUDIENTE'],
            },
        },
    ],
}, {
    timestamps: true,
});
InvitacionSchema.index({ escuelaId: 1, estado: 1 });
InvitacionSchema.index({ cursoId: 1, estado: 1 });
InvitacionSchema.index({ fechaExpiracion: 1 }, { expireAfterSeconds: 0 });
const Invitacion = mongoose_1.default.model('Invitacion', InvitacionSchema);
exports.default = Invitacion;
//# sourceMappingURL=invitacion.model.js.map