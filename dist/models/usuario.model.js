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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const UsuarioSchema = new mongoose_1.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
        minlength: 6,
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
    tipo: {
        type: String,
        enum: [
            'SUPER_ADMIN',
            'ADMIN',
            'DOCENTE',
            'ACUDIENTE',
            'ESTUDIANTE',
            'COORDINADOR',
            'RECTOR',
            'ADMINISTRATIVO',
        ],
        required: true,
    },
    estado: {
        type: String,
        enum: ['ACTIVO', 'INACTIVO'],
        default: 'ACTIVO',
    },
    escuelaId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Escuela',
        required: function () {
            return this.tipo !== 'SUPER_ADMIN';
        },
    },
    permisos: {
        type: [String],
        default: [],
    },
    perfil: {
        telefono: String,
        direccion: String,
        foto: String,
    },
    info_academica: {
        grado: String,
        grupo: String,
        codigo_estudiante: String,
        estudiantes_asociados: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Usuario' }],
        asignaturas_asignadas: [
            {
                asignaturaId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Asignatura' },
                cursoId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Curso' },
            },
        ],
    },
    fcmToken: {
        type: String,
        default: null,
        index: true
    },
    platform: {
        type: String,
        enum: ['ios', 'android'],
    },
    deviceInfo: {
        type: mongoose_1.default.Schema.Types.Mixed,
        default: {}
    },
    fcmTokenUpdatedAt: {
        type: Date,
        default: null
    },
    rolBase: {
        type: String,
        enum: ['DOCENTE', 'COORDINADOR', 'RECTOR', 'ADMINISTRATIVO', 'ACUDIENTE', 'ESTUDIANTE'],
    },
    perfilRolId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'PerfilRol',
    },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
}, { timestamps: true });
UsuarioSchema.pre('save', async function (next) {
    const user = this;
    if (!user.isModified('password'))
        return next();
    try {
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(user.password, salt);
        user.password = hashedPassword;
        next();
    }
    catch (error) {
        next(error);
    }
});
UsuarioSchema.methods.compararPassword = async function (candidatePassword) {
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
const Usuario = mongoose_1.default.model('Usuario', UsuarioSchema);
exports.default = Usuario;
//# sourceMappingURL=usuario.model.js.map